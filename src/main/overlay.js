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

// 土台に、効いているモードを重ねた結果を返す。
// 土台そのものは絶対に書き換えない (ここが安定性の要)。
// 何も重なっていなければ土台をそのまま返す
function compose(base, act) {
  const wp = (act || []).find(ownsWallpaper);
  const wv = (act || []).find(ownsWidgets);
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

// me を手動でオンにしたとき、同時にオンにしておけないモード。
// 同じもの (壁紙 / ウィジェット表示) を覚えているモード同士は取り合いになるため、
// 黙って裏で決めずに、オフにする相手を名指しで返して画面に知らせる
function exclusivityVictims(list, me) {
  const iWp = ownsWallpaper(me);
  const iWv = ownsWidgets(me);
  const out = [];
  for (const l of (list || [])) {
    if (l === me || l.name === ICON_BACKUP_NAME || l.on !== true) continue;
    if ((iWp && ownsWallpaper(l)) || (iWv && ownsWidgets(l))) out.push(l);
  }
  return out;
}

module.exports = {
  ICON_BACKUP_NAME, modeList, activeModes, compose,
  ownsWallpaper, ownsWidgets, exclusivityVictims,
};
