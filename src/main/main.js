// WidgetWall — メインプロセス
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, powerMonitor, nativeImage, session } = require('electron');
const path = require('path');
const config = require('./config');
const attach = require('./wallpaperAttach');
const weather = require('./weather');
const stats = require('./stats');

// 壁紙ウィンドウはアイコンの背面 = 常に「隠れている」扱いになるため、
// Chromium の被覆検知・スロットリングを止めないと描画が停止する
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const IS_AUTOSTART = process.argv.includes('--autostart');
const ASSETS = path.join(__dirname, '..', '..', 'assets');

let wallWin = null;
let settingsWin = null;
let tray = null;
let editMode = false;
let watchdog = null;
let lastWeatherKey = '';

// ---------------------------------------------------------------- 単一インスタンス
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(onReady);
}

// ---------------------------------------------------------------- ユーティリティ
function getHwnd(win) {
  const buf = win.getNativeWindowHandle();
  return Number(buf.readBigUInt64LE(0));
}

function broadcast(channel, payload) {
  for (const w of [wallWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function weatherWidget() {
  return config.get().widgets.find(w => w.type === 'weather');
}

// アタッチ + 直後の位置ずれ補正 (Electron が勝手に動かすことがある)
function attachWall() {
  if (!wallWin || wallWin.isDestroyed()) return;
  const hwnd = getHwnd(wallWin);
  attach.attach(hwnd);
  for (const ms of [250, 1000, 3000]) {
    setTimeout(() => {
      if (!editMode && wallWin && !wallWin.isDestroyed()) attach.ensurePlacement(hwnd);
    }, ms);
  }
}

// ---------------------------------------------------------------- 壁紙ウィンドウ
function createWallpaperWindow() {
  const display = screen.getPrimaryDisplay();
  wallWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    closable: false, skipTaskbar: true, focusable: false, show: false,
    hasShadow: false, roundedCorners: false, thickFrame: false,
    backgroundColor: '#0b0d12',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'wallpaper.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  wallWin.loadFile(path.join(__dirname, '..', 'renderer', 'wallpaper', 'index.html'));

  wallWin.once('ready-to-show', () => {
    wallWin.showInactive();
    attachWall();
  });

  // レンダラが落ちたら作り直す (安定性)
  wallWin.webContents.on('render-process-gone', () => {
    try { wallWin.destroy(); } catch (_) {}
    wallWin = null;
    setTimeout(() => { if (!wallWin) createWallpaperWindow(); }, 1000);
  });
}

// explorer.exe 再起動などで壁紙ウィンドウが道連れに破棄された場合の自動復旧
function startWatchdog() {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    if (editMode) return;
    try {
      if (!wallWin || wallWin.isDestroyed()) { createWallpaperWindow(); return; }
      const hwnd = getHwnd(wallWin);
      if (!attach.isWindowAlive(hwnd)) {
        try { wallWin.destroy(); } catch (_) {}
        wallWin = null;
        createWallpaperWindow();
      } else if (!attach.isParentAlive()) {
        attachWall();
      } else {
        attach.ensurePlacement(hwnd);
      }
    } catch (e) {
      console.error('watchdog:', e.message);
    }
  }, 30000);
}

// ---------------------------------------------------------------- 編集モード
function enterEditMode() {
  if (!wallWin || wallWin.isDestroyed() || editMode) return;
  editMode = true;
  const display = screen.getPrimaryDisplay();
  attach.detach(getHwnd(wallWin));
  wallWin.setFocusable(true);
  wallWin.setAlwaysOnTop(true, 'screen-saver');
  wallWin.setBounds(display.bounds);
  wallWin.show();
  wallWin.focus();
  wallWin.webContents.send('edit-mode', true);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.minimize();
}

function exitEditMode() {
  if (!wallWin || wallWin.isDestroyed() || !editMode) return;
  editMode = false;
  wallWin.webContents.send('edit-mode', false);
  wallWin.setAlwaysOnTop(false);
  wallWin.setFocusable(false);
  attachWall();
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
  const sw = Math.min(1040, wa.width - 80);
  const sh = Math.min(720, wa.height - 80);
  settingsWin = new BrowserWindow({
    width: sw, height: sh, minWidth: 700, minHeight: 520,
    x: Math.round(wa.x + (wa.width - sw) / 2),
    y: Math.round(wa.y + (wa.height - sh) / 2),
    frame: false, show: false,
    backgroundColor: '#0d1017',
    backgroundMaterial: 'acrylic',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));
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
// ポータブル版は %TEMP% に展開されて実行されるため、実体の exe パスを使う
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

// ---------------------------------------------------------------- 天気・システム情報の購読管理
function syncServices() {
  const c = config.get();
  const w = weatherWidget();
  const key = w ? JSON.stringify([w.options.lat, w.options.lon, c.settings.weatherIntervalMin]) : '';
  if (key !== lastWeatherKey) {
    lastWeatherKey = key;
    if (w) weather.schedule(() => weatherWidget(), c.settings.weatherIntervalMin);
  }
  if (c.widgets.some(x => x.type === 'stats')) stats.start();
  else stats.stop();
}

// ---------------------------------------------------------------- 終了
function quitApp() {
  try {
    clearInterval(watchdog);
    if (wallWin && !wallWin.isDestroyed()) attach.detach(getHwnd(wallWin));
  } catch (_) {}
  try { if (wallWin && !wallWin.isDestroyed()) wallWin.destroy(); } catch (_) {}
  try { tray && tray.destroy(); } catch (_) {}
  app.exit(0);
}

// ---------------------------------------------------------------- 起動
function onReady() {
  config.load();

  // 設定画面でのフォント一覧取得 (queryLocalFonts) を許可
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'local-fonts');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'local-fonts');

  createWallpaperWindow();
  createTray();
  startWatchdog();
  syncServices();

  if (!IS_AUTOSTART) openSettings();

  // 解像度・モニタ構成の変化に追従
  const onDisplayChange = () => {
    if (!wallWin || wallWin.isDestroyed()) return;
    if (editMode) {
      wallWin.setBounds(screen.getPrimaryDisplay().bounds);
    } else {
      attach.resize(getHwnd(wallWin));
    }
    broadcast('config', config.get());
  };
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);

  // スリープ復帰時に天気を更新し、貼り付け状態を確認
  powerMonitor.on('resume', () => {
    setTimeout(() => {
      const w = weatherWidget();
      if (w) weather.refresh(w.options);
      if (!editMode && wallWin && !wallWin.isDestroyed() && !attach.isParentAlive()) {
        attachWall();
      }
    }, 3000);
  });

  config.on('change', (c) => {
    broadcast('config', c);
    syncServices();
  });
  weather.on('update', (d) => broadcast('weather', d));
  stats.on('update', (d) => broadcast('stats', d));

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
    if (wallWin && !wallWin.isDestroyed()) attach.detach(getHwnd(wallWin));
  } catch (_) {}
});

// ---------------------------------------------------------------- IPC
ipcMain.handle('config:get', () => config.get());

ipcMain.handle('wallpaper:set', (e, patch) => config.update(c => Object.assign(c.wallpaper, patch)));

ipcMain.handle('settings:set', (e, patch) => config.update(c => Object.assign(c.settings, patch)));

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
    filters: [
      { name: '画像・動画', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp4', 'webm'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const kind = /\.(mp4|webm)$/i.test(p) ? 'video' : 'image';
  return { path: p, kind };
});

ipcMain.handle('city:search', (e, q) => weather.searchCity(q));
ipcMain.handle('weather:get', () => weather.getLatest());
ipcMain.handle('weather:refresh', () => {
  const w = weatherWidget();
  return w ? weather.refresh(w.options) : null;
});

ipcMain.handle('autostart:get', () => getAutostart());
ipcMain.handle('autostart:set', (e, v) => setAutostart(!!v));

ipcMain.handle('edit:enter', () => enterEditMode());
ipcMain.on('edit:finish', (e, layout) => {
  if (Array.isArray(layout)) {
    config.update(c => {
      for (const item of layout) {
        const w = c.widgets.find(x => x.id === item.id);
        if (!w) continue;
        if (typeof item.x === 'number') w.x = Math.round(item.x * 100) / 100;
        if (typeof item.y === 'number') w.y = Math.round(item.y * 100) / 100;
        if (typeof item.size === 'number') w.size = item.size;
      }
    });
  }
  exitEditMode();
});

ipcMain.handle('state:request', () => ({
  config: config.get(),
  weather: weather.getLatest(),
  version: app.getVersion(),
}));

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('win:minimize', () => settingsWin && settingsWin.minimize());
ipcMain.on('win:close', () => settingsWin && settingsWin.close());
ipcMain.on('app:quit', () => quitApp());
