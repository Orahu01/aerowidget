// 本物の main プロセスの検査。
//
//   実行: node scripts/apptest.js
//
// 2 部構成:
//   A. 静的検査 — レンダラが invoke するチャンネルすべてに main 側の handle があるか。
//      「画面は呼ぶが誰も受けない」系の壊れ方をコードを動かさず捕まえる。
//   B. 実起動検査 — 砂場の userData に決まった config を置き、WW_SELFTEST=1 で
//      本物のアプリを起動。main.js 内のセルフテストがマイグレーション・土台の不変・
//      排他・合成を実プロセスで検証し、終了コードで返す。
//      デスクトップのアイコンには一切触れない。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let fail = 0;

// ---------------- A. IPC の対応漏れ ----------------
{
  const invoked = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/preload'))) {
    const src = fs.readFileSync(path.join(ROOT, 'src/preload', f), 'utf8');
    for (const m of src.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)) invoked.add(m[1]);
  }
  const handled = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/main'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'src/main', f), 'utf8');
    for (const m of src.matchAll(/ipcMain\.handle\('([^']+)'/g)) handled.add(m[1]);
  }
  const missing = [...invoked].filter(c => !handled.has(c));
  if (missing.length) {
    fail++;
    console.log('✗ 受け手のない IPC:', missing.join(', '));
  } else {
    console.log(`IPC 対応: invoke ${invoked.size} 件すべてに handle あり`);
  }
}

// ---------------- B. 実プロセスの不変条件 ----------------
{
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-apptest-'));
  const wallA = { default: { type: 'custom', value: { kind: 'solid', colors: ['#301020'] }, dim: 0, blur: 0 }, byDisplay: {} };
  const wallB = { default: { type: 'custom', value: { kind: 'solid', colors: ['#103020'] }, dim: 0, blur: 0 }, byDisplay: {} };
  const fixture = {
    version: 2,
    wallpapers: { default: { type: 'custom', value: { kind: 'solid', colors: ['#141821'] }, dim: 0, blur: 0 }, byDisplay: {} },
    widgets: [
      { id: 'w1', type: 'clock', display: 0, x: 50, y: 30, size: 96, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {} },
      { id: 'w2', type: 'date', display: 0, x: 50, y: 60, size: 24, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {} },
    ],
    settings: {
      language: 'ja',
      currentIconMode: '', iconAutoRestore: '',
      // まだ統合前のふりをする -> 起動時マイグレーションの検証になる
      layouts: [{ name: '昼プリセット', wallpapers: wallA, widgets: [{ id: 'w1' }] }],
      scenes: { enabled: true, rules: [{ trigger: { type: 'app', apps: ['chrome.exe'] }, layout: '昼プリセット' }] },
      iconLayouts: [
        { name: '矛盾モード', savedAt: 1, count: 0, icons: [], hidden: [], on: true, trigger: { type: 'battery' } },
        { name: '壁紙モードA', savedAt: 2, count: 0, icons: [], hidden: [], on: false, trigger: { type: 'time', from: '22:00', to: '06:00' }, wallpapers: wallA, linkWidgets: true, widgetsOn: ['w1'] },
        { name: '壁紙モードB', savedAt: 3, count: 0, icons: [], hidden: [], on: false, trigger: null, wallpapers: wallB },
      ],
      scheduleEnabled: false,
    },
  };
  fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify(fixture, null, 2));

  const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  const r = spawnSync(electron, ['.', `--user-data-dir=${ud}`], {
    cwd: ROOT, shell: process.platform === 'win32',
    env: { ...process.env, WW_SELFTEST: '1', WW_NO_FS: '1' },
    encoding: 'utf8', timeout: 90000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const line of out.split(/\r?\n/)) {
    if (/SELFTEST/.test(line)) console.log(line);
  }
  if (r.status !== 0) {
    fail++;
    console.log(`✗ 実起動検査が失敗 (exit=${r.status})`);
    if (!/SELFTEST/.test(out)) console.log(out.slice(-1500));
  }
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (_) {}
}

console.log(fail ? `apptest: ${fail} 部で失敗` : 'apptest: 全部 PASS');
process.exit(fail ? 1 : 0);
