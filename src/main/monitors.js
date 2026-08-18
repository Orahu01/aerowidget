// 物理モニタの列挙 (EnumDisplayMonitors) と Electron ディスプレイとの対応付け。
// 壁紙ウィンドウは WorkerW の子として「物理ピクセル座標」で配置する必要があるため、
// DPI スケールの影響を受けない物理矩形をネイティブ API から直接取得する。
'use strict';

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const MonitorEnumProc = koffi.proto('__stdcall', 'MonitorEnumProc', 'bool', ['uint64', 'uint64', 'void *', 'int64']);
const EnumDisplayMonitors = user32.func('__stdcall', 'EnumDisplayMonitors', 'bool', ['uint64', 'void *', koffi.pointer(MonitorEnumProc), 'int64']);
const GetMonitorInfoW = user32.func('__stdcall', 'GetMonitorInfoW', 'bool', ['uint64', 'void *']);

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

// 物理モニタ一覧 [{x,y,w,h,primary}] (物理ピクセル)
function listPhysical() {
  const handles = [];
  const cb = koffi.register((hmon) => { handles.push(num(hmon)); return true; }, koffi.pointer(MonitorEnumProc));
  try {
    EnumDisplayMonitors(0, null, cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  const mons = [];
  for (const h of handles) {
    // MONITORINFO: cbSize(4) rcMonitor(16) rcWork(16) dwFlags(4)
    const buf = Buffer.alloc(40);
    buf.writeUInt32LE(40, 0);
    if (!GetMonitorInfoW(h, buf)) continue;
    const l = buf.readInt32LE(4), t = buf.readInt32LE(8), r = buf.readInt32LE(12), b = buf.readInt32LE(16);
    mons.push({ x: l, y: t, w: r - l, h: b - t, primary: (buf.readUInt32LE(36) & 1) === 1 });
  }
  return mons;
}

// Electron の displays と物理モニタを対応付ける。
// index 0 = プライマリ、それ以外は (x, y) 順。DIP と物理でスケールが違っても
// 相対的な並び順は保たれるため、双方を同じ規則でソートして突き合わせる。
function pair(screen) {
  const native = listPhysical();
  const prim = screen.getPrimaryDisplay();
  const rest = screen.getAllDisplays()
    .filter(d => d.id !== prim.id)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const nPrim = native.find(m => m.primary) || native[0] || { x: 0, y: 0, w: 1920, h: 1080, primary: true };
  const nRest = native.filter(m => m !== nPrim).sort((a, b) => a.x - b.x || a.y - b.y);

  const out = [{ index: 0, display: prim, native: nPrim }];
  rest.forEach((d, i) => {
    out.push({ index: i + 1, display: d, native: nRest[i] || nPrim });
  });
  return out;
}

// 設定画面用の一覧
function describe(screen) {
  return pair(screen).map(p => ({
    index: p.index,
    label: `モニタ${p.index + 1} (${p.native.w}×${p.native.h}${p.index === 0 ? '・メイン' : ''})`,
    primary: p.index === 0,
  }));
}

module.exports = { listPhysical, pair, describe };
