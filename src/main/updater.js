// 自動アップデート (electron-updater + GitHub Releases)。
// - NSIS インストール版のみ対応 (ポータブル版は手動更新)
// - リポジトリが非公開の間は 404 になるため、失敗は静かにステータス表示だけにする
'use strict';

const { app } = require('electron');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let autoUpdater = null;
let status = { state: 'idle', version: null, message: '' };
let started = false;

function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_FILE;
}

function supported() {
  return app.isPackaged && !isPortable();
}

function setStatus(state, extra = {}) {
  status = { state, version: status.version, message: '', ...extra };
  emitter.emit('status', status);
}

function init() {
  if (started || !supported()) return;
  started = true;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    setStatus('error', { message: 'updater unavailable' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => setStatus('checking'));
  autoUpdater.on('update-available', (info) => setStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => setStatus('latest'));
  autoUpdater.on('download-progress', (p) => setStatus('downloading', { version: status.version, message: Math.round(p.percent) + '%' }));
  autoUpdater.on('update-downloaded', (info) => setStatus('ready', { version: info.version }));
  autoUpdater.on('error', (e) => setStatus('error', { message: String(e && e.message || e).slice(0, 120) }));

  // 起動 20 秒後に一度チェック、以降 6 時間ごと (単一ハートビートに集約)
  setTimeout(() => check(), 20000);
  heartbeat.register('update-check', 6 * 60 * 60 * 1000, () => check());
}

function check() {
  if (!supported()) {
    setStatus(isPortable() ? 'portable' : 'dev');
    return status;
  }
  if (!started) init();
  if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {});
  return status;
}

function installNow() {
  if (autoUpdater && status.state === 'ready') {
    autoUpdater.quitAndInstall(false, true);
  }
}

function getStatus() {
  if (!supported() && status.state === 'idle') {
    status = { state: isPortable() ? 'portable' : 'dev', version: null, message: '' };
  }
  return status;
}

module.exports = { init, check, installNow, getStatus, supported, on: (...a) => emitter.on(...a) };
