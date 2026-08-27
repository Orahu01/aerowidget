// 設定画面の「全操作」を実際にクリックして回す検査。
//
//   実行: npx electron scripts/uicheck.js
//
// 目的は網羅であって深さではない: 各タブのすべての主要操作について
//   1. レンダラで例外が 1 件も起きないこと
//   2. 操作が対応する IPC 呼び出しまで到達すること
//   3. 目に見える結果 (カードの増減・表示切替) が起きること
// を確かめる。5.9.26 のように「変えていない操作」が壊れるのを出荷前に捕まえる。
//
// デスクトップにも実設定にも一切触れない (API は全部この中の偽物)。
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const bad = [];
const ok = (label, cond, detail) => {
  if (cond) { pass++; return true; }
  fail++;
  bad.push(label + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 200) : ''));
  console.log('✗', label, detail !== undefined ? JSON.stringify(detail).slice(0, 200) : '');
  return false;
};

// ---------------- 偽 API (プリロード) を settings.js の実際の使用面から生成 ----------------
function buildPreload() {
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/settings/settings.js'), 'utf8');
  const names = [...new Set([...src.matchAll(/window\.api\.([a-zA-Z]+)/g)].map(m => m[1]))];
  const lines = names.map(n => (n === 'onConfig')
    // 配信の入口だけは控えておく。検査から「重ねが効いた envelope」を流すため
    ? `  ${n}: (cb) => { H.config = cb; },`
    : (n === 'onMica')
    ? `  ${n}: (cb) => { H.mica = cb; },`
    : n.startsWith('on')
      ? `  ${n}: () => {},`
      : `  ${n}: (...a) => { log('${n}', a); return (O.${n} ? O.${n}(...a) : Promise.resolve([])); },`);
  const body = `
'use strict';
const { contextBridge } = require('electron');

// ---- 検査用の器: 呼ばれた IPC を全部記録する ----
const calls = [];
function log(name, args) {
  let s = name;
  try { s += '(' + args.map(a => JSON.stringify(a)).join(',').slice(0, 120) + ')'; } catch (_) {}
  calls.push(s);
}

// ---- 代表的な構成 (実データは使わない。CI でも同じ結果になるように) ----
const CFG = {
  wallpapers: { default: { type: 'custom', value: { kind: 'solid', colors: ['#141821'] }, dim: 0, blur: 0 }, byDisplay: {} },
  widgets: [
    { id: 'w-clock', type: 'clock', display: 0, x: 50, y: 30, size: 96, weight: 200, color: '#fff', opacity: 1, shadow: 'soft', letterSpacing: 3, font: 'Segoe UI', options: {} },
    { id: 'w-folder', type: 'folder', display: 0, x: 20, y: 70, size: 12, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: { items: [{ path: 'C:/x/App.lnk', name: 'App' }], layout: 'grid', iconSize: 34, showLabels: true, title: 'アプリ', bgOpacity: 0.5 } },
    { id: 'w-vis', type: 'visualizer', display: 0, x: 50, y: 90, size: 14, color: '#e3a94f', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: { bars: 48, wPct: 40, hPx: 90, mirror: true } },
    { id: 'w-off', type: 'date', display: 0, x: 80, y: 20, size: 24, weight: 300, color: '#fff', opacity: 1, shadow: 'soft', letterSpacing: 4, font: 'Segoe UI', off: true, options: { style: 'ja-long' } },
    { id: 'w-note', type: 'note', display: 0, x: 82, y: 82, size: 14, color: '#e6e7ea', shadow: 'none', opacity: 1, letterSpacing: 0, font: 'Segoe UI', options: { title: 'メモ', text: '', w: 240, h: 180, bgOpacity: 0.6 } },
    { id: 'w-sw', type: 'modeswitch', display: 0, x: 50, y: 92, size: 13, weight: 500, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 1, font: 'Segoe UI', options: { items: [], w: 300, h: 46, bgOpacity: 0.55, vertical: false } },
  ],
  settings: {
    language: 'ja', googleFonts: [], customPresets: [], layouts: [],
    scenes: { enabled: false, rules: [] },
    iconLayouts: [
      { name: 'モードA', savedAt: 1, count: 4, hidden: ['Icon2'], linkWidgets: true, widgetsOn: ['w-clock'], hasWallpaper: true, trigger: { type: 'app', apps: ['chrome.exe'] }, on: false },
      { name: 'モードB', savedAt: 2, count: 4, hidden: [], linkWidgets: false, widgetsOn: [], hasWallpaper: false, trigger: null, on: false },
    ],
    iconAutoRestore: '', currentIconMode: '',
    hotkeys: { enabled: false }, overlay: {}, schedule: { enabled: false, weekly: {} },
  },
};
const ICON_NAMES = ['Icon1', 'Icon2', 'Icon3', 'ごみ箱'];

// 重ねが効いているときに配られる「見えているもの」。土台とは別の壁紙を持つ。
// 設定画面がこちらを掴んでしまうと「変えたのに戻る」事故になるので、
// 検査では必ず base 側を見ていることを確かめる
const OVERLAID = {
  ...CFG,
  wallpapers: { default: { type: 'custom', value: { kind: 'solid', colors: ['#992200'] }, dim: 7, blur: 0 }, byDisplay: {} },
};
const H = {};

const snapshotsOut = () => ({
  saved: CFG.settings.iconLayouts.map(l => ({ ...l, hidden: (l.hidden || []).slice(), widgetsOn: (l.widgetsOn || []).slice() })),
  auto: { name: '復元前 (自動)', savedAt: 3, count: 4 },
});

const O = {
  getConfig: async () => ({
    config: CFG.__overlaid ? OVERLAID : CFG,
    base: CFG,
    activeModes: CFG.__overlaid ? ['重ね中モード'] : [],
    wallpaperModeName: CFG.__overlaid ? '重ね中モード' : '',
    wallpapers: [], presets: [],
  }),
  getFontsCss: async () => '',
  listThemes: async () => [],
  listDisplays: async () => [
    { index: 0, id: '1', key: 'MON-A|100x100', name: 'MON-A', label: 'モニタ1 MON-A (2560×1440・メイン)', primary: true },
    { index: 1, id: '2', key: 'MON-B|200x200', name: 'MON-B', label: 'モニタ2 MON-B (1440×2560)', primary: false },
  ],
  getVersion: async () => '0.0.0-test',
  getUpdateStatus: async () => ({ state: 'idle' }),
  failedHotkeys: async () => [],
  listBackups: async () => [],
  getAutostart: async () => ({ enabled: false, supported: false }),
  getHw: async () => ({}),
  getWeather: async () => null,
  getIcon: async () => null,
  getUrlIcon: async () => null,
  iconsAvailable: async () => true,
  iconsCurrent: async () => ICON_NAMES.length,
  iconCapacity: async () => 120,
  iconAutoArrange: async () => false,
  strandedIcons: async () => [],
  parkedWidgets: async () => CFG.widgets.filter(w => w.off).length,
  iconNames: async () => ICON_NAMES,
  iconAliases: async () => ({ ...(CFG.settings.iconAlias || {}) }),
  iconImage: async () => null,
  iconSnapshots: async () => snapshotsOut(),
  audioDevices: async () => ({ current: 'devA', devices: [{ id: 'devA', name: 'スピーカー' }, { id: 'devB', name: 'ヘッドホン' }] }),
  droppedPaths: () => [],
  flushIconImages: async () => true,

  // ---- 書き込み系: 偽の器の中で本当に反映する (再描画の確認のため) ----
  // 本物の wallpaper:set と同じ契約。ここを空にしておくと、画面が
  // 「土台を見ているか重ねを見ているか」を確かめられない (どちらも同じに見えてしまう)
  setWallpaper: async (patch, displayIndex) => {
    if (displayIndex == null) Object.assign(CFG.wallpapers.default, patch);
    else {
      const k = String(displayIndex);
      CFG.wallpapers.byDisplay[k] = Object.assign({}, CFG.wallpapers.default, CFG.wallpapers.byDisplay[k] || {}, patch);
    }
    return true;
  },
  addWidget: async (type) => {
    const w = { id: 'w-new-' + type, type, display: 0, x: 50, y: 50, size: 20, color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {} };
    CFG.widgets.push(w);
    return w;
  },
  removeWidget: async (id) => { CFG.widgets = CFG.widgets.filter(w => w.id !== id); return true; },
  updateWidget: async (id, patch) => {
    const w = CFG.widgets.find(x => x.id === id);
    if (w) { const { options, ...rest } = patch || {}; Object.assign(w, rest); if (options) Object.assign(w.options = w.options || {}, options); }
    return true;
  },
  saveIcons: async (name, hidden) => {
    // 本物の saveIconSnapshot と同じ契約: 同名は「その場で上書き」(作成ではない)。
    // 位置と hidden は入れ替わり、条件・壁紙・連動は持ち越す
    const clean = name || '無名';
    const idx = CFG.settings.iconLayouts.findIndex(l => l.name === clean);
    const prev = idx >= 0 ? CFG.settings.iconLayouts[idx] : null;
    const entry = {
      name: clean, savedAt: 9, count: ICON_NAMES.length,
      hidden: Array.isArray(hidden) ? hidden.filter(Boolean) : [],
      linkWidgets: !!(prev && prev.linkWidgets),
      widgetsOn: (prev && prev.widgetsOn) ? prev.widgetsOn.slice() : [],
      hasWallpaper: !!(prev && prev.hasWallpaper),
      trigger: (prev && prev.trigger) ? JSON.parse(JSON.stringify(prev.trigger)) : null,
      on: !!(prev && prev.on),
    };
    if (idx >= 0) CFG.settings.iconLayouts[idx] = entry;
    else CFG.settings.iconLayouts.push(entry);
    return { ok: true, count: ICON_NAMES.length, name: clean };
  },
  renameIconMode: async (from, to) => {
    const l = CFG.settings.iconLayouts.find(x => x.name === from);
    if (!l) return { ok: false, msg: 'なし' };
    l.name = to;
    return { ok: true, name: to };
  },
  removeIconSnapshot: async (name) => {
    CFG.settings.iconLayouts = CFG.settings.iconLayouts.filter(l => l.name !== name);
    return { ok: true };
  },
  updateIconMode: async (name, patch) => {
    const l = CFG.settings.iconLayouts.find(x => x.name === name);
    if (l && patch) { if (patch.hidden) l.hidden = patch.hidden; if ('linkWidgets' in patch) l.linkWidgets = patch.linkWidgets; if (patch.widgetsOn) l.widgetsOn = patch.widgetsOn; }
    return { ok: true, count: ICON_NAMES.length, hidden: (patch && patch.hidden || []).length, repaired: 0 };
  },
  setIconTrigger: async (name, trigger) => {
    const l = CFG.settings.iconLayouts.find(x => x.name === name);
    if (l) l.trigger = trigger;
    return { ok: true };
  },
  setIconModeOn: async (name, on) => {
    const l = CFG.settings.iconLayouts.find(x => x.name === name);
    if (l) { l.on = !!on; if (on) l.trigger = null; }
    // 本物の setModeOn と同じ排他: 他にオンのモードがあれば落として名指しで返す。
    // 画面はこの名前をトーストに出す約束 (黙ってオフにしない)
    const turnedOff = [];
    if (on) {
      for (const o of CFG.settings.iconLayouts) {
        if (o !== l && o.on === true) { o.on = false; turnedOff.push(o.name); }
      }
    }
    return { ok: true, on: !!on, turnedOff };
  },
  setIconWallpaper: async (name, remember) => {
    const l = CFG.settings.iconLayouts.find(x => x.name === name);
    if (l) l.hasWallpaper = !!remember;
    return { ok: true, remembered: !!remember };
  },
  restoreIcons: async () => ({ ok: true, moved: 4, hidden: 1, skipped: 0, rescued: 0, celled: 0, widgets: 0, widgetsRestored: 0, turnedOff: [] }),
  reorderIconModes: async () => ({ ok: true }),
  setIconAlias: async (name, label) => {
    // 本物の icons:setAlias と同じ契約。空文字なら消す、40 字まで、前後の空白は落とす
    const key = String(name || '');
    if (!key) return { ok: false };
    const txt = String(label || '').trim().slice(0, 40);
    CFG.settings.iconAlias = CFG.settings.iconAlias || {};
    if (txt) CFG.settings.iconAlias[key] = txt; else delete CFG.settings.iconAlias[key];
    return { ok: true, label: txt };
  },
  showAllWidgets: async () => { for (const w of CFG.widgets) w.off = false; return { ok: true, shown: 1 }; },
  showAllIcons: async () => ({ ok: true, restored: 0, placed: 0 }),
  setSettings: async (patch) => { Object.assign(CFG.settings, patch); return true; },
  setMica: async (on) => ({ ok: true, supported: true, on: !!on }),
  saveLayout: async () => [],
  applyLayout: async () => true,
  checkUpdate: async () => ({ state: 'idle' }),
};

contextBridge.exposeInMainWorld('__test', {
  calls: () => calls.slice(),
  reset: () => { calls.length = 0; },
  find: (needle) => calls.filter(c => c.includes(needle)),
  // 重ね (モードが効いている状態) の入り切りと、main からの配信の再現
  overlay: (v) => { CFG.__overlaid = !!v; },
  fireMica: (on) => H.mica && H.mica({ on: !!on }),
  fireConfig: () => H.config && H.config({
    config: CFG.__overlaid ? OVERLAID : CFG,
    base: CFG,
    activeModes: CFG.__overlaid ? ['重ね中モード'] : [],
    wallpaperModeName: CFG.__overlaid ? '重ね中モード' : '',
  }),
});
`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uicheck-'));
  const file = path.join(dir, 'preload.js');
  fs.writeFileSync(file, body + '\nconst api = {\n' + lines.join('\n') + '\n};\ncontextBridge.exposeInMainWorld(\'api\', api);\n');
  return file;
}

// ---------------- 操作の実行 ----------------
app.on('window-all-closed', () => {});
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 120000).unref();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100, height: 900, show: false,
    webPreferences: { preload: buildPreload(), contextIsolation: true },
  });
  const pageErrors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3 || /Uncaught|TypeError|ReferenceError|内部エラー/.test(String(message))) pageErrors.push(String(message).slice(0, 160));
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/settings/index.html'),
    { query: { micaok: '1', mica: '1' } });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // step(): 1 手順 = 1 ページ内スクリプト。中で例外が出ても検査全体は続ける。
  // ページ側には wf() (条件が満たされるまで待つ) を渡す — 固定 sleep のタイミング勝負にしない
  const step = async (label, code) => {
    try {
      return await win.webContents.executeJavaScript(`(async () => {
        const wf = async (fn, ms = 6000) => {
          const t0 = Date.now();
          for (;;) {
            let v; try { v = fn(); } catch (_) {}
            if (v) return v;
            if (Date.now() - t0 > ms) throw new Error('待ちきれず: ' + fn.toString().slice(0, 90));
            await new Promise(r => setTimeout(r, 100));
          }
        };
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        ${code}
      })()`);
    } catch (err) {
      ok(label, false, String(err && err.message || err).slice(0, 180));
      return undefined;
    }
  };
  const reset = () => win.webContents.executeJavaScript('window.__test.reset()');
  const fired = async (needle) => (await win.webContents.executeJavaScript(`window.__test.find(${JSON.stringify(needle)})`)).length > 0;
  const tab = async (name) => {
    await step('タブ ' + name, `
      (await wf(() => document.querySelector('.nav-item[data-tab="${name}"]'))).click();
      await wf(() => document.querySelector('#tab-${name}.active'));
      return true;`);
    await sleep(400);
  };

  await sleep(1000);
  await step('ようこそを閉じる', `
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '自分でゼロから作る');
    if (b) b.click(); return true;`);

  // ================= モードタブ =================
  await tab('icons');
  ok('モードタブが描けた', !!await step('モード一覧', `
    return await wf(() => document.querySelectorAll('#ic-modes .ic-mode').length >= 2);`));

  // 1. 新規作成 (ボタン)
  await reset();
  await step('作成', `
    (await wf(() => document.getElementById('ic-name'))).value = '新モード';
    document.getElementById('ic-save').click();
    await wf(() => [...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === '新モード'));
    return true;`);
  ok('作成: saveIcons が飛ぶ', await fired('saveIcons("新モード"'));
  ok('作成: カードが増える', !!await step('作成の反映', `
    return [...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === '新モード');`));

  // 2. Enter でも作成
  await reset();
  await step('作成(Enter)', `
    const i = document.getElementById('ic-name');
    i.value = 'Enterモード';
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wf(() => [...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === 'Enterモード'));
    return true;`);
  ok('作成(Enter): saveIcons が飛ぶ', await fired('saveIcons("Enterモード"'));

  // 開いているカードを対象に操作するヘルパ (閉じていたら開く)
  const inCard = (name, code) => `
    let card = [...document.querySelectorAll('.ic-mode.open')]
      .find(c => c.querySelector('.ic-mode-name').textContent === '${name}');
    if (!card) {
      (await wf(() => [...document.querySelectorAll('.ic-mode-head')]
        .find(h => h.querySelector('.ic-mode-name').textContent === '${name}'))).click();
      card = await wf(() => [...document.querySelectorAll('.ic-mode.open')]
        .find(c => c.querySelector('.ic-mode-name').textContent === '${name}'));
    }
    ${code}`;

  // 3. カードを開く
  ok('カードが開く', !!await step('カードを開く', inCard('モードA', 'return true;')));

  // 4. 名前の変更
  await reset();
  await step('名前変更', inCard('モードA', `
    [...card.querySelectorAll('input[type=text]')][0].value = 'モードA改';
    [...card.querySelectorAll('.btn')].find(b => b.textContent === '名前を変える').click();
    await wf(() => [...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === 'モードA改'));
    return true;`));
  ok('名前変更: renameIconMode が飛ぶ', await fired('renameIconMode("モードA","モードA改")'));
  ok('名前変更: 見出しが変わる', !!await step('名前の反映', `
    return [...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === 'モードA改');`));

  // 5. 動作の切り替え (常に -> アプリ条件)
  await reset();
  await step('動作=常に', inCard('モードA改', `
    const sel = [...card.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'always'));
    sel.value = 'always'; sel.dispatchEvent(new Event('change'));
    await sleep(500); return true;`));
  ok('動作=常に: setOn(true)', await fired('setIconModeOn("モードA改",true)'));
  await reset();
  await step('動作=アプリ条件', inCard('モードA改', `
    const sel = [...card.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'always'));
    sel.value = 'app'; sel.dispatchEvent(new Event('change'));
    await sleep(500); return true;`));
  ok('動作=アプリ条件: setTrigger(app)', await fired('setIconTrigger("モードA改",{"type":"app"'));
  ok('アプリ名の入力欄が出る', !!await step('アプリ名欄', inCard('モードA改', `
    return await wf(() => [...card.querySelectorAll('input[type=text]')]
      .find(i => i.placeholder && i.placeholder.includes('chrome')));`)));

  // 6. アプリ名の入力
  await reset();
  await step('アプリ名を入れる', inCard('モードA改', `
    const i = await wf(() => [...card.querySelectorAll('input[type=text]')]
      .find(x => x.placeholder && x.placeholder.includes('chrome')));
    i.value = 'game.exe'; i.dispatchEvent(new Event('change'));
    await sleep(500); return true;`));
  ok('アプリ名: setTrigger に入る', await fired('game.exe'));

  // 7. 壁紙も覚える
  await reset();
  await step('壁紙も覚える', inCard('モードA改', `
    const lab = await wf(() => [...card.querySelectorAll('label')].find(l => l.textContent.includes('壁紙も覚える')));
    lab.querySelector('input').click();
    await sleep(500); return true;`));
  ok('壁紙も覚える: setIconWallpaper', await fired('setIconWallpaper("モードA改"'));

  // 8. アイコンのチェック (行を作り直さずその場で切り替わるか)
  const flip = await step('チェック切替', inCard('モードA改', `
    const row = await wf(() => [...card.querySelectorAll('.ic-item:not(.w-item)')].find(r => !r.classList.contains('hidden-on')));
    row.dataset.p = '1';
    row.click();
    await sleep(300);
    const same = document.querySelector('[data-p="1"]');
    return { same: !!same, flipped: !!same && same.classList.contains('hidden-on') };`));
  ok('チェック: 同じ行のまま切り替わる', !!(flip && flip.same && flip.flipped), flip);

  // 9. この内容で保存
  await reset();
  await step('この内容で保存', inCard('モードA改', `
    [...card.querySelectorAll('.btn')].find(b => b.textContent === 'この内容で保存').click();
    await sleep(600); return true;`));
  ok('保存: updateIconMode が飛ぶ', await fired('updateIconMode("モードA改"'));

  // 10. このモードを適用
  await reset();
  await step('このモードを適用', inCard('モードA改', `
    [...card.querySelectorAll('.btn')].find(b => b.textContent === 'このモードを適用').click();
    await sleep(600); return true;`));
  ok('適用: restoreIcons が飛ぶ', await fired('restoreIcons("モードA改"'));

  // 11. 削除 (confirm は自動で承認)
  await reset();
  await step('削除', 'window.confirm = () => true;' + inCard('Enterモード', `
    [...card.querySelectorAll('.btn')].find(b => b.textContent === '削除').click();
    await wf(() => ![...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === 'Enterモード'));
    return true;`));
  ok('削除: removeIconSnapshot が飛ぶ', await fired('removeIconSnapshot("Enterモード")'));
  ok('削除: カードが消える', !!await step('削除の反映', `
    return ![...document.querySelectorAll('.ic-mode-name')].some(n => n.textContent === 'Enterモード');`));

  // ================= ウィジェットタブ =================
  await tab('widgets');
  const cardCount = await step('ウィジェット一覧', `
    await wf(() => document.querySelectorAll('#widget-list .widget-card').length >= 5);
    return document.querySelectorAll('#widget-list .widget-card').length;`);
  ok('ウィジェット一覧が描けた', !!cardCount, cardCount);

  // 12. 追加
  await reset();
  await step('追加', `
    (await wf(() => document.querySelector('#add-row .add-btn'))).click();
    await wf(() => document.querySelectorAll('#widget-list .widget-card').length > ${cardCount || 0});
    return true;`);
  ok('追加: addWidget が飛ぶ', await fired('addWidget('));
  ok('追加: カードが増える', !!await step('追加の反映', `
    return document.querySelectorAll('#widget-list .widget-card').length > ${cardCount || 0};`));

  // 13. しまう (電源ボタン)
  await reset();
  await step('しまう', `
    (await wf(() => document.querySelector('#widget-list .widget-card .wc-off'))).click();
    await sleep(500); return true;`);
  ok('しまう: updateWidget({off}) が飛ぶ', await fired('"off":'));

  // 14. 名前 (鉛筆)
  await reset();
  await step('呼び名', `
    const card = await wf(() => document.querySelector('#widget-list .widget-card'));
    card.querySelector('.wc-pen').click();
    const i = await wf(() => card.querySelector('.wc-name-in'));
    i.value = '呼び名テスト';
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(500); return true;`);
  ok('呼び名: updateWidget({name}) が飛ぶ', await fired('呼び名テスト'));

  // 15. 絞り込み
  const shown = await step('絞り込み', `
    const f = await wf(() => document.getElementById('widget-filter'));
    f.value = 'メモ'; f.dispatchEvent(new Event('input'));
    await sleep(300);
    const n = [...document.querySelectorAll('#widget-list .widget-card')].filter(c => c.style.display !== 'none').length;
    f.value = ''; f.dispatchEvent(new Event('input'));
    return n;`);
  ok('絞り込み: 1 件になる', shown === 1, shown);

  // 16. フォルダのリンク追加
  await reset();
  await step('リンク追加', `
    const folder = await wf(() => [...document.querySelectorAll('#widget-list .widget-card')]
      .find(c => c.textContent.includes('フォルダ')));
    if (!folder.classList.contains('open')) folder.querySelector('.wc-head').click();
    const inp = await wf(() => [...document.querySelectorAll('#widget-list input')].find(i => i.placeholder === 'https://example.com'));
    inp.value = 'github.com';
    [...document.querySelectorAll('#widget-list .btn')].find(b => b.textContent === 'リンクを追加').click();
    await sleep(400); return true;`);
  ok('リンク追加: items が更新される', await fired('"url":"https://github.com'));

  // ================= 直したバグの再発防止 =================
  // 17. 既存モードと同じ名前で「作成」しても、黙って上書きしない
  await tab('icons');
  await reset();
  await step('同名作成', `
    const i = await wf(() => document.getElementById('ic-name'));
    i.value = 'モードB';
    document.getElementById('ic-save').click();
    await sleep(600); return true;`);
  ok('同名作成: saveIcons を呼ばない', !(await fired('saveIcons("モードB"')));
  ok('同名作成: 断りを出す', !!await step('断りの確認', `
    const el = document.getElementById('ic-status');
    return !!(el && el.textContent.includes('既にあります'));`));

  // 18. 条件の値 (アプリ名・時刻) を書き換えても、入力欄が作り直されない。
  //     作り直されると、隣の欄へタブ移動して入力中の打鍵が消える
  await step('時間帯にする', inCard('モードA改', `
    const sel = [...card.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'always'));
    sel.value = 'time'; sel.dispatchEvent(new Event('change'));
    await sleep(700); return true;`));
  await reset();
  const keep = await step('時刻編集中のフォーカス', inCard('モードA改', `
    const box = [...card.querySelectorAll('input[type=text]')].filter(i => i.placeholder === '22:00' || i.placeholder === '06:00');
    if (box.length < 2) return { skip: '時刻欄なし', n: box.length };
    const [from, to] = box;
    from.value = '23:00';
    to.dataset.p2 = '1';
    to.focus();
    from.dispatchEvent(new Event('change'));   // 「from を確定して to へタブ移動」の再現
    await sleep(900);
    const still = document.querySelector('[data-p2="1"]');
    return { alive: !!still, focused: still === document.activeElement };`));
  ok('時刻編集: 隣の入力欄が生き残る', !!(keep && keep.alive), keep);
  ok('時刻編集: フォーカスも保つ', !!(keep && keep.focused), keep);
  ok('時刻編集: setTrigger は飛ぶ', await fired('setIconTrigger("モードA改"'));

  // 18b. from を確定してから to も確定すると、両方の変更が残る。
  //      再描画をやめた副作用で、2 つ目の送信が古い trg を引きずって
  //      1 つ目の変更を巻き戻す事故があった (from=23:00 の直後に to を確定すると、
  //      to の送信に古い from が道連れにされて 23:00 が消えていた)
  await reset();
  await step('to も確定する', inCard('モードA改', `
    const box = [...card.querySelectorAll('input[type=text]')].filter(i => i.placeholder === '22:00' || i.placeholder === '06:00');
    const to = box[1];
    to.value = '07:30';
    to.dispatchEvent(new Event('change'));
    await sleep(600); return true;`));
  const lastSetTrigger = (await win.webContents.executeJavaScript(`window.__test.find('setIconTrigger("モードA改"')`)).pop();
  ok('時刻編集: to の確定に from の変更が残る', !!(lastSetTrigger && lastSetTrigger.includes('23:00')), lastSetTrigger);
  ok('時刻編集: to 自体も反映される', !!(lastSetTrigger && lastSetTrigger.includes('07:30')), lastSetTrigger);

  // 19. 排他の知らせが実際に画面へ出る (黙ってオフにしない約束)。
  //     先に「モードB」を常にオンにしてから「モードA改」を常にオンにすると、
  //     B が落ちるので、その名前がトーストに出るはず
  await step('B を常にオン', inCard('モードB', `
    const sel = [...card.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'always'));
    sel.value = 'always'; sel.dispatchEvent(new Event('change'));
    await sleep(700); return true;`));
  await reset();
  await step('A改 を常にオン', inCard('モードA改', `
    const sel = [...card.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'always'));
    sel.value = 'always'; sel.dispatchEvent(new Event('change'));
    await sleep(800); return true;`));
  ok('排他: オフにした名前を知らせる', !!await step('トーストの確認', `
    const el = document.getElementById('toast');
    return !!(el && el.textContent.includes('モードB') && el.textContent.includes('オフにしました'));`));

  // ================= 他タブが素で描けるか =================
  await tab('wallpaper');
  ok('壁紙タブが描けた', !!await step('壁紙タブ', `return !!document.querySelector('#tab-wallpaper.active');`));
  // 23. ウィジェットの削除 (取り返しがつかない操作なので、狙ったものだけ消えること)
  await tab('widgets');
  const del = await step('削除', `
    const cards = [...document.querySelectorAll('#widget-list .widget-card')];
    const before = cards.length;
    const target = cards[1];
    const others = cards.filter(c => c !== target).length;
    target.querySelector('.wc-del').click();
    await wf(() => document.querySelectorAll('#widget-list .widget-card').length === before - 1);
    return { before, after: document.querySelectorAll('#widget-list .widget-card').length, others };`);
  ok('削除: 1 枚だけ減る', !!(del && del.after === del.before - 1), del);
  ok('削除: removeWidget が飛ぶ', await fired('removeWidget('));

  // 24. アイコンの呼び名 (実際の名前は変えない。変えると保存済みモードが迷子になる)
  await tab('icons');
  await reset();
  const alias = await step('呼び名を付ける', inCard('モードA改', `
    const row = await wf(() => card.querySelector('.ic-item:not(.w-item)'));
    const real = row.querySelector('.nm').textContent;
    row.querySelector('.ic-edit').click();
    const inp = await wf(() => document.querySelector('.ic-alias-in'));
    inp.value = 'よびな';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(700);
    return { real };`));
  ok('呼び名: setIconAlias がちょうど 1 回',
    (await win.webContents.executeJavaScript(`window.__test.find('setIconAlias(')`)).length === 1);
  ok('呼び名: 実際の名前で保存する',
    await fired('setIconAlias("' + (alias && alias.real) + '","よびな")'), alias);
  ok('呼び名: 画面に反映される', !!await step('呼び名の表示', `
    return [...document.querySelectorAll('.ic-item .nm')].some(n => n.textContent.includes('よびな'));`));

  // 25. F5 で読み直しても、どのタブも生きている (途中で止まらない)
  await reset();
  await step('F5', `
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
    await sleep(1500); return true;`);
  ok('F5: 読み直しの IPC が飛ぶ', await fired('flushIconImages'));
  ok('F5: モード一覧が描き直される', !!await step('F5 後のモード', `
    return document.querySelectorAll('#ic-modes .ic-mode').length > 0;`));
  ok('F5: 知らせが出る', !!await step('F5 のトースト', `
    const el = document.getElementById('toast');
    return !!(el && el.textContent.includes('読み直しました'));`));
  await tab('widgets');
  ok('F5: ウィジェット一覧も生きている', !!await step('F5 後のウィジェット', `
    return document.querySelectorAll('#widget-list .widget-card').length > 0;`));

  // ---- 壁紙タブ: つまみの宛先と、重ね中の編集先 ----
  // 20. 暗さのつまみが保存まで届く
  await reset();
  await step('暗さを変える', `
    const el = await wf(() => document.getElementById('wp-dim'));
    el.value = '40';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await sleep(400); return true;`);
  ok('暗さ: setWallpaper が飛ぶ', await fired('"dim":40'));

  // 21. モニタを選ぶと、そのモニタ宛てになる (すべて共通を書き換えない)
  const chips = await step('モニタの選択', `
    const row = document.getElementById('wp-target-chips');
    return row ? [...row.querySelectorAll('button')].map(b => b.textContent) : [];`);
  ok('モニタの選択肢が出る', Array.isArray(chips) && chips.length >= 2, chips);
  await reset();
  await step('2 枚目を選んでぼかす', `
    const row = document.getElementById('wp-target-chips');
    [...row.querySelectorAll('button')][1].click();
    await sleep(300);
    const el = document.getElementById('wp-blur');
    el.value = '7';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await sleep(400); return true;`);
  const c21 = await win.webContents.executeJavaScript(`window.__test.find('setWallpaper(')`);
  ok('モニタ指定つきで飛ぶ', !!(c21[0] && /,\s*\d+\)$/.test(c21[0])), c21[0]);
  await step('すべて共通へ戻す', `
    const row = document.getElementById('wp-target-chips');
    [...row.querySelectorAll('button')][0].click();
    await sleep(300); return true;`);

  // 22. 重ねが効いている間は、編集先が土台であることを知らせる。
  //     知らせが無いと「変えたのに変わらない」に見える
  await step('重ねを効かせる', `
    window.__test.overlay(true); window.__test.fireConfig();
    await sleep(700); return true;`);
  ok('重ね中は編集先の説明が出る', !!await step('知らせの確認', `
    const el = document.getElementById('wp-overlay-note');
    return !!(el && el.style.display !== 'none' && el.textContent.includes('重ね中モード'));`));
  const dimNow = await step('土台編集の確認', `
    // 重ねの壁紙は dim 7。土台は 40。7 を掴んでいたら取り違えている
    const el = document.getElementById('wp-dim');
    return el && el.value;`);
  ok('重ね中でも画面は土台を見ている', Number(dimNow) === 40, { dim: dimNow });
  await step('重ねを外す', `
    window.__test.overlay(false); window.__test.fireConfig();
    await sleep(600); return true;`);
  ok('重ねが外れたら知らせも消える', !!await step('知らせが消える', `
    const el = document.getElementById('wp-overlay-note');
    return !el || el.style.display === 'none';`));

  await tab('scenes');
  ok('シーンタブは案内だけ', !!await step('シーンタブ', `
    return document.querySelector('#tab-scenes').textContent.includes('統合されました');`));
  await tab('general');
  ok('設定タブが描けた', !!await step('設定タブ', `return !!document.querySelector('#tab-general.active');`));

  // ================= この画面の見た目 (明暗・アクセント色) =================
  // 26. ダークへ切り替えると、html の dataset とトースト経由の保存の両方が動く
  await reset();
  const darkR = await step('ダークへ', `
    const b = document.querySelector('#theme-mode-seg button[data-mode="dark"]');
    b.click();
    return { theme: document.documentElement.dataset.theme, on: b.classList.contains('on') };`);
  ok('ダーク: html に反映される', !!(darkR && darkR.theme === 'dark'), darkR);
  ok('ダーク: 選んだボタンが光る', !!(darkR && darkR.on), darkR);
  ok('ダーク: setSettings が飛ぶ', await fired('setSettings({"uiTheme":"dark"}'));

  // 27. ライトへ戻す (セグメントは排他で、片方だけ光る)
  await reset();
  const lightR = await step('ライトへ戻す', `
    document.querySelector('#theme-mode-seg button[data-mode="light"]').click();
    const seg = document.getElementById('theme-mode-seg');
    return {
      theme: document.documentElement.dataset.theme,
      onCount: seg.querySelectorAll('button.on').length,
    };`);
  ok('ライトへ戻せる', !!(lightR && lightR.theme === 'light'), lightR);
  ok('セグメントは常にどちらか 1 つだけ光る', lightR && lightR.onCount === 1, lightR);

  // 28. アクセント色のスウォッチを選ぶと、html に反映され保存される
  await reset();
  const purpleR = await step('紫を選ぶ', `
    const b = document.querySelector('.accent-sw[data-accent="purple"]');
    b.click();
    return { accent: document.documentElement.dataset.accent, on: b.classList.contains('on') };`);
  ok('アクセント色: html に反映される', !!(purpleR && purpleR.accent === 'purple'), purpleR);
  ok('アクセント色: 選んだスウォッチが光る', !!(purpleR && purpleR.on), purpleR);
  ok('アクセント色: setSettings が飛ぶ', await fired('setSettings({"uiAccent":"purple"}'));

  // 29. ARGB も選べて、他のスウォッチの光が消える (排他)
  await reset();
  const argbR = await step('ARGB を選ぶ', `
    document.querySelector('.accent-sw-argb').click();
    const wrap = document.getElementById('accent-swatches');
    return {
      accent: document.documentElement.dataset.accent,
      onCount: wrap.querySelectorAll('button.on').length,
    };`);
  ok('ARGB を選べる', !!(argbR && argbR.accent === 'argb'), argbR);
  ok('ARGB でも光るのは 1 つだけ', argbR && argbR.onCount === 1, argbR);

  // 30. Mica: 使える環境なら項目が出て、初期状態は「入」
  const micaInit = await step('Mica の初期状態', `
    const row = document.getElementById('mica-row');
    return {
      shown: !!(row && row.style.display !== 'none'),
      checked: !!document.getElementById('ui-mica').checked,
      attr: document.documentElement.dataset.mica || '',
    };`);
  ok('Mica: 使える環境では項目が出る', !!(micaInit && micaInit.shown), micaInit);
  ok('Mica: 入っていれば入で表示される', !!(micaInit && micaInit.checked && micaInit.attr === 'on'), micaInit);

  // 31. 切ると main へ伝わる
  await reset();
  await step('Mica を切る', `
    const c = document.getElementById('ui-mica');
    c.checked = false;
    c.dispatchEvent(new Event('change'));
    await sleep(400); return true;`);
  ok('Mica: 切ると setMica(false) が飛ぶ', await fired('setMica(false)'));

  // 32. main からの通知で、CSS 側の地の譲り方もそろう
  const micaOff = await step('main から切った通知', `
    window.__test.fireMica(false);
    await sleep(200);
    return { attr: document.documentElement.dataset.mica || '', checked: document.getElementById('ui-mica').checked };`);
  ok('Mica: 切ると地を譲るのをやめる', !!(micaOff && micaOff.attr === '' && micaOff.checked === false), micaOff);
  const micaOn2 = await step('main から入れた通知', `
    window.__test.fireMica(true);
    await sleep(200);
    return { attr: document.documentElement.dataset.mica || '', checked: document.getElementById('ui-mica').checked };`);
  ok('Mica: 入れ直すと地を譲る', !!(micaOn2 && micaOn2.attr === 'on' && micaOn2.checked === true), micaOn2);

  // ================= 総合: レンダラ例外ゼロ =================
  ok('レンダラ例外ゼロ', pageErrors.length === 0, pageErrors.slice(0, 4));

  console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `UI 検査: 全 ${pass} 件 PASS`);
  if (bad.length) for (const b of bad) console.log('  -', b);
  app.exit(fail ? 1 : 0);
}).catch((e) => { console.error('BOOT ERR', e); app.exit(3); });
