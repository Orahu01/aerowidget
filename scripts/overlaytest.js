// 重ねの規則 (src/main/overlay.js) の検査。
//
//   実行: node scripts/overlaytest.js
//
// かつてここは main.js の式を「書き写して」検査していた。
// その結果、実装だけ直しても写しは古いまま緑になり、直したはずの穴を見逃した
// (v5.9.29 の linkWidgets)。いまは本物の関数をそのまま呼ぶ。
'use strict';

const overlay = require('../src/main/overlay');
const { ICON_BACKUP_NAME } = overlay;

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`✗ ${label}\n    got : ${g}\n    want: ${w}`);
};
const ok = (label, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log(`✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
};

// 条件の成立を差し込む (本番は scenes.matches)
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
const act = () => overlay.activeModes(cfg.settings, matches);
const effective = () => overlay.compose(cfg, act());
const wpOf = (c) => c.wallpapers.default.value;
const baseSnapshot = JSON.stringify(cfg);

// ---------------- 条件と手動オン ----------------
eq('通常時は土台の壁紙', wpOf(effective()), '土台の壁紙');
eq('自動退避は重ねの対象外', act().length, 0);

fg = 'chrome.exe';
eq('条件が成立したら重なる', wpOf(effective()), '配信の壁紙');
eq('効いているのは 1 つ', act().map(m => m.name), ['配信用']);

fg = '';
eq('条件から外れたら土台へ戻る', wpOf(effective()), '土台の壁紙');

cfg.settings.iconLayouts[1].on = true;
eq('手動オンでも重なる', wpOf(effective()), '仕事の壁紙');

fg = 'chrome.exe';
eq('両方効いたら一覧の上が勝つ', wpOf(effective()), '配信の壁紙');
eq('効いているのは 2 つ', act().map(m => m.name), ['配信用', '仕事']);

// 一覧の順を入れ替えると勝ち負けも入れ替わる
cfg.settings.iconLayouts = [cfg.settings.iconLayouts[1], cfg.settings.iconLayouts[0], cfg.settings.iconLayouts[2]];
eq('並べ替えると勝ち負けも変わる', wpOf(effective()), '仕事の壁紙');

// ---------------- 土台の不変 ----------------
cfg = makeCfg();
fg = 'chrome.exe';
const composed = effective();
eq('重ねても土台は 1 バイトも変わらない', JSON.stringify(cfg), baseSnapshot);
ok('重ねた結果は土台とは別の入れ物', composed !== cfg);
composed.wallpapers.default.value = 'いじった';
eq('重ねた結果をいじっても土台に響かない', cfg.settings.iconLayouts[0].wallpapers.default.value, '配信の壁紙');

fg = '';
ok('何も効いていなければ土台をそのまま返す', effective() === cfg);

// ---------------- ウィジェットの表示 ----------------
{
  const c = {
    wallpapers: { default: { type: 'preset', value: 'w' } },
    widgets: [{ id: 'a' }, { id: 'b' }, { id: 'c', off: true }],
    settings: {
      iconLayouts: [
        { name: 'ゲーム', trigger: { type: 'app', apps: ['game.exe'] }, linkWidgets: true, widgetsOn: ['a'] },
      ],
    },
  };
  const A = () => overlay.activeModes(c.settings, matches);
  const E = () => overlay.compose(c, A());
  const offMap = (x) => x.widgets.map(w => (w.off ? 1 : 0));

  fg = '';
  eq('効いていなければ土台の出し入れのまま', offMap(E()), [0, 0, 1]);
  fg = 'game.exe';
  eq('効いたら選んだものだけ出る', offMap(E()), [0, 1, 1]);
  eq('土台の出し入れは変わらない', c.widgets.map(w => (w.off ? 1 : 0)), [0, 0, 1]);

  // ひとつも選んでいない = 全部隠す (人が画面で選んだ指定)。
  // ここが「何もしない」に戻ると、ゲーム中だけ何も出さない使い方ができなくなる
  c.settings.iconLayouts[0].widgetsOn = [];
  eq('ひとつも選んでいなければ全部隠す', offMap(E()), [1, 1, 1]);
  eq('全部隠しても土台は無事', c.widgets.map(w => (w.off ? 1 : 0)), [0, 0, 1]);

  // 連動そのものを切れば、ウィジェットには一切触らない
  c.settings.iconLayouts[0].linkWidgets = false;
  eq('連動を切れば土台のまま', offMap(E()), [0, 0, 1]);
  ok('連動も壁紙も無ければ土台をそのまま返す', E() === c);
}

// ---------------- 排他 ----------------
{
  const list = [
    { name: 'A', on: true, wallpapers: { x: 1 } },
    { name: 'B', on: true, linkWidgets: true, widgetsOn: ['w1'] },
    { name: 'C', on: true, linkWidgets: true, widgetsOn: [] },
    { name: 'D', on: true },                                  // 何も覚えていない
    { name: ICON_BACKUP_NAME, on: true, wallpapers: { x: 9 } },
    { name: 'E', on: false, wallpapers: { x: 2 } },            // オフのものは巻き込まない
  ];
  const names = (me) => overlay.exclusivityVictims(list, me).map(l => l.name);

  eq('壁紙どうしはぶつかる', names({ name: '新', wallpapers: { x: 3 } }), ['A']);
  eq('ウィジェット表示どうしはぶつかる (空選択も含む)',
    names({ name: '新', linkWidgets: true, widgetsOn: ['w2'] }), ['B', 'C']);
  eq('空選択のモードも相手を落とす',
    names({ name: '新', linkWidgets: true, widgetsOn: [] }), ['B', 'C']);
  eq('両方覚えていれば両方落とす',
    names({ name: '新', wallpapers: { x: 3 }, linkWidgets: true, widgetsOn: [] }), ['A', 'B', 'C']);
  eq('何も覚えていなければ誰も落とさない', names({ name: '新' }), []);
  eq('自動退避は巻き込まない', names({ name: '新', wallpapers: { x: 3 } }).includes(ICON_BACKUP_NAME), false);
  eq('自分自身は落とさない', names(list[0]), []);
}

// ---------------- 壊れた設定でも落ちない ----------------
{
  eq('iconLayouts が無くても平気', overlay.activeModes({}, matches), []);
  eq('settings が無くても平気', overlay.modeList(undefined), []);
  eq('null 混じりでも落ちない',
    overlay.activeModes({ iconLayouts: [null, { name: 'x', on: true }] }, matches).map(m => m.name), ['x']);
  const c2 = { widgets: null, wallpapers: {}, settings: {} };
  ok('widgets が無い土台でも合成できる',
    !!overlay.compose(c2, [{ name: 'z', linkWidgets: true, widgetsOn: [] }]));
}

console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `全 ${pass} 件 PASS`);
process.exit(fail ? 1 : 0);
