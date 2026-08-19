// 再生中メディア (SMTC) との連携。
// WinRT は Node から直接触れないため、assets/smtc.ps1 を Windows PowerShell 5.1 で
// 常駐実行し、変化があったときだけ流れてくる 1 行 JSON を受け取る。
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { EventEmitter } = require('events');

const emitter = new EventEmitter();

let proc = null;
let wanted = false;
let restartTimer = null;
let restartDelay = 5000;
let latest = null; // { playing, title, artist, app, art (dataURL|null) }

// asar 内のファイルは PowerShell から実行できないため、
// パッケージ時は asarUnpack で展開された実体のパスを使う
function scriptPath() {
  const p = path.join(__dirname, '..', '..', 'assets', 'smtc.ps1');
  return p.includes('app.asar') ? p.replace('app.asar', 'app.asar.unpacked') : p;
}

function spawnHelper() {
  if (proc || !wanted) return;
  try {
    proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.error('smtc spawn failed:', e.message);
    proc = null;
    return;
  }

  proc.on('error', (e) => console.error('smtc helper error:', e.message));

  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => {
    try {
      const j = JSON.parse(line);
      if (j.ok === false) return;
      latest = {
        playing: !!j.playing,
        title: j.title || '',
        artist: j.artist || '',
        app: j.app || '',
        art: j.art ? 'data:image/jpeg;base64,' + j.art : null,
      };
      restartDelay = 5000; // 正常受信できているのでバックオフをリセット
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
  if (latest && latest.playing) {
    latest = { ...latest, playing: false };
    emitter.emit('update', latest);
  }
}

function getLatest() { return latest; }

module.exports = { start, stop, getLatest, on: (...a) => emitter.on(...a) };
