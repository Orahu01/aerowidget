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

console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `全 ${pass} 件 PASS`);
process.exit(fail ? 1 : 0);
