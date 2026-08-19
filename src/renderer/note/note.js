// メモウィジェット (デスクトップ上で直接書ける付箋)
'use strict';

let widget = null;
let saveTimer = null;

const card = document.getElementById('card');
const titleEl = document.getElementById('title');
const textEl = document.getElementById('text');

function applyStyle() {
  if (!widget) return;
  const o = widget.options || {};
  card.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.6})`;
  card.style.color = widget.color || '#e6e7ea';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  textEl.style.fontSize = Math.max(10, widget.size || 14) + 'px';
  titleEl.textContent = o.title || '';
  // 入力中に上書きしない (自分の編集がラウンドトリップして戻ってくるため)
  if (document.activeElement !== textEl && textEl.value !== (o.text || '')) {
    textEl.value = o.text || '';
  }
}

textEl.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.fw.save({ text: textEl.value }), 600);
});
textEl.addEventListener('blur', () => {
  clearTimeout(saveTimer);
  window.fw.save({ text: textEl.value });
});

async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
  } catch (_) {}
}

window.fw.onWidget((w) => { widget = w; applyStyle(); });
window.fw.onConfig((env) => {
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) { widget = w; applyStyle(); }
});
window.fw.onFontsChanged(() => injectFonts());

(async () => {
  const st = await window.fw.getState();
  widget = st.widget;
  document.getElementById('gfonts').textContent = st.fontsCss || '';
  applyStyle();
})();
