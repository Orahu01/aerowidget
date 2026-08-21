// 自動アップデート (electron-updater + GitHub Releases)。
// - NSIS インストール版のみ対応 (ポータブル版は手動更新)
// - リポジトリが非公開の間は 404 になるため、失敗は静かにステータス表示だけにする
//
// 版の付け方: マイナーが奇数なら先行版 (5.3 / 5.5 / 5.7)、偶数なら安定版 (5.2 / 6.0)。
// 先行版は GitHub 側でも prerelease 印を付けるので、印を見る electron-updater は
// 既定では拾わない。受け取る設定にした人にも、確認なしでは入れない。
'use strict';

const { app } = require('electron');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let autoUpdater = null;
let status = { state: 'idle', version: null, message: '' };
let started = false;
let wantPrerelease = false;

// マイナーが奇数 = 先行版
function isPrerelease(version) {
  const m = /^(\d+)\.(\d+)\./.exec(String(version || ''));
  return !!m && Number(m[2]) % 2 === 1;
}

function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_FILE;
}

function supported() {
  return app.isPackaged && !isPortable();
}

// GitHub のリリース本文から、設定画面に出せる短い平文を作る。
// electron-updater は releaseNotes を HTML 文字列 (または配列) で渡してくる。
function readableNotes(info) {
  let raw = info && info.releaseNotes;
  if (Array.isArray(raw)) raw = raw.map(r => (r && r.note) || '').join('\n');
  if (typeof raw !== 'string' || !raw.trim()) return '';

  const text = raw
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')     // ブロックの終わりは改行に
    .replace(/<li[^>]*>/gi, '・')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')                    // 残りのタグを落とす
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

  const lines = text.split('\n')
    .map(l => l.replace(/^[\s*#>-]+/, '').trim())
    .filter(l => l && !/^https?:\/\//i.test(l))   // 素の URL 行は落とす
    .filter(l => !/^(full changelog|co-authored-by)/i.test(l));

  // 長くなりすぎないよう先頭だけ
  const picked = [];
  for (const l of lines) {
    picked.push(l.length > 110 ? l.slice(0, 110) + '…' : l);
    if (picked.length >= 6) break;
  }
  return picked.join('\n');
}

function setStatus(state, extra = {}) {
  // notes は次の状態へ引き継ぐ (download 中に消えないように)
  status = { state, version: status.version, notes: status.notes || '', message: '', ...extra };
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
  // 先行版だけは確認を挟みたいので、落とすかどうかは update-available で決める
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.allowPrerelease = wantPrerelease;

  autoUpdater.on('checking-for-update', () => setStatus('checking'));
  autoUpdater.on('update-available', (info) => {
    if (isPrerelease(info.version)) {
      // 先行版: 本人が「入れる」と言うまで落とさない
      setStatus('confirm', { version: info.version, notes: readableNotes(info) });
      return;
    }
    setStatus('available', { version: info.version, notes: readableNotes(info) });
    autoUpdater.downloadUpdate().catch(() => {});
  });
  autoUpdater.on('update-not-available', () => setStatus('latest'));
  autoUpdater.on('download-progress', (p) => setStatus('downloading', { version: status.version, message: Math.round(p.percent) + '%' }));
  autoUpdater.on('update-downloaded', (info) => setStatus('ready', { version: info.version, notes: readableNotes(info) }));
  autoUpdater.on('error', (e) => {
    const raw = String((e && e.message) || e);
    // 公開直後は latest.yml がまだ無いことがある。生の英文を出さず、待てば直ると伝える
    const transient = /latest\.yml|ENOTFOUND|ETIMEDOUT|ECONNRESET|404/i.test(raw);
    setStatus('error', { message: transient ? 'transient' : raw.slice(0, 120) });
  });

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
  if (autoUpdater) {
    autoUpdater.allowPrerelease = wantPrerelease;
    autoUpdater.checkForUpdates().catch(() => {});
  }
  return status;
}

// 設定から呼ぶ。切り替えた直後に効くよう、変わったらその場で確認しに行く
function setAllowPrerelease(on) {
  const next = !!on;
  if (next === wantPrerelease) return;
  wantPrerelease = next;
  if (autoUpdater) autoUpdater.allowPrerelease = next;
  if (started && status.state !== 'downloading') check();
}

// 先行版の確認に「はい」と答えたとき
function download() {
  if (autoUpdater && status.state === 'confirm') {
    setStatus('available', { version: status.version, notes: status.notes });
    autoUpdater.downloadUpdate().catch(() => {});
  }
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

module.exports = { init, check, download, installNow, getStatus, supported, setAllowPrerelease, isPrerelease, on: (...a) => emitter.on(...a) };
