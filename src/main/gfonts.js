// Google Fonts を簡単に追加する: css2 API から @font-face を取得し、
// woff2 をローカル (userData/fonts) に保存してオフラインでも使えるようにする。
'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function fontsDir() {
  return path.join(app.getPath('userData'), 'fonts');
}

function safeName(s) {
  return s.replace(/[^\w\-]+/g, '_');
}

async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchBin(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

// フォント名を追加 → { ok, family?, cssFile?, msg? }
async function add(familyInput) {
  const family = String(familyInput || '').trim();
  if (!family) return { ok: false, msg: 'フォント名を入力してください' };
  const urlFam = encodeURIComponent(family).replace(/%20/g, '+');

  // 可変ウェイト → 固定数ウェイト → 素 の順で試す
  const candidates = [
    `https://fonts.googleapis.com/css2?family=${urlFam}:wght@100..900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${urlFam}:wght@300;400;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${urlFam}&display=swap`,
  ];
  let css = null;
  for (const u of candidates) {
    try {
      css = await fetchText(u);
      break;
    } catch (_) { /* 次の候補へ */ }
  }
  if (!css) return { ok: false, msg: `「${family}」が見つかりませんでした (名前を確認してください)` };

  const dir = path.join(fontsDir(), safeName(family));
  fs.mkdirSync(dir, { recursive: true });

  // css 内の url(...) を全部ダウンロードしてローカルパスに書き換える
  // (日本語フォントはサブセット分割で 100 ファイル以上になるため 8 並列)
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
  if (!urls.length) return { ok: false, msg: '取得に失敗しました' };
  const jobs = urls.map((u, i) => ({ u, i }));
  const results = new Map();
  async function worker() {
    while (jobs.length) {
      const { u, i } = jobs.shift();
      const ext = (u.match(/\.(woff2|woff|ttf)/) || [, 'woff2'])[1];
      const fname = `f${i}.${ext}`;
      const bin = await fetchBin(u);
      fs.writeFileSync(path.join(dir, fname), bin);
      results.set(u, 'file:///' + path.join(dir, fname).replace(/\\/g, '/').replace(/ /g, '%20'));
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, urls.length) }, () => worker()));
  for (const [u, local] of results) css = css.split(u).join(local);
  const cssFile = path.join(dir, 'font.css');
  fs.writeFileSync(cssFile, css, 'utf8');
  return { ok: true, family, cssFile };
}

function remove(family, entry) {
  try {
    const dir = path.join(fontsDir(), safeName(family));
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

// 登録済みフォントの CSS をまとめて返す (レンダラが <style> に注入する)
function cssFor(list) {
  let out = '';
  for (const f of list || []) {
    try {
      out += fs.readFileSync(f.cssFile, 'utf8') + '\n';
    } catch (_) {}
  }
  return out;
}

module.exports = { add, remove, cssFor };
