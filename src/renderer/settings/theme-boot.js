// 明暗・アクセント色を、CSS が読み込まれる前に決めておくためだけのファイル。
// onConfig を待ってから document.documentElement に反映すると、起動直後の一瞬だけ
// 既定色 (ライト・ティール) が見えてから正しい色に切り替わる「ちらつき」が起きる。
// main.js が loadFile の query に載せてくる値を、同期的に (最初のスタイル適用より前に) 反映する
(() => {
  const p = new URLSearchParams(location.search);
  const theme = p.get('theme');
  const accent = p.get('accent');
  if (theme) document.documentElement.dataset.theme = theme;
  if (accent) document.documentElement.dataset.accent = accent;
})();
