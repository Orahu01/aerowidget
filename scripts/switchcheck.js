// 切り替えウィジェット (デスクトップ上のモード切替ボタン) の検査。
//
//   実行: npx electron scripts/switchcheck.js
//
// このボタンは、実際にデスクトップのアイコンを並べ替える唯一の面。
// 押し間違いがそのままユーザーのデスクトップを壊すので、いちばん慎重に見る。
// 検査するのは「押したら何が飛ぶか」だけで、アイコンには一切触れない
// (main 側の applyIconMode は偽物に差し替えてある)。
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
  bad.push(label + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 200) : ''));
  console.log('✗', label, detail !== undefined ? JSON.stringify(detail).slice(0, 200) : '');
  return false;
};

const WIDGET = {
  id: 'sw1', type: 'modeswitch', display: 0, x: 50, y: 92, size: 13, weight: 500,
  color: '#fff', opacity: 1, shadow: 'none', letterSpacing: 1, font: 'Segoe UI',
  options: { items: [], w: 300, h: 46, bgOpacity: 0.55, vertical: false },
};

function buildPreload() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-switchcheck-'));
  const file = path.join(dir, 'preload.js');
  fs.writeFileSync(file, `
'use strict';
const { contextBridge } = require('electron');
const calls = [];
const H = {};
// main が持っているモードの一覧と、いま実際に当たっているモード
let MODES = ['通常', '仕事', 'ゲーム'];
let CURRENT = '仕事';
contextBridge.exposeInMainWorld('fw', {
  id: ${JSON.stringify(WIDGET.id)},
  getState: async () => ({ widget: ${JSON.stringify(WIDGET)}, fontsCss: '', osLocale: 'ja' }),
  listIconModes: async () => { calls.push('list'); return MODES.slice(); },
  currentIconMode: async () => { calls.push('now'); return CURRENT; },
  applyIconMode: async (n) => { calls.push('apply:' + n); CURRENT = n; return true; },
  // 旧レイアウト側 (統合後は使わないはず。呼ばれたら記録して気づけるように)
  listLayouts: async () => { calls.push('LAYOUT-list'); return ['旧レイアウト']; },
  currentLayout: async () => { calls.push('LAYOUT-now'); return ''; },
  applyLayout: async (n) => { calls.push('LAYOUT-apply:' + n); return true; },
  getFontsCss: async () => '',
  onWidget: (cb) => { H.widget = cb; },
  onConfig: (cb) => { H.config = cb; },
  onFontsChanged: () => {},
});
contextBridge.exposeInMainWorld('__test', {
  calls: () => calls.slice(),
  reset: () => { calls.length = 0; },
  setModes: (m) => { MODES = m; },
  current: () => CURRENT,
  sendWidget: (w) => H.widget && H.widget(w),
  sendConfig: (env) => H.config && H.config(env),
});
`);
  return file;
}

app.on('window-all-closed', () => {});
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 90000).unref();

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    width: 400, height: 120, show: false,
    webPreferences: { preload: buildPreload(), contextIsolation: true },
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3) errors.push(String(message).slice(0, 160));
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/switcher/index.html'));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const calls = () => win.webContents.executeJavaScript('window.__test.calls()');
  const reset = () => win.webContents.executeJavaScript('window.__test.reset()');
  const labels = () => js(`return [...document.querySelectorAll('#buttons button')].map(b => b.textContent);`);
  await sleep(600);

  // 1. ウィジェットが配られたらボタンが並ぶ
  await js(`window.__test.sendWidget(${JSON.stringify(WIDGET)}); return true;`);
  await sleep(500);
  const first = await labels();
  ok('保存済みモードがボタンになる', JSON.stringify(first) === JSON.stringify(['通常', '仕事', 'ゲーム']), first);

  // 2. いま当たっているものが光る (1 つだけ)
  const lit = await js(`return [...document.querySelectorAll('#buttons button.active')].map(b => b.textContent);`);
  ok('いまのモードだけ光る', JSON.stringify(lit) === JSON.stringify(['仕事']), lit);

  // 3. 統合後はレイアウト側の API を一切使わない
  const all = await calls();
  ok('旧レイアウトの API を呼ばない', !all.some(c => c.startsWith('LAYOUT-')), all);

  // 4. 別のモードを押したら、そのモードがちょうど 1 回だけ当たる
  await reset();
  await js(`[...document.querySelectorAll('#buttons button')].find(b => b.textContent === 'ゲーム').click(); return true;`);
  await sleep(500);
  const c4 = await calls();
  ok('押したモードが 1 回だけ当たる', c4.filter(c => c === 'apply:ゲーム').length === 1, c4);
  ok('他のモードは当たらない', !c4.some(c => c.startsWith('apply:') && c !== 'apply:ゲーム'), c4);
  const lit4 = await js(`return [...document.querySelectorAll('#buttons button.active')].map(b => b.textContent);`);
  ok('押したモードに光が移る', JSON.stringify(lit4) === JSON.stringify(['ゲーム']), lit4);

  // 5. 光っているボタンをもう一度押しても、何も起きない。
  //    ここが漏れると、押すたびにデスクトップが並び替わる
  await reset();
  await js(`[...document.querySelectorAll('#buttons button')].find(b => b.textContent === 'ゲーム').click(); return true;`);
  await sleep(400);
  const c5 = await calls();
  ok('光っているボタンは何も起こさない', !c5.some(c => c.startsWith('apply:')), c5);

  // 6. 並べるモードを指定したら、その順で、実在するものだけ出す
  await reset();
  await js(`window.__test.sendWidget(${JSON.stringify({ ...WIDGET, options: { ...WIDGET.options, items: ['ゲーム', '存在しない', '通常'] } })}); return true;`);
  await sleep(500);
  const c6 = await labels();
  ok('指定した順に並ぶ', JSON.stringify(c6) === JSON.stringify(['ゲーム', '通常']), c6);
  ok('存在しない名前は出さない', !c6.includes('存在しない'), c6);

  // 7. モードが 1 つも無ければ、案内を出す (空のボタン列にしない)
  await js(`window.__test.setModes([]); window.__test.sendConfig({ config: { widgets: [], settings: {} }, osLocale: 'ja' }); return true;`);
  await sleep(500);
  const empty = await js(`const e = document.getElementById('empty'); return e ? e.textContent : '';`);
  ok('モードが無いときは案内を出す', /モード/.test(empty), empty);

  // 8. 全体を通して例外ゼロ
  ok('レンダラ例外ゼロ', errors.length === 0, errors.slice(0, 4));

  console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `切り替えボタン検査: 全 ${pass} 件 PASS`);
  if (bad.length) for (const b of bad) console.log('  -', b);
  app.exit(fail ? 1 : 0);
}).catch((e) => { console.error('BOOT ERR', e); app.exit(3); });
