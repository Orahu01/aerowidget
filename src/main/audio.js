// オーディオ制御 (音量 / ミュート / 既定の出力デバイス) と メディアキー送出。
// Core Audio は WinRT/COM が必要なため assets/audio.ps1 を常駐させて橋渡しする。
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { EventEmitter } = require('events');
const koffi = require('koffi');

const emitter = new EventEmitter();

const user32 = koffi.load('user32.dll');
const keybd_event = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uint64']);

// メディアキー (SMTC 対応アプリはこれで操作できる)
const VK = { play: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2 };
const KEYEVENTF_KEYUP = 0x0002;

function sendMediaKey(which) {
  const vk = VK[which];
  if (!vk) return false;
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
  return true;
}

let proc = null;
let wanted = false;
let restartTimer = null;
let restartDelay = 5000;
let latest = null; // { volume, muted, current, devices: [{id,name}] }

function scriptPath() {
  return path.join(__dirname, '..', '..', 'assets', 'audio.ps1');
}

function spawnHelper() {
  if (proc || !wanted) return;
  try {
    proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(),
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    console.error('audio spawn failed:', e.message);
    proc = null;
    return;
  }

  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => {
    try {
      const j = JSON.parse(line);
      if (!j.ok) return;
      // devices は list 応答のときだけ来るので、前回の一覧を保持する
      latest = {
        volume: j.volume,
        muted: !!j.muted,
        current: j.current || '',
        devices: j.devices || (latest ? latest.devices : []),
      };
      restartDelay = 5000;
      emitter.emit('update', latest);
    } catch (_) { /* 壊れた行は無視 */ }
  });

  proc.on('exit', () => {
    proc = null;
    if (wanted) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(spawnHelper, restartDelay);
      restartDelay = Math.min(restartDelay * 2, 120000);
    }
  });
}

function send(cmd) {
  if (proc && proc.stdin.writable) {
    try { proc.stdin.write(cmd + '\n'); } catch (_) {}
  }
}

function start() {
  if (wanted) return;
  wanted = true;
  spawnHelper();
}

function stop() {
  wanted = false;
  clearTimeout(restartTimer);
  if (proc) {
    try { proc.kill(); } catch (_) {}
    proc = null;
  }
}

function setVolume(v) {
  const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  // 応答を待たずに UI を進められるよう、手元の状態も更新しておく
  if (latest) latest = { ...latest, volume: n };
  send('vol ' + n);
}

function setMute(m) {
  if (latest) latest = { ...latest, muted: !!m };
  send('mute ' + (m ? 1 : 0));
}

function setDevice(id) {
  if (typeof id === 'string' && id) send('device ' + id);
}

function refresh() { send('list'); }

function getLatest() { return latest; }

module.exports = { start, stop, setVolume, setMute, setDevice, refresh, getLatest, sendMediaKey, on: (...a) => emitter.on(...a) };
