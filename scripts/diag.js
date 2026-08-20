// 診断: AeroWidget ウィンドウの現在の親子関係・位置・可視性を出力する
'use strict';

const koffi = require('koffi');
const user32 = koffi.load('user32.dll');

// node.exe は DPI 非対応で座標が仮想化されるため、Per-Monitor V2 を宣言して実座標を得る
try {
  const SetProcessDpiAwarenessContext = user32.func('__stdcall', 'SetProcessDpiAwarenessContext', 'bool', ['int64']);
  SetProcessDpiAwarenessContext(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
} catch (_) {}

const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'uint64', ['str16', 'str16']);
const FindWindowExW = user32.func('__stdcall', 'FindWindowExW', 'uint64', ['uint64', 'uint64', 'str16', 'str16']);
const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int', ['uint64', koffi.out('str16'), 'int']);
const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', ['uint64', koffi.out('str16'), 'int']);
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['uint64']);
const GetParent = user32.func('__stdcall', 'GetParent', 'uint64', ['uint64']);
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', koffi.out('void *')]);
const GetWindowLongPtrW = user32.func('__stdcall', 'GetWindowLongPtrW', 'int64', ['uint64', 'int']);

const EnumWindowsProc = koffi.proto('__stdcall', 'EnumWindowsProc2', 'bool', ['uint64', 'int64']);
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'int64']);
const EnumChildWindows = user32.func('__stdcall', 'EnumChildWindows', 'bool', ['uint64', koffi.pointer(EnumWindowsProc), 'int64']);

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

function cls(h) {
  const buf = ['\0'.repeat(256)];
  const out = Buffer.alloc(512);
  GetClassNameW(h, out, 256);
  return out.toString('utf16le').replace(/\0.*$/, '');
}
function title(h) {
  const out = Buffer.alloc(512);
  GetWindowTextW(h, out, 256);
  return out.toString('utf16le').replace(/\0.*$/, '');
}
function rect(h) {
  const b = Buffer.alloc(16);
  GetWindowRect(h, b);
  return [b.readInt32LE(0), b.readInt32LE(4), b.readInt32LE(8), b.readInt32LE(12)];
}
function info(h, label) {
  console.log(`${label}: hwnd=${h} class=${cls(h)} title="${title(h)}" vis=${IsWindowVisible(h)} rect=${rect(h)} style=0x${(num(GetWindowLongPtrW(h, -16)) >>> 0).toString(16)}`);
}

const progman = num(FindWindowW('Progman', null));
console.log('--- Progman ---');
info(progman, 'Progman');

console.log('--- Progman children ---');
const cb = koffi.register((h, _l) => { info(num(h), '  child'); return true; }, koffi.pointer(EnumWindowsProc));
EnumChildWindows(progman, cb, 0);
koffi.unregister(cb);

console.log('--- top-level WorkerW windows ---');
const cb2 = koffi.register((h, _l) => {
  const c = cls(num(h));
  if (c === 'WorkerW') info(num(h), 'WorkerW');
  return true;
}, koffi.pointer(EnumWindowsProc));
EnumWindows(cb2, 0);
koffi.unregister(cb2);

console.log('--- AeroWidget windows (any depth from desktop) ---');
const cb3 = koffi.register((h, _l) => {
  const t = title(num(h));
  if (t.includes('AeroWidget')) {
    info(num(h), 'WW');
    console.log('   parent:', num(GetParent(num(h))));
  }
  return true;
}, koffi.pointer(EnumWindowsProc));
EnumWindows(cb3, 0);
EnumChildWindows(progman, cb3, 0);
koffi.unregister(cb3);
