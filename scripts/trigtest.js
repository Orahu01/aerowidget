// モードの条件判定 (src/main/scenes.js の matches) の検査。
//
//   実行: node scripts/trigtest.js
//
// 「夜だけ暗い壁紙」のような時間帯の条件は、間違っても画面が静かに
// おかしくなるだけで、エラーにはならない。だから機械で見るしかない。
// とくに日またぎ (22:00→06:00) と、曜日を絞ったときの「前日から続く朝」は
// 人間が読んで正しさを確信できる類のコードではない。
'use strict';

const scenes = require('../src/main/scenes');

let pass = 0, fail = 0;
const bad = [];
const ok = (label, cond, detail) => {
  if (cond) { pass++; return; }
  fail++;
  bad.push(label + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  console.log('✗', label, detail !== undefined ? JSON.stringify(detail) : '');
};

// 2026-08-23 は日曜。曜日は日=0 … 土=6
const at = (day, hh, mm) => new Date(2026, 7, 23 + day, hh, mm, 0);
const T = (trigger, when) => scenes.matches(trigger, when);

// ---------------- 時間帯: 同じ日の中 ----------------
{
  const t = { type: 'time', from: '09:00', to: '17:00' };
  ok('日中: 開始ちょうどは効く', T(t, at(0, 9, 0)) === true);
  ok('日中: 途中は効く', T(t, at(0, 12, 30)) === true);
  ok('日中: 終了ちょうどは切れる', T(t, at(0, 17, 0)) === false);
  ok('日中: 開始前は効かない', T(t, at(0, 8, 59)) === false);
  ok('日中: 深夜は効かない', T(t, at(0, 2, 0)) === false);
}

// ---------------- 時間帯: 日をまたぐ ----------------
{
  const t = { type: 'time', from: '22:00', to: '06:00' };
  ok('夜: 開始ちょうどは効く', T(t, at(0, 22, 0)) === true);
  ok('夜: 深夜 0 時をまたいでも効く', T(t, at(1, 0, 30)) === true);
  ok('夜: 明け方は効く', T(t, at(1, 5, 59)) === true);
  ok('夜: 終了ちょうどは切れる', T(t, at(1, 6, 0)) === false);
  ok('夜: 昼は効かない', T(t, at(0, 12, 0)) === false);
  ok('夜: 開始直前は効かない', T(t, at(0, 21, 59)) === false);
}

// ---------------- 曜日の絞り込み ----------------
{
  // 月曜 (1) の夜だけ。日またぎなので「火曜の朝」も月曜の続きとして効くはず
  const t = { type: 'time', from: '22:00', to: '06:00', days: [1] };
  ok('曜日: 指定日の夜は効く', T(t, at(1, 23, 0)) === true);          // 月 23:00
  ok('曜日: 翌日の朝も前日の続きとして効く', T(t, at(2, 3, 0)) === true); // 火 03:00
  ok('曜日: 翌日の朝でも終了後は切れる', T(t, at(2, 7, 0)) === false);
  ok('曜日: 指定外の夜は効かない', T(t, at(3, 23, 0)) === false);      // 水 23:00
  // 週またぎ: 土 (6) 指定なら日曜の朝も効く
  const w = { type: 'time', from: '22:00', to: '06:00', days: [6] };
  ok('曜日: 土曜の夜から日曜の朝へまたげる', T(w, at(7, 3, 0)) === true); // 翌週日 03:00
}

// ---------------- 入力がおかしいとき ----------------
// 自由入力なので "6:5" や "25:00" が来る。落ちずに、
// 既定 (0:00〜24:00 = 常に効く) へ倒れることを固定しておく。
// この振る舞いを変えるなら、それは意識した変更であるべき
{
  ok('不正な開始は 0:00 として扱う', T({ type: 'time', from: '6:5', to: '23:00' }, at(0, 1, 0)) === true);
  ok('不正な終了は 24:00 として扱う', T({ type: 'time', from: '01:00', to: 'あああ' }, at(0, 23, 30)) === true);
  ok('両方おかしければ常に効く', T({ type: 'time', from: '', to: '' }, at(0, 12, 0)) === true);
  ok('時刻の桁あふれは丸める', T({ type: 'time', from: '25:99', to: '25:99' }, at(0, 23, 58)) === false);
  ok('空の曜日指定は毎日として扱う', T({ type: 'time', from: '09:00', to: '17:00', days: [] }, at(3, 12, 0)) === true);
}

// ---------------- アプリが前面 ----------------
{
  const t = { type: 'app', apps: ['chrome.exe', 'Valorant.exe'] };
  scenes.setForeground('');
  ok('アプリ: デスクトップでは効かない', T(t) === false);
  scenes.setForeground('chrome.exe');
  ok('アプリ: 一致すれば効く', T(t) === true);
  scenes.setForeground('valorant.exe');
  ok('アプリ: 大文字小文字は区別しない', T(t) === true);
  scenes.setForeground('notepad.exe');
  ok('アプリ: 一致しなければ効かない', T(t) === false);
  scenes.setForeground('chrome.exe');
  ok('アプリ: 空の一覧では効かない', T({ type: 'app', apps: [] }) === false);
  ok('アプリ: 空白だけの名前は無視する', T({ type: 'app', apps: ['  '] }) === false);
  scenes.setForeground('');
}

// ---------------- 全画面 / バッテリー ----------------
{
  scenes.setFullscreen(0, false);
  ok('全画面: 何も全画面でなければ効かない', T({ type: 'fullscreen' }) === false);
  scenes.setFullscreen(1, true);
  ok('全画面: どれか 1 枚が全画面なら効く', T({ type: 'fullscreen' }) === true);
  scenes.setFullscreen(1, false);
  ok('全画面: 抜ければ切れる', T({ type: 'fullscreen' }) === false);

  scenes.setBattery(false);
  ok('電源: コンセントなら効かない', T({ type: 'battery' }) === false);
  scenes.setBattery(true);
  ok('電源: バッテリー駆動なら効く', T({ type: 'battery' }) === true);
  scenes.setBattery(false);
}

// ---------------- 条件そのものが無い / 未知 ----------------
{
  ok('条件なしは効かない', scenes.matches(null) === false);
  ok('知らない種類は効かない', T({ type: 'なにか' }) === false);
}

console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `条件判定: 全 ${pass} 件 PASS`);
if (bad.length) for (const b of bad) console.log('  -', b);
process.exit(fail ? 1 : 0);
