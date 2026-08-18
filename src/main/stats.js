// CPU / メモリ使用率のサンプリング (システム情報ウィジェット用)
'use strict';

const os = require('os');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();
let active = false;
let prev = null;

function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

function sample() {
  const now = cpuTimes();
  let cpu = 0;
  if (prev) {
    const dTotal = now.total - prev.total;
    const dIdle = now.idle - prev.idle;
    cpu = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
  }
  prev = now;
  const memUsed = os.totalmem() - os.freemem();
  emitter.emit('update', {
    cpu: Math.max(0, Math.min(100, cpu)),
    mem: Math.round((memUsed / os.totalmem()) * 100),
    memUsedGb: (memUsed / 1024 ** 3).toFixed(1),
    memTotalGb: (os.totalmem() / 1024 ** 3).toFixed(1),
  });
}

function start() {
  if (active) return;
  active = true;
  prev = cpuTimes();
  heartbeat.register('stats', 2000, sample);
}

function stop() {
  active = false;
  heartbeat.unregister('stats');
}

module.exports = { start, stop, on: (...a) => emitter.on(...a) };
