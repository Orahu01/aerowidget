// モードの「重ね」の中核。
//
// ここだけが、どのモードが何に勝つかを決める。main も検査もこの 1 つを使う。
// 以前は検査が同じ式を書き写していたため、実装だけ直しても検査は古いまま緑になり、
// 「直したはずの穴」を見逃した (v5.9.29 の linkWidgets)。写しは必ずずれるので持たない。
//
// この中には Electron も設定ファイルも入れない (素の関数だけ)。
'use strict';

// 適用の直前に自動で退避される特別なモード。重ねの対象にはしない
const ICON_BACKUP_NAME = '復元前 (自動)';

// 重ねの対象になるモードだけを取り出す
function modeList(settings) {
  return ((settings || {}).iconLayouts || []).filter(l => l && l.name !== ICON_BACKUP_NAME);
}

// いま効いているモード (一覧の上にあるものが優先)。
// matches は条件が成立しているかを返す関数 (本番は scenes.matches)
function activeModes(settings, matches) {
  return modeList(settings).filter(m =>
    m.on === true || (m.trigger && matches(m.trigger)));
}

// このモードは壁紙を覚えているか
function ownsWallpaper(m) {
  return !!(m && m.wallpapers);
}

// このモードはウィジェットの表示を覚えているか。
// ひとつも選んでいない (widgetsOn が空) のは「全部隠す」という指定であって、
// 「何も指定していない」ではない — 区別できるのは linkWidgets だけ。
// だからこの印は、人が画面で付けたときにしか立ててはいけない
function ownsWidgets(m) {
  return !!(m && m.linkWidgets);
}

// 人が押して選んだモードを、常に条件まかせのモードより優先する。
// 「一覧の上が勝つ」だけだと、条件が当たっている間はボタンを押しても
// 見た目が一切変わらない (ボタンより条件の方が強く見える) 事故になる。
// 人の操作を最優先にしても、一覧の並びは書き換えない — あくまで重ねる時の選び方だけを変える
function byManualFirst(act) {
  const manual = (act || []).filter(m => m.on === true);
  const auto = (act || []).filter(m => m.on !== true);
  return [...manual, ...auto];
}

// 土台に、効いているモードを重ねた結果を返す。
// 土台そのものは絶対に書き換えない (ここが安定性の要)。
// 何も重なっていなければ土台をそのまま返す
function compose(base, act) {
  const ordered = byManualFirst(act);
  const wp = ordered.find(ownsWallpaper);
  const wv = ordered.find(ownsWidgets);
  if (!wp && !wv) return base;
  const out = { ...base };
  if (wp) out.wallpapers = JSON.parse(JSON.stringify(wp.wallpapers));
  if (wv) {
    const show = new Set(wv.widgetsOn || []);
    // 表示だけ差し替える。位置・設定は土台のまま
    out.widgets = (base.widgets || []).map(w => ({ ...w, off: !show.has(w.id) }));
  }
  return out;
}

// me を手動でオンにしたとき、同時にオンにしておけないモード = 他のすべての on:true。
// 以前は壁紙 / ウィジェットを両方とも覚えていないモードどうしは「取り合いにならない」
// として見逃していたが、それだと「常に効かせる」を何個も重ねられてしまい、
// 一番最初に on にしたものが (何を持っているかに関係なく) ずっと居座り続け、
// 切り替えボタンを押しても何も変わらないように見える不具合になっていた。
// モードは「切り替えて使うもの」なので、持ち物に関係なく同時に 1 つだけにする。
// 黙って裏で決めずに、オフにする相手を名指しで返して画面に知らせる
function exclusivityVictims(list, me) {
  const out = [];
  for (const l of (list || [])) {
    if (l === me || l.name === ICON_BACKUP_NAME || l.on !== true) continue;
    out.push(l);
  }
  return out;
}

module.exports = {
  ICON_BACKUP_NAME, modeList, activeModes, compose,
  ownsWallpaper, ownsWidgets, exclusivityVictims,
};
