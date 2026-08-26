// AeroWidget — メインプロセス (v2: マルチモニタ / フォルダウィジェット / 省電力)
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, powerMonitor, nativeImage, session, shell, desktopCapturer, net } = require('electron');
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
const overlay = require('./overlay');
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

// ---------------------------------------------------------------- モードの重ね
//
// 設定は「土台」で、手で変えたものは必ずそこに入る。
// モードは土台の上に重なるフィルタで、土台を書き換えない。
// 条件から外れたらフィルタが剥がれ、自動的に土台へ戻る。
//
// これまで「切り替え = 保存済みの写しで上書き」だったため、
// 写しを取ったあとに足したものが消える事故が何度も起きた。
// 重ねる方式なら、土台に触らないので構造的に起きない。
// 重ねの規則そのものは overlay.js が持つ。ここはそれに設定を渡すだけ —
// 規則を 2 か所に書くと必ずずれる (検査が写しを持っていて実装の穴を見逃した前例あり)
function modeList() {
  return overlay.modeList(config.get().settings);
}

function activeModes() {
  return overlay.activeModes(config.get().settings, (t) => scenes.matches(t));
}

// 土台に、効いているモードを重ねた結果。土台 (config) は一切書き換えない
function effectiveConfig() {
  return overlay.compose(config.get(), activeModes());
}

function configEnvelope() {
  return {
    config: effectiveConfig(),          // 描画側は重ねた結果を見る
    base: config.get(),                 // 設定画面は土台を編集する
    activeModes: activeModes().map(m => m.name),
    systemWallpaper: attach.getSystemWallpaperPath(),
    onlineWallpaper: onlinewall.getCurrent(),
    osLocale: app.getLocale() || 'ja',
    brand: brand.NAME,
  };
}

// 条件の成立状況が変わったとき、重ねた結果が変わっていれば描き直す。
// 設定ファイルには一切書き込まない (土台は不変)
let lastOverlayKey = '';
function refreshOverlay() {
  let key = '';
  try {
    const eff = effectiveConfig();
    key = JSON.stringify(eff.wallpapers) + '|' + eff.widgets.map(w => (w.off ? 1 : 0)).join('') + '|' + activeModes().map(m => m.name).join(',');
  }
  catch (_) { return; }
  if (key === lastOverlayKey) return;
  if (process.env.WW_DEBUG) console.log('[modes] 重ねが変わった -> ' + activeModes().map(m => m.name).join(', '));
  try { broadcast('config', configEnvelope()); } catch (_) {}
  // 壁紙レンダラは配られた config を描き直すだけで済むが、フォルダなどの対話ウィジェットは
  // 別窓なので、重ねの結果 (off) に合わせて窓そのものを作る/消すところまでここでやる。
  // 手動操作 (config.update 経由) は 'change' -> syncFolders で既に効いていたが、
  // 条件トリガーだけの重ね直しはここを通らず、窓が古いまま残っていた。
  //
  // 編集中は窓を触らない (掴んでいる最中に生成/破棄すると事故になる) が、
  // 鍵はここで進めてはいけない — 進めてしまうと、編集を抜けたときに
  // effectiveConfig が同じ鍵のままなら二度と呼ばれず、窓の同期が永久に取り残される。
  // 編集を抜けた時点の再同期は exitEditMode 側の syncFolders 呼び出しに任せる
  if (editMode) return;
  lastOverlayKey = key;
  try { syncFolders(); } catch (_) {}
}

function weatherWidget() {
  return config.get().widgets.find(w => w.type === 'weather');
}

function round2(v) { return Math.round(v * 100) / 100; }

// フォルダウィジェットの寸法 (レンダラ側 folder.js と同じ式)
function folderDims(o) {
  const n = Math.max(1, (o.items || []).length);
  const icon = o.iconSize || 34;
  const labels = o.showLabels !== false;

  if (o.layout === 'circle') {
    // 円周に等間隔で並べる。隣と重ならない半径は「1 個ぶんの幅 x 個数 / 円周率x2」。
    // カードは真円にするので、四角いボタンの角 (半対角 = cell x 0.71) まで
    // 円の内側に入る大きさにする。タイトルは円の真ん中へ置くので高さは足さない
    const cell = Math.max(46, icon + (labels ? 30 : 10));
    const r = n <= 1 ? 0 : Math.max(cell * 0.6, (n * cell) / (2 * Math.PI));
    const size = Math.round(2 * (r + cell * 0.71) + 14);
    return { cols: n, rows: 1, w: size, h: size };
  }

  const cols = o.columns > 0 ? o.columns : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
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
    { query: { display: String(pair.index), did: pair.id, dkey: pair.key, overlay: '1' } });

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

  win.loadFile(RENDERER(path.join('wallpaper', 'index.html')), { query: { display: String(pair.index), did: pair.id, dkey: pair.key } });

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
// ウィジェットの居場所のモニタ。
// displayKey (機種名+解像度。再起動で変わらない) を最優先。
// 次に displayId — ただしこれは起動中しか有効でないので、一致しなければ無視する。
// どちらでも決まらなければ従来の番号へ落とす。
//
// 5.9.18 の教訓: displayId だけで判定すると、再起動で id が振り直された瞬間に
// 全ウィジェットが「未接続のモニタ」扱いになって消える。番号への復帰は必須。
function pairForWidget(w) {
  if (w.displayKey) {
    const hit = displayPairs.find(p => p.key === w.displayKey);
    if (hit) return hit;
    // 鍵で見つからない = そのモニタは本当に繋がっていない
    return null;
  }
  if (w.displayId) {
    const hit = displayPairs.find(p => p.id === String(w.displayId));
    if (hit) return hit;
    // 古い id は再起動で無効になっている可能性がある。番号で拾い直す
  }
  return displayPairs.find(p => p.index === (w.display || 0)) || null;
}

function folderPlaceKey(w) {
  const dims = interDims(w);
  return JSON.stringify([w.display || 0, w.x, w.y, dims.w, dims.h]);
}

function placeFolder(id) {
  const win = folderWins.get(id);
  const widget = config.get().widgets.find(w => w.id === id);
  if (!win || win.isDestroyed() || !widget) return;
  const pair = pairForWidget(widget);
  if (!pair) return;                       // そのモニタは今つながっていない

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
  const inters = effectiveConfig().widgets.filter(w => INTERACTIVE_TYPES.has(w.type) && !w.off && pairForWidget(w));
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
  // 編集中に重ねの状態が変わっていた (refreshOverlay が窓の同期を保留していた) 分を
  // まとめて回収する。既存窓の再表示だけでなく、生成・破棄もここで一度に済ませる
  try { syncFolders(); } catch (_) {}
  lastOverlayKey = '';   // 次の変化を必ず拾えるように、鍵も一緒にリセットしておく
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
  {
    // 明暗・アクセント色は、設定を読み終わるまで待つと最初の一瞬だけ既定色で
    // 表示されてしまう (ちらつき)。起動時点でわかっている値は URL 越しに渡しておく
    const st = config.get().settings;
    const query = { theme: st.uiTheme || 'light', accent: st.uiAccent || 'teal' };
    if (process.env.WW_TEST_TAB) query.tab = process.env.WW_TEST_TAB;
    settingsWin.loadFile(RENDERER(path.join('settings', 'index.html')), { query });
  }
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

// レジストリの Run キー (Electron の setLoginItemSettings が使う方式) は、
// Windows がログオン時の負荷分散のためにわざと起動を遅らせる対象になる —
// 体感で数十秒〜1 分ほど出遅れることがある。タスクスケジューラの「ログオン時」
// トリガーはその遅延の対象外なので、そちらへ乗り換える
const AUTOSTART_TASK = 'AeroWidgetAutostart';

function schtasks(args) {
  try {
    return require('child_process').execFileSync('schtasks.exe', args, { windowsHide: true, encoding: 'utf8' });
  } catch (_) {
    return null;   // タスクが無い、権限が無い、など。呼び出し側は「無い」扱いにする
  }
}

function taskAutostartEnabled() {
  return schtasks(['/query', '/tn', AUTOSTART_TASK]) !== null;
}

function getAutostart() {
  if (!app.isPackaged) return { enabled: false, supported: false };
  // 旧方式 (レジストリ) がまだ残っている人にも、切り替えるまでは正しい状態を見せる
  const legacy = app.getLoginItemSettings({ path: autostartExePath(), args: ['--autostart'] }).openAtLogin;
  return { enabled: taskAutostartEnabled() || legacy, supported: true };
}

function setAutostart(enabled) {
  if (!app.isPackaged) return getAutostart();
  // 新旧どちらの方式も一度きれいにしてから、必要な方だけ作り直す
  app.setLoginItemSettings({ openAtLogin: false, path: autostartExePath(), args: ['--autostart'] });
  schtasks(['/delete', '/tn', AUTOSTART_TASK, '/f']);
  if (enabled) {
    schtasks([
      '/create', '/tn', AUTOSTART_TASK,
      '/tr', `"${autostartExePath()}" --autostart`,
      '/sc', 'onlogon', '/rl', 'limited', '/f',
    ]);
  }
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

  // フルスクリーン / 前面アプリの監視。
  // 省電力 (全画面で停止) だけでなく、条件付きモードとシーンもこの監視に乗っている。
  // 以前は省電力がオフだと監視ごと止まり、条件が一切効かなかった
  const hasModeTriggers = (c.settings.iconLayouts || []).some(l => l.trigger);
  const hasSceneRules = !!(c.settings.scenes && c.settings.scenes.enabled && (c.settings.scenes.rules || []).length);
  const needWatch = (c.settings.pauseOnFullscreen || hasModeTriggers || hasSceneRules) && !process.env.WW_NO_FS;
  if (needWatch) {
    // アプリ条件があるときは切り替えの体感を優先して短めに見る
    const hasAppCond = (c.settings.iconLayouts || []).some(l => l.trigger && l.trigger.type === 'app')
      || (hasSceneRules && (c.settings.scenes.rules || []).some(r => r.trigger && r.trigger.type === 'app'));
    fullscreen.start(() => displayPairs.map(p => ({ index: p.index, native: p.native })), hasAppCond ? 2000 : 5000);
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

  // 音量ウィジェット、またはビジュアライザーがあるときにオーディオブリッジを起動
  // (ビジュアライザーは「既定の出力がどれか」を知るのに使う)
  const needAudio = c.widgets.some(x => x.type === 'volume' || (x.type === 'visualizer' && !x.off));
  if (needAudio && !process.env.WW_NO_AUDIO) audio.start();
  else audio.stop();

  // 既定の出力デバイスの切り替わりを拾う (Windows 側で変えても追従できるように)。
  // ヘルパーは自発的に通知しないので、2 秒ごとに状態を聞く
  if (c.widgets.some(x => x.type === 'visualizer' && !x.off) && !process.env.WW_NO_AUDIO) {
    heartbeat.register('audiodev', 2000, () => audio.refresh(false), true);
  } else {
    heartbeat.unregister('audiodev');
  }

  // 隠すアイコンのあるモードが当たっている間だけ、逃げ戻り監視を回す
  const curMode = (c.settings.iconLayouts || []).find(l => l.name === c.settings.currentIconMode);
  if (curMode && (curMode.hidden || []).length) {
    heartbeat.register('iconguard', 5000, iconGuardTick);
  } else {
    heartbeat.unregister('iconguard');
  }

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
  refreshOverlay();                     // モードの条件・オンオフの変更を反映

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
  const target = layouts.find(l => l.name === name);
  if (!target) return false;

  // 既定では壁紙だけ差し替える。レイアウトはウィジェット一式の写しなので、
  // まるごと当てると「そのレイアウトを保存した後に足したウィジェット」が
  // 画面から消える。背景を変えたいだけの用途でそれが起きるのは事故なので、
  // ウィジェットまで入れ替えるのは明示的に選んだときだけにする。
  if ((c.settings.scenes || {}).wallpaperOnly !== false) {
    const same = JSON.stringify(c.wallpapers) === JSON.stringify(target.wallpapers);
    if (!same) {
      config.update(cfg => {
        cfg.wallpapers = JSON.parse(JSON.stringify(target.wallpapers));
      });
      placedKey.clear();
    }
    return true;
  }

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

// 一度だけ: レイアウトプリセットとシーンを「モード」へ統合し、矛盾した状態を掃除する。
// onReady() だけでなく config:import / backup:restore の直後にも呼ぶ必要がある —
// 呼ばないと、統合前の古い設定ファイルを読み込んだ瞬間だけ、退役させたはずの
// シーンエンジンが (scenes.enabled: true のまま) その場限りで動き出してしまう
function migrateModes() {
  config.update(c => unifyModes(c));
}

// 素の設定オブジェクトに対する統合処理 (副作用なし)。
// 取り込み・復元では、設定を配る前にこれを通す必要がある —
// config.replace() は読み込んだ瞬間に 'change' を配ってしまい、
// 統合前の設定でシーンエンジンが動き出す (壁紙を書き換え、アイコンを動かす) ため
function unifyModes(c) {
  if (!c || !c.settings) return c;

  // ここから下の「一度だけ」ブロックは modesUnified 済みなら丸ごと飛ばすが、
  // これはあくまで一度きりの移行処理をスキップするだけであって、関数全体を
  // 抜けるわけではない。以前は return で関数ごと抜けていたため、
  // すでに移行済みのほとんどのユーザーで、下にある「毎回直す」掃除
  // (on+条件の矛盾・on の多重) が一度も実行されないという、この関数自体の不具合があった
  if (!c.settings.modesUnified) {
    // レイアウトは壁紙+ウィジェット一式の写しだったので、
    // 壁紙とウィジェットの表示だけをモードに引き継ぐ (位置は土台に一本化)。
    // シーンのルールは、指していたレイアウトから作られたモードの条件になる
    c.settings.modesUnified = true;
    const modes = c.settings.iconLayouts || (c.settings.iconLayouts = []);
    const skip = new Set(['シーン切替前 (自動)', '適用前の構成 (自動)', 'テーマ適用前 (自動)']);
    for (const lay of (c.settings.layouts || [])) {
      if (!lay || !lay.name || skip.has(lay.name)) continue;
      if (modes.some(m => m.name === lay.name)) continue;
      const ids = new Set((lay.widgets || []).map(w => w.id));
      const keep = (c.widgets || []).filter(w => ids.has(w.id)).map(w => w.id);
      // 「一部だけ出すプリセットだった」ときにだけ表示も引き継ぐ。
      // ひとつも一致しないなら、それは古いウィジェットを指した写しであって
      // 「全部隠す」という指定ではない。ここで linkWidgets を立てると、
      // 空の widgetsOn が「全部隠す」と解釈されて画面から何もかも消える
      const partial = keep.length > 0 && (c.widgets || []).some(w => !ids.has(w.id));
      modes.push({
        name: lay.name, savedAt: Date.now(), icons: [], hidden: [],
        wallpapers: lay.wallpapers ? JSON.parse(JSON.stringify(lay.wallpapers)) : null,
        linkWidgets: partial,
        widgetsOn: partial ? keep : [],
        trigger: null, on: false,
      });
    }
    const sc = c.settings.scenes || {};
    // マスタースイッチや個々のルールを切ってあったなら、その無効化ごと引き継ぐ。
    // 無視して移すと、ユーザーが止めたはずの自動切り替えが更新後に勝手に復活する
    if (sc.enabled) {
      for (const r of (sc.rules || [])) {
        if (!r || r.enabled === false || !r.trigger || !r.layout) continue;
        const m = modes.find(x => x.name === r.layout);
        if (m && !m.trigger) { m.trigger = JSON.parse(JSON.stringify(r.trigger)); m.on = false; }
      }
    }
    sc.enabled = false;                       // シーンは役目を終える (データは残す)
  }

  // モードの状態はどちらか一方だけ: 「常に効かせる (on)」か「条件で効かせる (trigger)」。
  // 両方立っていると手動オンが常に勝ち、条件を変えても何も起きず
  // 「条件が効かない」ようにしか見えない。条件がある方を残す
  for (const l of (c.settings.iconLayouts || [])) {
    if (l.trigger && l.on) l.on = false;
  }

  // 「常に効かせる」は同時に 1 つだけ。以前は壁紙・ウィジェットを持つモードどうしでしか
  // ぶつからなかったため、それらを持たないモードを on にしても衝突と見なされず、
  // 気づかないうちに何個も on が重なっていた。ウィジェットを持つ別のモードが
  // 先に on のままだと、それがずっと勝ち続けて切り替えボタンが効かなく見える不具合になる。
  // 一覧の上から順に、最初の 1 つだけを残す (setModeOn の排他と同じ基準)
  {
    let kept = false;
    for (const l of (c.settings.iconLayouts || [])) {
      if (l.on !== true) continue;
      if (kept) l.on = false; else kept = true;
    }
  }
  return c;
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

  migrateModes();

  // 一度だけ: 旧方式 (レジストリ) で自動起動が有効な人を、遅延の対象にならない
  // タスクスケジューラ方式へ黙って移行する。壁紙が出たあとまで遅らせて、
  // 起動そのものを (直そうとしている自動起動の遅さで) 逆に遅くしないようにする
  if (app.isPackaged) {
    setTimeout(() => {
      if (config.get().settings.autostartMigrated) return;
      config.update(c => { c.settings.autostartMigrated = true; });
      const legacy = app.getLoginItemSettings({ path: autostartExePath(), args: ['--autostart'] }).openAtLogin;
      if (legacy && !taskAutostartEnabled()) setAutostart(true);
    }, 4000);
  }

  // 既存ウィジェットに、再起動でも変わらないモニタの鍵を覚えさせる。
  // 5.9.18 が書いた displayId は再起動で無効になるため、ここで鍵へ移行する。
  // 対応するモニタが見つからない displayId は捨てる (残すと永久に非表示になる)
  config.update(c => {
    for (const w of (c.widgets || [])) {
      if (w.displayKey && displayPairs.some(p => p.key === w.displayKey)) continue;
      const pair = pairForWidget(w) || displayPairs.find(p => p.index === (w.display || 0));
      if (pair) {
        w.displayKey = pair.key;
        w.display = pair.index;
        w.displayId = pair.id;
      } else if (w.displayId && !displayPairs.some(p => p.id === String(w.displayId))) {
        delete w.displayId;      // 使えない id は残さない
      }
    }
  });

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
  audio.on('update', (d) => {
    broadcast('audio', d);
    // 既定の出力が変わった -> ビジュアライザーは取り込み直しが必要
    if (d.current && d.current !== lastAudioOut) {
      lastAudioOut = d.current;
      broadcast('audiodev', { current: d.current, devices: d.devices || [] });
    }
  });
  feeds.on('rss', (d) => broadcast('rss', d));
  feeds.on('ticker', (d) => broadcast('ticker', d));
  updater.on('status', (s) => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update-status', s);
  });
  fullscreen.on('change', (index, paused) => {
    scenes.setFullscreen(index, paused);
    if (editMode) return;
    // 監視は条件付きモードのためにも回る。壁紙を止めるのは省電力がオンのときだけ
    if (!config.get().settings.pauseOnFullscreen) return;
    const win = wallWins.get(index);
    if (win && !win.isDestroyed()) win.webContents.send('power', { paused });
  });
  fullscreen.on('foreground', (exe) => scenes.setForeground(exe));

  // シーンエンジン起動。バッテリー状態も最初に読んでおく
  scenes.watchModes(() => refreshOverlay());
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
  // WW_SELFTEST: 本物の main プロセスで設計の不変条件を検証して終了する。
  // scripts/apptest.js が砂場の userData と決まった config を与えて起動する。
  // デスクトップのアイコンには一切触れない (設定の読み書きと合成だけ)
  if (process.env.WW_SELFTEST) {
    setTimeout(() => {
      let stPass = 0, stFail = 0;
      const chk = (label, cond, detail) => {
        if (cond) { stPass++; return; }
        stFail++;
        console.log('SELFTEST FAIL: ' + label + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 200) : ''));
      };
      try {
        const st = config.get().settings;
        const modes = st.iconLayouts || [];

        // 別ケース: シーンのマスタースイッチが切ってあるとき、
        // ルールが 1 つも条件へ移行されないこと (無効化した自動化が復活しない)
        if (process.env.WW_SELFTEST_CASE === 'scenes-disabled') {
          chk('無効なシーンのルールは条件にならない', modes.every(m => !m.trigger),
            modes.map(m => m.name + ':' + JSON.stringify(m.trigger)));
          chk('シーンは無効のまま', !(st.scenes && st.scenes.enabled));
          console.log(stFail ? `SELFTEST: ${stFail} 件失敗 / ${stPass + stFail} 件` : `SELFTEST: 全 ${stPass} 件 PASS`);
          app.exit(stFail ? 1 : 0);
          return;
        }

        // 別ケース: すでに modesUnified な (=ほとんどの実ユーザーと同じ) 構成でも、
        // 「毎回直す」掃除がちゃんと動くこと。以前は一度きりの移行と同じ if で
        // 早期 return していたため、すでに統合済みのユーザーではここが
        // 一度も実行されず、on の重複がずっと残ってしまっていた (実際の不具合)
        if (process.env.WW_SELFTEST_CASE === 'already-unified') {
          chk('統合済みならもう移行はしない (印は変わらずそのまま)', st.modesUnified === true);
          const bx = modes.find(m => m.name === '裸モードX');
          const by = modes.find(m => m.name === '裸モードY');
          chk('統合済みでも先の裸モードは on のまま', !!(bx && bx.on === true), bx);
          chk('統合済みでも後の裸モードは off へ倒される', !!(by && by.on === false), by);
          console.log(stFail ? `SELFTEST: ${stFail} 件失敗 / ${stPass + stFail} 件` : `SELFTEST: 全 ${stPass} 件 PASS`);
          app.exit(stFail ? 1 : 0);
          return;
        }

        // 1. マイグレーション: 印・プリセットの変換・シーンの引退
        chk('統合の印が立つ', st.modesUnified === true);
        const day = modes.find(m => m.name === '昼プリセット');
        chk('プリセットがモードになる', !!day);
        chk('プリセットの壁紙を引き継ぐ', !!(day && day.wallpapers));
        chk('シーンのルールが条件になる', !!(day && day.trigger && day.trigger.type === 'app'), day && day.trigger);
        chk('シーン自体は引退する', !(st.scenes && st.scenes.enabled));

        // 1b. 移行の推測が暴走して「全部隠す」を作らないこと。
        //     現行のどのウィジェット id とも一致しないプリセットは、
        //     ウィジェット連動なしのモード (壁紙だけ) になるべき —
        //     linkWidgets:true + widgetsOn:[] は「全部隠す」という人の意思表示のための状態で、
        //     一致がゼロだったという偶然でここに落ちてはいけない
        const ghost = modes.find(m => m.name === '幽霊プリセット');
        chk('id が丸ごと変わったプリセットもモードになる', !!ghost);
        chk('一致ゼロは連動なしとして移行する', !!(ghost && ghost.linkWidgets !== true), ghost);
        chk('一致ゼロでも壁紙は引き継ぐ', !!(ghost && ghost.wallpapers));

        // 2. 矛盾の掃除: on と trigger の両立ちは条件が主
        const both = modes.find(m => m.name === '矛盾モード');
        chk('on+条件の両立ちは掃除される', !!(both && both.trigger && both.on === false), both && { on: both.on, trg: !!both.trigger });

        // 2b. 「常に効かせる」は持ち物に関係なく同時に 1 つだけ (実際の不具合の再現)。
        // 一覧の上から見て最初の 1 つだけが残る
        const bx = modes.find(m => m.name === '裸モードX');
        const by = modes.find(m => m.name === '裸モードY');
        chk('先の裸モードは on のまま残る', !!(bx && bx.on === true), bx);
        chk('後の裸モードは起動時に off へ倒される', !!(by && by.on === false), by);

        // 3. 土台の不変: effectiveConfig は config を 1 バイトも書き換えない
        const before = JSON.stringify(config.get());
        effectiveConfig();
        chk('合成しても土台は不変', JSON.stringify(config.get()) === before);

        // 4. 手動オン: 条件が消え、合成に壁紙とウィジェット表示が乗る
        const rOn = setModeOn('壁紙モードA', true);
        chk('オンにできる', !!(rOn && rOn.ok), rOn);
        const a = (config.get().settings.iconLayouts || []).find(m => m.name === '壁紙モードA');
        chk('手動オンで条件は消える', !!(a && a.on === true && !a.trigger));
        const eff = effectiveConfig();
        chk('壁紙が重なる', JSON.stringify(eff.wallpapers) === JSON.stringify(a.wallpapers));
        chk('土台の壁紙はそのまま', JSON.stringify(config.get().wallpapers) !== JSON.stringify(eff.wallpapers));
        const wOn = new Set(a.widgetsOn || []);
        chk('ウィジェット表示が重なる', eff.widgets.every(w => w.off === !wOn.has(w.id)),
          eff.widgets.map(w => w.id + ':' + (w.off ? 'off' : 'on')));
        chk('土台のウィジェットはそのまま', config.get().widgets.every(w => !w.off));

        // 5. 排他: 同じ持ち物のモードは同時にオンにならず、名指しで返る
        const rB = setModeOn('壁紙モードB', true);
        chk('排他で前のモードがオフ', !!(rB && rB.turnedOff && rB.turnedOff.includes('壁紙モードA')), rB);
        const a2 = (config.get().settings.iconLayouts || []).find(m => m.name === '壁紙モードA');
        chk('オフが保存される', !!(a2 && a2.on === false));

        // 6. オフで土台へ戻る
        setModeOn('壁紙モードB', false);
        const eff2 = effectiveConfig();
        chk('全オフなら土台そのもの', JSON.stringify(eff2.wallpapers) === JSON.stringify(config.get().wallpapers));

        // 7. 窓が実際に立っている
        chk('壁紙の窓がある', wallWins.size >= 1, wallWins.size);

        // 8. 移行はシーン・ルールの無効化ごと引き継ぐ
        //    (無効ルールが先頭にあっても、有効ルールの条件が勝つ)
        chk('無効なルールに条件枠を奪われない',
          !!(day && day.trigger && day.trigger.type === 'app'), day && day.trigger);

        // 9. ウィジェット表示が「ひとつも選んでいない」= 全部隠す
        //    (以前は空だと合成に乗らず、何も起きなかった)
        setModeOn('壁紙モードA', false);
        config.update(c => {
          const m = (c.settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
          if (m) m.widgetsOn = [];
        });
        setModeOn('壁紙モードA', true);
        chk('空選択のモードは全部隠す', effectiveConfig().widgets.every(w => w.off),
          effectiveConfig().widgets.map(w => w.id + ':' + (w.off ? 'off' : 'on')));
        chk('土台のウィジェットは隠れない', config.get().widgets.every(w => !w.off));

        // 10. その状態でウィジェットを足しても、隠れっぱなしにならない…わけではない。
        //     「全部隠す」モードには足さない (それが意思表示なので) が、
        //     選択があるモードには足して「追加したのに出ない」を防ぐ
        config.update(c => {
          const m = (c.settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
          if (m) m.widgetsOn = ['w1'];
        });
        const added = addWidget('clock');
        const aMode = (config.get().settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
        chk('追加したウィジェットは選択中のモードにも入る',
          !!(added && aMode && (aMode.widgetsOn || []).includes(added.id)), aMode && aMode.widgetsOn);
        chk('追加したウィジェットは合成でも出る',
          !!effectiveConfig().widgets.find(w => w.id === added.id && !w.off));

        // 10b. 複製 (Ctrl+D) も追加と同じ扱い。ここが漏れると、複製した直後
        //      連動モードが効いていれば複製したウィジェットだけ見えなくなる
        config.update(c => {
          const m = (c.settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
          if (m) m.widgetsOn = ['w1'];
        });
        setModeOn('壁紙モードA', true);
        let duplicated = null;
        config.update(c => {
          const src = c.widgets.find(w => w.id === 'w1');
          duplicated = JSON.parse(JSON.stringify(src));
          duplicated.id = 'w-dup-test';
          duplicated.x = Math.min(97, src.x + 2.5);
          c.widgets.push(duplicated);
          joinLinkedWidgetsOn(c, duplicated.id);
        });
        const aMode2 = (config.get().settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
        chk('複製したウィジェットも選択中のモードに入る',
          !!(duplicated && aMode2 && (aMode2.widgetsOn || []).includes(duplicated.id)), aMode2 && aMode2.widgetsOn);
        chk('複製したウィジェットは合成でも出る',
          !!effectiveConfig().widgets.find(w => w.id === 'w-dup-test' && !w.off));
        setModeOn('壁紙モードA', false);

        // 11. 名前の変更が、他の場所の参照もまとめて追いかける
        const rn = renameIconMode('名前変更対象', '新しい名前');
        chk('名前を変えられる', !!(rn && rn.ok), rn);
        const stR = config.get().settings;
        const swR = (config.get().widgets || []).find(w => w.id === 'w4');
        chk('切り替えボタンの参照も追従する',
          !!(swR && swR.options.items.includes('新しい名前') && !swR.options.items.includes('名前変更対象')),
          swR && swR.options.items);
        chk('名前変更後も同名モードは 1 つ',
          (stR.iconLayouts || []).filter(l => l.name === '新しい名前').length === 1);

        // 12. 削除が、宙に浮く参照を残さない
        removeIconMode('削除対象');
        const stD = config.get().settings;
        const swD = (config.get().widgets || []).find(w => w.id === 'w4');
        chk('削除したモードは消える', !(stD.iconLayouts || []).some(l => l.name === '削除対象'));
        chk('自動復元の指定が外れる', stD.iconAutoRestore !== '削除対象', stD.iconAutoRestore);
        chk('シーンの既定も外れる', !(stD.scenes && stD.scenes.defaultIcons === '削除対象'));
        chk('シーンのルール参照も外れる',
          !((stD.scenes && stD.scenes.rules) || []).some(r => r.icons === '削除対象'));
        chk('切り替えボタンから消える', !!(swD && !swD.options.items.includes('削除対象')), swD && swD.options.items);

        // 13. 「今のアイコンモード」は重ねではなく実際に適用した名前で決まる
        //     (壁紙だけのモードが効いていても、それを今のアイコンモードとは呼ばない)
        setModeOn('壁紙モードB', true);
        config.update(c => { c.settings.currentIconMode = '新しい名前'; });
        chk('今のアイコンモードは重ねに引きずられない',
          (config.get().settings.currentIconMode) === '新しい名前');
        setModeOn('壁紙モードB', false);
        config.update(c => { c.settings.currentIconMode = ''; });

        // 14. 並び替え: 一覧の順番が「どのモードが勝つか」を決めるので、
        //     指定した通りに並び、指定に無いもの (自動退避など) は後ろへ回る
        {
          const before = (config.get().settings.iconLayouts || []).map(l => l.name);
          config.update(c => {
            c.settings.iconLayouts.push({ name: ICON_BACKUP_NAME, savedAt: 0, icons: [], hidden: [] });
          });
          const want = ['壁紙モードB', '壁紙モードA', '矛盾モード'];
          ipcReorder(want);
          const after = (config.get().settings.iconLayouts || []).map(l => l.name);
          chk('指定した順に並ぶ', JSON.stringify(after.slice(0, 3)) === JSON.stringify(want), after);
          chk('指定に無いものは後ろへ回る', after.slice(3).includes(ICON_BACKUP_NAME), after);
          chk('並び替えで数は変わらない', after.length === before.length + 1, { before: before.length, after: after.length });
          ipcReorder([]);
          chk('空の指定は断る (全部消さない)',
            (config.get().settings.iconLayouts || []).length === after.length);
          ipcReorder(['存在しない名前']);
          chk('知らない名前だけでも消えない',
            (config.get().settings.iconLayouts || []).length === after.length);
        }

        // 15. 覚え直す (同じ名前で保存し直す) の契約。
        //     実デスクトップは読まずに済むよう、読み取りだけ偽物に差し替える
        //     (書き込み側 icons.apply はそもそも呼ばない)
        {
          const realList = icons.list, realOrigin = icons.origin;
          const realVisible = icons.visibleList, realStranded = icons.strandedNames;
          icons.list = () => [{ name: 'A', x: 10, y: 20 }, { name: 'B', x: 10, y: 150 }];
          icons.origin = () => ({ x: 0, y: 0 });
          icons.visibleList = () => [];
          icons.strandedNames = () => [];
          try {
            const idxBefore = (config.get().settings.iconLayouts || []).findIndex(l => l.name === '壁紙モードA');
            config.update(c => {
              const m = (c.settings.iconLayouts || []).find(x => x.name === '壁紙モードA');
              if (m) { m.trigger = { type: 'battery' }; m.on = false; }
            });
            const r = saveIconSnapshot('壁紙モードA', ['B']);
            chk('覚え直せる', !!(r && r.ok), r);
            const list = config.get().settings.iconLayouts || [];
            const idxAfter = list.findIndex(l => l.name === '壁紙モードA');
            const m2 = list[idxAfter];
            chk('覚え直しても同じ位置のまま (優先順位が変わらない)', idxAfter === idxBefore, { idxBefore, idxAfter });
            chk('覚え直すと隠す一覧が入れ替わる', JSON.stringify(m2.hidden) === JSON.stringify(['B']), m2.hidden);
            chk('覚え直しても条件は残る', !!(m2.trigger && m2.trigger.type === 'battery'), m2.trigger);
            chk('覚え直しても壁紙は残る', !!m2.wallpapers);
            chk('覚え直しても連動は残る', m2.linkWidgets === true);
            chk('覚え直すと数は増えない',
              list.filter(l => l.name === '壁紙モードA').length === 1);
            // 新しい名前で保存すれば末尾に増える
            const n0 = list.length;
            saveIconSnapshot('あたらしい保存', []);
            chk('新しい名前なら増える', (config.get().settings.iconLayouts || []).length === n0 + 1);
          } finally {
            icons.list = realList; icons.origin = realOrigin;
            icons.visibleList = realVisible; icons.strandedNames = realStranded;
          }
        }

        // 16. 取り込み・復元と同じ手順: 配る前に統合しないと、
        //     config.replace() が読み込んだ瞬間に 'change' を配ってしまい、
        //     統合前の (まだ scenes.enabled な) 旧シーンエンジンが一度動いて
        //     土台の壁紙を直接書き換えてしまう。ここでは import/restore の
        //     ハンドラと同じ順番 (unifyModes -> replace -> migrateModes) を再現する
        {
          const ghostWall = { default: { type: 'custom', value: { kind: 'solid', colors: ['#ff00ff'] }, dim: 0, blur: 0 }, byDisplay: {} };
          const legacyPayload = JSON.parse(JSON.stringify({
            version: 2,
            wallpapers: config.get().wallpapers,
            widgets: config.get().widgets,
            settings: {
              ...config.get().settings,
              modesUnified: false,          // 統合前の設定ファイルのふり
              layouts: [{ name: 'ゴーストレイアウト', wallpapers: ghostWall, widgets: [] }],
              scenes: { enabled: true, defaultLayout: 'ゴーストレイアウト', defaultIcons: '', rules: [] },
            },
          }));
          unifyModes(legacyPayload);
          config.replace(legacyPayload, 'テスト用の取り込み');
          migrateModes();   // 正規化などで印が落ちていた場合の保険
          const wpAfter = JSON.stringify(config.get().wallpapers);
          chk('取り込みで旧シーンに土台を書き換えさせない',
            wpAfter !== JSON.stringify(ghostWall), wpAfter.slice(0, 90));
          chk('取り込み後は統合済みになる', config.get().settings.modesUnified === true);
          chk('取り込み後はシーンが引退している', !(config.get().settings.scenes && config.get().settings.scenes.enabled));
        }

        // 17. 編集中は対話ウィジェットの窓を触らない。ただし触らなかった分は、
        //     編集を抜けたときに必ず一度で回収されること (取りこぼしたまま固まらない)
        {
          config.update(c => {
            c.settings.iconLayouts.push({
              name: '編集中モード', savedAt: 0, icons: [], hidden: [],
              on: false, trigger: null, linkWidgets: true, widgetsOn: ['w1'],   // フォルダ (w3) を除外
            });
          });
          chk('素の状態ではフォルダの窓がある', folderWins.has('w3'), [...folderWins.keys()]);

          setModeOn('編集中モード', true);
          chk('編集を伴わない重ね直しは即座にフォルダの窓を消す', !folderWins.has('w3'), [...folderWins.keys()]);
          setModeOn('編集中モード', false);
          chk('モードを外せば窓は戻る', folderWins.has('w3'), [...folderWins.keys()]);

          enterEditMode();
          setModeOn('編集中モード', true);   // 編集中に重ねを変える (トリガー発火や他ウィンドウからの操作を想定)
          chk('編集中は重ねが変わっても窓に触らない', folderWins.has('w3'), [...folderWins.keys()]);
          exitEditMode();
          chk('編集を抜けたら取りこぼした同期を回収する', !folderWins.has('w3'), [...folderWins.keys()]);

          setModeOn('編集中モード', false);   // 後始末
          chk('後始末で窓も戻る', folderWins.has('w3'), [...folderWins.keys()]);
        }
      } catch (err) {
        stFail++;
        console.log('SELFTEST FAIL: 例外 :: ' + (err && err.stack || err));
      }
      console.log(stFail ? `SELFTEST: ${stFail} 件失敗 / ${stPass + stFail} 件` : `SELFTEST: 全 ${stPass} 件 PASS`);
      app.exit(stFail ? 1 : 0);
    }, 4000);
  }
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

function addWidget(type) {
  let created = null;
  config.update(c => {
    created = config.newWidget(type);
    c.widgets.push(created);
    joinLinkedWidgetsOn(c, created.id);
  });
  return created;
}
ipcMain.handle('widget:add', (e, type) => addWidget(type));

// 新しいウィジェット (追加・複製) を、いま「一部だけ出す」設定にしている
// モードすべての表示対象に加える。何も選んでいない (= 全部隠す意思表示の) モードは
// 対象外にする — そこへ足すと「全部隠す」という選択を上書きしてしまう
function joinLinkedWidgetsOn(c, id) {
  for (const l of (c.settings.iconLayouts || [])) {
    if (l.linkWidgets && (l.widgetsOn || []).length) l.widgetsOn.push(id);
  }
}

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
    const have = new Set(items.map(i => i.url || i.path));
    for (const p2 of clean) {
      if (have.has(p2)) continue;
      have.add(p2);
      if (isWebUrl(p2)) {
        items.push({ url: p2, name: new URL(p2).hostname.replace(/^www\./, '') });
      } else {
        items.push({ path: p2, name: path.basename(p2).replace(/\.(lnk|exe|url|bat)$/i, '') });
      }
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
    for (const it of w.options.items || []) if (it.path) set.add(it.path);
  }
  return set;
}

// フォルダウィジェットに入っているリンク (これ以外へは取りに行かない / 開かない)
function folderItemUrls() {
  const set = new Set();
  for (const w of config.get().widgets) {
    if (w.type !== 'folder') continue;
    for (const it of w.options.items || []) if (it.url) set.add(it.url);
  }
  return set;
}

function isWebUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// リンクのアイコン。ユーザーが自分で追加したサイトにだけ、その場所の
// favicon を取りに行く (第三者のサービスは経由しない)。取れなければ null で、
// 受け取った側が頭文字のタイルを描く
const urlIconCache = new Map();
async function fetchIcon(u, timeoutMs = 4000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await net.fetch(u, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 512 * 1024) return null;
    const img = nativeImage.createFromBuffer(buf);
    return (img && !img.isEmpty()) ? img.toDataURL() : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('icon:forUrl', async (e, u) => {
  if (!folderItemUrls().has(u)) return null;
  if (urlIconCache.has(u)) return urlIconCache.get(u);
  let out = null;
  try {
    const origin = new URL(u).origin;
    out = await fetchIcon(origin + '/favicon.ico') || await fetchIcon(origin + '/favicon.png');
  } catch (_) { out = null; }
  urlIconCache.set(u, out);
  return out;
});

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
  if (!w) return;

  // リンクは既定のブラウザへ。http/https 以外は開かない
  const link = (w.options.items || []).find(it => it.url && it.url === p);
  if (link) {
    if (isWebUrl(link.url)) shell.openExternal(link.url).catch(() => {});
    return;
  }

  if (!(w.options.items || []).some(it => it.path === p)) return;

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
    // addWidget と同じ理由: 複製した直後は、選択中のモードにも入れておかないと
    // 複製した瞬間 (連動モードが効いていれば) 見えなくなる。Ctrl+D は編集中しか
    // 押せないが、複製後に重ねへ戻ったときに消えて見える事故を防ぐ
    joinLinkedWidgetsOn(c, created.id);
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

let lastAudioOut = '';

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
  audio: (() => { const a = audio.getLatest(); return a ? { current: a.current, devices: a.devices } : null; })(),
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
    // 配る前に統合しておく。config.replace() は読み込んだ瞬間に 'change' を
    // 配ってしまうので、後から統合したのでは旧シーンが一度動いてしまう
    unifyModes(parsed);
    config.replace(parsed, 'インポートの前');
    migrateModes();          // 正規化で印が落ちていた場合の保険
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
    unifyModes(parsed);      // 配る前に統合する (インポートと同じ理由)
    config.replace(parsed, '復元の前');
    migrateModes();          // 正規化で印が落ちていた場合の保険
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
const ICON_BACKUP_NAME = overlay.ICON_BACKUP_NAME;

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
      // 同じ名前を上書きするときは、連動・壁紙・条件・オンオフを持ち越す
      linkWidgets: !!(prev && prev.linkWidgets),
      widgetsOn: (prev && prev.widgetsOn) ? prev.widgetsOn.slice() : [],
      wallpapers: (prev && prev.wallpapers) ? JSON.parse(JSON.stringify(prev.wallpapers)) : null,
      trigger: (prev && prev.trigger) ? JSON.parse(JSON.stringify(prev.trigger)) : null,
      on: !!(prev && prev.on),
    };
    // 上書きは同じ場所に置く。末尾へ移すと、編集のたびに一覧の並びが崩れる
    const idx = arr.findIndex(l => l.name === clean);
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    cfg.settings.iconLayouts = arr;
  });
  return { ok: true, count: rows.length, name: clean };
}

// スナップを適用する共通処理。書き込む前に必ず今の並びを退避する。

// activate: このモードを「オン」にする (条件を外し、排他を効かせる) かどうか。
// 人がボタン/切り替えウィジェットを押したときだけ true にする。
// モニタ構成変更などシステムが自動で当て直すときは false —
// でないとユーザーが設定した条件が黙って消え、他のモードまで巻き添えでオフになる
function applyIconSnapshot(name, activate = true) {
  const snap = (config.get().settings.iconLayouts || []).find(l => l.name === name);
  if (!snap) return { ok: false, msg: 'その配置が見つかりません' };
  rememberHome();                       // 隠す前の住所を控える
  saveIconSnapshot(ICON_BACKUP_NAME);
  // 壁紙とウィジェット表示は「重ね」が担当する。ここではアイコンだけを動かす。
  // 人がボタンを押したときだけ、あわせてこのモードをオンにする
  const r = icons.apply(snap.icons, snap.hidden || [],
    { origin: snap.origin, home: config.get().settings.iconHome || {} });
  if (!r) return { ok: false, msg: 'アイコンを操作できませんでした (デスクトップにアクセスできません)' };
  let turnedOff = [];
  if (name !== ICON_BACKUP_NAME && activate) {
    const t = setModeOn(name, true);
    turnedOff = (t && t.turnedOff) || [];
  }
  // 元に戻したら「どのモードでもない」状態。印を残すと、切り替えボタンが
  // 同名再適用を拒み、モニタ変更の当て直しが取り消したモードを復活させる
  config.update(cfg => {
    cfg.settings.currentIconMode = name === ICON_BACKUP_NAME ? '' : name;
  });
  return { ok: true, ...r, widgets: 0, widgetsRestored: 0, turnedOff };
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
      hasWallpaper: !!l.wallpapers,
      trigger: l.trigger ? JSON.parse(JSON.stringify(l.trigger)) : null,
      on: l.on === true,
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
function ipcReorder(names) {
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
}
ipcMain.handle('icons:reorder', (e, names) => ipcReorder(names));

function renameIconMode(from, to) {
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
    // 切り替えウィジェットはモード名を生の文字列で持っている。直さないと
    // ボタンがそのまま消える (存在しない名前としてフィルタで落ちる)
    for (const w of (cfg.widgets || [])) {
      if ((w.type === 'switcher' || w.type === 'modeswitch') && w.options && Array.isArray(w.options.items)) {
        w.options.items = w.options.items.map(n => (n === from ? clean : n));
      }
    }
  });
  return { ok: true, name: clean };
}
ipcMain.handle('icons:rename', (e, from, to) => renameIconMode(from, to));

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

// モードに「いまの壁紙」を覚えさせる / 忘れさせる
ipcMain.handle('icons:setWallpaper', (e, name, remember) => {
  let found = false;
  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === name);
    if (!l) return;
    found = true;
    // 土台の壁紙を写して覚える。以後このモードが効いている間だけ重なる
    l.wallpapers = remember ? JSON.parse(JSON.stringify(cfg.wallpapers)) : null;
  });
  refreshOverlay();
  return found ? { ok: true, remembered: !!remember } : { ok: false, msg: 'そのモードが見つかりません' };
});

// モードが自動で効く条件 (null なら手動のオンオフだけ)
ipcMain.handle('icons:setTrigger', (e, name, trigger) => {
  let found = false;
  config.update(cfg => {
    const l = (cfg.settings.iconLayouts || []).find(x => x.name === name);
    if (!l) return;
    found = true;
    l.trigger = trigger ? JSON.parse(JSON.stringify(trigger)) : null;
  });
  refreshOverlay();
  return found ? { ok: true } : { ok: false, msg: 'そのモードが見つかりません' };
});

// モードを手でオン / オフする。
// 同じもの (壁紙 / ウィジェット表示) を覚えるモードは同時にオンにしない。
// 黙って裏で取り合いにせず、何をオフにしたかを返して画面で知らせる
function setModeOn(name, on) {
  let found = false;
  const turnedOff = [];
  config.update(cfg => {
    const list = cfg.settings.iconLayouts || [];
    const me = list.find(x => x.name === name);
    if (!me) return;
    found = true;
    me.on = !!on;
    if (on) {
      me.trigger = null;                 // 手動オンにしたら条件は外す (排他)
      for (const l of overlay.exclusivityVictims(list, me)) {
        l.on = false;
        turnedOff.push(l.name);
      }
    }
  });
  refreshOverlay();
  return found ? { ok: true, on: !!on, turnedOff } : { ok: false, msg: 'そのモードが見つかりません' };
}
ipcMain.handle('icons:setOn', (e, name, on) => setModeOn(name, on));

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

// ビジュアライザー設定用: 出力デバイスの一覧と今の既定
ipcMain.handle('audio:devices', async () => {
  if (!process.env.WW_NO_AUDIO) audio.start();
  let a = audio.getLatest();
  if (!a || !(a.devices || []).length) {
    audio.refresh(true);
    await new Promise(r => setTimeout(r, 600));   // ヘルパーの応答を少し待つ
    a = audio.getLatest();
  }
  return a ? { current: a.current || '', devices: a.devices || [] } : { current: '', devices: [] };
});

// この環境で「隠す」が使えるか (死角がいくつあるか)
ipcMain.handle('icons:capacity', () => {
  try { return icons.hideCapacity(); } catch (_) { return 0; }
});

function removeIconMode(name) {
  config.update(cfg => {
    cfg.settings.iconLayouts = (cfg.settings.iconLayouts || []).filter(l => l.name !== name);
    if (cfg.settings.currentIconMode === name) cfg.settings.currentIconMode = '';
    // rename と同じ参照をここでも掃除する。放置すると自動復元やシーンの跡地が
    // 存在しない名前を指したまま黙って空振りし続ける (icons:rename 参照)
    if (cfg.settings.iconAutoRestore === name) cfg.settings.iconAutoRestore = '';
    const sc = cfg.settings.scenes || {};
    if (sc.defaultIcons === name) sc.defaultIcons = '';
    for (const r of (sc.rules || [])) if (r.icons === name) r.icons = '';
    for (const w of (cfg.widgets || [])) {
      if ((w.type === 'switcher' || w.type === 'modeswitch') && w.options && Array.isArray(w.options.items)) {
        w.options.items = w.options.items.filter(n => n !== name);
      }
    }
  });
  return (config.get().settings.iconLayouts || []).map(l => ({ name: l.name, savedAt: l.savedAt, count: (l.icons || []).length }));
}
ipcMain.handle('icons:remove', (e, name) => removeIconMode(name));

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
      // ユーザーが明示的に選んだ配置へ戻す (従来どおりのオプトイン)。
      // これはシステムが勝手に行うので、条件やオンオフには一切触らない (activate: false)。
      // 保存先の名前が消えている (モード削除済み) こともあるので、失敗したら下の隠し直しに続ける
      const r = applyIconSnapshot(cur.iconAutoRestore, false);
      if (process.env.WW_DEBUG) console.log('[icons] モニタ構成変更 -> "' + cur.iconAutoRestore + '" へ復元 ' + (r.ok ? 'OK' : ('失敗: ' + r.msg)));
      if (r.ok) return;
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

// 隠しているモードの見張り。
// アイコンを手で動かすと、explorer (混在 DPI の再計算) が死角に退避中の
// アイコンまで画面へ引き戻すことがある。止める手段は無いので、
// 「隠すはずなのに見えている」ものを見つけたら黙って隠し直す。
// 見えているアイコンの位置には一切触らない。
let iconGuardBackoffUntil = 0;
let iconGuardLastSet = '';
let iconGuardRepeat = 0;
function iconGuardTick() {
  const st = config.get().settings;
  const mode = st.currentIconMode
    ? (st.iconLayouts || []).find(l => l.name === st.currentIconMode) : null;
  const hide = (mode && mode.hidden) || [];
  if (!hide.length) return;                                  // 隠すモードが当たっていない
  if (Date.now() - lastDisplayChangeAt < 6000) return;       // 構成変更中は専用処理に任せる
  if (Date.now() < iconGuardBackoffUntil) return;
  try {
    if (icons.autoArrange()) return;                         // 自動整列と戦っても勝てない
    const parked = new Set(icons.strandedNames() || []);
    const escaped = hide.filter(n => !parked.has(n));
    if (!escaped.length) { iconGuardRepeat = 0; return; }

    // 同じ顔ぶれを連続で隠し直しているなら、explorer と喧嘩している。間を空ける
    const key = escaped.slice().sort().join('|');
    iconGuardRepeat = key === iconGuardLastSet ? iconGuardRepeat + 1 : 0;
    iconGuardLastSet = key;
    if (iconGuardRepeat >= 3) {
      iconGuardBackoffUntil = Date.now() + 60000;
      iconGuardRepeat = 0;
      return;
    }
    const r = icons.apply([], escaped);
    if (process.env.WW_DEBUG) {
      console.log('[icons] 逃げてきた ' + ((r && r.hidden) || 0) + ' 個を隠し直した (' + escaped.slice(0, 3).join(', ') + (escaped.length > 3 ? ' …' : '') + ')');
    }
  } catch (e) {
    if (process.env.WW_DEBUG) console.error('[icons] 見張りに失敗:', e);
  }
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

// 「今のアイコンモード」は重ねとは別物 (アイコンは人操作でしか動かない)。
// activeModes() は壁紙・ウィジェット表示のための一覧で、アイコンを一切
// 動かしていないモードも含まれる。currentIconMode = 最後に実際に適用した名前、それだけ
ipcMain.handle('switcher:currentIcons', () => config.get().settings.currentIconMode || '');

ipcMain.handle('switcher:applyIcons', (e, name) => {
  // 押されたモードを当てるだけ。「戻す」は別のモード (通常など) を押して行う。
  // かつてはここに「同じものをもう一度押したら解除」があったが、
  // 光っているボタンは画面側が押させないので永久に届かない死んだ道だった。
  // 解除の意味も曖昧 (アイコンは戻す? 戻さない?) で、事故のもとでしかない
  return !!applyIconSnapshot(name).ok;
});

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
