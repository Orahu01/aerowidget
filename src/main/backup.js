// 設定ファイルのバックアップ。
//
// いちばん失って困るのは exe ではなく、時間をかけて作ったウィジェット配置のほう。
// 更新の瞬間にフックするのではなく「起動時にアプリのバージョンが変わっていたら退避」
// という形にしてある。こうすると自動更新・インストーラの手動実行・ポータブル版の
// 差し替え・そしてバージョンを下げたときまで、経路を問わず 1 か所で拾える。
'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const KEEP = 5;                       // 残す世代数
const PREFIX = 'config.backup-';

function dir() {
  return app.getPath('userData');
}

function configPath() {
  return path.join(dir(), 'config.json');
}

// 2026-08-20 23:45:07 -> "20260820-234507"
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ファイル名から版と日時を復元する。v5.1 以前の `config.backup-<epoch>.json` も読める
function parseName(name) {
  if (!name.startsWith(PREFIX) || !name.endsWith('.json')) return null;
  const body = name.slice(PREFIX.length, -'.json'.length);

  const m = body.match(/^(.+)-(\d{8})-(\d{6})$/);
  if (m) {
    const [, version, ymd, hms] = m;
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T` +
                `${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}`;
    const t = new Date(iso).getTime();
    return { version, time: Number.isFinite(t) ? t : 0 };
  }
  if (/^\d+$/.test(body)) return { version: '', time: Number(body) };   // 旧形式
  return null;
}

// 新しい順。{ file, version, time, size, reason }
//
// 名前の日時は秒までしか持たないので、同じ秒に並んだときは実ファイルの更新時刻で
// 決着をつける。ここが不定だと prune() が新しいほうを消しかねない。
function list() {
  let names = [];
  try {
    names = fs.readdirSync(dir());
  } catch (_) {
    return [];
  }
  const out = [];
  for (const name of names) {
    const meta = parseName(name);
    if (!meta) continue;
    let size = 0;
    let reason = '';
    let mtime = 0;
    try {
      const st = fs.statSync(path.join(dir(), name));
      size = st.size;
      mtime = st.mtimeMs;
      const parsed = JSON.parse(fs.readFileSync(path.join(dir(), name), 'utf8'));
      reason = String(parsed.backupReason || '');
      if (!meta.version) meta.version = String(parsed.appVersion || '');
    } catch (_) { /* 壊れていても一覧には出す */ }
    out.push({ file: name, version: meta.version, time: meta.time || mtime, size, reason, mtime });
  }
  return out.sort((a, b) => (b.time - a.time) || (b.mtime - a.mtime) || a.file.localeCompare(b.file));
}

// 古い世代を落とす。自分が付けた名前のものだけを対象にする
function prune(keep = KEEP) {
  for (const b of list().slice(keep)) {
    try { fs.unlinkSync(path.join(dir(), b.file)); } catch (_) { /* best-effort */ }
  }
}

// 現在の config.json を退避する。戻り値はファイル名 (取らなかったときは null)
function create(reason, version) {
  const src = configPath();
  if (!fs.existsSync(src)) return null;               // 初回起動: 退避するものがない
  try {
    const ver = String(version || 'unknown').replace(/[^0-9A-Za-z.+_-]/g, '') || 'unknown';
    // 同じ版・同じ秒に 2 度来ても取りこぼさないよう連番を足す
    let name = `${PREFIX}${ver}-${stamp(new Date())}.json`;
    for (let i = 2; fs.existsSync(path.join(dir(), name)) && i < 100; i++) {
      name = `${PREFIX}${ver}.${i}-${stamp(new Date())}.json`;
    }
    const dest = path.join(dir(), name);

    // 理由を書き込んでおくと、復元画面でどれを選べばよいか分かる
    let text = fs.readFileSync(src, 'utf8');
    try {
      const parsed = JSON.parse(text);
      parsed.backupReason = String(reason || '');
      text = JSON.stringify(parsed, null, 2);
    } catch (_) { /* 壊れた設定でもそのままコピーする */ }

    fs.writeFileSync(dest, text, 'utf8');
    prune();
    return name;
  } catch (e) {
    console.error('backup failed:', e.message);
    return null;
  }
}

// バックアップを読んで中身を返す (復元の適用は config.replace が行う)
function read(file) {
  const name = path.basename(String(file || ''));
  if (!parseName(name)) throw new Error('バックアップファイルではありません');
  return JSON.parse(fs.readFileSync(path.join(dir(), name), 'utf8'));
}

function remove(file) {
  const name = path.basename(String(file || ''));
  if (!parseName(name)) throw new Error('バックアップファイルではありません');
  fs.unlinkSync(path.join(dir(), name));
}

module.exports = { create, list, read, remove, prune, dir };
