// 開発用 UI テスト: 指定ウィンドウにホバー/クリックして PrintWindow でキャプチャする。
// node.exe を Per-Monitor V2 にしてから操作するので、混在 DPI 環境でも実座標で扱える。
//   node scripts/uitest.js <hwnd> <relX%> <relY%> [hover|click] [outName]
'use strict';

const koffi = require('koffi');
const fs = require('fs');
const path = require('path');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');

try {
  const SetProcessDpiAwarenessContext = user32.func('__stdcall', 'SetProcessDpiAwarenessContext', 'bool', ['int64']);
  SetProcessDpiAwarenessContext(-4);
} catch (_) {}

const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'bool', ['uint64', koffi.out('void *')]);
const SetCursorPos = user32.func('__stdcall', 'SetCursorPos', 'bool', ['int', 'int']);
const GetCursorPos = user32.func('__stdcall', 'GetCursorPos', 'bool', [koffi.out('void *')]);
const mouse_event = user32.func('__stdcall', 'mouse_event', 'void', ['uint32', 'uint32', 'uint32', 'uint32', 'uint64']);
const PrintWindow = user32.func('__stdcall', 'PrintWindow', 'bool', ['uint64', 'uint64', 'uint32']);
const GetWindowDC = user32.func('__stdcall', 'GetWindowDC', 'uint64', ['uint64']);
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'bool', ['uint64', 'uint64']);
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uint64', ['uint64']);
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uint64', ['uint64', 'int', 'int']);
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uint64', ['uint64', 'uint64']);
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'bool', ['uint64']);
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'bool', ['uint64']);
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uint64', 'uint64', 'uint32', 'uint32', 'void *', 'void *', 'uint32']);
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uint64', []);
const GetWindowTextW2 = user32.func('__stdcall', 'GetWindowTextW', 'int', ['uint64', 'void *', 'int']);

function fgTitle() {
  const h = num(GetForegroundWindow());
  const b = Buffer.alloc(512);
  GetWindowTextW2(h, b, 255);
  return `${h} "${b.toString('utf16le').replace(/\0.*$/, '')}"`;
}

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rect(hwnd) {
  const b = Buffer.alloc(16);
  GetWindowRect(hwnd, b);
  return { x: b.readInt32LE(0), y: b.readInt32LE(4), w: b.readInt32LE(8) - b.readInt32LE(0), h: b.readInt32LE(12) - b.readInt32LE(4) };
}

function cursor() {
  const b = Buffer.alloc(8);
  GetCursorPos(b);
  return { x: b.readInt32LE(0), y: b.readInt32LE(4) };
}

// PrintWindow(PW_RENDERFULLCONTENT) の結果を BMP で書き出す
function capture(hwnd, out) {
  const r = rect(hwnd);
  const wdc = CreateCompatibleDC(0);
  const screenDc = GetWindowDC(hwnd);
  const bmp = CreateCompatibleBitmap(screenDc, r.w, r.h);
  const old = SelectObject(wdc, bmp);
  PrintWindow(hwnd, wdc, 2);
  SelectObject(wdc, old);

  const bi = Buffer.alloc(40);
  bi.writeUInt32LE(40, 0);
  bi.writeInt32LE(r.w, 4);
  bi.writeInt32LE(-r.h, 8); // top-down
  bi.writeUInt16LE(1, 12);
  bi.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(r.w * r.h * 4);
  GetDIBits(wdc, bmp, 0, r.h, pixels, bi, 0);

  const fileHeader = Buffer.alloc(14);
  fileHeader.write('BM', 0, 'ascii');
  fileHeader.writeUInt32LE(14 + 40 + pixels.length, 2);
  fileHeader.writeUInt32LE(14 + 40, 10);
  const infoOut = Buffer.from(bi);
  infoOut.writeInt32LE(r.h, 8); // BMP は bottom-up 前提なので正の高さで書く
  // top-down で取得したので行を反転して書き出す
  const flipped = Buffer.alloc(pixels.length);
  const stride = r.w * 4;
  for (let y = 0; y < r.h; y++) pixels.copy(flipped, (r.h - 1 - y) * stride, y * stride, (y + 1) * stride);

  fs.writeFileSync(out, Buffer.concat([fileHeader, infoOut, flipped]));
  DeleteObject(bmp);
  DeleteDC(wdc);
  ReleaseDC(hwnd, screenDc);
  return r;
}

// KEYEVENTF_UNICODE で任意の文字列を入力する (INPUT 構造体は x64 で 40 バイト)
const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', 'void *', 'int']);
function typeText(text) {
  const chars = [...text];
  const buf = Buffer.alloc(40 * chars.length * 2);
  let off = 0;
  for (const ch of chars) {
    for (const up of [false, true]) {
      buf.writeUInt32LE(1, off);                    // type = INPUT_KEYBOARD
      buf.writeUInt16LE(0, off + 8);                // wVk = 0
      buf.writeUInt16LE(ch.charCodeAt(0), off + 10); // wScan = unicode
      buf.writeUInt32LE(0x0004 | (up ? 0x0002 : 0), off + 12); // UNICODE | KEYUP
      off += 40;
    }
  }
  SendInput(chars.length * 2, buf, 40);
}

(async () => {
  const [hwndArg, rx, ry, mode = 'hover', name = 'uitest', text = ''] = process.argv.slice(2);
  const hwnd = Number(hwndArg);
  const r = rect(hwnd);
  const x = r.x + Math.round(r.w * Number(rx) / 100);
  const y = r.y + Math.round(r.h * Number(ry) / 100);
  console.log(`window rect: ${r.x},${r.y} ${r.w}x${r.h} -> target ${x},${y} (${mode})`);

  const orig = cursor();
  SetCursorPos(x, y);
  await sleep(400);
  if (mode === 'click' || mode === 'type') {
    mouse_event(0x0002, 0, 0, 0, 0); // LEFTDOWN
    await sleep(70);
    mouse_event(0x0004, 0, 0, 0, 0); // LEFTUP
    await sleep(600);
    console.log('foreground after click:', fgTitle());
    if (mode === 'type') {
      typeText(text);
      await sleep(1200);
    } else {
      await sleep(1000);
    }
  } else {
    await sleep(700);
  }
  const dir = process.env.WW_SHOT_DIR || '.';
  const out = path.join(dir, name + '.bmp');
  capture(hwnd, out);
  if (mode !== 'hold') SetCursorPos(orig.x, orig.y);
  console.log('saved', out);
})();
