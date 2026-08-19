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
const folderWins = new Map();          // widgetId -> BrowserWindow
let settingsWin = null;
let tray = null;
let editMode = false;
let lastWeatherKey = '';
let lastBuiltin = null;                // 内蔵 CPU/MEM サンプル
const pendingLayout = new Map();       // 編集モード中のレイアウト変更
const iconCache = new Map();           // path -> dataURL

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

// ---------------------------------------------------------------- フォルダウィジェットウィンドウ
function createFolderWindow(widget) {
  const dims = folderDims(widget.options);
  const win = new BrowserWindow({
    width: dims.w, height: dims.h,
    frame: false, resizable: true, movable: false,
    minimizable: false, maximizable: false, closable: false,
    skipTaskbar: true, focusable: false, show: false,
    hasShadow: false, roundedCorners: false, thickFrame: false,
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: PRELOAD('folder.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  folderWins.set(widget.id, win);
  win.loadFile(RENDERER(path.join('folder', 'index.html')), { query: { wid: widget.id } });
  win.once('ready-to-show', () => {
    if (!editMode) {
      win.showInactive();
      placeFolder(widget.id);
    }
  });
  win.webContents.on('render-process-gone', () => {
    try { win.destroy(); } catch (_) {}
    folderWins.delete(widget.id);
    setTimeout(() => { if (!editMode) syncFolders(); }, 1000);
  });
}

function placeFolder(id) {
  const win = folderWins.get(id);
  const widget = config.get().widgets.find(w => w.id === id);
  if (!win || win.isDestroyed() || !widget) return;
  const pair = displayPairs.find(p => p.index === (widget.display || 0)) || displayPairs[0];
  if (!pair) return;
  const dims = folderDims(widget.options);
  const sf = pair.display.scaleFactor || 1;
  const pw = Math.round(dims.w * sf), ph = Math.round(dims.h * sf);
  const cx = pair.native.x + Math.round(pair.native.w * widget.x / 100);
  const cy = pair.native.y + Math.round(pair.native.h * widget.y / 100);
  const rect = {
    x: Math.min(Math.max(cx - (pw >> 1), pair.native.x), pair.native.x + pair.native.w - pw),
    y: Math.min(Math.max(cy - (ph >> 1), pair.native.y), pair.native.y + pair.native.h - ph),
    w: pw, h: ph,
  };
  const hwnd = getHwnd(win);
  attach.attachAbove(hwnd, rect);
  try { win.webContents.setZoomFactor(sf); } catch (_) {}

  // モニタごとに DPI 換算が異なり、Electron が遅れて自己流のサイズを再適用してくるため、
  // 「実測 → ずれていれば DIP を逆算補正 → 物理位置を再適用」を一致するまで繰り返し、
  // 安定してから実測値で角丸リージョンを切る (ズレたまま切ると見た目が崩れる)
  const settle = (n) => {
    if (editMode || !win || win.isDestroyed() || !attach.isWindowAlive(hwnd)) return;
    const r = attach.getRect(hwnd);
    if (r.x === rect.x && r.y === rect.y && r.w === rect.w && r.h === rect.h) {
      attach.setRoundRegion(hwnd, rect.w, rect.h, Math.round(14 * sf));
      return;
    }
    if (r.w !== rect.w || r.h !== rect.h) {
      const b = win.getBounds();
      const nw = Math.max(40, Math.round(rect.w / ((r.w / b.width) || 1)));
      const nh = Math.max(30, Math.round(rect.h / ((r.h / b.height) || 1)));
      win.setBounds({ width: nw, height: nh });
    }
    attach.ensurePlacement(hwnd, rect);
    if (n > 0) {
      setTimeout(() => settle(n - 1), 130);
    } else {
      // 収束しきらなくても、実測サイズに合わせてリージョンを切れば見た目は崩れない
      const fin = attach.getRect(hwnd);
      attach.setRoundRegion(hwnd, fin.w, fin.h, Math.round(14 * sf));
    }
  };
  setTimeout(() => settle(6), 130);
}

function syncFolders() {
  const folders = config.get().widgets.filter(w => w.type === 'folder');
  for (const [id, win] of [...folderWins]) {
    if (!folders.find(w => w.id === id)) {
      try { attach.detach(getHwnd(win)); } catch (_) {}
      try { win.destroy(); } catch (_) {}
      folderWins.delete(id);
    }
  }
  for (const w of folders) {
    if (!folderWins.has(w.id)) {
      createFolderWindow(w);
    } else {
      const win = folderWins.get(w.id);
      win.webContents.send('fw', w);
      if (editMode) {
        win.hide();
      } else {
        if (!win.isVisible()) win.showInactive();
        placeFolder(w.id);
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
  for (const w of config.get().widgets.filter(x => x.type === 'folder')) {
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
    x: Math.round(wa.x + (wa.width - sw) / 2),
    y: Math.round(wa.y + (wa.height - sh) / 2),
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
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
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
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '設定を開く', click: () => openSettings() },
      { label: 'レイアウトを編集', click: () => enterEditMode() },
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

  // 壁紙スケジュール (昼 / 夜の自動切替)
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
}

let lastScheduleKey = '';
let lastScheduleMode = null;

function applySchedule() {
  const s = config.get().settings.schedule;
  if (!s || !s.enabled) return;
  const parse = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1] * 60 + +m[2]) : null; };
  const dayM = parse(s.dayStart), nightM = parse(s.nightStart);
  if (dayM == null || nightM == null) return;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  let mode;
  if (dayM <= nightM) mode = (cur >= dayM && cur < nightM) ? 'day' : 'night';
  else mode = (cur >= dayM || cur < nightM) ? 'day' : 'night';
  if (mode === lastScheduleMode) return;
  lastScheduleMode = mode;
  const snap = s[mode];
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

// ---------------------------------------------------------------- 終了
function quitApp() {
  try {
    heartbeat.unregister('watchdog');
    fullscreen.stop();
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

  config.on('change', (c) => {
    broadcast('config', configEnvelope());
    syncServices();
    if (!editMode) syncFolders();
  });
  weather.on('update', (d) => broadcast('weather', d));
  stats.on('update', (d) => { lastBuiltin = d; if (!lhm.isOnline()) broadcast('hw', mergedHw()); });
  lhm.on('update', () => broadcast('hw', mergedHw()));
  lhm.on('status', (on) => broadcast('lhm-status', on));
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
  shell.openPath(p);
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
  editing: editMode,
  version: app.getVersion(),
}));

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('win:minimize', () => settingsWin && settingsWin.minimize());
ipcMain.on('win:close', () => settingsWin && settingsWin.close());
ipcMain.on('app:quit', () => quitApp());
