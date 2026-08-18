// Libre Hardware Monitor 連携 (Options → Remote Web Server → Run で有効化される
// http://127.0.0.1:8085/data.json をポーリングして温度・使用率・ネット速度を取得する)
'use strict';

const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let failCount = 0;
let online = false;
let latest = null;

// "45,3 °C" / "1.2 KB/s" などのロケール混在文字列 → 数値
function parseNum(s) {
  if (s == null) return null;
  const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function fmtTemp(s) {
  const n = parseNum(s);
  return n == null ? null : Math.round(n);
}

function fmtPct(s) {
  const n = parseNum(s);
  return n == null ? null : Math.round(n);
}

// スループット文字列 → MB/s 数値
function toMBs(s) {
  const n = parseNum(s);
  if (n == null) return null;
  const str = String(s);
  if (/GB\/s/i.test(str)) return n * 1024;
  if (/MB\/s/i.test(str)) return n;
  if (/KB\/s/i.test(str)) return n / 1024;
  if (/B\/s/i.test(str)) return n / 1024 / 1024;
  return n / 1024 / 1024; // 単位不明なら B/s とみなす
}

// data.json のツリーを歩いてハードウェア別に整理する
function parseTree(root) {
  const hw = { cpu: null, gpu: null, ram: null, drives: [], nics: [] };

  function classify(node) {
    const img = node.ImageURL || '';
    const text = node.Text || '';
    if (/cpu\.png/i.test(img)) return 'cpu';
    if (/nvidia|ati|amd.*gpu|intel_gfx|gpu/i.test(img) || /GeForce|Radeon|Arc |Iris|UHD Graphics/i.test(text)) return 'gpu';
    if (/ram\.png/i.test(img)) return 'ram';
    if (/hdd\.png|ssd/i.test(img)) return 'drive';
    if (/nic\.png/i.test(img)) return 'nic';
    return null;
  }

  function walk(node) {
    for (const child of node.Children || []) {
      const kind = classify(child);
      if (kind === 'cpu' && !hw.cpu) hw.cpu = child;
      else if (kind === 'gpu' && !hw.gpu) hw.gpu = child;
      else if (kind === 'ram' && !hw.ram) hw.ram = child;
      else if (kind === 'drive') hw.drives.push(child);
      else if (kind === 'nic') hw.nics.push(child);
      else walk(child);
    }
  }
  walk(root);
  return hw;
}

// hardware ノード内から group(Temperatures/Load/...) → センサー名で値を引く
function sensor(hwNode, groupRe, nameRe) {
  if (!hwNode) return null;
  for (const g of hwNode.Children || []) {
    if (!groupRe.test(g.Text || '')) continue;
    const leaves = g.Children || [];
    for (const s of leaves) {
      if (nameRe.test(s.Text || '')) return s.Value;
    }
    if (leaves.length && nameRe === MATCH_ANY) return leaves[0].Value;
  }
  return null;
}
const MATCH_ANY = /./;

function extract(root) {
  const hw = parseTree(root);
  const out = { ok: true, source: 'lhm' };

  out.cpu = {
    load: fmtPct(sensor(hw.cpu, /^Load$/i, /CPU Total/i)),
    temp: fmtTemp(
      sensor(hw.cpu, /^Temperatures$/i, /Package|Average|Tctl|Core \(Tctl/i)
      ?? sensor(hw.cpu, /^Temperatures$/i, MATCH_ANY)
    ),
  };
  out.gpu = {
    load: fmtPct(sensor(hw.gpu, /^Load$/i, /GPU Core/i) ?? sensor(hw.gpu, /^Load$/i, MATCH_ANY)),
    temp: fmtTemp(sensor(hw.gpu, /^Temperatures$/i, /GPU Core/i) ?? sensor(hw.gpu, /^Temperatures$/i, MATCH_ANY)),
    hot: fmtTemp(sensor(hw.gpu, /^Temperatures$/i, /Hot Spot/i)),
  };
  out.mem = {
    load: fmtPct(sensor(hw.ram, /^Load$/i, /Memory/i)),
    usedGb: parseNum(sensor(hw.ram, /^Data$/i, /Memory Used/i)),
    totalGb: null,
  };
  const avail = parseNum(sensor(hw.ram, /^Data$/i, /Memory Available/i));
  if (out.mem.usedGb != null && avail != null) out.mem.totalGb = Math.round(out.mem.usedGb + avail);

  out.drives = hw.drives.slice(0, 3).map(d => ({
    name: (d.Text || 'Drive').slice(0, 18),
    temp: fmtTemp(sensor(d, /^Temperatures$/i, MATCH_ANY)),
    used: fmtPct(sensor(d, /^Load$/i, /Used Space/i)),
  })).filter(d => d.temp != null || d.used != null);

  // 一番トラフィックの多い NIC を採用
  let best = null;
  for (const nic of hw.nics) {
    const down = toMBs(sensor(nic, /^Throughput$/i, /Download/i));
    const up = toMBs(sensor(nic, /^Throughput$/i, /Upload/i));
    if (down == null && up == null) continue;
    const score = (down || 0) + (up || 0);
    if (!best || score > best.score) best = { down, up, score };
  }
  out.net = best ? { down: best.down, up: best.up } : null;

  return out;
}

async function poll(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 1800);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    latest = extract(json);
    failCount = 0;
    if (!online) { online = true; emitter.emit('status', true); }
    emitter.emit('update', latest);
  } catch (_) {
    failCount++;
    if (online && failCount >= 2) {
      online = false;
      latest = null;
      emitter.emit('status', false);
      emitter.emit('update', { ok: false, source: 'lhm' });
    }
  } finally {
    clearTimeout(t);
  }
}

// getUrl() から現在の URL を取り出しつつポーリングを(再)開始
function start(getUrl) {
  const run = () => {
    // オフライン時はゆっくり再試行して負荷をかけない
    if (!online && failCount > 0 && failCount % 5 !== 0) { failCount++; return; }
    poll(getUrl());
  };
  heartbeat.register('lhm', 2000, run, true);
}

function stop() {
  heartbeat.unregister('lhm');
}

module.exports = { start, stop, isOnline: () => online, getLatest: () => latest, on: (...a) => emitter.on(...a) };
