// デスクトップアイコンの配置を読む / 復元する。
//
// 安全第一の設計:
//   - list() は読むだけ。1 バイトも書かない。
//   - apply() だけが書き込み。呼び出し側 (main) が復元ボタン等で明示的に呼んだときのみ。
//   - 照合は「名前」で行う。名前が一致しないアイコンには一切触れない
//     (推測して動かすくらいなら放置する)。
//   - どこかで失敗しても投げず、部分的な結果を返して静かに諦める。
//
// SysListView32 の位置は POINT を explorer のアドレス空間で受け取る必要があるため
// VirtualAllocEx + ReadProcessMemory を使う。書き込み (LVM_SETITEMPOSITION) は
// 座標を lParam に直接詰めるので遠隔メモリは不要。
'use strict';

const koffi = require('koffi');
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'uint64', ['str16', 'str16']);
const FindWindowExW = user32.func('__stdcall', 'FindWindowExW', 'uint64', ['uint64', 'uint64', 'str16', 'str16']);
const SendMessageW = user32.func('__stdcall', 'SendMessageW', 'int64', ['uint64', 'uint32', 'uint64', 'int64']);
const IsWindow = user32.func('__stdcall', 'IsWindow', 'bool', ['uint64']);
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uint64', 'void *']);

const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'uint64', ['uint32', 'bool', 'uint32']);
const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'bool', ['uint64']);
const VirtualAllocEx = kernel32.func('__stdcall', 'VirtualAllocEx', 'uint64', ['uint64', 'uint64', 'uint64', 'uint32', 'uint32']);
const VirtualFreeEx = kernel32.func('__stdcall', 'VirtualFreeEx', 'bool', ['uint64', 'uint64', 'uint64', 'uint32']);
const ReadProcessMemory = kernel32.func('__stdcall', 'ReadProcessMemory', 'bool', ['uint64', 'uint64', 'void *', 'uint64', 'void *']);
const WriteProcessMemory = kernel32.func('__stdcall', 'WriteProcessMemory', 'bool', ['uint64', 'uint64', 'void *', 'uint64', 'void *']);

const LVM_FIRST = 0x1000;
const LVM_GETITEMCOUNT = LVM_FIRST + 4;
const LVM_GETITEMPOSITION = LVM_FIRST + 16;
const LVM_SETITEMPOSITION = LVM_FIRST + 15;
const LVM_GETITEMTEXTW = LVM_FIRST + 115;
const PROCESS_VM = 0x0008 | 0x0010 | 0x0020;  // OPERATION | READ | WRITE
const MEM = 0x1000 | 0x2000, RELEASE = 0x8000, PAGE_RW = 0x04;
const pack = (x, y) => ((y & 0xFFFF) << 16) | (x & 0xFFFF);

// SHELLDLL_DefView 直下の SysListView32 を探す (attach と同じ理屈)
function findListView() {
  const progman = num(FindWindowW('Progman', null));
  let def = progman ? num(FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) : 0;
  if (!def) {
    let w = 0;
    for (let guard = 0; guard < 64 && (w = num(FindWindowExW(0, w, 'WorkerW', null))); guard++) {
      const d = num(FindWindowExW(w, 0, 'SHELLDLL_DefView', null));
      if (d) { def = d; break; }
    }
  }
  return def ? num(FindWindowExW(def, 0, 'SysListView32', null)) : 0;
}

// explorer を開いて遠隔バッファを確保。使い終わったら session.close() を必ず呼ぶ
function openSession() {
  const lv = findListView();
  if (!lv || !IsWindow(lv)) return null;
  const count = num(SendMessageW(lv, LVM_GETITEMCOUNT, 0, 0));
  if (count <= 0 || count > 100000) return null;

  const pidBuf = Buffer.alloc(4);
  GetWindowThreadProcessId(lv, pidBuf);
  const pid = pidBuf.readUInt32LE(0);
  if (!pid) return null;

  const h = num(OpenProcess(PROCESS_VM, false, pid));
  if (!h) return null;

  // POINT(8) + テキスト(520) + LVITEMW(88)
  const remote = num(VirtualAllocEx(h, 0, 1024, MEM, PAGE_RW));
  if (!remote) { CloseHandle(h); return null; }

  return {
    lv, h, count,
    pPoint: remote,
    pText: remote + 16,
    pItem: remote + 16 + 520,
    close() {
      try { VirtualFreeEx(h, remote, 0, RELEASE); } catch (_) {}
      try { CloseHandle(h); } catch (_) {}
    },
  };
}

function readPos(s, i) {
  if (!num(SendMessageW(s.lv, LVM_GETITEMPOSITION, i, s.pPoint))) return null;
  const buf = Buffer.alloc(8), rd = Buffer.alloc(8);
  if (!ReadProcessMemory(s.h, s.pPoint, buf, 8, rd)) return null;
  return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
}

function readName(s, i) {
  const item = Buffer.alloc(88);
  item.writeInt32LE(0, 8);                          // iSubItem = 0
  item.writeBigUInt64LE(BigInt(s.pText), 24);       // pszText -> remote text buf
  item.writeInt32LE(260, 32);                       // cchTextMax
  const wr = Buffer.alloc(8);
  if (!WriteProcessMemory(s.h, s.pItem, item, 88, wr)) return '';
  const len = num(SendMessageW(s.lv, LVM_GETITEMTEXTW, i, s.pItem));
  const tb = Buffer.alloc(520), rd = Buffer.alloc(8);
  if (!ReadProcessMemory(s.h, s.pText, tb, 520, rd)) return '';
  return tb.toString('utf16le', 0, Math.max(0, Math.min(520, len * 2)));
}

// 全アイコンの {name, x, y} を返す (読むだけ)。取れなければ null
function list() {
  const s = openSession();
  if (!s) return null;
  const out = [];
  try {
    for (let i = 0; i < s.count; i++) {
      const pos = readPos(s, i);
      const name = readName(s, i);
      if (name && pos) out.push({ name, x: pos.x, y: pos.y });
    }
  } catch (_) {
    return null;
  } finally {
    s.close();
  }
  return out;
}

// 保存済みの配置 (list()の戻り値と同じ形) を名前で照合して書き戻す。
// 戻り値 {moved, skipped, total}。名前が一致しないアイコンは触らない。
function apply(saved) {
  if (!Array.isArray(saved) || !saved.length) return { moved: 0, skipped: 0, total: 0 };
  const s = openSession();
  if (!s) return null;

  // 現在の名前 -> index を作る (同名は最初の1つ)
  const nameToIndex = new Map();
  try {
    for (let i = 0; i < s.count; i++) {
      const name = readName(s, i);
      if (name && !nameToIndex.has(name)) nameToIndex.set(name, i);
    }
    let moved = 0, skipped = 0;
    for (const it of saved) {
      const i = nameToIndex.get(it.name);
      if (i == null) { skipped++; continue; }
      const x = it.x | 0, y = it.y | 0;
      num(SendMessageW(s.lv, LVM_SETITEMPOSITION, i, pack(x, y)));
      moved++;
    }
    return { moved, skipped, total: saved.length };
  } catch (_) {
    return null;
  } finally {
    s.close();
  }
}

function available() {
  const lv = findListView();
  return !!(lv && IsWindow(lv));
}

module.exports = { list, apply, available };
