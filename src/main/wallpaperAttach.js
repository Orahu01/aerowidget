// デスクトップアイコンの背面 (WorkerW / Progman) に Electron ウィンドウを差し込むモジュール。
// Wallpaper Engine / Lively と同じ手法。Win10 と Win11 24H2 以降の両方のレイアウトに対応する。
'use strict';

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

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

const EnumWindowsProc = koffi.proto('__stdcall', 'EnumWindowsProc', 'bool', ['uint64', 'int64']);
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'int64']);

const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', koffi.out('void *')]);

const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXSCREEN = 0;
const SM_CYSCREEN = 1;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;

const state = {
  attached: false,
  parent: 0,        // 差し込み先 (WorkerW もしくは Progman)
  mode: 'none',     // 'workerw-sibling' | 'workerw-child' | 'progman'
  savedStyle: null, // detach 時に戻す元の GWL_STYLE
};

function num(v) { return typeof v === 'bigint' ? Number(v) : v; }

// Progman に 0x052C を送って WorkerW を生成させ、差し込み先ウィンドウを探す
function findTarget() {
  const progman = num(FindWindowW('Progman', null));
  if (!progman) return null;

  // WorkerW を生成させるおまじない (Wallpaper Engine と同じ)
  SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, 0x0, 1000, null);

  // --- Win10 型レイアウト: SHELLDLL_DefView を持つ WorkerW の「次の兄弟」の WorkerW ---
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
  if (sibling) return { parent: sibling, mode: 'workerw-sibling' };

  // --- Win11 24H2 型レイアウト: SHELLDLL_DefView が Progman 直下、WorkerW も Progman の子 ---
  const defView = num(FindWindowExW(progman, 0, 'SHELLDLL_DefView', null));
  const childWorker = num(FindWindowExW(progman, 0, 'WorkerW', null));
  if (childWorker) return { parent: childWorker, mode: 'workerw-child', defView };
  if (defView) return { parent: progman, mode: 'progman', defView };

  return { parent: progman, mode: 'progman', defView: 0 };
}

// プライマリモニタの物理ピクセル領域を、親ウィンドウ(仮想スクリーン原点)基準の座標で返す
function primaryRectInParent() {
  const vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  return {
    x: -vx,
    y: -vy,
    w: GetSystemMetrics(SM_CXSCREEN),
    h: GetSystemMetrics(SM_CYSCREEN),
  };
}

function screenRect(hwnd) {
  const b = Buffer.alloc(16);
  GetWindowRect(hwnd, b);
  return { l: b.readInt32LE(0), t: b.readInt32LE(4), r: b.readInt32LE(8), b: b.readInt32LE(12) };
}

// hwnd (Electron ウィンドウ) をアイコン背面に差し込む
function attach(hwnd) {
  const target = findTarget();
  if (!target || !target.parent) return false;

  // タスクバー/Alt+Tab に出さない
  const ex = num(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);

  // WS_CHILD にしてから差し込む (座標系が親クライアント基準で安定する)
  const st = num(GetWindowLongPtrW(hwnd, GWL_STYLE));
  if (state.savedStyle === null) state.savedStyle = st;
  SetWindowLongPtrW(hwnd, GWL_STYLE, ((st | WS_CHILD) & ~WS_POPUP) >>> 0);

  SetParent(hwnd, target.parent);

  const r = primaryRectInParent();
  MoveWindow(hwnd, r.x, r.y, r.w, r.h, true);

  // Progman 直下に入れた場合はアイコン(SHELLDLL_DefView)のすぐ下に配置する
  if (target.mode === 'progman' && target.defView) {
    const SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1, SWP_NOACTIVATE = 0x10;
    SetWindowPos(hwnd, target.defView, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }

  state.attached = true;
  state.parent = target.parent;
  state.mode = target.mode;
  return true;
}

// 通常のトップレベルウィンドウに戻す (レイアウト編集用 / 終了時)
function detach(hwnd) {
  if (!state.attached) return;
  SetParent(hwnd, 0);
  if (state.savedStyle !== null) {
    SetWindowLongPtrW(hwnd, GWL_STYLE, state.savedStyle);
    state.savedStyle = null;
  }
  state.attached = false;
  state.parent = 0;
  state.mode = 'none';
  refreshDesktop();
}

// アタッチ中にモニタ構成が変わった場合のリサイズ
function resize(hwnd) {
  if (!state.attached) return;
  const r = primaryRectInParent();
  MoveWindow(hwnd, r.x, r.y, r.w, r.h, true);
}

// Electron 側の勝手な再配置を検知して正しい位置に戻す。
// 期待: プライマリモニタ全面 (スクリーン座標 0,0 - cx,cy)
function ensurePlacement(hwnd) {
  if (!state.attached) return;
  const cx = GetSystemMetrics(SM_CXSCREEN);
  const cy = GetSystemMetrics(SM_CYSCREEN);
  const r = screenRect(hwnd);
  if (r.l !== 0 || r.t !== 0 || r.r !== cx || r.b !== cy) {
    const p = primaryRectInParent();
    MoveWindow(hwnd, p.x, p.y, p.w, p.h, true);
  }
}

// explorer.exe が再起動されると親ウィンドウが消えるので、生存確認に使う
function isParentAlive() {
  return state.attached && !!IsWindow(state.parent);
}

function isWindowAlive(hwnd) {
  return !!IsWindow(hwnd);
}

// 現在の壁紙を再適用してデスクトップを再描画させる
function refreshDesktop() {
  try {
    const SPI_GETDESKWALLPAPER = 0x0073;
    const SPI_SETDESKWALLPAPER = 0x0014;
    const buf = Buffer.alloc(2 * 512);
    SystemParametersInfoW(SPI_GETDESKWALLPAPER, 511, buf, 0);
    SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, buf, 0x01); // SPIF_UPDATEINIFILE のみ (レジストリ書換なし相当)
    const progman = num(FindWindowW('Progman', null));
    if (progman) InvalidateRect(progman, null, true);
  } catch (_) { /* 再描画は best-effort */ }
}

module.exports = { attach, detach, resize, ensurePlacement, isParentAlive, isWindowAlive, refreshDesktop, findTarget, state };
