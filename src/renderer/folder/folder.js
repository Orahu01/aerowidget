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

// アプリは path、リンクは url で区別する
function keyOf(it) { return it.url || it.path; }

function labelOf(it) {
  if (it.name) return it.name;
  if (it.url) { try { return new URL(it.url).hostname.replace(/^www\./, ''); } catch (_) { return it.url; } }
  return String(it.path || '').split(/[\\/]/).pop().replace(/\.(lnk|exe|url|bat)$/i, '');
}

// favicon が取れないリンク用の頭文字タイル (名前から色を決めるので毎回同じ色になる)
function letterTile(text, size) {
  const el = document.createElement('span');
  el.className = 'tile';
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.borderRadius = Math.round(size * 0.26) + 'px';
  el.style.background = `hsl(${h % 360}, 52%, 46%)`;
  el.style.fontSize = Math.round(size * 0.5) + 'px';
  el.textContent = (text.trim()[0] || '?').toUpperCase();
  return el;
}

function itemButton(it, o, icon) {
  const btn = document.createElement('button');
  btn.className = 'item';
  const label = labelOf(it);
  btn.title = it.url || it.name || it.path;

  const holder = document.createElement('span');
  holder.className = 'ico';
  holder.style.width = icon + 'px';
  holder.style.height = icon + 'px';
  const img = document.createElement('img');
  img.style.width = icon + 'px';
  img.style.height = icon + 'px';
  img.style.display = 'none';
  holder.appendChild(img);
  btn.appendChild(holder);

  if (o.showLabels !== false) {
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = label;
    btn.appendChild(name);
  }
  btn.addEventListener('click', () => window.fw.launch(keyOf(it)));

  const got = it.url ? window.fw.getUrlIcon(it.url) : window.fw.getIcon(it.path);
  const fallback = () => holder.appendChild(letterTile(label, icon));
  got.then((url) => {
    if (url) { img.src = url; img.style.display = ''; return; }
    fallback();                       // 取れなければ頭文字のタイル (空白にしない)
  }).catch(fallback);
  return btn;
}

async function render() {
  if (!widget) return;
  const o = widget.options || {};
  const icon = o.iconSize || 34;
  const circle = o.layout === 'circle';

  card.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.55})`;
  card.style.color = widget.color || '#e8ecf4';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.classList.toggle('round', circle);
  titleEl.textContent = o.title || '';
  titleEl.style.fontSize = Math.max(10, widget.size || 12) + 'px';

  grid.classList.toggle('circle', circle);
  grid.style.gridTemplateColumns = circle
    ? ''
    // minmax(0, 1fr): 長いラベルがトラックを押し広げてカードからはみ出すのを防ぐ
    : `repeat(${cols(o)}, minmax(0, 1fr))`;
  grid.innerHTML = '';

  const items = o.items || [];
  if (!items.length) {
    grid.innerHTML = '<div class="empty-hint">設定画面から<br>アプリやリンクを追加</div>';
    return;
  }

  for (const it of items) grid.appendChild(itemButton(it, o, icon));
  if (circle) placeCircle(items.length, icon, o.showLabels !== false);
}

// 円形に並べる。半径は実際の箱の大きさから決めるので、
// ウィンドウ側の計算と多少ずれても収まる
function placeCircle(n, icon, labels) {
  const btns = [...grid.querySelectorAll('.item')];
  const cell = Math.max(46, icon + (labels ? 30 : 10));
  const box = Math.min(grid.clientWidth, grid.clientHeight);
  // ボタンの角 (半対角) まで円に収まる半径
  const r = n <= 1 ? 0 : Math.max(0, box / 2 - cell * 0.71);
  const cx = grid.clientWidth / 2;
  const cy = grid.clientHeight / 2;
  btns.forEach((b, i) => {
    b.style.width = cell + 'px';
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;   // 真上から時計回り
    b.style.left = Math.round(cx + r * Math.cos(a) - cell / 2) + 'px';
    b.style.top = Math.round(cy + r * Math.sin(a) - cell / 2) + 'px';
  });
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
  const add = window.fw.droppedPaths([...(e.dataTransfer.files || [])]);
  // ブラウザのアドレスバーやリンクをドロップした場合
  const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  for (const line of String(uri || '').split(/\r?\n/)) {
    const t = line.trim();
    if (/^https?:\/\//i.test(t)) add.push(t);
  }
  if (add.length) await window.fw.addItems(add);
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
