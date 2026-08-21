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
//
// 「隠す」は画面外への退避で実現する。Windows にアイコンを個別に隠す API は無いが、
// 複数モニタを並べると仮想画面には必ず「どのモニタにも映らない死角」ができる。
// そこへ動かせば見えなくなる。ファイルもレジストリも触らないので後始末が要らない。
//
// アイコンの自動整列が有効だと座標はグリッドへ吸着するが、吸着先も死角の中に
// 収まるので問題にならない (指定どおりの座標に入るかではなく、着地点が
// 見えるかどうかが問題)。
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

const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int']);
const GetWindowLongPtrW = user32.func('__stdcall', 'GetWindowLongPtrW', 'int64', ['uint64', 'int']);
const MonitorFromPoint = user32.func('__stdcall', 'MonitorFromPoint', 'uint64', ['int64', 'uint32']);

const SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;
const MONITOR_DEFAULTTONULL = 0;
const GWL_STYLE = -16;
const LVS_AUTOARRANGE = 0x0100;

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

// 画面座標 (x, y) がどのモニタにも属さないか
function isOffScreen(sx, sy) {
  const pt = (BigInt(sy & 0xFFFFFFFF) << 32n) | BigInt(sx >>> 0);
  return !num(MonitorFromPoint(pt, MONITOR_DEFAULTTONULL));
}

// いまの仮想画面の原点 (スクリーン座標)。
// listview のアイコン座標はこの点を (0,0) とした相対座標なので、
// モニタ構成が変わると同じ数値でも指す場所が変わる。
// 保存時の原点を控えておき、使うときに差分だけずらす。
function origin() {
  return { x: GetSystemMetrics(SM_XVIRTUALSCREEN), y: GetSystemMetrics(SM_YVIRTUALSCREEN) };
}

// デスクトップの「アイコンの自動整列」がオンか。オンだと explorer が
// 並べ直してしまうので、隠すのも位置の復元も効かない。null = 分からない
function autoArrange() {
  const lv = findListView();
  if (!lv || !IsWindow(lv)) return null;
  try { return !!(num(GetWindowLongPtrW(lv, GWL_STYLE)) & LVS_AUTOARRANGE); }
  catch (_) { return null; }
}

const STEP_X = 130, STEP_Y = 126;   // アイコン間隔よりわずかに広く取る
const cellKey = (x, y) => Math.round(x / STEP_X) + ',' + Math.round(y / STEP_Y);

// 画面に映る空きセルを上から順に集める。taken は cellKey の Set
function freeVisibleCells(limit, taken) {
  const o = origin();
  const vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  const vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  const out = [];
  for (let ly = 0; ly < vh && out.length < limit; ly += STEP_Y) {
    for (let lx = 0; lx < vw && out.length < limit; lx += STEP_X) {
      if (isOffScreen(o.x + lx, o.y + ly)) continue;
      const k = cellKey(lx, ly);
      if (taken && taken.has(k)) continue;
      if (taken) taken.add(k);
      out.push({ x: lx, y: ly });
    }
  }
  return out;
}

// 復元の計画を立てる純粋関数。画面に依存する判定は env で注入する (テスト用)。
//   want        : [{name,x,y}] 保存時の座標 (savedOrigin 基準)
//   hide        : [名前...]
//   savedOrigin : 保存時の仮想画面原点。無ければ「今と同じ」とみなす
//   home        : {名前 -> {x,y,ox,oy}} 最後に見えていた位置 (各自の原点つき)
//   stay        : [{name,x,y}] 動かさない現存アイコン (セルの重なり回避用)
//   env         : { origin:{x,y}, isOff(sx,sy), slots(n), freeCells(n, taken) }
// 戻り値 { moves:[{name,x,y}], parked:[{name,x,y}], rescued, celled }
function planMoves(want, hide, savedOrigin, home, stay, env) {
  const cur = env.origin;
  const dx = (savedOrigin && Number.isFinite(savedOrigin.x) ? savedOrigin.x : cur.x) - cur.x;
  const dy = (savedOrigin && Number.isFinite(savedOrigin.y) ? savedOrigin.y : cur.y) - cur.y;

  // home は記録ごとに原点を持つので、それぞれ今の原点へずらす
  const homeAt = (name) => {
    const h = home && home[name];
    if (!h) return null;
    const hx = (h.x | 0) + ((Number.isFinite(h.ox) ? h.ox : cur.x) - cur.x);
    const hy = (h.y | 0) + ((Number.isFinite(h.oy) ? h.oy : cur.y) - cur.y);
    return env.isOff(cur.x + hx, cur.y + hy) ? null : { x: hx, y: hy };
  };

  const hideSet = new Set(hide);
  const taken = new Set();
  for (const it of (stay || [])) taken.add(cellKey(it.x, it.y));

  const moves = [];
  const lost = [];
  let rescued = 0;
  for (const it of want) {
    if (hideSet.has(it.name)) continue;        // 隠す指定が優先
    const t = { x: (it.x | 0) + dx, y: (it.y | 0) + dy };
    if (!env.isOff(cur.x + t.x, cur.y + t.y)) {
      moves.push({ name: it.name, x: t.x, y: t.y });
      taken.add(cellKey(t.x, t.y));
      continue;
    }
    // 保存座標が今の画面に無い -> 控えてある元位置 -> それも無ければ空きセル
    const h = homeAt(it.name);
    if (h) { moves.push({ name: it.name, x: h.x, y: h.y }); taken.add(cellKey(h.x, h.y)); rescued++; }
    else lost.push(it.name);
  }
  const cells = env.freeCells(lost.length, taken);
  let celled = 0;
  lost.forEach((name, i) => {
    const c = cells[i];
    if (c) { moves.push({ name, x: c.x, y: c.y }); celled++; }
  });

  const parked = [];
  const slots = env.slots(hideSet.size);
  let si = 0;
  for (const name of hide) {
    const slot = slots[si];
    if (!slot) break;                          // 死角が尽きた
    parked.push({ name, x: slot.x, y: slot.y });
    si++;
  }
  return { moves, parked, rescued, celled };
}

// 保存済みの並びを、保存時の原点から今の原点へ引き直す。
// 死角にいた分は home に控えた元位置へ直す。戻り値の座標は今の原点基準
function unparkRows(rows, savedOrigin, home) {
  const cur = origin();
  const dx = (savedOrigin && Number.isFinite(savedOrigin.x) ? savedOrigin.x : cur.x) - cur.x;
  const dy = (savedOrigin && Number.isFinite(savedOrigin.y) ? savedOrigin.y : cur.y) - cur.y;
  let repaired = 0;
  const out = (rows || []).map(it => {
    const x = (it.x | 0) + dx, y = (it.y | 0) + dy;
    if (!isOffScreen(cur.x + x, cur.y + y)) return { ...it, x, y };
    const h = home && home[it.name];
    if (h) {
      const hx = (h.x | 0) + ((Number.isFinite(h.ox) ? h.ox : cur.x) - cur.x);
      const hy = (h.y | 0) + ((Number.isFinite(h.oy) ? h.oy : cur.y) - cur.y);
      if (!isOffScreen(cur.x + hx, cur.y + hy)) { repaired++; return { ...it, x: hx, y: hy }; }
    }
    return { ...it, x, y };                    // 直せないものはそのまま (原点だけ引き直す)
  });
  out.repaired = repaired;
  return out;
}

// 退避先 (listview 座標) の一覧を作る。
// listview の原点は仮想画面の原点と一致するので、そのままオフセットできる。
// 見つからなければ空配列 = この環境では隠せない。
function parkingSlots(limit = 64) {
  const ox = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const oy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  const vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  const vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  const stepX = STEP_X, stepY = STEP_Y;
  const out = [];
  for (let ly = 0; ly < vh && out.length < limit; ly += stepY) {
    for (let lx = 0; lx < vw && out.length < limit; lx += stepX) {
      // セルの四隅が全部死角なら安全に隠せる
      const corners = [
        [lx, ly], [lx + stepX - 1, ly],
        [lx, ly + stepY - 1], [lx + stepX - 1, ly + stepY - 1],
      ];
      if (corners.every(([cx, cy]) => isOffScreen(ox + cx, oy + cy))) out.push({ x: lx, y: ly });
    }
  }
  return out;
}

// この環境で隠せるか (死角がいくつあるか)
function hideCapacity() {
  return parkingSlots(200).length;
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
//   saved : [{name, x, y}] 表示したいアイコンとその位置 (保存時の原点基準)
//   hidden: [名前...]       画面外へ退避したいアイコン
//   opts  : { origin:{x,y} 保存時の仮想画面原点, home:{名前->{x,y,ox,oy}} }
// 保存時とモニタ構成が違っても、原点の差分を引き直して同じ場所へ戻す。
// それでも今の画面に無い座標は、元位置 -> 空きセルの順で必ず見える場所にする。
// 戻り値 {moved, hidden, skipped, rescued, celled, total}
function apply(saved, hidden = [], opts = {}) {
  const want = Array.isArray(saved) ? saved : [];
  const hide = Array.isArray(hidden) ? hidden.filter(Boolean) : [];
  if (!want.length && !hide.length) return { moved: 0, hidden: 0, skipped: 0, rescued: 0, celled: 0, total: 0 };

  const s = openSession();
  if (!s) return null;

  try {
    // 現在の全アイコン (名前 -> index と、動かさないものの位置)
    const nameToIndex = new Map();
    const current = [];
    for (let i = 0; i < s.count; i++) {
      const name = readName(s, i);
      if (!name || nameToIndex.has(name)) continue;
      nameToIndex.set(name, i);
      const pos = readPos(s, i);
      if (pos) current.push({ name, x: pos.x, y: pos.y });
    }

    // 計画: スナップに無い現存アイコンは動かさないので、そのセルは避ける
    const known = new Set([...want.map(w => w.name), ...hide]);
    const o = origin();
    const stay = current.filter(c => !known.has(c.name) && !isOffScreen(o.x + c.x, o.y + c.y));
    const env = {
      origin: o,
      isOff: isOffScreen,
      slots: (n) => parkingSlots(n),
      freeCells: (n, taken) => freeVisibleCells(n, taken),
    };
    const plan = planMoves(want, hide, opts.origin, opts.home, stay, env);

    let moved = 0, skipped = 0, hid = 0;
    for (const m of plan.moves) {
      const i = nameToIndex.get(m.name);
      if (i == null) { skipped++; continue; }
      num(SendMessageW(s.lv, LVM_SETITEMPOSITION, i, pack(m.x | 0, m.y | 0)));
      moved++;
    }
    for (const m of plan.parked) {
      const i = nameToIndex.get(m.name);
      if (i == null) { skipped++; continue; }
      num(SendMessageW(s.lv, LVM_SETITEMPOSITION, i, pack(m.x, m.y)));
      hid++;
    }

    return {
      moved, hidden: hid, skipped,
      rescued: plan.rescued, celled: plan.celled,
      total: want.length + hide.length,
    };
  } catch (_) {
    return null;
  } finally {
    s.close();
  }
}

// いま画面に見えているアイコンだけ {name,x,y} で返す。
// 「最後に見えていた位置」を記録するために使う (隠す前の住所)。
function visibleList() {
  const all = list();
  if (!all) return null;
  const ox = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const oy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  return all.filter(i => !isOffScreen(ox + i.x, oy + i.y));
}

// いま画面外 (どのモニタにも映らない位置) にいるアイコン
function strandedNames() {
  const all = list();
  if (!all) return null;
  const ox = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const oy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  return all.filter(i => isOffScreen(ox + i.x, oy + i.y)).map(i => i.name);
}

// 画面外のアイコンを全部、見える場所へ並べ直す。
// 元位置が分からなくても必ず戻せる最後の手段なので、
// 保存済み座標 (仮想画面の左上からの相対) が、どのモニタにも載っていないか。
// 「退避先の座標を元の場所として覚えてしまう」のを防ぐのに使う
function isParked(x, y) {
  const ox = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const oy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  return isOffScreen(ox + (x | 0), oy + (y | 0));
}

// 保存データに頼らず「空いている見えるセル」を自前で探して置く。
// home: {名前 -> {x,y}} 最後に見えていた位置。あればそこへ戻す。
// 無い / 埋まっている場合だけ、空いている見えるセルへ置く。
function showAll(home = {}) {
  const all = list();
  if (!all) return null;
  const o = origin();

  const stranded = all.filter(i => isOffScreen(o.x + i.x, o.y + i.y));
  if (!stranded.length) return { moved: 0, stranded: 0 };

  // 見えている位置は埋まっているとみなす
  const taken = new Set(all
    .filter(i => !isOffScreen(o.x + i.x, o.y + i.y))
    .map(i => cellKey(i.x, i.y)));

  const s2 = openSession();
  if (!s2) return null;
  try {
    const nameToIndex = new Map();
    for (let i = 0; i < s2.count; i++) {
      const n = readName(s2, i);
      if (n && !nameToIndex.has(n)) nameToIndex.set(n, i);
    }
    let moved = 0, restored = 0, placed = 0;
    const needCell = [];
    for (const it of stranded) {
      const i = nameToIndex.get(it.name);
      if (i == null) continue;

      // 覚えている元位置 (記録時の原点から引き直す) が使えて、空いていればそこへ
      const h = home[it.name];
      let hx = null, hy = null;
      if (h) {
        hx = (h.x | 0) + ((Number.isFinite(h.ox) ? h.ox : o.x) - o.x);
        hy = (h.y | 0) + ((Number.isFinite(h.oy) ? h.oy : o.y) - o.y);
      }
      if (h && !isOffScreen(o.x + hx, o.y + hy) && !taken.has(cellKey(hx, hy))) {
        num(SendMessageW(s2.lv, LVM_SETITEMPOSITION, i, pack(hx, hy)));
        taken.add(cellKey(hx, hy));
        moved++; restored++;
        continue;
      }
      needCell.push({ name: it.name, i });
    }
    // 元位置が分からない / 埋まっている場合だけ空きセルへ
    const cells = freeVisibleCells(needCell.length, taken);
    needCell.forEach((it, n) => {
      const c = cells[n];
      if (!c) return;
      num(SendMessageW(s2.lv, LVM_SETITEMPOSITION, it.i, pack(c.x, c.y)));
      moved++; placed++;
    });
    return { moved, restored, placed, stranded: stranded.length };
  } catch (_) {
    return null;
  } finally {
    s2.close();
  }
}

function available() {
  const lv = findListView();
  return !!(lv && IsWindow(lv));
}

module.exports = {
  isParked, list, apply, available, hideCapacity, parkingSlots, strandedNames, showAll, visibleList,
  origin, autoArrange, planMoves, unparkRows, freeVisibleCells };
