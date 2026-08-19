// WidgetWall — メインプロセス (v2: マルチモニタ / フォルダウィジェット / 省電力)
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, powerMonitor, nativeImage, session, shell } = require('electron');
const path = require('path');
const config = require('./config');
const attach = require('./wallpaperAttach');
const monitors = require('./monitors');
const weather = require('./weather');
const stats = require('./stats');
const lhm = require('./lhm');
const fullscreen = require('./fullscreen');
const gfonts = require('./gfonts');
const heartbeat = require('./heartbeat');
const media = require('./media');
const feeds = require('./feeds');
const updater = require('./updater');

// 壁紙ウィンドウはアイコンの背面 = 常に「隠れている」扱いになるため、
// Chromium の被覆検知・スロットリングを止めないと描画が停止する
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// 動画壁紙は GPU のハードウェアデコード (NVDEC / QuickSync) を使う
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

const IS_AUTOSTART = process.argv.includes('--autostart');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PRELOAD = (n) => path.join(__dirname, '..', 'preload', n);
const RENDERER = (n) => path.join(__dirname, '..', 'renderer', n);

let displayPairs = [];                 // [{index, display, native}]
const wallWins = new Map();            // displayIndex -> BrowserWindow
const folderWins = new Map();          // widgetId -> BrowserWindow (フォルダ/メモ/タイマーの対話ウィジェット)
let settingsWin = null;
let tray = null;
let editMode = false;
let lastWeatherKey = '';
let lastBuiltin = null;                // 内蔵 CPU/MEM サンプル
const pendingLayout = new Map();       // 編集モード中のレイアウト変更
const iconCache = new Map();           // path -> dataURL

// デスクトップ上でクリックできる「小窓型」ウィジェット
const INTERACTIVE_TYPES = new Set(['folder', 'note', 'pomo']);
const placedKey = new Map();           // widgetId -> 配置キー (無関係な設定変更で再配置しない)
const placeGen = new Map();            // widgetId -> 世代 (収束ループの多重実行防止)

// ---------------------------------------------------------------- 単一インスタンス
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(onReady);
}

// ---------------------------------------------------------------- ユーティリティ
function getHwnd(win) {
  return Number(win.getNativeWindowHandle().readBigUInt64LE(0));
}

function allWindows() {
  return [...wallWins.values(), ...folderWins.values(), settingsWin].filter(w => w && !w.isDestroyed());
}

function broadcast(channel, payload) {
  for (const w of allWindows()) w.webContents.send(channel, payload);
}

function configEnvelope() {
  return { config: config.get(), systemWallpaper: attach.getSystemWallpaperPath() };
}

function weatherWidget() {
  return config.get().widgets.find(w => w.type === 'weather');
}

function round2(v) { return Math.round(v * 100) / 100; }

// フォルダウィジェットの寸法 (レンダラ側 folder.js と同じ式)
function folderDims(o) {
  const n = Math.max(1, (o.items || []).length);
  const cols = o.columns > 0 ? o.columns : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const icon = o.iconSize || 34;
  const labels = o.showLabels !== false;
  const cellW = Math.max(58, icon + 30);
  const cellH = icon + (labels ? 34 : 12);
  return { cols, rows, w: 20 + cols * cellW, h: 16 + (o.title ? 28 : 0) + rows * cellH };
}

// 対話ウィジェット (フォルダ / メモ / タイマー) の CSS ピクセル寸法
function interDims(w) {
  const o = w.options || {};
  if (w.type === 'note') return { w: Math.max(140, o.w || 240), h: Math.max(90, o.h || 180) };
  if (w.type === 'pomo') return { w: Math.max(170, o.w || 210), h: Math.max(120, o.h || 150) };
  return folderDims(o);
}

// ---------------------------------------------------------------- 壁紙ウィンドウ (モニタごと)
function createWallWindow(pair) {
  const b = pair.display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    // resizable:false だと Electron が作成時サイズへ強制的に戻すため true にする
    // (フレームなし + 子ウィンドウなのでユーザーがリサイズすることはない)
    frame: false, resizable: true, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    closable: false, skipTaskbar: true, focusable: false, show: false,
    hasShadow: false, roundedCorners: false, thickFrame: false,
    backgroundColor: '#0b0d12',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: PRELOAD('wallpaper.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  wallWins.set(pair.index, win);

  win.loadFile(RENDERER(path.join('wallpaper', 'index.html')), { query: { display: String(pair.index) } });

  win.once('ready-to-show', () => {
    win.showInactive();
    attachWall(pair.index);
  });

  win.webContents.on('render-process-gone', () => {
    try { win.destroy(); } catch (_) {}
    wallWins.delete(pair.index);
    setTimeout(() => { if (!editMode) rebuildWallWindows(); }, 1000);
  });
}

// 子ウィンドウ化すると DPI コンテキストが変わり、Electron が独自の DIP 換算で
// サイズを戻してしまう。実際の物理サイズを測り、必要な DIP 値を逆算して合わせる。
function fixAttachedSize(win, hwnd, targetRect, zoom) {
  try {
    const r = attach.getRect(hwnd);
    const b = win.getBounds();
    if (process.env.WW_DEBUG) {
      console.log('[fix] target=', JSON.stringify(targetRect), 'phys=', JSON.stringify(r), 'dip=', JSON.stringify(b));
    }
    if (r.w !== targetRect.w || r.h !== targetRect.h) {
      const ratioW = (r.w / b.width) || 1;
      const ratioH = (r.h / b.height) || 1;
      const nw = Math.round(targetRect.w / ratioW);
      const nh = Math.round(targetRect.h / ratioH);
      win.setBounds({ width: nw, height: nh });
      if (process.env.WW_DEBUG) {
        const r2 = attach.getRect(hwnd);
        console.log('[fix] setBounds', nw, nh, '-> phys=', JSON.stringify(r2), 'dip=', JSON.stringify(win.getBounds()));
      }
    }
    attach.ensurePlacement(hwnd, targetRect);
    if (process.env.WW_DEBUG) {
      console.log('[fix] after ensure phys=', JSON.stringify(attach.getRect(hwnd)));
    }
    win.webContents.setZoomFactor(zoom || 1);
  } catch (e) {
    if (process.env.WW_DEBUG) console.log('[fix] error', e.message);
  }
}

function attachWall(index) {
  const win = wallWins.get(index);
  const pair = displayPairs.find(p => p.index === index);
  if (!win || win.isDestroyed() || !pair) return;
  const hwnd = getHwnd(win);
  attach.attachAt(hwnd, pair.native);
  const zoom = pair.display.scaleFactor || 1;
  fixAttachedSize(win, hwnd, pair.native, zoom);
  for (const ms of [250, 1000, 3000]) {
    setTimeout(() => {
      if (!editMode && win && !win.isDestroyed()) fixAttachedSize(win, hwnd, pair.native, zoom);
    }, ms);
  }
}

function rebuildWallWindows() {
  displayPairs = monitors.pair(screen);
  for (const [idx, win] of [...wallWins]) {
    if (!displayPairs.find(p => p.index === idx) || win.isDestroyed()) {
      try { attach.detach(getHwnd(win)); } catch (_) {}
      try { win.destroy(); } catch (_) {}
      wallWins.delete(idx);
    }
  }
  for (const pair of displayPairs) {
    if (!wallWins.has(pair.index)) {
      createWallWindow(pair);
    } else if (!editMode) {
      attach.ensurePlacement(getHwnd(wallWins.get(pair.index)), pair.native);
    }
  }
  syncFolders();
}

// ---------------------------------------------------------------- 対話ウィジェットウィンドウ (フォルダ / メモ / タイマー)
const INTER_RENDERER = { folder: 'folder', note: 'note', pomo: 'pomo' };

function createFolderWindow(widget) {
  const dims = interDims(widget);
  const win = new BrowserWindow({
    width: dims.w, height: dims.h,
    frame: false, resizable: true, movable: false,
    minimizable: false, maximizable: false, closable: false,
    // focusable:false (WS_EX_NOACTIVATE) だと Chromium が入力を処理せず、
    // クリックもキーボードも一切効かなくなる。対話ウィジェットなので true にする。
    skipTaskbar: true, focusable: true, show: false,
    hasShadow: false, roundedCorners: false, thickFrame: false,
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: PRELOAD('folder.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium のズーム倍率は file:// オリジン単位でセッションに永続化される。
      // 壁紙側 (子ウィンドウのため DPI 補正でズームを使う) と食い合わないよう、
      // 対話ウィジェットは専用セッションに隔離して常に等倍で描く
      partition: 'persist:widgets',
      zoomFactor: 1,
    },
  });
  folderWins.set(widget.id, win);
  const dir = INTER_RENDERER[widget.type] || 'folder';
  win.loadFile(RENDERER(path.join(dir, 'index.html')), { query: { wid: widget.id } });
  win.once('ready-to-show', () => {
    if (!editMode) {
      win.showInactive();
      placeFolder(widget.id);
    }
  });
  // クリックすると一時的に前面へ出るので、操作が終わったらデスクトップ直上へ戻す
  win.on('blur', () => {
    if (!editMode && !win.isDestroyed()) attach.lowerToDesktopLayer(getHwnd(win));
  });

  win.webContents.on('render-process-gone', () => {
    try { win.destroy(); } catch (_) {}
    folderWins.delete(widget.id);
    placedKey.delete(widget.id);
    setTimeout(() => { if (!editMode) syncFolders(); }, 1000);
  });
}

// 配置キー: これが変わった時だけ再配置する。
// (以前は設定のどんな変更でも SetParent + 収束ループが走り直し、サイズがふらつく原因だった)
function folderPlaceKey(w) {
  const dims = interDims(w);
  return JSON.stringify([w.display || 0, w.x, w.y, dims.w, dims.h]);
}

function placeFolder(id) {
  const win = folderWins.get(id);
  const widget = config.get().widgets.find(w => w.id === id);
  if (!win || win.isDestroyed() || !widget) return;
  const pair = displayPairs.find(p => p.index === (widget.display || 0)) || displayPairs[0];
  if (!pair) return;

  // 対話ウィジェットはトップレベルのままなので、Electron の DIP 座標系で素直に配置できる。
  // (物理ピクセルで中心位置を決め、その左上を DIP に変換して setBounds に渡す)
  const dims = interDims(widget);
  const sf = pair.display.scaleFactor || 1;
  const pw = Math.round(dims.w * sf), ph = Math.round(dims.h * sf);
  const cx = pair.native.x + Math.round(pair.native.w * widget.x / 100);
  const cy = pair.native.y + Math.round(pair.native.h * widget.y / 100);
  const px = Math.min(Math.max(cx - (pw >> 1), pair.native.x), pair.native.x + pair.native.w - pw);
  const py = Math.min(Math.max(cy - (ph >> 1), pair.native.y), pair.native.y + pair.native.h - ph);

  const hwnd = getHwnd(win);

  // Electron は setBounds のサイズを「今ウィンドウが載っているモニタ」の倍率で
  // 物理ピクセルへ換算する。先に移動して対象モニタへ移してからサイズを決めないと、
  // 別倍率のモニタ間でサイズがばらつく (これがサイズ不安定の原因だった)。
  try {
    const dip = screen.screenToDipPoint({ x: px, y: py });
    win.setPosition(Math.round(dip.x), Math.round(dip.y));
  } catch (_) {}
  win.setSize(dims.w, dims.h);
  attach.placeOnDesktopLayer(hwnd);
  placedKey.set(id, folderPlaceKey(widget));

  // 実測が目標の物理サイズと合うまで補正し、確定したサイズで角丸を切る
  const wantW = pw, wantH = ph;
  const gen = (placeGen.get(id) || 0) + 1;
  placeGen.set(id, gen);
  const settle = (n) => {
    if (placeGen.get(id) !== gen) return;
    if (editMode || win.isDestroyed() || !attach.isWindowAlive(hwnd)) return;
    const r = attach.getRect(hwnd);
    if ((Math.abs(r.w - wantW) > 1 || Math.abs(r.h - wantH) > 1) && n > 0) {
      const b = win.getBounds();
      const nw = Math.max(40, Math.round(wantW / ((r.w / b.width) || 1)));
      const nh = Math.max(30, Math.round(wantH / ((r.h / b.height) || 1)));
      win.setSize(nw, nh);
      setTimeout(() => settle(n - 1), 120);
      return;
    }
    attach.setRoundRegion(hwnd, r.w, r.h, Math.round(14 * sf));
  };
  setTimeout(() => settle(4), 140);
}

function syncFolders() {
  const inters = config.get().widgets.filter(w => INTERACTIVE_TYPES.has(w.type));
  for (const [id, win] of [...folderWins]) {
    if (!inters.find(w => w.id === id)) {
      try { attach.detach(getHwnd(win)); } catch (_) {}
      try { win.destroy(); } catch (_) {}
      folderWins.delete(id);
      placedKey.delete(id);
      placeGen.delete(id);
    }
  }
  for (const w of inters) {
    if (!folderWins.has(w.id)) {
      createFolderWindow(w);
    } else {
      const win = folderWins.get(w.id);
      win.webContents.send('fw', w);
      if (editMode) {
        win.hide();
      } else {
        if (!win.isVisible()) win.showInactive();
        // 位置・サイズに関わる変更があった時だけ再配置 (無駄な SetParent とループを避ける)
        const hwnd = getHwnd(win);
        if (placedKey.get(w.id) !== folderPlaceKey(w) || !attach.isParentAlive(hwnd)) {
          placeFolder(w.id);
        } else {
          attach.ensurePlacement(hwnd);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 監視 (自己修復)
function startWatchdog() {
  heartbeat.register('watchdog', 30000, () => {
    if (editMode) return;
    try {
      let rebuild = false;
      for (const [idx, win] of wallWins) {
        if (win.isDestroyed() || !attach.isWindowAlive(getHwnd(win))) { rebuild = true; continue; }
        const pair = displayPairs.find(p => p.index === idx);
        if (!attach.isParentAlive(getHwnd(win))) attachWall(idx);
        else if (pair) fixAttachedSize(win, getHwnd(win), pair.native, pair.display.scaleFactor || 1);
      }
      for (const [id, win] of folderWins) {
        if (win.isDestroyed() || !attach.isWindowAlive(getHwnd(win))) { rebuild = true; continue; }
        if (!attach.isParentAlive(getHwnd(win))) placeFolder(id);
        else attach.ensurePlacement(getHwnd(win));
      }
      if (rebuild) {
        for (const [idx, win] of [...wallWins]) { if (win.isDestroyed() || !attach.isWindowAlive(getHwnd(win))) wallWins.delete(idx); }
        for (const [id, win] of [...folderWins]) { if (win.isDestroyed() || !attach.isWindowAlive(getHwnd(win))) folderWins.delete(id); }
        rebuildWallWindows();
      }
    } catch (e) {
      console.error('watchdog:', e.message);
    }
  });
}

// ---------------------------------------------------------------- 編集モード
function enterEditMode() {
  if (editMode || wallWins.size === 0) return;
  editMode = true;
  pendingLayout.clear();
  for (const win of folderWins.values()) { try { win.hide(); } catch (_) {} }
  for (const [idx, win] of wallWins) {
    if (win.isDestroyed()) continue;
    const pair = displayPairs.find(p => p.index === idx);
    attach.detach(getHwnd(win));
    try { win.webContents.setZoomFactor(1); } catch (_) {}
    win.setFocusable(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    if (pair) win.setBounds(pair.display.bounds);
    win.show();
    win.webContents.send('edit-mode', true);
  }
  const primary = wallWins.get(0);
  if (primary && !primary.isDestroyed()) primary.focus();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.minimize();
}

function exitEditMode() {
  if (!editMode) return;
  editMode = false;
  // 集めたレイアウト変更を反映
  if (pendingLayout.size) {
    config.update(c => {
      for (const [id, p] of pendingLayout) {
        const w = c.widgets.find(x => x.id === id);
        if (!w) continue;
        for (const k of ['x', 'y', 'size']) {
          if (typeof p[k] === 'number') w[k] = round2(p[k]);
        }
        if (p.options) Object.assign(w.options, p.options);
      }
    });
    pendingLayout.clear();
  }
  for (const [idx, win] of wallWins) {
    if (win.isDestroyed()) continue;
    win.webContents.send('edit-mode', false);
    win.setAlwaysOnTop(false);
    win.setFocusable(false);
    attachWall(idx);
  }
  placedKey.clear(); // 編集で位置が変わった可能性があるため全対話ウィジェットを配置し直す
  for (const w of config.get().widgets.filter(x => INTERACTIVE_TYPES.has(x.type))) {
    const win = folderWins.get(w.id);
    if (win && !win.isDestroyed()) {
      win.showInactive();
      placeFolder(w.id);
    }
  }
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.restore();
}

// ---------------------------------------------------------------- 設定ウィンドウ
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const sw = Math.min(1060, wa.width - 80);
  const sh = Math.min(740, wa.height - 80);
  settingsWin = new BrowserWindow({
    width: sw, height: sh, minWidth: 700, minHeight: 520,
    frame: false, show: false,
    backgroundColor: '#141518',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: PRELOAD('settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(RENDERER(path.join('settings', 'index.html')),
    process.env.WW_TEST_TAB ? { query: { tab: process.env.WW_TEST_TAB } } : undefined);
  settingsWin.once('ready-to-show', () => {
    positionSettingsOnPrimary();
    settingsWin.show();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// モニタごとに DPI が違うと Electron の DIP 座標は多義的になり、指定位置が
// 別モニタに化けることがある。物理座標でプライマリ中央を計算して置き直す。
function positionSettingsOnPrimary() {
  try {
    const pair = displayPairs[0] || monitors.pair(screen)[0];
    if (!pair || !settingsWin || settingsWin.isDestroyed()) return;
    const b = settingsWin.getBounds();
    const sf = pair.display.scaleFactor || 1;
    const pw = Math.round(b.width * sf), ph = Math.round(b.height * sf);
    const px = pair.native.x + Math.round((pair.native.w - pw) / 2);
    const py = pair.native.y + Math.round((pair.native.h - ph) / 2);
    const dip = screen.screenToDipPoint({ x: px, y: py });
    settingsWin.setPosition(Math.round(dip.x), Math.round(dip.y));
  } catch (_) { /* 位置は best-effort */ }
}

// ---------------------------------------------------------------- トレイ
function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
    if (icon.isEmpty()) throw new Error('empty');
  } catch (_) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('WidgetWall');
  const rebuild = () => {
    const auto = getAutostart();
    const layouts = (config.get().settings.layouts || []);
    const layoutItems = layouts.length
      ? layouts.map((l, i) => ({ label: l.name || `レイアウト ${i + 1}`, click: () => applyLayout(i) }))
      : [{ label: '(設定画面から保存できます)', enabled: false }];
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '設定を開く', click: () => openSettings() },
      { label: 'レイアウトを編集', click: () => enterEditMode() },
      { label: 'レイアウトプリセット', submenu: layoutItems },
      { label: '天気を更新', click: () => { const w = weatherWidget(); if (w) weather.refresh(w.options); } },
      { type: 'separator' },
      {
        label: '自動起動', type: 'checkbox', checked: auto.enabled, enabled: auto.supported,
        click: (item) => setAutostart(item.checked),
      },
      { type: 'separator' },
      { label: '終了', click: () => quitApp() },
    ]));
  };
  rebuild();
  tray.on('double-click', () => openSettings());
  tray.rebuild = rebuild;
}

// ---------------------------------------------------------------- 自動起動
function autostartExePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function getAutostart() {
  if (!app.isPackaged) return { enabled: false, supported: false };
  const s = app.getLoginItemSettings({ path: autostartExePath(), args: ['--autostart'] });
  return { enabled: s.openAtLogin, supported: true };
}

function setAutostart(enabled) {
  if (!app.isPackaged) return getAutostart();
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: autostartExePath(),
    args: ['--autostart'],
  });
  if (tray && tray.rebuild) tray.rebuild();
  return getAutostart();
}

// ---------------------------------------------------------------- サービス同期 (天気 / HW モニタ / 省電力)
function syncServices() {
  const c = config.get();

  // 天気
  const w = weatherWidget();
  const key = w ? JSON.stringify([w.options.lat, w.options.lon, c.settings.weatherIntervalMin]) : '';
  if (key !== lastWeatherKey) {
    lastWeatherKey = key;
    if (w) weather.schedule(() => weatherWidget(), c.settings.weatherIntervalMin);
    else weather.stopSchedule();
  }

  // ハードウェアモニタ
  const statsWidgets = c.widgets.filter(x => x.type === 'stats');
  const wantLhm = statsWidgets.some(x => (x.options.source || 'auto') !== 'builtin') && !process.env.WW_NO_LHM;
  const wantBuiltin = statsWidgets.some(x => (x.options.source || 'auto') !== 'lhm');
  if (wantLhm) lhm.start(() => config.get().settings.lhmUrl);
  else lhm.stop();
  if (wantBuiltin) stats.start();
  else stats.stop();

  // フルスクリーン検知 (省電力)
  if (c.settings.pauseOnFullscreen && !process.env.WW_NO_FS) {
    fullscreen.start(() => displayPairs.map(p => ({ index: p.index, native: p.native })));
  } else {
    fullscreen.stop();
  }

  // 壁紙スケジュール (昼夜 / 曜日の自動切替)
  const schedKey = JSON.stringify(c.settings.schedule || {});
  if (schedKey !== lastScheduleKey) {
    lastScheduleKey = schedKey;
    lastScheduleMode = null; // 設定が変わったら次の判定で必ず適用し直す
  }
  if (c.settings.schedule && c.settings.schedule.enabled) {
    heartbeat.register('schedule', 60000, applySchedule, true);
  } else {
    heartbeat.unregister('schedule');
  }

  // 再生中メディア (nowplaying ウィジェット / アルバムアート壁紙があるときだけ PS ブリッジを起動)
  const wallpapersAll = [c.wallpapers.default, ...Object.values(c.wallpapers.byDisplay || {})];
  const needMedia = c.widgets.some(x => x.type === 'nowplaying') || wallpapersAll.some(w => w && w.type === 'nowplaying');
  if (needMedia && !process.env.WW_NO_MEDIA) media.start();
  else media.stop();

  // RSS / 株価フィード (該当ウィジェットの分だけ購読)
  feeds.sync(
    c.widgets.filter(x => x.type === 'rss').map(x => (x.options || {}).url),
    c.widgets.filter(x => x.type === 'ticker').map(x => (x.options || {}).symbols),
  );
}

let lastScheduleKey = '';
let lastScheduleMode = null;

function applySchedule() {
  const s = config.get().settings.schedule;
  if (!s || !s.enabled) return;
  const now = new Date();
  let mode, snap;

  if (s.mode === 'weekly') {
    mode = 'w' + now.getDay();
    snap = (s.weekly || {})[String(now.getDay())];
  } else {
    const parse = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1] * 60 + +m[2]) : null; };
    const dayM = parse(s.dayStart), nightM = parse(s.nightStart);
    if (dayM == null || nightM == null) return;
    const cur = now.getHours() * 60 + now.getMinutes();
    if (dayM <= nightM) mode = (cur >= dayM && cur < nightM) ? 'day' : 'night';
    else mode = (cur >= dayM || cur < nightM) ? 'day' : 'night';
    snap = s[mode];
  }

  if (mode === lastScheduleMode) return;
  lastScheduleMode = mode;
  if (!snap) return;
  config.update(c => { c.wallpapers.default = JSON.parse(JSON.stringify(snap)); });
}

function mergedHw() {
  if (lhm.isOnline() && lhm.getLatest()) return lhm.getLatest();
  if (lastBuiltin) {
    return {
      ok: true, source: 'builtin',
      cpu: { load: lastBuiltin.cpu, temp: null },
      gpu: { load: null, temp: null },
      mem: { load: lastBuiltin.mem, usedGb: +lastBuiltin.memUsedGb, totalGb: +lastBuiltin.memTotalGb },
      drives: [], net: null,
    };
  }
  return { ok: false };
}

// ---------------------------------------------------------------- レイアウトプリセット / 修復
function applyLayout(i) {
  const c = config.get();
  const l = (c.settings.layouts || [])[i];
  if (!l) return;
  placedKey.clear();
  config.update(cfg => {
    cfg.wallpapers = JSON.parse(JSON.stringify(l.wallpapers));
    cfg.widgets = JSON.parse(JSON.stringify(l.widgets));
  });
}

// 壊れたときの立て直し: 全ウィンドウを作り直してアタッチし直す
function repairAll() {
  try {
    for (const win of [...wallWins.values(), ...folderWins.values()]) {
      if (!win.isDestroyed()) {
        try { attach.detach(getHwnd(win)); } catch (_) {}
        try { win.destroy(); } catch (_) {}
      }
    }
  } catch (_) {}
  wallWins.clear();
  folderWins.clear();
  placedKey.clear();
  placeGen.clear();
  iconCache.clear();
  attach.refreshDesktop();
  rebuildWallWindows();
  const w = weatherWidget();
  if (w) weather.refresh(w.options);
  return true;
}

// ---------------------------------------------------------------- 終了
function quitApp() {
  try {
    heartbeat.unregister('watchdog');
    fullscreen.stop();
    media.stop();
    for (const win of [...wallWins.values(), ...folderWins.values()]) {
      if (!win.isDestroyed()) {
        try { attach.detach(getHwnd(win)); } catch (_) {}
        try { win.destroy(); } catch (_) {}
      }
    }
  } catch (_) {}
  try { tray && tray.destroy(); } catch (_) {}
  app.exit(0);
}

// ---------------------------------------------------------------- 起動
function onReady() {
  config.load();

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'local-fonts');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'local-fonts');

  rebuildWallWindows();
  createTray();
  startWatchdog();
  syncServices();

  if (!IS_AUTOSTART) openSettings();

  const onDisplayChange = () => {
    if (editMode) return;
    rebuildWallWindows();
    broadcast('config', configEnvelope());
  };
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);

  powerMonitor.on('resume', () => {
    setTimeout(() => {
      const w = weatherWidget();
      if (w) weather.refresh(w.options);
      if (!editMode) rebuildWallWindows();
      broadcast('config', configEnvelope());
    }, 3000);
  });

  updater.init();

  config.on('change', (c) => {
    broadcast('config', configEnvelope());
    syncServices();
    if (!editMode) syncFolders();
    if (tray && tray.rebuild) tray.rebuild();
  });
  weather.on('update', (d) => broadcast('weather', d));
  stats.on('update', (d) => { lastBuiltin = d; if (!lhm.isOnline()) broadcast('hw', mergedHw()); });
  lhm.on('update', () => broadcast('hw', mergedHw()));
  lhm.on('status', (on) => broadcast('lhm-status', on));
  media.on('update', (d) => broadcast('media', d));
  feeds.on('rss', (d) => broadcast('rss', d));
  feeds.on('ticker', (d) => broadcast('ticker', d));
  updater.on('status', (s) => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update-status', s);
  });
  fullscreen.on('change', (index, paused) => {
    if (editMode) return;
    const win = wallWins.get(index);
    if (win && !win.isDestroyed()) win.webContents.send('power', { paused });
  });

  // ---- 開発用セルフテストフック ----
  if (process.env.WW_TEST_EDIT) {
    setTimeout(() => enterEditMode(), 4000);
    setTimeout(() => exitEditMode(), 7500);
  }
  if (process.env.WW_TEST_AUTOSTART) {
    setTimeout(() => {
      console.log('AUTOSTART_ON:', JSON.stringify(setAutostart(true)));
      console.log('AUTOSTART_OFF:', JSON.stringify(setAutostart(false)));
      quitApp();
    }, 3000);
  }
}

app.on('window-all-closed', () => { /* トレイ常駐のため終了しない */ });
app.on('before-quit', () => {
  try {
    for (const win of [...wallWins.values(), ...folderWins.values()]) {
      if (!win.isDestroyed()) attach.detach(getHwnd(win));
    }
  } catch (_) {}
});

// ---------------------------------------------------------------- IPC
ipcMain.handle('config:get', () => configEnvelope());

ipcMain.handle('displays:list', () => monitors.describe(screen));

ipcMain.handle('wallpaper:set', (e, patch, displayIndex) => config.update(c => {
  if (displayIndex == null) {
    Object.assign(c.wallpapers.default, patch);
  } else {
    const k = String(displayIndex);
    c.wallpapers.byDisplay[k] = Object.assign({}, c.wallpapers.default, c.wallpapers.byDisplay[k] || {}, patch);
  }
}));

ipcMain.handle('wallpaper:clearOverride', (e, displayIndex) => config.update(c => {
  delete c.wallpapers.byDisplay[String(displayIndex)];
}));

ipcMain.handle('settings:set', (e, patch) => config.update(c => Object.assign(c.settings, patch)));

ipcMain.handle('custompreset:save', (e, value) => config.update(c => {
  c.settings.customPresets = [value, ...c.settings.customPresets].slice(0, 12);
}));

ipcMain.handle('custompreset:remove', (e, i) => config.update(c => {
  c.settings.customPresets.splice(i, 1);
}));

ipcMain.handle('widget:add', (e, type) => {
  let created = null;
  config.update(c => {
    created = config.newWidget(type);
    c.widgets.push(created);
  });
  return created;
});

ipcMain.handle('widget:remove', (e, id) => config.update(c => {
  c.widgets = c.widgets.filter(w => w.id !== id);
}));

ipcMain.handle('widget:update', (e, id, patch) => config.update(c => {
  const w = c.widgets.find(x => x.id === id);
  if (!w) return;
  const { options, ...rest } = patch || {};
  Object.assign(w, rest);
  if (options) Object.assign(w.options, options);
}));

ipcMain.handle('file:pick', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: '壁紙にする画像・動画を選択',
    properties: ['openFile'],
    filters: [{ name: '画像・動画', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp4', 'webm'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { path: p, kind: /\.(mp4|webm)$/i.test(p) ? 'video' : 'image' };
});

ipcMain.handle('file:pickImage', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: 'ウィジェットとして表示する画像を選択',
    properties: ['openFile'],
    filters: [{ name: '画像', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }],
  });
  return (r.canceled || !r.filePaths[0]) ? null : r.filePaths[0];
});

ipcMain.handle('folder:pick', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: 'フォルダウィジェットに入れるアプリ・ファイルを選択',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'アプリ・ショートカット', extensions: ['lnk', 'exe', 'url', 'bat'] },
      { name: 'すべてのファイル', extensions: ['*'] },
    ],
  });
  if (r.canceled) return [];
  return r.filePaths.map(p => ({ path: p, name: path.basename(p).replace(/\.(lnk|exe|url|bat)$/i, '') }));
});

function folderItemPaths() {
  const set = new Set();
  for (const w of config.get().widgets) {
    if (w.type !== 'folder') continue;
    for (const it of w.options.items || []) set.add(it.path);
  }
  return set;
}

// .lnk / .url はリンク自体でなく「指し先」のアイコンを解決する
// (getFileIcon をショートカットに直接使うと汎用アイコンになることがある)
async function resolveIcon(p) {
  const tryIcon = async (target) => {
    if (!target) return null;
    try {
      if (/\.(ico|png)$/i.test(target)) {
        const img = nativeImage.createFromPath(target);
        if (img && !img.isEmpty()) return img;
      }
      const img = await app.getFileIcon(target, { size: 'large' });
      return (img && !img.isEmpty()) ? img : null;
    } catch (_) { return null; }
  };

  if (/\.lnk$/i.test(p)) {
    try {
      const s = shell.readShortcutLink(p);
      const img = (await tryIcon(s.icon)) || (await tryIcon(s.target));
      if (img) return img;
    } catch (_) { /* 展開できない .lnk は下のフォールバックへ */ }
  }
  if (/\.url$/i.test(p)) {
    try {
      const txt = require('fs').readFileSync(p, 'utf8');
      const m = /^IconFile\s*=\s*(.+)$/im.exec(txt);
      if (m) {
        const img = await tryIcon(m[1].trim());
        if (img) return img;
      }
    } catch (_) {}
  }
  return await tryIcon(p);
}

ipcMain.handle('icon:get', async (e, p) => {
  if (!folderItemPaths().has(p)) return null;
  if (iconCache.has(p)) return iconCache.get(p);
  const img = await resolveIcon(p);
  if (!img) return null;
  const url = img.toDataURL();
  iconCache.set(p, url);
  return url;
});

ipcMain.on('folder:launch', (e, id, p) => {
  const w = config.get().widgets.find(x => x.id === id && x.type === 'folder');
  if (!w || !(w.options.items || []).some(it => it.path === p)) return;

  shell.openPath(p).then(err => {
    if (!err) return;
    // calc.exe のような UWP スタブは ShellExecute で開けないことがある。
    // 実行ファイルなら直接起動でフォールバックする
    if (/\.(exe|bat|cmd)$/i.test(p)) {
      try {
        require('child_process')
          .spawn(p, [], { detached: true, stdio: 'ignore', cwd: path.dirname(p) })
          .unref();
        return;
      } catch (e2) {
        if (process.env.WW_DEBUG) console.log('[launch] spawn failed:', e2.message);
      }
    }
    if (process.env.WW_DEBUG) console.log('[launch] openPath error:', err);
  });
});

ipcMain.handle('folder:state', (e, id) => {
  const w = config.get().widgets.find(x => x.id === id);
  return { widget: w || null, fontsCss: gfonts.cssFor(config.get().settings.googleFonts) };
});

ipcMain.handle('city:search', (e, q) => weather.searchCity(q));
ipcMain.handle('weather:get', () => weather.getLatest());
ipcMain.handle('weather:refresh', () => {
  const w = weatherWidget();
  return w ? weather.refresh(w.options) : null;
});

ipcMain.handle('hw:get', () => ({ hw: mergedHw(), lhmOnline: lhm.isOnline() }));

ipcMain.handle('gfont:add', async (e, family) => {
  const r = await gfonts.add(family);
  if (r.ok) {
    config.update(c => {
      c.settings.googleFonts = [
        ...c.settings.googleFonts.filter(f => f.family.toLowerCase() !== r.family.toLowerCase()),
        { family: r.family, cssFile: r.cssFile },
      ];
    });
    broadcast('fonts-changed', null);
  }
  return r;
});

ipcMain.handle('gfont:remove', (e, family) => {
  gfonts.remove(family);
  config.update(c => {
    c.settings.googleFonts = c.settings.googleFonts.filter(f => f.family !== family);
  });
  broadcast('fonts-changed', null);
  return true;
});

ipcMain.handle('fonts:css', () => gfonts.cssFor(config.get().settings.googleFonts));

ipcMain.handle('autostart:get', () => getAutostart());
ipcMain.handle('autostart:set', (e, v) => setAutostart(!!v));

ipcMain.handle('edit:enter', () => enterEditMode());
ipcMain.on('edit:live', (e, id, partial) => {
  if (!editMode || !id) return;
  const prev = pendingLayout.get(id) || {};
  const merged = { ...prev, ...partial };
  if (partial && partial.options) merged.options = { ...(prev.options || {}), ...partial.options };
  pendingLayout.set(id, merged);
});
ipcMain.on('edit:finish', () => exitEditMode());

ipcMain.handle('state:request', () => ({
  ...configEnvelope(),
  weather: weather.getLatest(),
  hw: mergedHw(),
  media: media.getLatest(),
  feeds: feeds.snapshot(),
  editing: editMode,
  version: app.getVersion(),
}));

// ---- 画像スライドショー用の複数選択 ----
ipcMain.handle('file:pickImages', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: 'スライドショーにする画像を選択 (複数可)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '画像', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

// ---- メモ / タイマーなど対話ウィジェットからの保存 (options の一部だけ許可) ----
const INTER_SAVE_KEYS = new Set(['text', 'doneCount']);
ipcMain.on('inter:save', (e, id, options) => {
  const w = config.get().widgets.find(x => x.id === id && INTERACTIVE_TYPES.has(x.type));
  if (!w || !options || typeof options !== 'object') return;
  const patch = {};
  for (const k of Object.keys(options)) {
    if (INTER_SAVE_KEYS.has(k)) patch[k] = options[k];
  }
  if (Object.keys(patch).length) {
    config.update(c => {
      const t = c.widgets.find(x => x.id === id);
      if (t) Object.assign(t.options, patch);
    });
  }
});

// ---- 設定のエクスポート / インポート ----
ipcMain.handle('config:export', async () => {
  const r = await dialog.showSaveDialog(settingsWin, {
    title: '設定をエクスポート',
    defaultPath: `WidgetWall-settings-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, msg: 'キャンセルしました' };
  try {
    require('fs').writeFileSync(r.filePath, JSON.stringify(config.get(), null, 2), 'utf8');
    return { ok: true, msg: 'エクスポートしました' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle('config:import', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: '設定をインポート',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, msg: 'キャンセルしました' };
  try {
    const parsed = JSON.parse(require('fs').readFileSync(r.filePaths[0], 'utf8'));
    if (!parsed || typeof parsed !== 'object' || (!parsed.widgets && !parsed.wallpapers && !parsed.wallpaper)) {
      return { ok: false, msg: 'WidgetWall の設定ファイルではありません' };
    }
    placedKey.clear();
    config.replace(parsed);
    return { ok: true, msg: 'インポートしました (元の設定はバックアップ済み)' };
  } catch (e) {
    return { ok: false, msg: '読み込みに失敗: ' + e.message };
  }
});

// ---- レイアウトプリセット ----
ipcMain.handle('layout:save', (e, name) => {
  const c = config.get();
  const snap = {
    name: String(name || '').slice(0, 40) || `レイアウト ${(c.settings.layouts || []).length + 1}`,
    wallpapers: JSON.parse(JSON.stringify(c.wallpapers)),
    widgets: JSON.parse(JSON.stringify(c.widgets)),
  };
  config.update(cfg => { cfg.settings.layouts = [...(cfg.settings.layouts || []), snap].slice(0, 12); });
  return config.get().settings.layouts;
});

ipcMain.handle('layout:apply', (e, i) => { applyLayout(i); return true; });

ipcMain.handle('layout:overwrite', (e, i) => {
  config.update(c => {
    const l = (c.settings.layouts || [])[i];
    if (l) {
      l.wallpapers = JSON.parse(JSON.stringify(c.wallpapers));
      l.widgets = JSON.parse(JSON.stringify(c.widgets));
    }
  });
  return config.get().settings.layouts;
});

ipcMain.handle('layout:remove', (e, i) => {
  config.update(c => { (c.settings.layouts || []).splice(i, 1); });
  return config.get().settings.layouts;
});

// ---- メンテナンス / アップデート / アンインストール ----
ipcMain.handle('app:repair', () => repairAll());

ipcMain.handle('update:get', () => updater.getStatus());
ipcMain.handle('update:check', () => updater.check());
ipcMain.on('update:install', () => updater.installNow());

ipcMain.handle('app:uninstall', async () => {
  if (!app.isPackaged) return { ok: false, msg: '開発モードでは使えません' };
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return { ok: false, msg: 'ポータブル版は exe を削除するだけでアンインストール完了です (設定は %APPDATA%\\widgetwall)' };
  }
  const un = path.join(path.dirname(process.execPath), 'Uninstall WidgetWall.exe');
  if (!require('fs').existsSync(un)) return { ok: false, msg: 'アンインストーラが見つかりません (設定 → アプリから削除してください)' };
  const { response } = await dialog.showMessageBox(settingsWin, {
    type: 'warning',
    buttons: ['アンインストール', 'キャンセル'],
    defaultId: 1,
    cancelId: 1,
    message: 'WidgetWall をアンインストールしますか?',
    detail: '壁紙とウィジェットは消えます。設定ファイルは残るため、再インストールすれば元に戻ります。',
  });
  if (response !== 0) return { ok: false, msg: 'キャンセルしました' };
  require('child_process').spawn(un, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => quitApp(), 500);
  return { ok: true, msg: '' };
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('win:minimize', () => settingsWin && settingsWin.minimize());
ipcMain.on('win:close', () => settingsWin && settingsWin.close());
ipcMain.on('app:quit', () => quitApp());
