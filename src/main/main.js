// AeroWidget — メインプロセス (v2: マルチモニタ / フォルダウィジェット / 省電力)
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, powerMonitor, nativeImage, session, shell, desktopCapturer } = require('electron');
const path = require('path');
const brand = require('../shared/brand');
const migrate = require('./migrate');
const config = require('./config');
const backup = require('./backup');
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
const audio = require('./audio');
const hotkeys = require('./hotkeys');
const scenes = require('./scenes');
const icons = require('./icons');
const sysinfo = require('./sysinfo');
const ics = require('./ics');
const onlinewall = require('./onlinewall');
const { THEMES } = require('./themes');

// 壁紙ウィンドウはアイコンの背面 = 常に「隠れている」扱いになるため、
// Chromium の被覆検知・スロットリングを止めないと描画が停止する
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// 動画壁紙は GPU のハードウェアデコード (NVDEC / QuickSync) を使う
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

// 常駐アプリなので、想定外の例外でエラーダイアログを出して止まるより
// ログに残して壁紙を表示し続ける方が実害が小さい
process.on('uncaughtException', (e) => {
  console.error('uncaught exception:', e && e.stack ? e.stack : e);
});
process.on('unhandledRejection', (e) => {
  console.error('unhandled rejection:', e && e.stack ? e.stack : e);
});

const IS_AUTOSTART = process.argv.includes('--autostart');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PRELOAD = (n) => path.join(__dirname, '..', 'preload', n);
const RENDERER = (n) => path.join(__dirname, '..', 'renderer', n);

let displayPairs = [];                 // [{index, display, native}]
const wallWins = new Map();            // displayIndex -> BrowserWindow
const folderWins = new Map();          // widgetId -> BrowserWindow (フォルダ/メモ/タイマーの対話ウィジェット)
const overlayWins = new Map();         // モニタ index -> BrowserWindow (呼び出せるダッシュボード)
let settingsWin = null;
let tray = null;
let editMode = false;
let lastWeatherKey = '';
let lastBuiltin = null;                // 内蔵 CPU/MEM サンプル
const pendingLayout = new Map();       // 編集モード中のレイアウト変更
const iconCache = new Map();           // path -> dataURL

// デスクトップ上でクリックできる「小窓型」ウィジェット
const INTERACTIVE_TYPES = new Set(['folder', 'note', 'pomo', 'volume', 'nowplaying', 'todo', 'switcher', 'modeswitch']);
let widgetsHidden = false;             // ホットキーによる全ウィジェット非表示
const placedKey = new Map();           // widgetId -> 配置キー (無関係な設定変更で再配置しない)
const placeGen = new Map();            // widgetId -> 世代 (収束ループの多重実行防止)

// ---------------------------------------------------------------- 単一インスタンス
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(() => {
    // 旧名からの引っ越しは、設定を読むより先に済ませる
    try { migrate.run(); } catch (e) { console.error('migrate failed:', e.message); }
    return onReady();
  });
}

// ---------------------------------------------------------------- ユーティリティ
function getHwnd(win) {
  return Number(win.getNativeWindowHandle().readBigUInt64LE(0));
}

function allWindows() {
  return [...wallWins.values(), ...overlayWins.values(), ...folderWins.values(), settingsWin]
    .filter(w => w && !w.isDestroyed());
}

function broadcast(channel, payload) {
  for (const w of allWindows()) w.webContents.send(channel, payload);
}

function configEnvelope() {
  return {
    config: config.get(),
    systemWallpaper: attach.getSystemWallpaperPath(),
    onlineWallpaper: onlinewall.getCurrent(),
    osLocale: app.getLocale() || 'ja',
    brand: brand.NAME,
  };
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

// 対話ウィジェット (フォルダ / メモ / タイマー / 音量 / 再生中の曲) の CSS ピクセル寸法
function interDims(w) {
  const o = w.options || {};
  if (w.type === 'note') return { w: Math.max(140, o.w || 240), h: Math.max(90, o.h || 180) };
  if (w.type === 'pomo') return { w: Math.max(170, o.w || 210), h: Math.max(120, o.h || 150) };
  if (w.type === 'volume') {
    return { w: Math.max(180, o.w || 260), h: Math.max(70, o.h || (o.showDevices !== false ? 120 : 78)) };
  }
  if (w.type === 'nowplaying') return { w: Math.max(200, o.w || 320), h: Math.max(70, o.h || 96) };
  if (w.type === 'todo') return { w: Math.max(170, o.w || 250), h: Math.max(120, o.h || 220) };
  if (w.type === 'switcher' || w.type === 'modeswitch') {
    return o.vertical
      ? { w: Math.max(110, o.w || 150), h: Math.max(80, o.h || 160) }
      : { w: Math.max(140, o.w || 300), h: Math.max(34, o.h || 46) };
  }
  return folderDims(o);
}

// ---------------------------------------------------------------- 壁紙ウィンドウ (モニタごと)
// ---- 呼び出せるダッシュボード (オーバーレイ) ----
//
// 壁紙は作業中どうしても隠れてしまうので、同じ配置を最前面に呼び出せるようにする。
// 背後をキャプチャしてぼかすのではなく、壁紙レンダラーをそのまま読み込んで
// 暗幕を重ねる。実装が軽く、Windows の透過ウィンドウの相性問題も踏まない。

function overlayVisible() {
  for (const w of overlayWins.values()) if (w && !w.isDestroyed()) return true;
  return false;
}

function createOverlayWindow(pair) {
  const b = pair.display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, show: false, hasShadow: false,
    roundedCorners: false, thickFrame: false,
    backgroundColor: '#000000',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: PRELOAD('wallpaper.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlayWins.set(pair.index, win);

  // ゲームのフルスクリーンより上に出したいので screen-saver 相当に置く
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);

  win.loadFile(RENDERER(path.join('wallpaper', 'index.html')),
    { query: { display: String(pair.index), overlay: '1' } });

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    // 混在 DPI で作成時サイズがずれることがあるため、出す直前に貼り直す
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    win.show();
    win.focus();
    if (process.env.WW_DEBUG) console.log('[overlay] shown display=' + pair.index, JSON.stringify(win.getBounds()));
  });
  win.on('closed', () => { if (process.env.WW_DEBUG) console.log('[overlay] closed display=' + pair.index); });

  // カーソルのあるモニタが前面でないと、Windows のフォアグラウンド制限で
  // focus() が通らず、開いた直後に blur が飛んでくる。そのまま閉じると
  // 「別モニタでは一瞬で消える」ことになるので、一度でも焦点を得るまで待つ。
  let everFocused = false;
  win.on('focus', () => { everFocused = true; });
  win.on('blur', () => {
    const on = (config.get().settings.overlay || {}).closeOnBlur !== false;
    if (process.env.WW_DEBUG) console.log('[overlay] blur closeOnBlur=' + on + ' everFocused=' + everFocused);
    if (on && everFocused) hideOverlay();
  });

  win.webContents.on('render-process-gone', () => hideOverlay());
  return win;
}

function showOverlay() {
  if (overlayVisible()) return;
  const pairs = displayPairs.length ? displayPairs : monitors.pair(screen);
  if (!pairs.length) return;

  const o = config.get().settings.overlay || {};
  let targets = pairs;
  if (!o.allDisplays) {
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    const hit = pairs.find(p => p.display.id === d.id);
    targets = hit ? [hit] : [pairs[0]];
  }

  if (process.env.WW_DEBUG) console.log('[overlay] show targets=' + targets.map(t => t.index).join(','));
  if (o.hideIcons !== false) attach.setDesktopIconsVisible(false);
  for (const pair of targets) createOverlayWindow(pair);
}

function hideOverlay() {
  if (!overlayWins.size) return;
  if (process.env.WW_DEBUG) console.log('[overlay] hide');
  for (const [i, win] of [...overlayWins]) {
    overlayWins.delete(i);
    try { if (!win.isDestroyed()) win.destroy(); } catch (_) { /* 破棄済み */ }
  }
  // アイコンは「普段の設定」に戻す (編集モードの一時切替と同じ考え方)
  if (!editMode) {
    const show = config.get().settings.showDesktopIcons !== false;
    attach.setDesktopIconsVisible(show);
  }
}

function toggleOverlay() {
  if (overlayVisible()) hideOverlay(); else showOverlay();
}

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
  if (process.env.WW_DEBUG) {
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      console.log(`[wall${pair.index}:${level}] ${message} (${String(sourceId).split(/[\/]/).pop()}:${line})`);
    });
  }

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
const INTER_RENDERER = { folder: 'folder', note: 'note', pomo: 'pomo', volume: 'volume', nowplaying: 'nowplaying', todo: 'todo', switcher: 'switcher', modeswitch: 'switcher' };

function createFolderWindow(widget) {
  const dims = interDims(widget);
  const win = new BrowserWindow({
    width: dims.w, height: dims.h,
    // ユーザーが枠をドラッグしてリサイズすると中身と食い違って崩れるため禁止。
    // (サイズ変更は設定画面か編集モードのホイールから行う)
    frame: false, resizable: false, movable: false,
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
  if (process.env.WW_DEBUG) {
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      console.log(`[${widget.type}:${level}] ${message} (${String(sourceId).split(/[\\/]/).pop()}:${line})`);
    });
  }
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

// resizable:false のままだと setSize が効かないので、変更の瞬間だけ解除する
function resizeLocked(win, w, h) {
  try {
    win.setResizable(true);
    win.setSize(Math.round(w), Math.round(h));
  } finally {
    try { win.setResizable(false); } catch (_) {}
  }
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
  resizeLocked(win, dims.w, dims.h);
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
      resizeLocked(win, nw, nh);
      setTimeout(() => settle(n - 1), 120);
      return;
    }
    attach.setRoundRegion(hwnd, r.w, r.h, Math.round(14 * sf));
  };
  setTimeout(() => settle(4), 140);
}

function syncFolders() {
  const inters = config.get().widgets.filter(w => INTERACTIVE_TYPES.has(w.type) && !w.off);
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
      // 「停止中は隠す」設定の再生中ウィジェットは、何も鳴っていなければ窓ごと隠す
      const hideIdle = w.type === 'nowplaying' && (w.options || {}).hideWhenStopped
        && !((media.getLatest() || {}).title);
      if (editMode || hideIdle) {
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
  scenes.setPaused(true);
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
  scenes.setPaused(false);
  // 集めたレイアウト変更を反映
  if (pendingLayout.size) {
    config.update(c => {
      for (const [id, p] of pendingLayout) {
        const w = c.widgets.find(x => x.id === id);
        if (!w) continue;
        for (const k of ['x', 'y', 'size']) {
          if (typeof p[k] === 'number') w[k] = round2(p[k]);
        }
        if (typeof p.locked === 'boolean') w.locked = p.locked;
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
  for (const w of config.get().widgets.filter(x => INTERACTIVE_TYPES.has(x.type) && !x.off)) {
    const win = folderWins.get(w.id);
    if (win && !win.isDestroyed()) {
      win.showInactive();
      placeFolder(w.id);
    }
  }
  // 編集中の一時的なアイコン切替を、通常時の設定値へ戻す
  attach.setDesktopIconsVisible(config.get().settings.showDesktopIcons !== false);
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
  if (process.env.WW_DEBUG) {
    settingsWin.webContents.on('console-message', (e, level, message, line, sourceId) => {
      console.log(`[settings:${level}] ${message} (${sourceId}:${line})`);
    });
  }
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
  tray.setToolTip(brand.NAME);
  const rebuild = () => {
    const auto = getAutostart();
    const lang = config.get().settings.language || 'auto';
    const en = lang === 'en' || (lang === 'auto' && !(app.getLocale() || 'ja').startsWith('ja'));
    const t = (ja, enS) => (en ? enS : ja);
    const layouts = (config.get().settings.layouts || []);
    const layoutItems = layouts.length
      ? layouts.map((l, i) => ({ label: l.name || `レイアウト ${i + 1}`, click: () => applyLayout(i) }))
      : [{ label: t('(設定画面から保存できます)', '(save from settings)'), enabled: false }];

    // アイコンのモードも、いま当たっているものに印を付けて並べる
    const iconModes = (config.get().settings.iconLayouts || []).filter(l => l.name !== ICON_BACKUP_NAME);
    const curIcons = config.get().settings.currentIconMode || '';
    const iconModeItems = iconModes.map(l => ({
      label: l.name, type: 'radio', checked: l.name === curIcons,
      click: () => applyIconSnapshot(l.name),
    }));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('設定を開く', 'Open settings'), click: () => openSettings() },
      { label: t('レイアウトを編集', 'Edit layout'), click: () => enterEditMode() },
      { label: t('レイアウトプリセット', 'Layout presets'), submenu: layoutItems },
      ...(iconModes.length
        ? [{ label: t('アイコンのモード', 'Icon modes'), submenu: iconModeItems }]
        : []),
      { label: t('天気を更新', 'Refresh weather'), click: () => { const w = weatherWidget(); if (w) weather.refresh(w.options); } },
      {
        // しまってあるものがあるときだけ出す最後の逃げ道
        label: t('しまったウィジェットを全部出す', 'Show all parked widgets'),
        visible: (config.get().widgets || []).some(w => w.off),
        click: () => showAllWidgets(),
      },
      { type: 'separator' },
      {
        label: t('デスクトップアイコンを表示', 'Show desktop icons'), type: 'checkbox',
        checked: config.get().settings.showDesktopIcons !== false,
        click: (item) => config.update(c => { c.settings.showDesktopIcons = item.checked; }),
      },
      {
        label: t('自動起動', 'Start with Windows'), type: 'checkbox', checked: auto.enabled, enabled: auto.supported,
        click: (item) => setAutostart(item.checked),
      },
      { type: 'separator' },
      { label: t('終了', 'Quit'), click: () => quitApp() },
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

  // 天気 (現在の天気ウィジェット + 予報ウィジェットの全地点)
  const weatherSubs = () => config.get().widgets
    .filter(x => x.type === 'weather' || x.type === 'forecast')
    .map(x => x.options || {});
  const key = JSON.stringify([weatherSubs().map(o => [o.lat, o.lon]), c.settings.weatherIntervalMin]);
  if (key !== lastWeatherKey) {
    lastWeatherKey = key;
    if (weatherSubs().length) weather.schedule(weatherSubs, c.settings.weatherIntervalMin);
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

  // 音量ウィジェットがあるときだけオーディオブリッジを起動
  if (c.widgets.some(x => x.type === 'volume') && !process.env.WW_NO_AUDIO) audio.start();
  else audio.stop();

  // ディスク / ネットワーク情報
  sysinfo.sync(
    c.widgets.some(x => x.type === 'disk'),
    c.widgets.some(x => x.type === 'netinfo'),
  );

  // ICS 予定表
  ics.sync(c.widgets.filter(x => x.type === 'ics').map(x => ({
    url: (x.options || {}).url,
    daysAhead: (x.options || {}).daysAhead || 7,
  })));

  // オンライン壁紙 (使用中のソースを探す)
  const onlineWp = wallpapersAll.find(w => w && w.type === 'online');
  onlinewall.sync(
    onlineWp ? ((onlineWp.value && onlineWp.value.source) || 'bing') : null,
    onlineWp ? (onlineWp.value && onlineWp.value.refreshHours) || 24 : 24,
  );

  // グローバルホットキー
  hotkeys.sync(c.settings.hotkeys);

  // 先行版を受け取るか (切り替えた直後に効かせる)
  updater.setAllowPrerelease(c.settings.allowPrerelease);

  // シーン (文脈でレイアウトを自動切替)
  scenes.sync(c.settings.scenes);

  // 視差効果 (オプトイン時のみ 15Hz でカーソルを配信。heartbeat 集約の例外)
  syncParallax(wallpapersAll.some(w => w && w.parallax));

  // 通常時のアイコン表示設定を反映 (編集中は編集モード側が制御する)
  if (!editMode) {
    attach.setDesktopIconsVisible(c.settings.showDesktopIcons !== false);
  }

  // RSS / 株価フィード (該当ウィジェットの分だけ購読)
  feeds.sync(
    c.widgets.filter(x => x.type === 'rss').map(x => (x.options || {}).url),
    c.widgets.filter(x => x.type === 'ticker').map(x => (x.options || {}).symbols),
  );
}

let lastScheduleKey = '';
let lastScheduleMode = null;

// ---------------------------------------------------------------- 視差効果
let parallaxTimer = null;
let lastCursor = { x: -9999, y: -9999 };

function syncParallax(enabled) {
  if (enabled && !parallaxTimer) {
    parallaxTimer = setInterval(() => {
      if (editMode || widgetsHidden) return;
      const p = attach.cursorPos();
      if (Math.abs(p.x - lastCursor.x) + Math.abs(p.y - lastCursor.y) < 4) return;
      lastCursor = p;
      for (const [idx, win] of wallWins) {
        const pair = displayPairs.find(x => x.index === idx);
        if (!pair || win.isDestroyed()) continue;
        const n = pair.native;
        win.webContents.send('cursor', {
          x: Math.max(-1, Math.min(1, ((p.x - n.x) / n.w) * 2 - 1)),
          y: Math.max(-1, Math.min(1, ((p.y - n.y) / n.h) * 2 - 1)),
        });
      }
    }, 66);
  } else if (!enabled && parallaxTimer) {
    clearInterval(parallaxTimer);
    parallaxTimer = null;
  }
}

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

// ---------------------------------------------------------------- レイアウト / テーマ / 修復
function applyLayout(i) {
  const c = config.get();
  const l = (c.settings.layouts || [])[i];
  if (!l) return;
  lastLayoutIdx = i;
  placedKey.clear();
  config.update(cfg => {
    cfg.wallpapers = JSON.parse(JSON.stringify(l.wallpapers));
    cfg.widgets = JSON.parse(JSON.stringify(l.widgets));
  });
}

let lastLayoutIdx = -1;
function cycleLayout() {
  const layouts = config.get().settings.layouts || [];
  if (!layouts.length) return;
  applyLayout((lastLayoutIdx + 1) % layouts.length);
}

const SCENE_BACKUP_NAME = 'シーン切替前 (自動)';

// シーンが指すレイアウトを名前で適用する。
// いまの配置がどの保存済みレイアウトとも一致しない (= 未保存の作業がある) ときは、
// 先に 1 枠だけの自動退避に逃がしてから切り替える。自動でユーザーの配置を
// 書き換える機能なので、ここを省くわけにはいかない。
function applySceneLayout(name) {
  const c = config.get();
  const layouts = c.settings.layouts || [];
  if (!layouts.some(l => l.name === name)) return false;

  const cur = JSON.stringify({ w: c.wallpapers, g: c.widgets });
  const isSaved = layouts.some(l => JSON.stringify({ w: l.wallpapers, g: l.widgets }) === cur);
  if (!isSaved) {
    config.update(cfg => {
      cfg.settings.layouts = [
        ...(cfg.settings.layouts || []).filter(l => l.name !== SCENE_BACKUP_NAME),
        {
          name: SCENE_BACKUP_NAME,
          wallpapers: JSON.parse(JSON.stringify(cfg.wallpapers)),
          widgets: JSON.parse(JSON.stringify(cfg.widgets)),
        },
      ];
    });
  }
  const idx = (config.get().settings.layouts || []).findIndex(l => l.name === name);
  if (idx < 0) return false;
  applyLayout(idx);
  return true;
}

// シーンが指すアイコン配置へ切り替える。
// レイアウトと違い、アイコンは指定が無ければ「触らない」。
// 勝手に動かされるのが一番困る対象なので、既定は無操作。
let lastSceneIcons = null;
function applySceneIcons(iconsName) {
  const want = String(iconsName || '');
  if (!want) return;                       // 指定なし = 触らない
  if (want === lastSceneIcons) return;     // 同じ配置なら書き込まない
  const r = applyIconSnapshot(want);
  if (r && r.ok) {
    lastSceneIcons = want;
    if (process.env.WW_DEBUG) {
      console.log(`[icons] シーン -> "${want}" (戻した ${r.moved} / 隠した ${r.hidden})`);
    }
  }
}

const AUTO_BACKUP_NAME = '適用前の構成 (自動)';

function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id);
  if (!theme) return false;
  placedKey.clear();
  config.update(cfg => {
    // 既存の構成を自動バックアップとしてレイアウトに残す (1 枠だけ)
    if ((cfg.widgets || []).length) {
      cfg.settings.layouts = [
        ...(cfg.settings.layouts || []).filter(l => l.name !== AUTO_BACKUP_NAME),
        {
          name: AUTO_BACKUP_NAME,
          wallpapers: JSON.parse(JSON.stringify(cfg.wallpapers)),
          widgets: JSON.parse(JSON.stringify(cfg.widgets)),
        },
      ].slice(-12);
    }
    cfg.wallpapers = JSON.parse(JSON.stringify(theme.wallpapers));
    cfg.widgets = JSON.parse(JSON.stringify(theme.widgets));
  });
  return true;
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
    // アイコンを隠したまま終了すると復帰手段がなくなるので必ず戻す
    attach.setDesktopIconsVisible(true);
    hotkeys.dispose();
    heartbeat.unregister('watchdog');
    fullscreen.stop();
    media.stop();
    audio.stop();
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
// ホットキーで全ウィジェットの表示を切り替える
function toggleWidgetsVisible() {
  widgetsHidden = !widgetsHidden;
  broadcast('widgets-hidden', widgetsHidden);
  for (const [id, win] of folderWins) {
    if (win.isDestroyed()) continue;
    if (widgetsHidden) win.hide();
    else if (!editMode) {
      win.showInactive();
      placeFolder(id);
    }
  }
}

function onReady() {
  config.load();

  // local-fonts はフォント一覧、media / display-capture はビジュアライザーの
  // ループバック取り込みに必要。これを拒否していたせいで、ビジュアライザーは
  // NotAllowedError で一度も動けなかった
  const ALLOWED_PERMISSIONS = new Set(['local-fonts', 'media', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  // ビジュアライザー用: システム音声のループバックキャプチャを許可
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => callback({}));
  });

  // ホットキーのアクションを配線 (登録自体は syncServices が設定に従って行う)
  hotkeys.setActions({
    overlay: () => toggleOverlay(),
    toggleWidgets: () => toggleWidgetsVisible(),
    toggleIcons: () => config.update(c => { c.settings.showDesktopIcons = !(c.settings.showDesktopIcons !== false); }),
    nextLayout: () => cycleLayout(),
    pomoToggle: () => {
      for (const [id, win] of folderWins) {
        const w = config.get().widgets.find(x => x.id === id);
        if (w && w.type === 'pomo' && !win.isDestroyed()) win.webContents.send('pomo-toggle');
      }
    },
  });

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

  // 変更の配信は config.update の中から同期で呼ばれる。どれかが投げると
  // 保存した側の IPC まで巻き添えで失敗するので、各段を独立に守る。
  let trayTimer = null;
  config.on('change', (c) => {
    try { broadcast('config', configEnvelope()); } catch (e) { if (process.env.WW_DEBUG) console.error('[change] broadcast:', e); }
    try { syncServices(); } catch (e) { if (process.env.WW_DEBUG) console.error('[change] services:', e); }
    try { if (!editMode) syncFolders(); } catch (e) { if (process.env.WW_DEBUG) console.error('[change] folders:', e); }
    // トレイはキー入力のたびに作り直す価値がない。少し待って 1 回だけ
    clearTimeout(trayTimer);
    trayTimer = setTimeout(() => {
      try { if (tray && tray.rebuild) tray.rebuild(); } catch (e) { if (process.env.WW_DEBUG) console.error('[change] tray:', e); }
    }, 300);
  });
  weather.on('update', (d) => broadcast('weather', d));
  sysinfo.on('disks', (d) => broadcast('disks', d));
  sysinfo.on('netinfo', (d) => broadcast('netinfo', d));
  ics.on('ics', (d) => broadcast('ics', d));
  onlinewall.on('update', () => broadcast('config', configEnvelope()));
  stats.on('update', (d) => { lastBuiltin = d; if (!lhm.isOnline()) broadcast('hw', mergedHw()); });
  lhm.on('update', () => broadcast('hw', mergedHw()));
  lhm.on('status', (on) => broadcast('lhm-status', on));
  media.on('update', (d) => {
    broadcast('media', d);
    // 「停止中は隠す」の対象ウィンドウを再生状態に合わせて出し入れする
    if (!editMode && config.get().widgets.some(w => w.type === 'nowplaying' && (w.options || {}).hideWhenStopped)) {
      syncFolders();
    }
  });
  audio.on('update', (d) => broadcast('audio', d));
  feeds.on('rss', (d) => broadcast('rss', d));
  feeds.on('ticker', (d) => broadcast('ticker', d));
  updater.on('status', (s) => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update-status', s);
  });
  fullscreen.on('change', (index, paused) => {
    scenes.setFullscreen(index, paused);
    if (editMode) return;
    const win = wallWins.get(index);
    if (win && !win.isDestroyed()) win.webContents.send('power', { paused });
  });
  fullscreen.on('foreground', (exe) => scenes.setForeground(exe));

  // シーンエンジン起動。バッテリー状態も最初に読んでおく
  scenes.init((name, iconsName) => {
    const ok = name ? applySceneLayout(name) : true;
    // アイコンはレイアウトと独立。指定が無ければ触らない
    applySceneIcons(iconsName);
    return ok;
  });
  try { scenes.setBattery(powerMonitor.isOnBatteryPower()); } catch (_) { /* デスクトップ機 */ }
  powerMonitor.on('on-battery', () => scenes.setBattery(true));
  powerMonitor.on('on-ac', () => scenes.setBattery(false));

  // アイコン自動復元 (オプトイン): モニタ構成が変わったとき
  screen.on('display-metrics-changed', onDisplayChanged);
  screen.on('display-added', onDisplayChanged);
  screen.on('display-removed', onDisplayChanged);

  // ---- 開発用セルフテストフック ----
  if (process.env.WW_TEST_EDIT) {
    setTimeout(() => enterEditMode(), 4000);
    setTimeout(() => exitEditMode(), 7500);
  }
  if (process.env.WW_TEST_OVERLAY) {
    setTimeout(() => toggleOverlay(), 3500);
  }
  if (process.env.WW_TEST_THEME) {
    setTimeout(() => applyTheme(process.env.WW_TEST_THEME), 4000);
  }
  if (process.env.WW_TEST_APPLYLAYOUT) {
    setTimeout(() => {
      const idx = (config.get().settings.layouts || []).findIndex(l => l.name === process.env.WW_TEST_APPLYLAYOUT);
      if (idx >= 0) applyLayout(idx);
    }, 4000);
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
    attach.setDesktopIconsVisible(true);
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

// 逃げ道: しまってあるウィジェットを全部出す
function showAllWidgets() {
  let n = 0;
  config.update(cfg => {
    for (const w of (cfg.widgets || [])) if (w.off) { w.off = false; n++; }
  });
  return n;
}
ipcMain.handle('widgets:showAll', () => ({ ok: true, shown: showAllWidgets() }));
ipcMain.handle('widgets:parked', () => (config.get().widgets || []).filter(w => w.off).length);

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

// デスクトップ上のフォルダウィジェットへの直接ドロップ
ipcMain.handle('folder:addItems', (e, wid, paths) => {
  const clean = (Array.isArray(paths) ? paths : [])
    .filter(p2 => typeof p2 === 'string' && p2);
  if (!clean.length) return { ok: false, added: 0 };
  let added = 0;
  config.update(cfg => {
    const w = (cfg.widgets || []).find(x => x.id === wid && x.type === 'folder');
    if (!w) return;
    if (!w.options) w.options = {};
    const items = w.options.items || (w.options.items = []);
    const have = new Set(items.map(i => i.path));
    for (const p2 of clean) {
      if (have.has(p2)) continue;
      items.push({ path: p2, name: path.basename(p2).replace(/\.(lnk|exe|url|bat)$/i, '') });
      added++;
    }
  });
  return { ok: true, added };
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
  return {
    widget: w || null,
    fontsCss: gfonts.cssFor(config.get().settings.googleFonts),
    audio: audio.getLatest(),
    media: media.getLatest(),
    osLocale: app.getLocale() || 'ja',
  };
});

// ---- 音量 / 出力デバイス / メディア操作 ----
ipcMain.on('audio:volume', (e, v) => audio.setVolume(v));
ipcMain.on('audio:mute', (e, m) => audio.setMute(m));
ipcMain.on('audio:device', (e, id) => audio.setDevice(id));
ipcMain.on('audio:refresh', () => audio.refresh());
ipcMain.on('media:key', (e, which) => {
  if (['play', 'next', 'prev', 'stop'].includes(which)) audio.sendMediaKey(which);
});

ipcMain.handle('city:search', (e, q) => weather.searchCity(q));
ipcMain.handle('weather:get', () => weather.getLatest());
ipcMain.handle('weather:refresh', () => {
  const seen = new Set();
  let last = null;
  for (const w of config.get().widgets) {
    if (w.type !== 'weather' && w.type !== 'forecast') continue;
    const o = w.options || {};
    if (o.lat == null) continue;
    const k = `${o.lat},${o.lon}`;
    if (seen.has(k)) continue;
    seen.add(k);
    last = weather.refresh(o);
  }
  return last;
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

// 編集モード中の一時的な表示切替 (設定は変えない。編集終了時に通常設定へ戻る)
ipcMain.handle('icons:toggle', (e, visible) => {
  attach.setDesktopIconsVisible(!!visible);
  const now = attach.areDesktopIconsVisible();
  broadcast('icons-state', now);
  return now;
});
ipcMain.handle('icons:get', () => attach.areDesktopIconsVisible());

// テーマ
ipcMain.handle('theme:list', () => THEMES);
ipcMain.handle('theme:apply', (e, id) => applyTheme(id));

// ウィジェット複製 (編集モードの Ctrl+D などから)
ipcMain.handle('widget:duplicate', (e, id) => {
  let created = null;
  config.update(c => {
    const src = c.widgets.find(x => x.id === id);
    if (!src) return;
    created = JSON.parse(JSON.stringify(src));
    created.id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    created.x = Math.min(97, src.x + 2.5);
    created.y = Math.min(97, src.y + 2.5);
    c.widgets.push(created);
  });
  return created;
});

// スライドショー用のフォルダ選択と一覧
ipcMain.handle('dir:pick', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: 'スライドショーにするフォルダを選択',
    properties: ['openDirectory'],
  });
  return (r.canceled || !r.filePaths[0]) ? null : r.filePaths[0];
});

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
ipcMain.handle('slides:list', (e, dir) => {
  try {
    return require('fs').readdirSync(dir)
      .filter(f => IMG_RE.test(f))
      .slice(0, 500)
      .map(f => path.join(dir, f));
  } catch (_) {
    return [];
  }
});
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
  weatherMap: weather.snapshot(),
  hw: mergedHw(),
  media: media.getLatest(),
  feeds: feeds.snapshot(),
  sysinfo: sysinfo.snapshot(),
  ics: ics.snapshot(),
  widgetsHidden,
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
const INTER_SAVE_KEYS = new Set(['text', 'doneCount', 'items']);
ipcMain.on('inter:save', (e, id, options) => {
  const w = config.get().widgets.find(x => x.id === id && INTERACTIVE_TYPES.has(x.type));
  if (!w || !options || typeof options !== 'object') return;
  const patch = {};
  for (const k of Object.keys(options)) {
    if (!INTER_SAVE_KEYS.has(k)) continue;
    if (k === 'items') {
      if (!Array.isArray(options.items)) continue;
      patch.items = options.items.slice(0, 200).map(it => ({
        text: String((it && it.text) || '').slice(0, 300),
        done: !!(it && it.done),
      }));
    } else {
      patch[k] = options[k];
    }
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
    defaultPath: `${brand.NAME}-settings-${new Date().toISOString().slice(0, 10)}.json`,
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
      return { ok: false, msg: `${brand.NAME} の設定ファイルではありません` };
    }
    placedKey.clear();
    config.replace(parsed, 'インポートの前');
    return { ok: true, msg: 'インポートしました (元の設定はバックアップ済み)' };
  } catch (e) {
    return { ok: false, msg: '読み込みに失敗: ' + e.message };
  }
});

// ---- 設定のバックアップ ----
ipcMain.handle('backup:list', () => backup.list());

ipcMain.handle('backup:restore', async (e, file) => {
  const item = backup.list().find(b => b.file === file);
  if (!item) return { ok: false, msg: 'バックアップが見つかりません' };

  const when = new Date(item.time).toLocaleString('ja-JP');
  const r = await dialog.showMessageBox(settingsWin, {
    type: 'warning',
    buttons: ['復元する', 'キャンセル'],
    defaultId: 1,
    cancelId: 1,
    title: 'バックアップから復元',
    message: `${when} の状態に戻します`,
    detail: `バージョン ${item.version || '不明'} 時点の壁紙・ウィジェット配置・設定に置き換えます。
`
          + '今の設定も自動でバックアップされるので、戻すこともできます。',
  });
  if (r.response !== 0) return { ok: false, msg: 'キャンセルしました' };

  try {
    const parsed = backup.read(file);
    placedKey.clear();
    config.replace(parsed, '復元の前');
    return { ok: true, msg: `${when} の状態に復元しました` };
  } catch (err) {
    return { ok: false, msg: '復元に失敗: ' + err.message };
  }
});

ipcMain.handle('backup:remove', (e, file) => {
  try {
    backup.remove(file);
    return { ok: true, list: backup.list() };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
});

ipcMain.handle('backup:reveal', () => {
  shell.openPath(backup.dir());
  return true;
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
ipcMain.on('update:download', () => updater.download());

// オーバーレイ: Esc / 余白クリックで閉じる
ipcMain.on('overlay:close', () => hideOverlay());

// 他のアプリと衝突して登録できなかったホットキー
ipcMain.handle('hotkeys:failed', () => hotkeys.failed());

// シーン設定 UI: 「このボタンを押してから対象のアプリをクリック」方式。
// ボタンを押した瞬間は設定画面自身が前面なので、他のアプリが前面に来るまで
// 最大 6 秒待って、最初に取れた exe 名を返す。
// ---- デスクトップアイコンの保存 / 復元 ----
const ICON_BACKUP_NAME = '復元前 (自動)';

// 「最後に見えていた位置」。隠す前の住所をここに貯めておき、
// 呼び戻すときの帰り先にする。隠したまま保存を繰り返しても失われない。
let lastDisplayChangeAt = 0;   // モニタ構成が最後に変わった時刻 (直後の記録を止める)

function rememberHome() {
  // モニタ構成が変わった直後は、Windows が画面外のアイコンを適当な場所へ
  // 引き戻していることがある。その混乱中の位置を「元の場所」として
  // 覚えてしまうと以後ずっと崩れるので、落ち着くまで記録しない。
  if (Date.now() - lastDisplayChangeAt < 8000) return;
  const vis = icons.visibleList();
  if (!vis || !vis.length) return;
  const o = icons.origin();
  config.update(cfg => {
    const home = { ...(cfg.settings.iconHome || {}) };
    for (const i of vis) home[i.name] = { x: i.x, y: i.y, ox: o.x, oy: o.y };
    cfg.settings.iconHome = home;
  });
}

// 現在のアイコン配置を name つきスナップとして settings.iconLayouts に積む。
// 読むだけ。書き込みは一切しない。同名は上書き、最大 21 枠 (自動退避 1 + 通常 20)。
// 死角に退避しているアイコンの座標を、控えてある元位置に直す。
// 保存時とモニタ構成が違えば、原点の差分も引き直す (icons.unparkRows)
function unpark(rows, savedOrigin) {
  try {
    return icons.unparkRows(rows, savedOrigin, config.get().settings.iconHome || {});
  } catch (_) {
    const out = (rows || []).slice();
    out.repaired = 0;
    return out;
  }
}

function saveIconSnapshot(name, hidden) {
  rememberHome();                        // 見えているものの住所を控えておく
  const now = icons.list();
  if (!now || !now.length) return { ok: false, msg: 'デスクトップアイコンを読み取れませんでした' };
  const clean = String(name || '').slice(0, 40) || `アイコン配置 ${new Date().toLocaleString('ja-JP')}`;
  // 自動退避は「いま隠れている名前」も控える。戻すときに同じものを隠し直すため
  const hide = clean === ICON_BACKUP_NAME
    ? (icons.strandedNames() || [])
    : (Array.isArray(hidden) ? hidden.filter(Boolean) : []);
  const rows = unpark(now);                        // 今の原点基準なので差分ゼロ、死角の分だけ直る
  const o = icons.origin();
  const prev = (config.get().settings.iconLayouts || []).find(l => l.name === clean);
  // 上限は黙って消さずに断る。並び替えで順序が意味を持つようになったので、
  // slice で先頭を落とすと「ユーザーが一番上に置いたモード」が消えてしまう
  const arr0 = config.get().settings.iconLayouts || [];
  const isNew = !arr0.some(l => l.name === clean);
  const userCount = arr0.filter(l => l.name !== ICON_BACKUP_NAME).length;
  if (isNew && clean !== ICON_BACKUP_NAME && userCount >= 20) {
    return { ok: false, msg: 'モードは 20 個まで保存できます。使っていないものを削除してください' };
  }
  config.update(cfg => {
    const arr = (cfg.settings.iconLayouts || []).slice();
    const entry = {
      name: clean, savedAt: Date.now(), icons: [...rows], hidden: hide,
      origin: { x: o.x, y: o.y },                  // どのモニタ構成で覚えたか
      // 同じ名前を上書きするときは、ウィジェットの連動を持ち越す
      linkWidgets: !!(prev && prev.linkWidgets),
      widgetsOn: (prev && prev.widgetsOn) ? prev.widgetsOn.slice() : [],
    };
    // 上書きは同じ場所に置く。末尾へ移すと、編集のたびに一覧の並びが崩れる
    const idx = arr.findIndex(l => l.name === clean);
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    cfg.settings.iconLayouts = arr;
  });
  return { ok: true, count: rows.length, name: clean };
}

// 指定したウィジェットだけ出す。消さずに off にするので、戻せば元通り。
function applyWidgetSet(ids) {
  const on = new Set(ids || []);
  let shown = 0;
  config.update(cfg => {
    for (const w of (cfg.widgets || [])) {
      w.off = !on.has(w.id);
      if (!w.off) shown++;
    }
  });
  return shown;
}

// スナップを適用する共通処理。書き込む前に必ず今の並びを退避する。

function applyIconSnapshot(name) {
  const snap = (config.get().settings.iconLayouts || []).find(l => l.name === name);
  if (!snap) return { ok: false, msg: 'その配置が見つかりません' };
  rememberHome();                       // 隠す前の住所を控える
  saveIconSnapshot(ICON_BACKUP_NAME);
  // 連動がオンでも中身が空なら「まだ決めていない」とみなす。
  // ここで applyWidgetSet([]) を走らせると、ウィジェットが全部消えてしまう。
  const wantWidgets = !!snap.linkWidgets && (snap.widgetsOn || []).length > 0;

  // どこか 1 つでも連動を使っているなら、ウィジェットの出し入れはモードの持ち物。
  // 連動していないモードへ切り替えたときに前のモードが隠したままだと、
  // 「切り替えたのに戻ってこない」ことになるので、そこで全部出す。
  const linkUsed = (config.get().settings.iconLayouts || [])
    .some(l => l.linkWidgets && (l.widgetsOn || []).length);

  // ウィジェットまで動かすなら、退避にも今の出し入れを含めておく (でないと戻し切れない)
  if (wantWidgets) {
    const nowOn = (config.get().widgets || []).filter(w => !w.off).map(w => w.id);
    config.update(cfg => {
      const b = (cfg.settings.iconLayouts || []).find(l => l.name === ICON_BACKUP_NAME);
      if (b) { b.linkWidgets = true; b.widgetsOn = nowOn; }
    });
  }
  const r = icons.apply(snap.icons, snap.hidden || [],
    { origin: snap.origin, home: config.get().settings.iconHome || {} });
  if (!r) return { ok: false, msg: 'アイコンを操作できませんでした (デスクトップにアクセスできません)' };
  let widgets = 0;            // このモードで出したウィジェットの数
  let widgetsRestored = 0;    // 連動していないモードで、しまってあったものを出した数
  if (wantWidgets) widgets = applyWidgetSet(snap.widgetsOn);
  else if (linkUsed && name !== ICON_BACKUP_NAME) widgetsRestored = showAllWidgets();
  // 元に戻したら「どのモードでもない」状態。印を残すと、切り替えボタンが
  // 同名再適用を拒み、モニタ変更の当て直しが取り消したモードを復活させる
  config.update(cfg => {
    cfg.settings.currentIconMode = name === ICON_BACKUP_NAME ? '' : name;
  });
  return { ok: true, ...r, widgets, widgetsRestored };
}

ipcMain.handle('icons:available', () => {
  try { return icons.available(); } catch (_) { return false; }
});
// 読み取り系は投げない。失敗しても空で返し、設定画面の描画を止めない
ipcMain.handle('icons:current', () => {
  try { return (icons.list() || []).length; } catch (_) { return 0; }
});
ipcMain.handle('icons:names', () => {
  try { return (icons.list() || []).map(i => i.name); } catch (_) { return []; }
});
ipcMain.handle('icons:stranded', () => {
  try { return icons.strandedNames() || []; } catch (_) { return []; }
});

// デスクトップ上の「表示名 -> ファイルパス」を作る。
// 個人用と共用 (Public) の両方を見る。拡張子は表示名から落ちているので付け外しで照合する。
function desktopPathByName() {
  const fs = require('fs');
  const dirs = [app.getPath('desktop')];
  const pub = process.env.PUBLIC;
  if (pub) dirs.push(path.join(pub, 'Desktop'));

  const out = new Map();
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const n of names) {
      const full = path.join(dir, n);
      const base = n.replace(/\.(lnk|url)$/i, '');
      if (!out.has(base)) out.set(base, full);
      if (!out.has(n)) out.set(n, full);
    }
  }
  return out;
}

// フォルダを app.getFileIcon に渡すと、Windows は黄色いフォルダではなく
// ドライブのアイコンを返してくる。フォルダだけは自前の絵に差し替える。
const FOLDER_ICON = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
  + '<path d="M2.5 8.2A2.7 2.7 0 0 1 5.2 5.5h6.5c.8 0 1.5.35 2 .95l1.6 1.9h11.5a2.7 2.7 0 0 1 2.7 2.7v13.2'
  + 'a2.7 2.7 0 0 1-2.7 2.7H5.2a2.7 2.7 0 0 1-2.7-2.7z" fill="#d9a13c"/>'
  + '<path d="M2.5 12.4h27v11.85a2.7 2.7 0 0 1-2.7 2.7H5.2a2.7 2.7 0 0 1-2.7-2.7z" fill="#f0c463"/>'
  + '</svg>').toString('base64');

// その名前がフォルダを指しているか (ショートカットなら飛び先を見る)
function pointsToFolder(target) {
  const fs = require('fs');
  try {
    if (fs.statSync(target).isDirectory()) return true;
  } catch (_) { return false; }
  if (!/\.lnk$/i.test(target)) return false;
  try {
    const link = shell.readShortcutLink(target).target;
    return !!link && fs.statSync(link).isDirectory();
  } catch (_) {
    return false;
  }
}

// アイコン画像 (dataURL)。デスクトップ上のものだけに限る
const deskIconCache = new Map();
// F5 で画像も取り直せるようにする (キャッシュはここが持っているため)
ipcMain.handle('icons:flushImages', () => { deskIconCache.clear(); return true; });
ipcMain.handle('icons:image', async (e, name) => {
  if (deskIconCache.has(name)) return deskIconCache.get(name);
  const p2 = desktopPathByName().get(String(name || ''));
  if (!p2) return null;
  try {
    const url = pointsToFolder(p2)
      ? FOLDER_ICON
      : await resolveIcon(p2).then(img => (img ? img.toDataURL() : null));
    if (deskIconCache.size > 300) deskIconCache.clear();   // 名前の入れ替わりで溜まり続けないように
    deskIconCache.set(name, url);
    return url;
  } catch (_) {
    return null;
  }
});

// 画面外に取り残されたアイコンを全部呼び戻す (最後の逃げ道)
ipcMain.handle('icons:showAll', () => {
  saveIconSnapshot(ICON_BACKUP_NAME);
  const r = icons.showAll(config.get().settings.iconHome || {});
  if (!r) return { ok: false, msg: 'デスクトップにアクセスできませんでした' };
  return { ok: true, ...r };
});
// 自動退避は「自分で保存した配置」と混ぜない。
// 選ぶ対象ではなく安全網なので、UI 側でも別枠に置く。
ipcMain.handle('icons:snapshots', () => {
  const all = (config.get().settings.iconLayouts || [])
    // hidden は名前の配列のまま返す。個数だけにすると受け取り側で復元できない
    .map(l => ({
      name: l.name, savedAt: l.savedAt,
      count: (l.icons || []).length,
      hidden: (l.hidden || []).slice(),
      linkWidgets: !!l.linkWidgets,
      widgetsOn: (l.widgetsOn || []).slice(),
    }));
  return {
    saved: all.filter(l => l.name !== ICON_BACKUP_NAME),
    auto: all.find(l => l.name === ICON_BACKUP_NAME) || null,
  };
});

ipcMain.handle('icons:save', (e, name, hidden) => {
  if (String(name || '').trim() === ICON_BACKUP_NAME) {
    return { ok: false, msg: 'その名前は自動退避用に使っているので選べません' };
  }
  return saveIconSnapshot(name, hidden);
});

ipcMain.handle('icons:restore', (e, name) => applyIconSnapshot(name));

// モードの名前を変える。名前で参照している設定も一緒に付け替える
// モードの並び替え (名前の配列で新しい順序を受け取る)
ipcMain.handle('icons:reorder', (e, names) => {
  const order = Array.isArray(names) ? names.filter(Boolean) : [];
  if (!order.length) return { ok: false };
  config.update(cfg => {
    const arr = cfg.settings.iconLayouts || [];
    const byName = new Map(arr.map(l => [l.name, l]));
    const listed = order.map(n => byName.get(n)).filter(Boolean);
    const rest = arr.filter(l => !order.includes(l.name));   // 自動退避などはそのまま後ろへ
    cfg.settings.iconLayouts = [...listed, ...rest];
  });
  return { ok: true };
});

ipcMain.handle('icons:rename', (e, from, to) => {
  const clean = String(to || '').trim().slice(0, 40);
  if (!clean) return { ok: false, msg: '名前を入れてください' };
  if (clean === ICON_BACKUP_NAME) return { ok: false, msg: 'その名前は使えません' };
  const all = config.get().settings.iconLayouts || [];
  if (!all.some(l => l.name === from)) return { ok: false, msg: 'そのモードが見つかりません' };
  if (clean !== from && all.some(l => l.name === clean)) {
    return { ok: false, msg: '同じ名前のモードがあります' };
  }
  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === from);
    if (l) l.name = clean;
    if (cfg.settings.iconAutoRestore === from) cfg.settings.iconAutoRestore = clean;
    if (cfg.settings.currentIconMode === from) cfg.settings.currentIconMode = clean;
    const sc = cfg.settings.scenes || {};
    if (sc.defaultIcons === from) sc.defaultIcons = clean;
    for (const r of (sc.rules || [])) if (r.icons === from) r.icons = clean;
  });
  return { ok: true, name: clean };
});

// モードにウィジェットの表示状態を結び付ける
ipcMain.handle('icons:setWidgets', (e, name, link, ids) => {
  const on = Array.isArray(ids) ? ids.filter(Boolean) : [];
  let found = false;
  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === name);
    if (!l) return;
    found = true;
    l.linkWidgets = !!link;
    l.widgetsOn = on;
  });
  return found ? { ok: true, count: on.length } : { ok: false, msg: 'そのモードが見つかりません' };
});

// デスクトップの名前に、画面に出す呼び名を付ける (実ファイルの名前は変えない)
ipcMain.handle('icons:setAlias', (e, name, label) => {
  const key = String(name || '');
  if (!key) return { ok: false };
  const txt = String(label || '').trim().slice(0, 40);
  config.update(cfg => {
    const a = cfg.settings.iconAlias || (cfg.settings.iconAlias = {});
    if (txt) a[key] = txt; else delete a[key];
  });
  return { ok: true, label: txt };
});
ipcMain.handle('icons:aliases', () => ({ ...(config.get().settings.iconAlias || {}) }));

// モードの「隠すアイコン」と「ウィジェット連動」をひとまとめに差し替える。
// 並び位置には触らない。2 回に分けると config の変更通知が 2 回飛び、
// そのたびに設定画面が作り直されて編集中のクリックを取りこぼすため。
ipcMain.handle('icons:updateMode', (e, name, patch) => {
  const snap = (config.get().settings.iconLayouts || []).find(l => l.name === name);
  if (!snap) return { ok: false, msg: 'そのモードが見つかりません' };
  const p2 = patch || {};
  const hide = Array.isArray(p2.hidden) ? p2.hidden.filter(Boolean) : (snap.hidden || []);
  rememberHome();
  const fixed = unpark(snap.icons, snap.origin);   // 保存時の原点から今の原点へ引き直す
  const o = icons.origin();
  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === name);
    if (!l) return;
    l.hidden = hide;
    l.icons = [...fixed];
    l.origin = { x: o.x, y: o.y };
    l.savedAt = Date.now();
    if ('linkWidgets' in p2) l.linkWidgets = !!p2.linkWidgets;
    if (Array.isArray(p2.widgetsOn)) l.widgetsOn = p2.widgetsOn.filter(Boolean);
  });
  return { ok: true, count: fixed.length, hidden: hide.length, repaired: fixed.repaired };
});

// (旧 API。設定画面は icons:updateMode を使う)
ipcMain.handle('icons:setHidden', (e, name, hidden) => {
  const snap = (config.get().settings.iconLayouts || []).find(l => l.name === name);
  if (!snap) return { ok: false, msg: 'そのモードが見つかりません' };

  const hide = Array.isArray(hidden) ? hidden.filter(Boolean) : [];
  rememberHome();
  const fixed = unpark(snap.icons, snap.origin);   // 保存時の原点から今の原点へ引き直す
  const o = icons.origin();

  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === name);
    if (l) {
      l.hidden = hide;
      l.icons = [...fixed];
      l.origin = { x: o.x, y: o.y };
      l.savedAt = Date.now();
    }
  });
  return { ok: true, count: fixed.length, hidden: hide.length, repaired: fixed.repaired };
});

// デスクトップの「アイコンの自動整列」がオンか (オンだと隠す/戻すが効かない)
ipcMain.handle('icons:autoArrange', () => {
  try { return icons.autoArrange(); } catch (_) { return null; }
});

// この環境で「隠す」が使えるか (死角がいくつあるか)
ipcMain.handle('icons:capacity', () => {
  try { return icons.hideCapacity(); } catch (_) { return 0; }
});

ipcMain.handle('icons:remove', (e, name) => {
  config.update(cfg => {
    cfg.settings.iconLayouts = (cfg.settings.iconLayouts || []).filter(l => l.name !== name);
    if (cfg.settings.currentIconMode === name) cfg.settings.currentIconMode = '';
  });
  return (config.get().settings.iconLayouts || []).map(l => ({ name: l.name, savedAt: l.savedAt, count: (l.icons || []).length }));
});

// 解像度・モニタ構成が変わったとき。
// Windows はこのとき画面外のアイコンを適当な場所へ引き戻すので、
// 隠しているモードが当たっているなら、落ち着いてから当て直して隠し直す。
// 「解像度が変わったら自動で戻す」で配置を選んでいれば、そちらを優先する。
let iconRestoreTimer = null;
function onDisplayChanged() {
  lastDisplayChangeAt = Date.now();
  clearTimeout(iconRestoreTimer);
  // 構成変更が落ち着くまで少し待つ (連続イベントの最後の1回だけ効かせる)
  iconRestoreTimer = setTimeout(() => {
    const cur = config.get().settings;
    if (cur.iconAutoRestore) {
      // ユーザーが明示的に選んだ配置へ戻す (従来どおりのオプトイン)
      applyIconSnapshot(cur.iconAutoRestore);
      if (process.env.WW_DEBUG) console.log('[icons] モニタ構成変更 -> "' + cur.iconAutoRestore + '" へ復元');
      return;
    }
    // それ以外は勝手に並べ直さない。ただし Windows が退避中のアイコンを
    // 引き戻してしまうので、いまのモードが隠しているぶんだけは隠し直す。
    // 見えているアイコンの位置には一切触らない。
    const mode = (cur.iconLayouts || []).find(l => l.name === cur.currentIconMode);
    const hide = (mode && mode.hidden) || [];
    if (!hide.length) return;
    try {
      const back = new Set(icons.strandedNames() || []);
      const escaped = hide.filter(n => !back.has(n));
      if (!escaped.length) return;                 // 全部まだ隠れている
      const r = icons.apply([], escaped);
      if (process.env.WW_DEBUG) console.log('[icons] モニタ構成変更 -> ' + ((r && r.hidden) || 0) + ' 個を隠し直し');
    } catch (e) {
      if (process.env.WW_DEBUG) console.error('[icons] 隠し直しに失敗:', e);
    }
  }, 5000);
}

// 切り替えボタンウィジェット: レイアウト名で切り替える
ipcMain.handle('switcher:layouts', () =>
  (config.get().settings.layouts || []).map(l => l.name));

ipcMain.handle('switcher:current', () => {
  const c = config.get();
  const cur = JSON.stringify({ w: c.wallpapers, g: c.widgets });
  const hit = (c.settings.layouts || []).find(l => JSON.stringify({ w: l.wallpapers, g: l.widgets }) === cur);
  return hit ? hit.name : '';
});

// アイコンモード側 (切り替えウィジェットの target: 'icons')
ipcMain.handle('switcher:iconModes', () =>
  (config.get().settings.iconLayouts || [])
    .filter(l => l.name !== ICON_BACKUP_NAME).map(l => l.name));

ipcMain.handle('switcher:currentIcons', () => config.get().settings.currentIconMode || '');

ipcMain.handle('switcher:applyIcons', (e, name) => !!applyIconSnapshot(name).ok);

ipcMain.handle('switcher:apply', (e, name) => {
  const idx = (config.get().settings.layouts || []).findIndex(l => l.name === name);
  if (idx < 0) return false;
  applyLayout(idx);
  return true;
});

ipcMain.handle('scene:foreground', async () => {
  for (let i = 0; i < 20; i++) {
    const exe = fullscreen.currentForegroundExe();
    if (exe) return exe;
    await new Promise(r => setTimeout(r, 300));
  }
  return '';
});

ipcMain.handle('app:uninstall', async () => {
  if (!app.isPackaged) return { ok: false, msg: '開発モードでは使えません' };
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return { ok: false, msg: `ポータブル版は exe を削除するだけでアンインストール完了です (設定は %APPDATA%\${brand.ID})` };
  }
  // アンインストーラの名前は electron-builder が productName から作る
  const un = path.join(path.dirname(process.execPath), `Uninstall ${brand.NAME}.exe`);
  if (!require('fs').existsSync(un)) return { ok: false, msg: 'アンインストーラが見つかりません (設定 → アプリから削除してください)' };
  const { response } = await dialog.showMessageBox(settingsWin, {
    type: 'warning',
    buttons: ['アンインストール', 'キャンセル'],
    defaultId: 1,
    cancelId: 1,
    message: `${brand.NAME} をアンインストールしますか?`,
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
