// WidgetWall — 壁紙レンダラ
'use strict';

const PRESETS = {
  aurora: `radial-gradient(45% 60% at 18% 82%, rgba(56,110,240,.55), transparent 65%),
           radial-gradient(50% 55% at 82% 20%, rgba(20,190,180,.40), transparent 65%),
           radial-gradient(55% 65% at 70% 85%, rgba(120,80,220,.45), transparent 65%),
           linear-gradient(155deg, #070b18, #0b1228 55%, #081120)`,
  sunset: `radial-gradient(50% 60% at 20% 85%, rgba(255,120,90,.50), transparent 65%),
           radial-gradient(55% 60% at 80% 25%, rgba(255,180,90,.35), transparent 60%),
           radial-gradient(60% 70% at 65% 80%, rgba(190,70,140,.40), transparent 65%),
           linear-gradient(155deg, #190f1e, #2a1226 55%, #190c18)`,
  midnight: `radial-gradient(60% 80% at 70% 20%, rgba(40,70,160,.28), transparent 65%),
             radial-gradient(50% 60% at 20% 80%, rgba(30,50,110,.22), transparent 65%),
             linear-gradient(170deg, #05070d, #090d1a 60%, #05070d)`,
  sakura: `radial-gradient(50% 60% at 22% 80%, rgba(240,120,170,.38), transparent 65%),
           radial-gradient(55% 60% at 80% 22%, rgba(200,140,240,.30), transparent 62%),
           radial-gradient(60% 70% at 70% 85%, rgba(255,170,190,.25), transparent 65%),
           linear-gradient(155deg, #1c1220, #2a1626 55%, #1b1020)`,
  forest: `radial-gradient(50% 60% at 20% 82%, rgba(30,160,120,.35), transparent 65%),
           radial-gradient(55% 60% at 82% 22%, rgba(90,180,90,.22), transparent 62%),
           radial-gradient(60% 70% at 68% 85%, rgba(20,110,110,.35), transparent 65%),
           linear-gradient(155deg, #08120e, #0c1c16 55%, #081410)`,
  mono: `radial-gradient(60% 75% at 30% 25%, rgba(255,255,255,.06), transparent 60%),
         linear-gradient(160deg, #101014, #16161c 55%, #0e0e12)`,
};

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];

let config = null;
let weatherData = null;
let statsData = null;
let editing = false;
let mediaKey = '';
const widgetEls = new Map();   // id -> { el, lastHtml }

const $ = (s) => document.querySelector(s);
const mediaBox = $('#media');
const dimBox = $('#dim');
const widgetsBox = $('#widgets');
const guideV = $('#guide-v');
const guideH = $('#guide-h');
const sizeBadge = $('#size-badge');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fileUrl(p) {
  return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23');
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '#ffffff');
  const n = parseInt(m ? m[1] : 'ffffff', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------------------------------------------------------------- 背景
function renderMedia() {
  const wp = config.wallpaper;
  const key = JSON.stringify([wp.type, wp.value, wp.blur]);
  if (key !== mediaKey) {
    mediaKey = key;
    mediaBox.innerHTML = '';
    let el = null;
    if (wp.type === 'image') {
      el = document.createElement('img');
      el.src = fileUrl(wp.value);
    } else if (wp.type === 'video') {
      el = document.createElement('video');
      el.src = fileUrl(wp.value);
      el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true;
    } else if (wp.type === 'color') {
      el = document.createElement('div');
      el.className = 'preset-bg';
      el.style.background = wp.value;
      el.style.animation = 'none';
    } else {
      el = document.createElement('div');
      el.className = 'preset-bg';
      el.style.background = PRESETS[wp.value] || PRESETS.aurora;
    }
    if (wp.blur > 0) {
      el.style.filter = `blur(${wp.blur}px)`;
      el.style.transform = 'scale(1.06)';
    }
    mediaBox.appendChild(el);
  }
  dimBox.style.opacity = (wp.dim || 0) / 100;
}

// ---------------------------------------------------------------- ウィジェット内容
function clockHtml(o) {
  const d = new Date();
  let h = d.getHours();
  let ampm = '';
  if (o.hour12) { ampm = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
  let t = (o.hour12 ? String(h) : String(h).padStart(2, '0')) + ':' + String(d.getMinutes()).padStart(2, '0');
  if (o.showSeconds) t += ':' + String(d.getSeconds()).padStart(2, '0');
  return esc(t) + (o.hour12 && o.showAmPm ? `<span class="ampm">${ampm}</span>` : '');
}

function dateHtml(o) {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), w = d.getDay();
  switch (o.style) {
    case 'ja-md': return esc(`${m}月${day}日 (${WEEK_JA[w]})`);
    case 'slash': return esc(`${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
    case 'iso': return esc(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    case 'en-long': return esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    case 'en-md': return esc(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    default: return esc(`${y}年${m}月${day}日 ${WEEK_JA[w]}曜日`);
  }
}

function weatherHtml(o) {
  const w = weatherData;
  if (!w || w.temp == null) return `<span class="wicon">🌡️</span> ─<div class="sub">${esc(o.city || '')} 取得中…</div>`;
  let html = '';
  html += (o.showIcon !== false ? `<span class="wicon">${w.emoji}</span> ` : '') + `${w.temp}°`;
  const sub = [];
  if (o.showCity !== false && w.city) sub.push(esc(w.city));
  if (o.showDesc !== false && w.desc) sub.push(esc(w.desc));
  if (sub.length) html += `<div class="sub">${sub.join(' ・ ')}</div>`;
  if (o.showHiLow && w.hi != null) html += `<div class="tiny">↑${w.hi}°　↓${w.lo}°</div>`;
  return html;
}

function statsHtml(o) {
  const s = statsData;
  if (!s) return 'CPU ─%　MEM ─%';
  const parts = [];
  if (o.showCpu !== false) parts.push(`CPU ${String(s.cpu).padStart(2, ' ')}%`);
  if (o.showMem !== false) parts.push(`MEM ${s.mem}%`);
  return esc(parts.join('　'));
}

function widgetHtml(w) {
  switch (w.type) {
    case 'clock': return clockHtml(w.options || {});
    case 'date': return dateHtml(w.options || {});
    case 'weather': return weatherHtml(w.options || {});
    case 'stats': return statsHtml(w.options || {});
    case 'text': return esc((w.options && w.options.text) || '').replace(/\n/g, '<br>');
    default: return '';
  }
}

function applyWidgetStyle(el, w) {
  el.style.left = w.x + '%';
  el.style.top = w.y + '%';
  el.style.fontFamily = `"${w.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  el.style.fontSize = w.size + 'px';
  el.style.fontWeight = w.weight;
  el.style.color = w.color;
  el.style.opacity = w.opacity;
  el.style.letterSpacing = w.letterSpacing + 'px';
  if (w.shadow === 'glow') {
    el.style.textShadow = `0 0 16px ${hexA(w.color, 0.85)}, 0 0 46px ${hexA(w.color, 0.45)}, 0 2px 10px rgba(0,0,0,.35)`;
  } else if (w.shadow === 'none') {
    el.style.textShadow = 'none';
  } else {
    el.style.textShadow = '0 2px 6px rgba(0,0,0,.5), 0 8px 32px rgba(0,0,0,.45)';
  }
}

function renderWidgets() {
  widgetsBox.innerHTML = '';
  widgetEls.clear();
  for (const w of config.widgets) {
    const el = document.createElement('div');
    el.className = 'widget';
    el.dataset.id = w.id;
    applyWidgetStyle(el, w);
    el.innerHTML = widgetHtml(w);
    widgetsBox.appendChild(el);
    widgetEls.set(w.id, { el, lastHtml: '' });
  }
}

// 時計・日付などの内容だけを更新 (DOM 再構築なし)
function tick() {
  if (!config) return;
  for (const w of config.widgets) {
    const rec = widgetEls.get(w.id);
    if (!rec) continue;
    const html = widgetHtml(w);
    if (html !== rec.lastHtml) {
      rec.lastHtml = html;
      rec.el.innerHTML = html;
    }
  }
}

function renderAll() {
  if (!config) return;
  renderMedia();
  renderWidgets();
  tick();
}

// ---------------------------------------------------------------- 編集モード
let drag = null; // { w, el, offX, offY }

function findWidget(el) {
  const box = el && el.closest ? el.closest('.widget') : null;
  if (!box) return null;
  const w = config.widgets.find(x => x.id === box.dataset.id);
  return w ? { w, el: box } : null;
}

function showBadge(w, x, y) {
  sizeBadge.style.display = 'block';
  sizeBadge.textContent = `${Math.round(w.size)}px ・ ${w.x.toFixed(1)}% , ${w.y.toFixed(1)}%`;
  sizeBadge.style.left = Math.min(x + 18, innerWidth - 200) + 'px';
  sizeBadge.style.top = Math.min(y + 22, innerHeight - 40) + 'px';
  clearTimeout(showBadge.t);
  showBadge.t = setTimeout(() => { sizeBadge.style.display = 'none'; }, 1200);
}

widgetsBox.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  const hit = findWidget(e.target);
  if (!hit) return;
  const rect = hit.el.getBoundingClientRect();
  drag = {
    w: hit.w, el: hit.el,
    offX: e.clientX - (rect.left + rect.width / 2),
    offY: e.clientY - (rect.top + rect.height / 2),
  };
  hit.el.classList.add('dragging');
  hit.el.setPointerCapture(e.pointerId);
});

widgetsBox.addEventListener('pointermove', (e) => {
  if (!editing || !drag) return;
  let x = ((e.clientX - drag.offX) / innerWidth) * 100;
  let y = ((e.clientY - drag.offY) / innerHeight) * 100;

  // スナップ: 画面中央 + 他ウィジェットの位置
  const xs = [50], ys = [50];
  for (const o of config.widgets) {
    if (o.id !== drag.w.id) { xs.push(o.x); ys.push(o.y); }
  }
  let sx = null, sy = null;
  for (const c of xs) if (Math.abs(x - c) < 0.7) { x = c; sx = c; break; }
  for (const c of ys) if (Math.abs(y - c) < 0.7) { y = c; sy = c; break; }
  guideV.style.display = sx != null ? 'block' : 'none';
  guideH.style.display = sy != null ? 'block' : 'none';
  if (sx != null) guideV.style.left = sx + '%';
  if (sy != null) guideH.style.top = sy + '%';

  drag.w.x = Math.max(0, Math.min(100, x));
  drag.w.y = Math.max(0, Math.min(100, y));
  drag.el.style.left = drag.w.x + '%';
  drag.el.style.top = drag.w.y + '%';
  showBadge(drag.w, e.clientX, e.clientY);
});

widgetsBox.addEventListener('pointerup', () => {
  if (drag) drag.el.classList.remove('dragging');
  drag = null;
  guideV.style.display = 'none';
  guideH.style.display = 'none';
});

window.addEventListener('wheel', (e) => {
  if (!editing) return;
  const hit = findWidget(document.elementFromPoint(e.clientX, e.clientY));
  if (!hit) return;
  e.preventDefault();
  const step = e.shiftKey ? 8 : 2;
  hit.w.size = Math.max(8, Math.min(600, hit.w.size + (e.deltaY < 0 ? step : -step)));
  hit.el.style.fontSize = hit.w.size + 'px';
  showBadge(hit.w, e.clientX, e.clientY);
}, { passive: false });

function finishEdit() {
  const layout = config.widgets.map(w => ({ id: w.id, x: w.x, y: w.y, size: w.size }));
  window.wall.finishEdit(layout);
}

$('#edit-done').addEventListener('click', finishEdit);
window.addEventListener('keydown', (e) => {
  if (editing && e.key === 'Escape') finishEdit();
});

// ---------------------------------------------------------------- 初期化・購読
window.wall.onConfig((c) => { config = c; renderAll(); });
window.wall.onWeather((d) => { weatherData = d; tick(); });
window.wall.onStats((d) => { statsData = d; tick(); });
window.wall.onEditMode((v) => {
  editing = v;
  document.body.classList.toggle('edit', v);
  if (!v) { guideV.style.display = guideH.style.display = 'none'; sizeBadge.style.display = 'none'; }
});

(async () => {
  const st = await window.wall.requestState();
  config = st.config;
  weatherData = st.weather;
  renderAll();
  setInterval(tick, 300);
})();
