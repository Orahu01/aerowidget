// 壁紙レンダラ (デスクトップに実際に描かれる面) の検査。
//
//   実行: npx electron scripts/wallcheck.js
//
// この 1300 行のレンダラは、これまでどの検査も実行していなかった。
// 「再起動したらウィジェットが全部消えた」(v5.9.22) も「モードで隠したウィジェットが
// 編集中も触れない」(v5.9.29) も、ここの数行が原因だった。
// 見るのは 3 点:
//   1. 素の構成で例外ゼロ・想定どおりの個数が描かれる
//   2. どのモニタが担当するか (再起動で変わる displayId ではなく鍵で判定する)
//   3. モードの重ねと配置編集の関係 (隠れていても編集はできる)
//
// 実際のウィンドウ配置や WorkerW 貼り付けはしない (offscreen で DOM だけ見る)。
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

// ---- 検査に使う構成 ----
// w1/w2 はこの画面 (鍵 MON-A|2560x1440)、w3 は別画面、w4 はしまってある、
// w5 は鍵を持たず番号だけ (古い設定からの移行途中を模す)
const WALL = { default: { type: 'custom', value: { kind: 'solid', colors: ['#141821'] }, dim: 0, blur: 0 }, byDisplay: {} };
const mkW = (id, extra) => ({
  id, type: 'clock', display: 0, x: 50, y: 30, size: 40, weight: 200, color: '#fff',
  opacity: 1, shadow: 'none', letterSpacing: 0, font: 'Segoe UI', options: {}, ...extra,
});
const BASE = {
  wallpapers: WALL,
  widgets: [
    mkW('w1', { displayKey: 'MON-A|2560x1440' }),
    mkW('w2', { displayKey: 'MON-A|2560x1440', y: 60 }),
    mkW('w3', { displayKey: 'MON-B|1440x2560' }),
    mkW('w4', { displayKey: 'MON-A|2560x1440', y: 80, off: true }),
    mkW('w5', { display: 0, y: 90 }),          // 鍵なし = 番号で判定
  ],
  settings: { language: 'ja', overlay: {}, iconLayouts: [] },
};
// 重ねの結果: モード「集中」が w1 だけ表示する
const COMPOSED = {
  ...BASE,
  widgets: BASE.widgets.map(w => ({ ...w, off: w.id !== 'w1' })),
};

function buildPreload() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wallcheck-'));
  const file = path.join(dir, 'preload.js');
  fs.writeFileSync(file, `
'use strict';
const { contextBridge } = require('electron');
const STATE = ${JSON.stringify({ base: BASE, composed: COMPOSED })};
const handlers = {};
const noop = () => {};
contextBridge.exposeInMainWorld('wall', {
  requestState: async () => ({
    config: STATE.base, base: STATE.base,
    systemWallpaper: '', onlineWallpaper: null, osLocale: 'ja',
    hw: null, media: null, editing: false, widgetsHidden: false,
  }),
  getFontsCss: async () => '',
  getIcon: async () => null,
  listSlides: async () => [],
  duplicateWidget: async () => null,
  getIconsVisible: async () => true,
  setIconsVisible: async () => true,
  closeOverlay: noop, editLive: noop, finishEdit: noop,
  onConfig: (cb) => { handlers.config = cb; },
  onEditMode: (cb) => { handlers.edit = cb; },
  onWeather: noop, onHw: noop, onMedia: noop, onAudioDev: noop, onRss: noop,
  onTicker: noop, onDisks: noop, onNetinfo: noop, onIcs: noop, onCursor: noop,
  onWidgetsHidden: noop, onPower: noop, onFontsChanged: noop, onIconsState: noop,
});
// 検査から main の配信を模す入口
contextBridge.exposeInMainWorld('__test', {
  sendConfig: (which) => handlers.config && handlers.config({
    config: which === 'composed' ? STATE.composed : STATE.base,
    base: STATE.base, systemWallpaper: '', onlineWallpaper: null, osLocale: 'ja',
  }),
  setEdit: (v) => handlers.edit && handlers.edit(v),
});
`);
  return file;
}

app.on('window-all-closed', () => {});
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 90000).unref();

app.whenReady().then(async () => {
  const preload = buildPreload();
  const errors = [];
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { preload, contextIsolation: true },
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3) errors.push(String(message).slice(0, 160));
  });
  // main が付ける問い合わせと同じ形にする (鍵つき・この画面は MON-A)
  await win.loadFile(path.join(ROOT, 'src/renderer/wallpaper/index.html'), {
    search: 'display=0&did=999&dkey=' + encodeURIComponent('MON-A|2560x1440'),
  });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const ids = () => js(`return [...document.querySelectorAll('#widgets [data-id]')].map(el => el.dataset.id).sort();`);
  await sleep(1500);

  // 1. 素の構成: この画面のぶんだけ描かれ、しまってあるものは描かれない
  ok('起動時に描画できる', !!await js('return !!document.getElementById("widgets");'));
  const first = await ids();
  ok('担当の画面のウィジェットだけ描く', JSON.stringify(first) === JSON.stringify(['w1', 'w2', 'w5']), first);
  ok('しまってあるものは描かない', !first.includes('w4'), first);
  ok('別モニタのものは描かない', !first.includes('w3'), first);

  // 2. 鍵で判定する (再起動で変わる displayId ではなく)。
  //    鍵が一致しない画面では、鍵つきのものは 1 つも描かれてはいけない
  const other = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { preload, contextIsolation: true } });
  const otherErrors = [];
  other.webContents.on('console-message', (e, level, m) => { if (level >= 3) otherErrors.push(String(m).slice(0, 160)); });
  await other.loadFile(path.join(ROOT, 'src/renderer/wallpaper/index.html'), {
    search: 'display=1&did=999&dkey=' + encodeURIComponent('MON-B|1440x2560'),
  });
  await sleep(1200);
  const onB = await other.webContents.executeJavaScript(
    `[...document.querySelectorAll('#widgets [data-id]')].map(el => el.dataset.id).sort()`);
  ok('別モニタは自分のぶんだけ描く', JSON.stringify(onB) === JSON.stringify(['w3']), onB);
  ok('別モニタでも例外ゼロ', otherErrors.length === 0, otherErrors.slice(0, 3));
  other.destroy();

  // 3. 重ねの配信: モードが効くと表示が絞られる
  await js('window.__test.sendConfig("composed"); return true;');
  await sleep(500);
  const composed = await ids();
  ok('重ねが効くと表示が絞られる', JSON.stringify(composed) === JSON.stringify(['w1']), composed);

  // 4. 配置編集は土台を見る = 重ねで隠れていても触れる。
  //    ここが壊れると「追加したウィジェットに触れない」(v5.9.29) が再発する
  await js('window.__test.setEdit(true); return true;');
  await sleep(500);
  const editing = await ids();
  ok('編集中は隠れているものも触れる', JSON.stringify(editing) === JSON.stringify(['w1', 'w2', 'w5']), editing);
  ok('編集中でも「しまう」は隠れたまま', !editing.includes('w4'), editing);

  // 4b. 編集中の当たり判定 (右クリックでロック) は、描画と同じ土台のオブジェクトに
  //     書き込まなければならない。重ねが効いている間、config (見えているもの) と
  //     baseCfg (編集対象) は id が同じでも別のオブジェクトなので、片方だけ書き込むと
  //     「画面には一瞬反映されるが、次に描き直すと消える」偽の成功になる
  await js(`
    const el = document.querySelector('[data-id="w1"]');
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return true;`);
  await sleep(300);
  const lockedNow = await js(`return document.querySelector('[data-id="w1"]').classList.contains('locked');`);
  ok('ロックはすぐ画面に反映される', lockedNow === true, lockedNow);
  // 描き直しを強制する (編集の出入りは renderWidgets を呼び直す)。
  // ここで土台そのものが書き換わっていなければ、ロックは消える
  await js('window.__test.setEdit(false); window.__test.setEdit(true); return true;');
  await sleep(500);
  const lockedAfterRerender = await js(`return document.querySelector('[data-id="w1"]').classList.contains('locked');`);
  ok('ロックは描き直しても土台に残る (当たり判定と描画が同じ物を指す)',
    lockedAfterRerender === true, lockedAfterRerender);

  // 5. 編集を抜けたら重ねの結果に戻る (配置を変えていなくても)
  await js('window.__test.setEdit(false); return true;');
  await sleep(500);
  const after = await ids();
  ok('編集を抜けると重ねへ戻る', JSON.stringify(after) === JSON.stringify(['w1']), after);

  // 6. 全体を通して例外ゼロ
  ok('レンダラ例外ゼロ', errors.length === 0, errors.slice(0, 4));

  console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `壁紙レンダラ検査: 全 ${pass} 件 PASS`);
  if (bad.length) for (const b of bad) console.log('  -', b);
  app.exit(fail ? 1 : 0);
}).catch((e) => { console.error('BOOT ERR', e); app.exit(3); });
