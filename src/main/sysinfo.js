// ディスク空き容量とネットワーク情報 (ローカルIP / SSID / 遅延) の収集。
// 対象ウィジェットがあるときだけ heartbeat で回す。
'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const { execFile } = require('child_process');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let disks = [];          // [{letter, freeGb, totalGb, pct}]
let netinfo = { localIp: '', ssid: '', pingMs: null };
let wantDisk = false;
let wantNet = false;

// ---------------------------------------------------------------- ディスク
async function scanDisks() {
  const out = [];
  for (let c = 67; c <= 90; c++) { // C..Z (A/B はフロッピー時代の遺物なので飛ばす)
    const letter = String.fromCharCode(c);
    const root = letter + ':\\';
    if (!fs.existsSync(root)) continue;
    try {
      const s = await fs.promises.statfs(root);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      if (total <= 0) continue;
      out.push({
        letter,
        freeGb: +(free / 1024 ** 3).toFixed(1),
        totalGb: +(total / 1024 ** 3).toFixed(1),
        pct: Math.round(((total - free) / total) * 100),
      });
    } catch (_) { /* アクセス不可のドライブ (カードリーダ等) は無視 */ }
  }
  disks = out;
  emitter.emit('disks', disks);
}

// ---------------------------------------------------------------- ネットワーク
function localIp() {
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '';
}

function fetchSsid() {
  return new Promise((resolve) => {
    execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve('');
      // 言語非依存: 最初の "SSID : xxx" 行 (BSSID は除外)
      for (const line of stdout.split(/\r?\n/)) {
        const m = /^\s*SSID\s*:\s*(.+)$/.exec(line);
        if (m && !/BSSID/i.test(line)) return resolve(m[1].trim());
      }
      resolve('');
    });
  });
}

// ping コマンドの代わりに TCP 接続時間で遅延を測る (管理者権限・子プロセス不要)
function measurePing(host = '1.1.1.1', port = 443, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (v) => { if (!done) { done = true; sock.destroy(); resolve(v); } };
    sock.setTimeout(timeout, () => finish(null));
    sock.once('error', () => finish(null));
    sock.connect(port, host, () => finish(Date.now() - start));
  });
}

async function scanNet() {
  const [ssid, ping] = await Promise.all([fetchSsid(), measurePing()]);
  netinfo = { localIp: localIp(), ssid, pingMs: ping };
  emitter.emit('netinfo', netinfo);
}

// ---------------------------------------------------------------- 稼働管理
function sync(needDisk, needNet) {
  if (needDisk !== wantDisk) {
    wantDisk = needDisk;
    if (needDisk) {
      heartbeat.register('disks', 5 * 60 * 1000, scanDisks);
      scanDisks();
    } else {
      heartbeat.unregister('disks');
    }
  }
  if (needNet !== wantNet) {
    wantNet = needNet;
    if (needNet) {
      heartbeat.register('netinfo', 30 * 1000, scanNet);
      scanNet();
    } else {
      heartbeat.unregister('netinfo');
    }
  }
}

function snapshot() { return { disks, netinfo }; }

module.exports = { sync, snapshot, on: (...a) => emitter.on(...a) };
