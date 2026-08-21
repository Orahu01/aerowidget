// フォルダウィジェット (デスクトップ上でクリック可能な小窓)
'use strict';

let widget = null;

const card = document.getElementById('card');
const titleEl = document.getElementById('title');
const grid = document.getElementById('grid');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// main 側と同じ寸法式 (列数の算出に使用)
function cols(o) {
  const n = Math.max(1, (o.items || []).length);
  return o.columns > 0 ? o.columns : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
}

async function render() {
  if (!widget) return;
  const o = widget.options || {};
  const icon = o.iconSize || 34;

  card.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.55})`;
  card.style.color = widget.color || '#e8ecf4';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  titleEl.textContent = o.title || '';
  titleEl.style.fontSize = Math.max(10, widget.size || 12) + 'px';

  // minmax(0, 1fr): 長いラベルがトラックを押し広げてカードからはみ出すのを防ぐ
  grid.style.gridTemplateColumns = `repeat(${cols(o)}, minmax(0, 1fr))`;
  grid.innerHTML = '';

  const items = o.items || [];
  if (!items.length) {
    grid.innerHTML = '<div class="empty-hint">設定画面から<br>アプリを追加</div>';
    return;
  }
  for (const it of items) {
    const btn = document.createElement('button');
    btn.className = 'item';
    btn.title = it.name || it.path;
    const img = document.createElement('img');
    img.style.width = icon + 'px';
    img.style.height = icon + 'px';
    btn.appendChild(img);
    if (o.showLabels !== false) {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name || String(it.path || '').split(/[\\/]/).pop().replace(/\.(lnk|exe|url|bat)$/i, '');
      btn.appendChild(name);
    }
    btn.addEventListener('click', () => window.fw.launch(it.path));
    grid.appendChild(btn);
    window.fw.getIcon(it.path).then(url => { if (url) img.src = url; });
  }
}

// エクスプローラーからの直接ドロップで追加できる (複数まとめて可)。
// 追加は main が config に書き、その変更通知で render() が呼ばれて反映される
document.body.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  card.classList.add('dropping');
});
document.body.addEventListener('dragleave', (e) => {
  if (e.relatedTarget) return;
  card.classList.remove('dropping');
});
document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  card.classList.remove('dropping');
  const paths = window.fw.droppedPaths(e.dataTransfer.files || []);
  if (paths.length) await window.fw.addItems(paths);
});

async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
  } catch (_) {}
}

window.fw.onWidget((w) => { widget = w; render(); });
window.fw.onConfig((env) => {
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) { widget = w; render(); }
});
window.fw.onFontsChanged(() => injectFonts());

(async () => {
  const st = await window.fw.getState();
  widget = st.widget;
  document.getElementById('gfonts').textContent = st.fontsCss || '';
  render();
})();
