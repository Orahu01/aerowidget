// デスクトップアイコンの背面 (WorkerW / Progman) に Electron ウィンドウを差し込むモジュール。
// Wallpaper Engine / Lively と同じ手法。Win10 と Win11 24H2 以降の両方のレイアウトに対応する。
//
// - attachAt():    アイコンの「背面」に配置 (壁紙ウィンドウ用)
// - placeOnDesktopLayer(): アイコンの「前面」かつ全アプリの背面に配置 (対話ウィジェット用、クリック可能)
'use strict';

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');

const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'uint64', ['str16', 'str16']);
const FindWindowExW = user32.func('__stdcall', 'FindWindowExW', 'uint64', ['uint64', 'uint64', 'str16', 'str16']);
const SendMessageTimeoutW = user32.func('__stdcall', 'SendMessageTimeoutW', 'uint64', ['uint64', 'uint32', 'uint64', 'uint64', 'uint32', 'uint32', 'void *']);
const SetParent = user32.func('__stdcall', 'SetParent', 'uint64', ['uint64', 'uint64']);
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'bool', ['uint64', 'uint64', 'int', 'int', 'int', 'int', 'uint32']);
const MoveWindow = user32.func('__stdcall', 'MoveWindow', 'bool', ['uint64', 'int', 'int', 'int', 'int', 'bool']);
const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int']);
const IsWindow = user32.func('__stdcall', 'IsWindow', 'bool', ['uint64']);
const GetWindowLongPtrW = user32.func('__stdcall', 'GetWindowLongPtrW', 'int64', ['uint64', 'int']);
const SetWindowLongPtrW = user32.func('__stdcall', 'SetWindowLongPtrW', 'int64', ['uint64', 'int', 'int64']);
const SystemParametersInfoW = user32.func('__stdcall', 'SystemParametersInfoW', 'bool', ['uint32', 'uint32', 'void *', 'uint32']);
const InvalidateRect = user32.func('__stdcall', 'InvalidateRect', 'bool', ['uint64', 'void *', 'bool']);
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', koffi.out('void *')]);
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['uint64']);
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'bool', ['uint64', 'int']);
const SetWindowRgn = user32.func('__stdcall', 'SetWindowRgn', 'int', ['uint64', 'uint64', 'bool']);
const CreateRoundRectRgn = gdi32.func('__stdcall', 'CreateRoundRectRgn', 'uint64', ['int', 'int', 'int', 'int', 'int', 'int']);

const EnumWindowsProc = koffi.proto('__stdcall', 'EnumWindowsProc', 'bool', ['uint64', 'int64']);
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'int64']);

const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

// hwnd → { parent, mode, above, savedStyle, rect }
const attached = new Map();

// Progman に 0x052C を送って WorkerW を生成させ、差し込み先ウィンドウを探す
function findTarget() {
  const progman = num(FindWindowW('Progman', null));
  if (!progman) return null;

  SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, 0x0, 1000, null);

  // --- Win10 型: SHELLDLL_DefView を持つウィンドウの「次の兄弟」の WorkerW ---
  let sibling = 0;
  const cb = koffi.register((hwnd, _l) => {
    const h = num(hwnd);
    const def = num(FindWindowExW(h, 0, 'SHELLDLL_DefView', null));
    if (def) {
      const w = num(FindWindowExW(0, h, 'WorkerW', null));
      if (w) sibling = w;
    }
    return true;
  }, koffi.pointer(EnumWindowsProc));
  try {
    EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  if (sibling) return { progman, parent: sibling, mode: 'workerw-sibling' };

  // --- Win11 24H2 型: SHELLDLL_DefView も WorkerW も Progman の子 ---
  const defView = num(FindWindowExW(progman, 0, 'SHELLDLL_DefView', null));
  const childWorker = num(FindWindowExW(progman, 0, 'WorkerW', null));
  if (childWorker) return { progman, parent: childWorker, mode: 'workerw-child', defView };
  return { progman, parent: progman, mode: 'progman', defView };
}

function virtualOrigin() {
  return { x: GetSystemMetrics(SM_XVIRTUALSCREEN), y: GetSystemMetrics(SM_YVIRTUALSCREEN) };
}

function screenRect(hwnd) {
  const b = Buffer.alloc(16);
  GetWindowRect(hwnd, b);
  return { l: b.readInt32LE(0), t: b.readInt32LE(4), r: b.readInt32LE(8), b: b.readInt32LE(12) };
}

function makeChildStyle(hwnd) {
  const ex = num(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
  const st = num(GetWindowLongPtrW(hwnd, GWL_STYLE));
  SetWindowLongPtrW(hwnd, GWL_STYLE, ((st | WS_CHILD) & ~WS_POPUP) >>> 0);
  return st;
}

function moveToPhysRect(hwnd, rect) {
  const vo = virtualOrigin();
  MoveWindow(hwnd, rect.x - vo.x, rect.y - vo.y, rect.w, rect.h, true);
}

// 壁紙ウィンドウ: アイコンの背面に配置
function attachAt(hwnd, rect) {
  const target = findTarget();
  if (!target || !target.parent) return false;

  const prev = attached.get(hwnd);
  const savedStyle = prev ? prev.savedStyle : makeChildStyle(hwnd);
  if (!prev) attached.set(hwnd, { savedStyle });

  SetParent(hwnd, target.parent);
  moveToPhysRect(hwnd, rect);

  // Progman 直下しかない場合はアイコンのすぐ下の Z 位置へ
  if (target.mode === 'progman' && target.defView) {
    SetWindowPos(hwnd, target.defView, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }

  Object.assign(attached.get(hwnd), { parent: target.parent, mode: target.mode, above: false, rect });
  return true;
}

// フォルダウィジェット: アイコンの前面 (かつ全アプリの背面 = デスクトップ上) に配置。
// Progman の子の最前面に置くことで、クリックを受け取れてアプリには隠れない。
// 対話ウィジェット (フォルダ / メモ / タイマー) を「デスクトップ直上」の層に置く。
//
// 以前は Progman の子ウィンドウにしていたが、別プロセスのウィンドウの子にすると
// Chromium にマウス/キーボード入力が一切届かず、クリックできなかった。
// そのためトップレベルのまま維持し、Z オーダーだけ Progman の直上に差し込む
// (Rainmeter の "OnDesktop" と同じ考え方)。アイコンより手前・全アプリより奥に居座り、
// かつ入力は通常のトップレベルウィンドウとして正しく処理される。
function placeOnDesktopLayer(hwnd) {
  const progman = num(FindWindowW('Progman', null));
  if (!progman) return false;

  const prev = attached.get(hwnd);
  if (!prev) {
    // タスクバー / Alt+Tab には出さない (入力は殺さないので NOACTIVATE は付けない)
    const ex = num(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
    attached.set(hwnd, { savedStyle: null, desktopLayer: true });
  }

  if (!IsWindowVisible(hwnd)) ShowWindow(hwnd, 8 /* SW_SHOWNA */);
  SetWindowPos(hwnd, progman, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

  Object.assign(attached.get(hwnd), { parent: progman, above: true, desktopLayer: true });
  return true;
}

// 一度前面に出た対話ウィジェットを、再びデスクトップ直上まで下げる
function lowerToDesktopLayer(hwnd) {
  const st = attached.get(hwnd);
  if (!st || !st.desktopLayer) return;
  const progman = num(FindWindowW('Progman', null));
  if (progman) SetWindowPos(hwnd, progman, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

// 通常のトップレベルウィンドウに戻す (レイアウト編集 / 終了時)
function detach(hwnd) {
  const st = attached.get(hwnd);
  if (!st) return;
  if (st.desktopLayer) {
    // 元からトップレベル。Z オーダーを戻すだけでよい
    attached.delete(hwnd);
    return;
  }
  SetParent(hwnd, 0);
  if (st.savedStyle != null) SetWindowLongPtrW(hwnd, GWL_STYLE, st.savedStyle);
  attached.delete(hwnd);
  refreshDesktop();
}

// Electron 側の勝手な再配置を検知して正しい物理位置へ戻す
function ensurePlacement(hwnd, rect) {
  const st = attached.get(hwnd);
  if (!st) return;
  // デスクトップ層のトップレベル窓は Electron が座標を管理するので Z 順だけ保つ
  if (st.desktopLayer) { lowerToDesktopLayer(hwnd); return; }
  const target = rect || st.rect;
  if (!target) return;
  st.rect = target;
  // show のタイミングと SetParent が競合すると不可視のまま取り残されることがある
  if (!IsWindowVisible(hwnd)) ShowWindow(hwnd, 8 /* SW_SHOWNA */);
  const r = screenRect(hwnd);
  if (r.l !== target.x || r.t !== target.y || r.r !== target.x + target.w || r.b !== target.y + target.h) {
    moveToPhysRect(hwnd, target);
  }
  if (st.above) {
    SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
}

function isAttached(hwnd) {
  return attached.has(hwnd);
}

function isParentAlive(hwnd) {
  const st = attached.get(hwnd);
  if (!st) return false;
  // デスクトップ層の窓は親を持たない。Progman が生きていれば健全とみなす
  if (st.desktopLayer) return !!num(FindWindowW('Progman', null));
  return !!(st.parent && IsWindow(st.parent));
}

function isWindowAlive(hwnd) {
  return !!IsWindow(hwnd);
}

// 角丸ウィンドウリージョン (子ウィンドウは DWM の角丸が効かないため GDI で切り抜く)
function setRoundRegion(hwnd, w, h, radius) {
  try {
    const rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, radius, radius);
    SetWindowRgn(hwnd, rgn, true); // リージョンの所有権は OS に移る
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------- デスクトップアイコンの表示切替
// アイコンを描いているのは SHELLDLL_DefView。これを隠すとアイコンだけ消える
// (壁紙とウィジェットはそのまま)。エクスプローラ再起動で必ず元に戻る。
function findDefView() {
  const progman = num(FindWindowW('Progman', null));
  let def = progman ? num(FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) : 0;
  if (def) return def;
  // Win10 型は WorkerW 配下にぶら下がっていることがある
  const cb = koffi.register((hwnd, _l) => {
    const d = num(FindWindowExW(num(hwnd), 0, 'SHELLDLL_DefView', null));
    if (d) { def = d; return false; }
    return true;
  }, koffi.pointer(EnumWindowsProc));
  try {
    EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return def;
}

function setDesktopIconsVisible(visible) {
  const def = findDefView();
  if (!def) return false;
  ShowWindow(def, visible ? 5 /* SW_SHOW */ : 0 /* SW_HIDE */);
  return true;
}

function areDesktopIconsVisible() {
  const def = findDefView();
  return def ? !!IsWindowVisible(def) : true;
}

// 現在の Windows 壁紙のファイルパス (透過モード用)
function getSystemWallpaperPath() {
  try {
    const SPI_GETDESKWALLPAPER = 0x0073;
    const buf = Buffer.alloc(2 * 512);
    SystemParametersInfoW(SPI_GETDESKWALLPAPER, 511, buf, 0);
    const p = buf.toString('utf16le').replace(/\0.*$/, '');
    if (p) return p;
  } catch (_) {}
  // スライドショー等でパスが取れない場合のフォールバック
  const path = require('path');
  const fs = require('fs');
  const t = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
  return fs.existsSync(t) ? t : '';
}

// 現在の壁紙を再適用してデスクトップを再描画させる
function refreshDesktop() {
  try {
    const SPI_GETDESKWALLPAPER = 0x0073;
    const SPI_SETDESKWALLPAPER = 0x0014;
    const buf = Buffer.alloc(2 * 512);
    SystemParametersInfoW(SPI_GETDESKWALLPAPER, 511, buf, 0);
    SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, buf, 0x01);
    const progman = num(FindWindowW('Progman', null));
    if (progman) InvalidateRect(progman, null, true);
  } catch (_) { /* best-effort */ }
}

// 現在の物理スクリーン矩形
function getRect(hwnd) {
  const r = screenRect(hwnd);
  return { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t };
}

module.exports = {
  findTarget, attachAt, placeOnDesktopLayer, lowerToDesktopLayer, detach, ensurePlacement, getRect,
  isAttached, isParentAlive, isWindowAlive,
  setRoundRegion, getSystemWallpaperPath, refreshDesktop,
  setDesktopIconsVisible, areDesktopIconsVisible,
};
