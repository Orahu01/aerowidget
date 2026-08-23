// 本物の main プロセスの検査。
//
//   実行: node scripts/apptest.js
//
// 3 部構成:
//   A. 静的検査 — レンダラが invoke するチャンネルすべてに main 側の handle があるか。
//      「画面は呼ぶが誰も受けない」系の壊れ方をコードを動かさず捕まえる。
//      また、実デスクトップのアイコンを動かすため実行時には検証できない一部の
//      分岐 (後述) を、ソースの文字列一致で最低限の退行検知だけしておく。
//   B. 実起動検査 (既定の構成) — 砂場の userData に決まった config を置き、WW_SELFTEST=1 で
//      本物のアプリを起動。main.js 内のセルフテストがマイグレーション・土台の不変・
//      排他・合成・重ねと対話ウィジェット窓の同期・モード名の参照整合を実プロセスで検証する。
//   C. 実起動検査 (シーン無効の構成) — シーンのマスタースイッチが切ってあるとき、
//      ルールが 1 つも条件へ移行されないことだけを別 config で確かめる。
//
//   デスクトップの実アイコンには一切触れない (icons.apply() を呼ぶ経路は使わない)。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let fail = 0;

// ---------------- A1. IPC の対応漏れ ----------------
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

// ---------------- A2. 実行時に検証できない分岐の静的ガード ----------------
// onDisplayChanged() の自動復元と switcher:applyIcons は、どちらも
// applyIconSnapshot() を経由し、これが icons.apply() で実デスクトップのアイコンを
// 動かす。ここを本当に起動して確かめることはできない (アイコンには絶対に触れない) ので、
// せめて「意図した形で呼んでいるか」だけソースの文字列一致で見張る。
// どちらも過去に一度壊れた実装 (5.9.28 時点のバグハントで確定) の再発防止線
{
  const src = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  const guards = [
    ['自動復元は activate:false で呼ぶ (人操作でないので条件を壊さない)', /applyIconSnapshot\(cur\.iconAutoRestore,\s*false\)/],
    ['切り替えボタンは押されたモードを当てるだけ (解除の分岐を持たない)', /switcher:applyIcons[\s\S]{0,400}?return !!applyIconSnapshot\(name\)\.ok;\s*\}\);/],
  ];
  for (const [label, re] of guards) {
    if (re.test(src)) console.log(`静的ガード OK: ${label}`);
    else { fail++; console.log(`✗ 静的ガード失敗: ${label}`); }
  }
}

// ---------------- 実起動検査の共通処理 ----------------
function runSelftest(label, fixture, env) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-apptest-'));
  fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify(fixture, null, 2));
  const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  const r = spawnSync(electron, ['.', `--user-data-dir=${ud}`], {
    cwd: ROOT, shell: process.platform === 'win32',
    env: { ...process.env, WW_SELFTEST: '1', WW_NO_FS: '1', ...env },
    encoding: 'utf8', timeout: 90000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(`--- ${label} ---`);
  for (const line of out.split(/\r?\n/)) {
    if (/SELFTEST/.test(line)) console.log(line);
  }
  if (r.status !== 0) {
    fail++;
    console.log(`✗ ${label} が失敗 (exit=${r.status})`);
    if (!/SELFTEST/.test(out)) console.log(out.slice(-1500));
  }
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (_) {}
}

const wallA = { default: { type: 'custom', value: { kind: 'solid', colors: ['#301020'] }, dim: 0, blur: 0 }, byDisplay: {} };
const wallB = { default: { type: 'custom', value: { kind: 'solid', colors: ['#103020'] }, dim: 0, blur: 0 }, byDisplay: {} };

// ---------------- B. 実起動検査 (既定の構成) ----------------
runSelftest('B: 既定の構成', {
  version: 2,
  wallpapers: { default: { type: 'custom', value: { kind: 'solid', colors: ['#141821'] }, dim: 0, blur: 0 }, byDisplay: {} },
  widgets: [
    { id: 'w1', type: 'clock', display: 0, x: 50, y: 30, size: 96, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {} },
    { id: 'w2', type: 'date', display: 0, x: 50, y: 60, size: 24, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {} },
    { id: 'w3', type: 'folder', display: 0, x: 20, y: 70, size: 12, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: { items: [], layout: 'grid', iconSize: 34, showLabels: true, title: 'フォルダ', bgOpacity: 0.5 } },
    { id: 'w4', type: 'switcher', display: 0, x: 50, y: 92, size: 13, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: { items: ['名前変更対象', '削除対象'], target: 'icons' } },
  ],
  settings: {
    language: 'ja',
    currentIconMode: '', iconAutoRestore: '削除対象',
    // まだ統合前のふりをする -> 起動時マイグレーションの検証になる
    layouts: [{ name: '昼プリセット', wallpapers: wallA, widgets: [{ id: 'w1' }] }],
    scenes: {
      enabled: true,
      defaultIcons: '削除対象',
      rules: [
        // 無効なルールを先頭に置く: 移行時に飛ばされず先取りしてしまうと、
        // 下の有効なルールが同じレイアウトのトリガー枠を奪われて負ける (bug: enabled 無視)
        { trigger: { type: 'battery' }, layout: '昼プリセット', enabled: false },
        { trigger: { type: 'app', apps: ['chrome.exe'] }, layout: '昼プリセット' },
        { icons: '削除対象' },   // layout/trigger なし = モード移行には関与しない。削除時の参照掃除だけ見る
      ],
    },
    iconLayouts: [
      { name: '矛盾モード', savedAt: 1, count: 0, icons: [], hidden: [], on: true, trigger: { type: 'battery' } },
      { name: '壁紙モードA', savedAt: 2, count: 0, icons: [], hidden: [], on: false, trigger: { type: 'time', from: '22:00', to: '06:00' }, wallpapers: wallA, linkWidgets: true, widgetsOn: ['w1'] },
      { name: '壁紙モードB', savedAt: 3, count: 0, icons: [], hidden: [], on: false, trigger: null, wallpapers: wallB },
      { name: '名前変更対象', savedAt: 4, count: 0, icons: [], hidden: [], on: false, trigger: null },
      { name: '削除対象', savedAt: 5, count: 0, icons: [], hidden: [], on: false, trigger: null },
    ],
    scheduleEnabled: false,
  },
}, {});

// ---------------- C. 実起動検査 (シーン無効の構成) ----------------
// マスタースイッチが切ってあるとき、ルールが 1 つも条件へ移行されないことだけを見る
runSelftest('C: シーン無効の構成', {
  version: 2,
  wallpapers: { default: { type: 'custom', value: { kind: 'solid', colors: ['#141821'] }, dim: 0, blur: 0 }, byDisplay: {} },
  widgets: [],
  settings: {
    language: 'ja',
    currentIconMode: '', iconAutoRestore: '',
    layouts: [],
    scenes: { enabled: false, rules: [{ trigger: { type: 'app', apps: ['chrome.exe'] }, layout: '無効プリセット' }] },
    iconLayouts: [{ name: '無効プリセット', savedAt: 1, count: 0, icons: [], hidden: [], on: false, trigger: null }],
    scheduleEnabled: false,
  },
}, { WW_SELFTEST_CASE: 'scenes-disabled' });

console.log(fail ? `apptest: ${fail} 部で失敗` : 'apptest: 全部 PASS');
process.exit(fail ? 1 : 0);
