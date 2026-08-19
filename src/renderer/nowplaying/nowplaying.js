// 再生中の曲ウィジェット (曲名・アーティスト・ジャケット + 再生操作)
'use strict';

let widget = null;
let m = null;   // { playing, title, artist, art }

const card = document.getElementById('card');
const art = document.getElementById('art');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');

function o() { return (widget && widget.options) || {}; }
function en() {
  const l = (widget && widget._lang) || 'auto';
  if (l === 'en') return true;
  if (l === 'ja') return false;
  return !(osLocale || 'ja').toLowerCase().startsWith('ja');
}
let osLocale = 'ja';

function applyStyle() {
  if (!widget) return;
  card.style.background = `rgba(13, 16, 22, ${o().bgOpacity ?? 0.55})`;
  card.style.color = widget.color || '#e6e7ea';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.style.fontSize = Math.max(10, widget.size || 16) + 'px';
  document.body.classList.toggle('no-art', o().showArt === false);
  document.body.classList.toggle('no-ctrl', o().showControls === false);
}

function render() {
  const has = !!(m && m.title);
  document.body.classList.toggle('idle', !has);
  document.body.classList.toggle('playing', !!(m && m.playing));
  document.body.classList.toggle('paused', has && !m.playing);

  titleEl.textContent = has ? m.title : (en() ? 'Nothing playing' : '再生中のメディアなし');
  artistEl.textContent = (has && o().showArtist !== false) ? (m.artist || '') : '';
  if (has && m.art) {
    if (art.src !== m.art) art.src = m.art;
  } else {
    art.removeAttribute('src');
  }
}

for (const [id, key] of [['prev', 'prev'], ['play', 'play'], ['next', 'next']]) {
  document.getElementById(id).addEventListener('click', () => window.fw.mediaKey(key));
}

async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
  } catch (_) {}
}

window.fw.onWidget((w) => { widget = w; applyStyle(); render(); });
window.fw.onConfig((env) => {
  if (env.osLocale) osLocale = env.osLocale;
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) { widget = w; widget._lang = (env.config.settings || {}).language || 'auto'; applyStyle(); render(); }
});
window.fw.onFontsChanged(() => injectFonts());
window.fw.onMedia((d) => { m = d; render(); });

(async () => {
  const st = await window.fw.getState();
  if (st.osLocale) osLocale = st.osLocale;
  widget = st.widget;
  m = st.media || null;
  document.getElementById('gfonts').textContent = st.fontsCss || '';
  applyStyle();
  render();
})();
