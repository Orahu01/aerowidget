// フルスクリーンアプリの検知 (省電力):
// ゲームなどがモニタを完全に覆っている間、そのモニタの壁紙レンダリングを一時停止する。
// ポーリングではなく WinEvent フック (フォアグラウンド変化・移動終了) で駆動し、
// 取りこぼし対策として 5 秒間隔のハートビートで補完する。
'use strict';

const koffi = require('koffi');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const user32 = koffi.load('user32.dll');

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uint64', []);
const GetWindowRect2 = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', 'void *']);
const GetClassNameW2 = user32.func('__stdcall', 'GetClassNameW', 'int', ['uint64', 'void *', 'int']);
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uint64', 'void *']);

const WinEventProc = koffi.proto('__stdcall', 'WinEventProc', 'void', ['uint64', 'uint32', 'uint64', 'int32', 'int32', 'uint32', 'uint32']);
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uint64', ['uint32', 'uint32', 'uint64', koffi.pointer(WinEventProc), 'uint32', 'uint32', 'uint32']);
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'bool', ['uint64']);

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

const IGNORE_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

function className(hwnd) {
  const buf = Buffer.alloc(512);
  GetClassNameW2(hwnd, buf, 255);
  return buf.toString('utf16le').replace(/\0.*$/, '');
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
  if (fg) {
    const pid = windowPid(fg);
    const cls = className(fg);
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
}

function onWinEvent(_hook, event) {
  if (event !== EVENT_SYSTEM_FOREGROUND && event !== EVENT_SYSTEM_MOVESIZEEND) return;
  // 連続イベントをまとめて 250ms 後に 1 回だけ判定
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => check(), 250);
}

function start(getMonitors) {
  getMonitorsFn = getMonitors;
  if (!hook) {
    hookCb = koffi.register(onWinEvent, koffi.pointer(WinEventProc));
    hook = num(SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MOVESIZEEND, 0, hookCb, 0, 0, WINEVENT_OUTOFCONTEXT));
  }
  // フックの取りこぼし (F11 のボーダーレス化など) を 5 秒毎に補完
  heartbeat.register('fullscreen', 5000, check, true);
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

module.exports = { start, stop, on: (...a) => emitter.on(...a) };
