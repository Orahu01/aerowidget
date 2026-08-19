// 診断: 指定座標でクリックがどのウィンドウに届くか (WindowFromPoint) を調べる
'use strict';

const koffi = require('koffi');
const user32 = koffi.load('user32.dll');

try {
  const SetProcessDpiAwarenessContext = user32.func('__stdcall', 'SetProcessDpiAwarenessContext', 'bool', ['int64']);
  SetProcessDpiAwarenessContext(-4);
} catch (_) {}

const WindowFromPoint = user32.func('__stdcall', 'WindowFromPoint', 'uint64', ['int64']);
const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int', ['uint64', 'void *', 'int']);
const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', ['uint64', 'void *', 'int']);
const GetWindowLongPtrW = user32.func('__stdcall', 'GetWindowLongPtrW', 'int64', ['uint64', 'int']);
const GetAncestor = user32.func('__stdcall', 'GetAncestor', 'uint64', ['uint64', 'uint32']);

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

function str(fn, h) {
  const b = Buffer.alloc(512);
  fn(h, b, 255);
  return b.toString('utf16le').replace(/\0.*$/, '');
}

// POINT は 64bit に詰めて値渡し (x = 下位32bit, y = 上位32bit)
function pack(x, y) {
  return (BigInt(y >>> 0) << 32n) | BigInt(x >>> 0);
}

const WS_EX_NOACTIVATE = 0x08000000;
const WS_EX_TRANSPARENT = 0x00000020;
const WS_EX_LAYERED = 0x00080000;

const GetParent = user32.func('__stdcall', 'GetParent', 'uint64', ['uint64']);

function describe(h) {
  const ex = num(GetWindowLongPtrW(h, -20)) >>> 0;
  const flags = [
    ex & WS_EX_NOACTIVATE ? 'NOACTIVATE' : '',
    ex & WS_EX_TRANSPARENT ? 'TRANSPARENT' : '',
    ex & WS_EX_LAYERED ? 'LAYERED' : '',
  ].filter(Boolean).join(',') || '-';
  return `hwnd=${h} class=${str(GetClassNameW, h)} title="${str(GetWindowTextW, h)}" ex=0x${ex.toString(16)} [${flags}]`;
}

for (const arg of process.argv.slice(2)) {
  const [x, y] = arg.split(',').map(Number);
  let h = num(WindowFromPoint(pack(x, y)));
  console.log(`(${x},${y}):`);
  for (let i = 0; i < 6 && h; i++) {
    console.log(`   ${i === 0 ? 'hit ' : 'up  '} ${describe(h)}`);
    h = num(GetParent(h));
  }
}
