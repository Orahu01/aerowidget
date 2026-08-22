// フルスクリーンアプリの検知 (省電力):
// ゲームなどがモニタを完全に覆っている間、そのモニタの壁紙レンダリングを一時停止する。
// ポーリングではなく WinEvent フック (フォアグラウンド変化・移動終了) で駆動し、
// 取りこぼし対策として 5 秒間隔のハートビートで補完する。
//
// 同じフックで前面アプリの exe 名も分かるので、シーン機能のために
// 'foreground' イベントとして併せて出す (フックを二重に張らないため)。
'use strict';

const koffi = require('koffi');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uint64', []);
const GetWindowRect2 = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', 'void *']);
const GetClassNameW2 = user32.func('__stdcall', 'GetClassNameW', 'int', ['uint64', 'void *', 'int']);
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uint64', 'void *']);

const WinEventProc = koffi.proto('__stdcall', 'WinEventProc', 'void', ['uint64', 'uint32', 'uint64', 'int32', 'int32', 'uint32', 'uint32']);
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uint64', ['uint32', 'uint32', 'uint64', koffi.pointer(WinEventProc), 'uint32', 'uint32', 'uint32']);
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'bool', ['uint64']);

// PID から実行ファイルのパスを引く (PROCESS_QUERY_LIMITED_INFORMATION = 0x1000)
const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'uint64', ['uint32', 'bool', 'uint32']);
const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'bool', ['uint64']);
const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'bool', ['uint64', 'uint32', 'void *', 'void *']);

const EVENT_SYSTEM_FOREGROUND = 0x0003;
const EVENT_SYSTEM_MOVESIZEEND = 0x000B;
const WINEVENT_OUTOFCONTEXT = 0x0000;

const emitter = new EventEmitter();
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

let hook = 0;
let hookCb = null;
let getMonitorsFn = null;
let debounceTimer = null;
let lastState = new Map(); // monitorIndex -> paused
let lastForeground = null; // 直近の前面 exe 名

const IGNORE_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

function className(hwnd) {
  const buf = Buffer.alloc(512);
  GetClassNameW2(hwnd, buf, 255);
  return buf.toString('utf16le').replace(/\0.*$/, '');
}

// PID → "photoshop.exe" (小文字)。取れなければ ''
function exeForPid(pid) {
  if (!pid) return '';
  const h = num(OpenProcess(0x1000, false, pid));
  if (!h) return '';
  try {
    const buf = Buffer.alloc(1024 * 2);
    const size = Buffer.alloc(4); size.writeUInt32LE(1024, 0);
    if (!QueryFullProcessImageNameW(h, 0, buf, size)) return '';
    const full = buf.toString('utf16le').replace(/\0.*$/, '');
    const base = full.split(/[\\/]/).pop() || '';
    return base.toLowerCase();
  } catch (_) {
    return '';
  } finally {
    CloseHandle(h);
  }
}

function windowPid(hwnd) {
  const buf = Buffer.alloc(4);
  GetWindowThreadProcessId(hwnd, buf);
  return buf.readUInt32LE(0);
}

function check() {
  if (!getMonitorsFn) return;
  const monitors = getMonitorsFn();
  const covered = new Map();
  for (const m of monitors) covered.set(m.index, false);

  const fg = num(GetForegroundWindow());
  let fgExe = '';
  if (fg) {
    const pid = windowPid(fg);
    const cls = className(fg);
    if (pid && pid !== process.pid && !IGNORE_CLASSES.has(cls)) {
      fgExe = exeForPid(pid);
    }
    if (pid !== process.pid && !IGNORE_CLASSES.has(cls)) {
      const b = Buffer.alloc(16);
      GetWindowRect2(fg, b);
      const r = { l: b.readInt32LE(0), t: b.readInt32LE(4), r: b.readInt32LE(8), b: b.readInt32LE(12) };
      for (const m of monitors) {
        const n = m.native;
        // ウィンドウがモニタ全体を覆っている = フルスクリーン
        if (r.l <= n.x && r.t <= n.y && r.r >= n.x + n.w && r.b >= n.y + n.h) {
          covered.set(m.index, true);
        }
      }
    }
  }

  for (const [index, paused] of covered) {
    if (lastState.get(index) !== paused) {
      lastState.set(index, paused);
      emitter.emit('change', index, paused);
    }
  }

  // 前面アプリが変わったらシーン用に知らせる (デスクトップ/自分自身は空文字)
  if (fgExe !== lastForeground) {
    lastForeground = fgExe;
    if (process.env.WW_DEBUG) console.log('[fg] ' + (fgExe || '(desktop)'));
    emitter.emit('foreground', fgExe);
  }
}

function onWinEvent(_hook, event) {
  if (event !== EVENT_SYSTEM_FOREGROUND && event !== EVENT_SYSTEM_MOVESIZEEND) return;
  // 連続イベントをまとめて 250ms 後に 1 回だけ判定
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => check(), 250);
}

function start(getMonitors, intervalMs = 5000) {
  getMonitorsFn = getMonitors;
  if (!hook) {
    hookCb = koffi.register(onWinEvent, koffi.pointer(WinEventProc));
    hook = num(SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MOVESIZEEND, 0, hookCb, 0, 0, WINEVENT_OUTOFCONTEXT));
  }
  // フックの取りこぼし (F11 のボーダーレス化など) を 5 秒毎に補完
  heartbeat.register('fullscreen', intervalMs, check, true);
}

function stop() {
  heartbeat.unregister('fullscreen');
  clearTimeout(debounceTimer);
  if (hook) {
    try { UnhookWinEvent(hook); } catch (_) {}
    hook = 0;
  }
  if (hookCb) {
    try { koffi.unregister(hookCb); } catch (_) {}
    hookCb = null;
  }
  getMonitorsFn = null;
  for (const [index, paused] of lastState) {
    if (paused) emitter.emit('change', index, false);
  }
  lastState = new Map();
}

// いまの前面アプリを単発で引く (シーン設定の「このアプリを追加」用)
function currentForegroundExe() {
  const fg = num(GetForegroundWindow());
  if (!fg) return '';
  const cls = className(fg);
  if (IGNORE_CLASSES.has(cls)) return '';
  const pid = windowPid(fg);
  if (!pid || pid === process.pid) return '';
  return exeForPid(pid);
}

module.exports = { start, stop, currentForegroundExe, on: (...a) => emitter.on(...a) };
