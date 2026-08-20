// オンライン壁紙 (API キー不要のソースのみ):
//  - bing:   Bing の「今日の画像」
//  - picsum: Lorem Picsum のランダム写真
// ダウンロードして userData に保存し、ローカル画像として表示する。
const brand = require('../shared/brand');
'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let current = null;   // { source, file, fetchedAt }
let wantSource = null;

function dir() {
  const d = path.join(app.getPath('userData'), 'online');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function fetchBuf(url, timeoutMs = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': `Mozilla/5.0 ${brand.UA}` }, redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

async function imageUrlFor(source) {
  if (source === 'bing') {
    const j = JSON.parse((await fetchBuf('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ja-JP')).toString('utf8'));
    const img = j.images && j.images[0];
    if (!img) throw new Error('no image');
    return 'https://www.bing.com' + img.urlbase + '_UHD.jpg';
  }
  // picsum: リダイレクト先が実体
  return 'https://picsum.photos/2560/1440';
}

async function refresh(source) {
  try {
    const buf = await fetchBuf(await imageUrlFor(source));
    if (buf.length < 10000) throw new Error('too small');
    const file = path.join(dir(), source + '.jpg');
    fs.writeFileSync(file, buf);
    current = { source, file, fetchedAt: Date.now() };
    emitter.emit('update', current);
  } catch (e) {
    // 失敗時: 既存ファイルがあればそれを使い続ける
    const file = path.join(dir(), source + '.jpg');
    if (fs.existsSync(file) && (!current || current.source !== source)) {
      current = { source, file, fetchedAt: 0 };
      emitter.emit('update', current);
    }
  }
}

// 使用中のオンライン壁紙ソース (なければ null) を伝える
function sync(source, refreshHours) {
  if (source === wantSource) return;
  wantSource = source;
  if (source) {
    heartbeat.register('onlinewall', Math.max(1, refreshHours || 24) * 3600 * 1000, () => refresh(wantSource));
    refresh(source);
  } else {
    heartbeat.unregister('onlinewall');
  }
}

function getCurrent() { return current; }

module.exports = { sync, refresh, getCurrent, on: (...a) => emitter.on(...a) };
