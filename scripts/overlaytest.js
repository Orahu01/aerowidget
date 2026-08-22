// 重ねの中核 (activeModes / effectiveConfig) が、土台を書き換えずに動くかの机上テスト
'use strict';
let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`✗ ${label}\n    got : ${g}\n    want: ${w}`);
};

// main.js と同じ式
const ICON_BACKUP_NAME = '復元前 (自動)';
let fg = '';
const matches = (t) => (t && t.type === 'app' ? (t.apps || []).includes(fg) : false);

const makeCfg = () => ({
  wallpapers: { default: { type: 'preset', value: '土台の壁紙' } },
  widgets: [{ id: 'a' }, { id: 'b' }],
  settings: {
    iconLayouts: [
      { name: '配信用', trigger: { type: 'app', apps: ['chrome.exe'] }, wallpapers: { default: { type: 'preset', value: '配信の壁紙' } } },
      { name: '仕事', on: false, wallpapers: { default: { type: 'preset', value: '仕事の壁紙' } } },
      { name: ICON_BACKUP_NAME, wallpapers: { default: { type: 'preset', value: '退避' } } },
    ],
  },
});
let cfg = makeCfg();
const modeList = () => (cfg.settings.iconLayouts || []).filter(l => l.name !== ICON_BACKUP_NAME);
const activeModes = () => modeList().filter(m => m.on === true || (m.trigger && matches(m.trigger)));
const effective = () => {
  const wp = activeModes().find(m => m.wallpapers);
  if (!wp) return cfg;
  return { ...cfg, wallpapers: JSON.parse(JSON.stringify(wp.wallpapers)) };
};
const wpOf = (c) => c.wallpapers.default.value;
const baseSnapshot = JSON.stringify(cfg);

// 1. 条件が成立していないときは土台のまま
eq('通常時は土台の壁紙', wpOf(effective()), '土台の壁紙');
eq('自動退避は重ねの対象外', activeModes().length, 0);

// 2. Chrome を前面に -> 重なる
fg = 'chrome.exe';
eq('Chrome で配信の壁紙が重なる', wpOf(effective()), '配信の壁紙');

// 3. 外れたら自動的に土台へ戻る (記憶や退避が要らない)
fg = 'explorer.exe';
eq('外れたら土台へ戻る', wpOf(effective()), '土台の壁紙');

// 4. 手動オンは条件なしでも効く
cfg.settings.iconLayouts[1].on = true;
eq('手動オンで重なる', wpOf(effective()), '仕事の壁紙');

// 5. 一覧の上のモードが優先
fg = 'chrome.exe';
eq('上のモードが勝つ', wpOf(effective()), '配信の壁紙');

// 6. ここまでで土台は一切変わっていないこと (これが設計の核心)
cfg.settings.iconLayouts[1].on = false;
fg = '';
eq('土台は不変', JSON.stringify(cfg), baseSnapshot);

// 7. 手で壁紙を変えたら、それは土台に入り、重ねが剥がれれば見える
cfg.wallpapers.default.value = '手で変えた壁紙';
eq('手で変えた壁紙が土台に入る', wpOf(effective()), '手で変えた壁紙');
fg = 'chrome.exe';
eq('重ねている間は隠れる', wpOf(effective()), '配信の壁紙');
fg = '';
eq('剥がれたら手で変えた壁紙が戻る', wpOf(effective()), '手で変えた壁紙');

// 8. 手動オンと条件は同時に持てない (起動時の掃除と同じ規則)。
//    両方立っていた古い設定は、条件が主になる
{
  const l = { name: 'X', on: true, trigger: { type: 'app', apps: ['chrome.exe'] } };
  if (l.trigger && l.on) l.on = false;      // main.js の起動時掃除と同じ式
  fg = '';
  cfg.settings.iconLayouts = [l];
  eq('掃除後: 条件が外れていれば効かない', activeModes().length, 0);
  fg = 'chrome.exe';
  eq('掃除後: 条件が合えば効く', activeModes().length, 1);
}

// 9. ウィジェット表示の合成: 覚えているモードが効いている間だけ表示が変わり、
//    土台の off (手動のしまう) はモードが外れれば戻る
{
  fg = '';
  cfg = makeCfg();
  cfg.widgets = [{ id: 'a', off: false }, { id: 'b', off: false }, { id: 'c', off: true }];
  cfg.settings.iconLayouts = [
    { name: 'ゲーム', trigger: { type: 'app', apps: ['game.exe'] }, linkWidgets: true, widgetsOn: ['a'] },
  ];
  const effW = () => {
    const act = activeModes();
    const wv = act.find(m => m.linkWidgets && (m.widgetsOn || []).length);
    if (!wv) return cfg.widgets.map(w => !w.off);
    const show = new Set(wv.widgetsOn);
    return cfg.widgets.map(w => show.has(w.id));
  };
  eq('通常時: 土台の表示どおり', effW(), [true, true, false]);
  fg = 'game.exe';
  eq('モード中: a だけ表示', effW(), [true, false, false]);
  fg = '';
  eq('外れたら土台へ戻る (c は隠れたまま)', effW(), [true, true, false]);
  eq('土台の off は書き換わっていない', cfg.widgets.map(w => !!w.off), [false, false, true]);
}

// 10. 手動オンの排他: 同じものを覚えるモードをオンにしたら、前のはオフ + 名前を知らせる
{
  const list = [
    { name: 'A', on: true, wallpapers: { x: 1 } },
    { name: 'B', on: false, wallpapers: { x: 2 } },
    { name: 'C', on: true, linkWidgets: true, widgetsOn: ['w1'] },
  ];
  // main.js の setModeOn と同じ規則
  const setOn = (name) => {
    const me = list.find(l => l.name === name);
    me.on = true; me.trigger = null;
    const turnedOff = [];
    const iWp = !!me.wallpapers, iWv = !!(me.linkWidgets && (me.widgetsOn || []).length);
    for (const l of list) {
      if (l === me || l.on !== true) continue;
      const oWp = !!l.wallpapers, oWv = !!(l.linkWidgets && (l.widgetsOn || []).length);
      if ((iWp && oWp) || (iWv && oWv)) { l.on = false; turnedOff.push(l.name); }
    }
    return turnedOff;
  };
  eq('B をオン -> 壁紙が競合する A だけオフ', setOn('B'), ['A']);
  eq('C は残る (ウィジェットは競合しない)', list.find(l => l.name === 'C').on, true);
}

console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `全 ${pass} 件 PASS`);
process.exit(fail ? 1 : 0);
