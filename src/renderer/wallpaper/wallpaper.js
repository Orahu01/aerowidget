// WidgetWall — 壁紙レンダラ (v2: マルチモニタ / 省電力 / ゾーン・ライン・フォルダ)
'use strict';

const DISPLAY = Number(new URLSearchParams(location.search).get('display') || 0);

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
let systemWallpaper = '';
let weatherData = null;
let hwData = null;
let mediaData = null;          // 再生中メディア (SMTC)
const rssData = new Map();     // url -> { items, error }
const tickerData = new Map();  // symbol -> { price, changePct, ... }
const hwHist = new Map();      // metric -> number[] (スパークライン用)
let editing = false;
let paused = false;
let mediaKey = '';
let tickTimer = null;
let slideTimer = null;
let slideIdx = 0;
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

function myWallpaper() {
  const w = config.wallpapers || {};
  return (w.byDisplay || {})[String(DISPLAY)] || w.default || { type: 'preset', value: 'aurora', dim: 0, blur: 0 };
}

function myWidgets() {
  return (config.widgets || []).filter(w => (w.display || 0) === DISPLAY);
}

function customCss(v) {
  const colors = (v && v.colors && v.colors.length) ? v.colors : ['#223', '#112'];
  if (v.kind === 'solid' || colors.length === 1) return colors[0];
  if (v.kind === 'radial') {
    return `radial-gradient(120% 120% at 25% 20%, ${colors.join(', ')})`;
  }
  return `linear-gradient(${v.angle ?? 135}deg, ${colors.join(', ')})`;
}

// フォルダウィジェットの寸法 (main 側と同じ式)
function folderDims(o) {
  const n = Math.max(1, (o.items || []).length);
  const cols = o.columns > 0 ? o.columns : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const icon = o.iconSize || 34;
  const labels = o.showLabels !== false;
  const cellW = Math.max(58, icon + 30);
  const cellH = icon + (labels ? 34 : 12);
  return { cols, rows, w: 20 + cols * cellW, h: 16 + (o.title ? 28 : 0) + rows * cellH };
}

// ---------------------------------------------------------------- 背景
function mediaFilter(wp, el) {
  const parts = [];
  if (wp.bright > 0) parts.push(`brightness(${1 + wp.bright / 100})`);
  if (wp.blur > 0) parts.push(`blur(${wp.blur}px)`);
  el.style.filter = parts.join(' ');
  if (wp.blur > 0 && el.tagName !== 'DIV') el.style.transform = 'scale(1.06)';
}

// スライドショー: 2 枚の img をクロスフェードで入れ替える
function startSlideshow(box, wp) {
  clearTimeout(slideTimer);
  const v = wp.value || {};
  const files = v.files || [];
  if (!files.length) return;
  const imgs = box.querySelectorAll('img');
  let active = 0;
  slideIdx = slideIdx % files.length;
  imgs[0].src = fileUrl(files[slideIdx]);
  imgs[0].classList.add('on');

  const advance = () => {
    if (!box.isConnected) return; // 壁紙が切り替わったら終了
    if (!paused && files.length > 1) {
      slideIdx = (slideIdx + 1) % files.length;
      const next = imgs[1 - active];
      const cur = imgs[active];
      next.src = fileUrl(files[slideIdx]);
      const show = () => {
        next.classList.add('on');
        if (v.fade === false) cur.classList.remove('on');
        else setTimeout(() => cur.classList.remove('on'), 60);
        active = 1 - active;
      };
      if (next.complete) show();
      else next.onload = show;
    }
    slideTimer = setTimeout(advance, Math.max(1, v.intervalMin || 5) * 60 * 1000);
  };
  slideTimer = setTimeout(advance, Math.max(1, v.intervalMin || 5) * 60 * 1000);
}

function renderMedia() {
  const wp = myWallpaper();
  const npArt = wp.type === 'nowplaying' ? (mediaData && mediaData.art) || '' : '';
  const key = JSON.stringify([wp.type, wp.value, wp.blur, wp.bright, wp.animate,
    wp.type === 'system' ? systemWallpaper : '', npArt.length ? npArt.length + npArt.slice(-32) : 0]);
  if (key !== mediaKey) {
    mediaKey = key;
    clearTimeout(slideTimer);
    mediaBox.innerHTML = '';
    let el = null;
    if (wp.type === 'image' || (wp.type === 'system' && systemWallpaper)) {
      el = document.createElement('img');
      el.src = fileUrl(wp.type === 'system' ? systemWallpaper : wp.value);
    } else if (wp.type === 'video') {
      el = document.createElement('video');
      el.src = fileUrl(wp.value);
      el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true;
      if (paused) el.pause();
    } else if (wp.type === 'slideshow') {
      el = document.createElement('div');
      el.className = 'slide-box';
      el.innerHTML = '<img class="slide" draggable="false"><img class="slide" draggable="false">';
      startSlideshow(el, wp);
    } else if (wp.type === 'nowplaying') {
      el = document.createElement('div');
      el.className = 'np-bg';
      if (npArt) {
        const img = document.createElement('img');
        img.src = npArt;
        el.appendChild(img);
      } else {
        el.style.background = PRESETS.midnight;
      }
    } else if (wp.type === 'color') {
      el = document.createElement('div');
      el.className = 'preset-bg';
      el.style.background = wp.value;
    } else if (wp.type === 'custom') {
      el = document.createElement('div');
      el.className = 'preset-bg';
      el.style.background = customCss(wp.value || {});
      if (wp.animate) el.classList.add('anim');
    } else {
      el = document.createElement('div');
      el.className = 'preset-bg';
      el.style.background = PRESETS[wp.value] || PRESETS.aurora;
      if (wp.animate) el.classList.add('anim');
    }
    mediaFilter(wp, el);
    mediaBox.appendChild(el);
  }
  dimBox.style.opacity = (wp.dim || 0) / 100;
}

// ---------------------------------------------------------------- ウィジェット内容
// 数字を 1 桁ずつ固定幅の枠に入れる。プロポーショナルフォントでも
// 秒の更新のたびに時計全体がガタガタ動かなくなる (幅は常に一定)
function digitFix(escaped) {
  return escaped.replace(/\d/g, (d) => `<span class="d">${d}</span>`);
}

function clockHtml(o) {
  const d = new Date();
  let h = d.getHours();
  let ampm = '';
  if (o.hour12) { ampm = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
  let t = (o.hour12 ? String(h) : String(h).padStart(2, '0')) + ':' + String(d.getMinutes()).padStart(2, '0');
  if (o.showSeconds) t += ':' + String(d.getSeconds()).padStart(2, '0');
  return digitFix(esc(t)) + (o.hour12 && o.showAmPm ? `<span class="ampm">${ampm}</span>` : '');
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

// 値を固定幅で整形する (white-space: pre 前提)。
// 数値の桁数が変わっても行の幅が動かないので、表示がガタつかない
const padV = (v, n) => String(v == null ? '--' : v).padStart(n, ' ');

function fmtRate(x) {
  if (x == null) return '   -- KB/s';
  if (x >= 1) return (x >= 100 ? x.toFixed(0) : x.toFixed(1)).padStart(5, ' ') + ' MB/s';
  return String(Math.round(x * 1024)).padStart(5, ' ') + ' KB/s';
}

// 温度をしきい値で色分けして描画する
function tempHtml(temp, warn) {
  if (temp == null) return '       ';
  const s = `  ${padV(temp, 3)}°C`;
  return temp >= warn ? `<span class="hw-hot">${s}</span>` : s;
}

function statsHtml(o) {
  const d = hwData;
  if (!d || !d.ok) return '<span class="row">HWモニタ待機中…</span>';
  const temps = o.showTemps !== false;
  const warn = +o.tempWarn > 0 ? +o.tempWarn : 85;
  const spark = (k) => (o.showGraph ? `<canvas class="hw-spark" data-k="${k}"></canvas>` : '');
  const rows = [];
  if (o.showCpu !== false && d.cpu) {
    let s = `CPU ${padV(d.cpu.load, 3)}%`;
    if (temps) s += tempHtml(d.cpu.temp, warn);
    rows.push(s + spark('cpu'));
  }
  if (o.showGpu !== false && d.gpu && (d.gpu.load != null || d.gpu.temp != null)) {
    let s = `GPU ${padV(d.gpu.load, 3)}%`;
    if (temps) s += tempHtml(d.gpu.temp, warn);
    rows.push(s + spark('gpu'));
  }
  if (o.showMem !== false && d.mem) {
    let s = `MEM ${padV(d.mem.load, 3)}%`;
    if (!o.compact && d.mem.usedGb != null && d.mem.totalGb) {
      s += `  ${padV(d.mem.usedGb.toFixed(1), 5)}/${d.mem.totalGb}GB`;
    }
    rows.push(s + spark('mem'));
  }
  if (o.showDrives && d.drives) {
    for (const dr of d.drives) {
      const name = String(dr.name || 'Drive').slice(0, 14).padEnd(14, ' ');
      rows.push(`SSD ${esc(name)}${dr.temp != null ? tempHtml(dr.temp, warn) : '      '}${dr.used != null ? ` ${padV(dr.used, 3)}%` : ''}`);
    }
  }
  if (o.showNet && d.net) {
    rows.push(`NET ↓${fmtRate(d.net.down)}  ↑${fmtRate(d.net.up)}`);
  }
  if (!rows.length) return '';
  if (o.compact) return `<span class="row">${rows.map(r => r.replace(/ +$/, '')).join('　')}</span>`;
  return rows.map(r => `<span class="row">${r}</span>`).join('');
}

// スパークライン履歴の蓄積 (hw 更新ごとに 1 点、最大 90 点 = 約 3 分)
function pushHist(k, v) {
  if (v == null) return;
  const a = hwHist.get(k) || [];
  a.push(v);
  if (a.length > 90) a.shift();
  hwHist.set(k, a);
}

function drawSparks(root, w) {
  const canvases = root.querySelectorAll('.hw-spark');
  if (!canvases.length) return;
  const cw = Math.round(Math.min(220, Math.max(60, w.size * 5)));
  const ch = Math.round(Math.max(10, w.size * 0.85));
  for (const cv of canvases) {
    const data = hwHist.get(cv.dataset.k) || [];
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== ch) cv.height = ch;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    if (data.length < 2) continue;
    ctx.beginPath();
    const n = data.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (90 - 1)) * cw;
      const y = ch - 1 - (Math.min(100, Math.max(0, data[i])) / 100) * (ch - 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = hexA(w.color, 0.85);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineTo(((n - 1) / 89) * cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = hexA(w.color, 0.14);
    ctx.fill();
  }
}

function zoneHtml(o) {
  let html = '';
  if (o.label) html += `<span class="zone-label pos-${o.labelPos || 'tl'}">${esc(o.label)}</span>`;
  html += '<div class="rs-handle"></div>';
  return html;
}

function folderPhHtml(w) {
  const o = w.options || {};
  const dims = folderDims(o);
  const icon = o.iconSize || 34;
  let cells = '';
  for (const it of (o.items || [])) {
    cells += `<div class="fph-cell" data-icon="${esc(it.path)}" style="width:${icon}px;height:${icon}px"></div>`;
  }
  if (!(o.items || []).length) cells = `<div class="fph-cell" style="width:${icon}px;height:${icon}px"></div>`;
  return (o.title ? `<div class="fph-title">${esc(o.title)}</div>` : '')
    + `<div class="fph-grid" style="grid-template-columns: repeat(${dims.cols}, minmax(0, 1fr))">${cells}</div>`;
}

function imageHtml(o) {
  if (!o.path) return '<span class="img-empty">設定画面で画像を選択</span>';
  return `<img class="img-body" src="${fileUrl(o.path)}" draggable="false">`;
}

function analogHtml(o) {
  return `<div class="an-face${o.showTicks !== false ? ' ticks' : ''}">`
    + '<div class="an-hand an-h"></div>'
    + '<div class="an-hand an-m"></div>'
    + (o.showSeconds !== false ? '<div class="an-hand an-s"></div>' : '')
    + '<div class="an-cap"></div></div>';
}

function updateAnalog(el, o) {
  const d = new Date();
  const s = d.getSeconds();
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  const set = (sel, deg) => {
    const hand = el.querySelector(sel);
    if (hand) hand.style.transform = `translateX(-50%) rotate(${deg}deg)`;
  };
  set('.an-h', h * 30);
  set('.an-m', m * 6);
  if (o.showSeconds !== false) set('.an-s', s * 6);
}

function calendarHtml(o) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const first = new Date(y, m, 1);
  const daysIn = new Date(y, m + 1, 0).getDate();
  const start = first.getDay(); // 日曜はじまり
  let html = `<div class="cal-head">${y}年${m + 1}月</div><div class="cal-grid">`;
  if (o.showWeekdays !== false) {
    WEEK_JA.forEach((wd, i) => {
      const cls = o.sundayColor !== false ? (i === 0 ? ' sun' : i === 6 ? ' sat' : '') : '';
      html += `<span class="cal-wd${cls}">${wd}</span>`;
    });
  }
  for (let i = 0; i < start; i++) html += '<span class="cal-day empty"></span>';
  for (let d = 1; d <= daysIn; d++) {
    const dow = (start + d - 1) % 7;
    let cls = 'cal-day';
    if (d === today) cls += ' today';
    else if (o.sundayColor !== false) { if (dow === 0) cls += ' sun'; else if (dow === 6) cls += ' sat'; }
    html += `<span class="${cls}">${d}</span>`;
  }
  html += '</div>';
  return html;
}

function countdownHtml(o) {
  if (!o.date) return '<span class="sub">日付を設定してください</span>';
  const target = new Date(o.date + 'T00:00:00');
  if (isNaN(target)) return '<span class="sub">日付が不正です</span>';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 86400000);
  let main;
  if (days > 0) main = `あと <span class="cd-num">${days}</span> 日`;
  else if (days === 0) main = '<span class="cd-num">今日</span>';
  else if (o.showPast !== false) main = `<span class="cd-num">${-days}</span> 日経過`;
  else main = '終了';
  return (o.title ? `<div class="sub cd-title">${esc(o.title)}</div>` : '') + main;
}

function rssHtml(o) {
  const rec = rssData.get(o.url);
  if (!rec || !rec.items || !rec.items.length) {
    return `<span class="row sub">${rec && rec.error ? 'フィードを取得できません' : 'ニュース取得中…'}</span>`;
  }
  const items = rec.items;
  const rotate = +o.rotateSec > 0;
  if (rotate) {
    const idx = Math.floor(Date.now() / (o.rotateSec * 1000)) % items.length;
    return `<span class="row">・ ${esc(items[idx].title)}</span>`;
  }
  return items.slice(0, Math.max(1, o.count || 3))
    .map(it => `<span class="row">・ ${esc(it.title)}</span>`)
    .join('');
}

function fmtPrice(p) {
  if (p == null) return '   --';
  if (p >= 1000) return Math.round(p).toLocaleString('en-US');
  if (p >= 100) return p.toFixed(1);
  return p.toFixed(2);
}

function tickerHtml(o) {
  const syms = String(o.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!syms.length) return '<span class="row sub">銘柄を設定してください</span>';
  const width = Math.min(12, Math.max(4, ...syms.map(s => s.length)));
  const rows = syms.map(sym => {
    const d = tickerData.get(sym);
    const name = esc(sym.padEnd(width, ' '));
    if (!d || d.price == null) return `<span class="row">${name}  ${d && d.error ? '--' : '…'}</span>`;
    let chg = '';
    if (o.showChange !== false && d.changePct != null) {
      const up = d.changePct >= 0;
      chg = `  <span class="${up ? 'tk-up' : 'tk-down'}">${up ? '▲' : '▼'}${Math.abs(d.changePct).toFixed(2)}%</span>`;
    }
    return `<span class="row">${name}  ${padV(fmtPrice(d.price), 9)}${chg}</span>`;
  });
  return rows.join('');
}

// メモ / タイマー / 音量 / 再生中の曲は別ウィンドウ実体。編集モード用のプレースホルダだけ描く
function interPhHtml(w, label) {
  const o = w.options || {};
  return `<div class="iph"><span class="iph-label">${esc(o.title || label)}</span></div>`;
}

function widgetHtml(w) {
  switch (w.type) {
    case 'clock': return clockHtml(w.options || {});
    case 'date': return dateHtml(w.options || {});
    case 'weather': return weatherHtml(w.options || {});
    case 'stats': return statsHtml(w.options || {});
    case 'text': return esc((w.options && w.options.text) || '').replace(/\n/g, '<br>');
    case 'zone': return zoneHtml(w.options || {});
    case 'line': return '<div class="rs-handle"></div>';
    case 'folder': return folderPhHtml(w);
    case 'image': return imageHtml(w.options || {});
    case 'analog': return analogHtml(w.options || {});
    case 'calendar': return calendarHtml(w.options || {});
    case 'countdown': return countdownHtml(w.options || {});
    case 'rss': return rssHtml(w.options || {});
    case 'ticker': return tickerHtml(w.options || {});
    case 'nowplaying': return interPhHtml(w, '再生中の曲');
    case 'note': return interPhHtml(w, 'メモ');
    case 'pomo': return interPhHtml(w, 'ポモドーロ');
    case 'volume': return interPhHtml(w, '音量');
    default: return '';
  }
}

function applyWidgetStyle(el, w) {
  const o = w.options || {};
  el.className = 'widget ' + w.type
    + (w.type === 'folder' ? ' folderph' : '')
    + (['note', 'pomo', 'volume', 'nowplaying'].includes(w.type) ? ' interph' : '')
    + (w.type === 'line' && o.orient === 'v' ? ' vert' : '');
  el.style.cssText = '';
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

  if (w.type === 'zone') {
    el.style.width = (o.w || 20) + '%';
    el.style.height = (o.h || 25) + '%';
    el.style.background = hexA(o.fill || '#4f8cff', o.fillOpacity ?? 0.08);
    el.style.border = `${o.borderWidth ?? 1.5}px ${o.borderStyle || 'dashed'} ${hexA(o.borderColor || '#7db4ff', o.borderOpacity ?? 0.55)}`;
    el.style.borderRadius = (o.radius ?? 16) + 'px';
  } else if (w.type === 'line') {
    const style = `${o.thick ?? 2}px ${o.style || 'solid'} ${w.color}`;
    if (o.orient === 'v') {
      el.style.height = (o.len || 25) + '%';
      el.style.width = '0px';
      el.style.borderLeft = style;
    } else {
      el.style.width = (o.len || 25) + '%';
      el.style.height = '0px';
      el.style.borderTop = style;
    }
  } else if (w.type === 'folder') {
    const dims = folderDims(o);
    el.style.width = dims.w + 'px';
    el.style.height = dims.h + 'px';
    el.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.55})`;
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.borderRadius = '14px';
  } else if (w.type === 'image') {
    el.style.width = (o.w || 18) + '%';
    el.style.borderRadius = (o.radius ?? 12) + 'px';
    el.style.overflow = 'hidden';
    el.style.lineHeight = '0';
    el.style.textShadow = 'none';
    if (w.shadow === 'glow') {
      el.style.boxShadow = `0 0 24px ${hexA(w.color, 0.55)}, 0 6px 24px rgba(0,0,0,.4)`;
    } else if (w.shadow === 'soft') {
      el.style.boxShadow = '0 8px 32px rgba(0,0,0,.45)';
    }
  } else if (w.type === 'analog') {
    el.style.width = el.style.height = w.size + 'px';
    el.style.setProperty('--anc', w.color);
    el.style.setProperty('--anc-dim', hexA(w.color, 0.35));
    const face = o.face === 'none' ? 'transparent'
      : o.face === 'light' ? `rgba(255,255,255,${o.faceOpacity ?? 0.25})`
        : `rgba(8,10,14,${o.faceOpacity ?? 0.25})`;
    el.style.setProperty('--anface', face);
  } else if (w.type === 'calendar') {
    if (o.bg !== false) {
      el.style.background = `rgba(8,10,14,${o.bgOpacity ?? 0.3})`;
      el.style.borderRadius = '12px';
      el.style.padding = '0.7em 0.9em';
    }
    el.style.setProperty('--cal-acc', o.accent || '#e3a94f');
  } else if (['note', 'pomo', 'volume', 'nowplaying'].includes(w.type)) {
    const defs = { note: [240, 180], pomo: [210, 150], volume: [260, 120], nowplaying: [320, 96] }[w.type];
    el.style.width = (o.w || defs[0]) + 'px';
    el.style.height = (o.h || defs[1]) + 'px';
    el.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.6})`;
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.borderRadius = '14px';
  } else if (w.type === 'rss' || w.type === 'ticker') {
    el.style.textAlign = 'left';
  }
}

async function fillFolderIcons(root) {
  for (const cell of root.querySelectorAll('.fph-cell[data-icon]')) {
    const url = await window.wall.getIcon(cell.dataset.icon);
    if (url && !cell.querySelector('img')) {
      const img = document.createElement('img');
      img.src = url;
      cell.appendChild(img);
    }
  }
}

function renderWidgets() {
  widgetsBox.innerHTML = '';
  widgetEls.clear();
  for (const w of myWidgets()) {
    const el = document.createElement('div');
    el.dataset.id = w.id;
    applyWidgetStyle(el, w);
    el.innerHTML = widgetHtml(w);
    widgetsBox.appendChild(el);
    widgetEls.set(w.id, { el, lastHtml: '' });
    if (w.type === 'folder') fillFolderIcons(el);
  }
}

// 内容だけ更新 (DOM 再構築なし)。kinds を渡すとそのタイプのみ
function tick(kinds) {
  if (!config) return;
  for (const w of myWidgets()) {
    if (kinds && !kinds.includes(w.type)) continue;
    const rec = widgetEls.get(w.id);
    if (!rec) continue;
    // アナログ時計は針の transform だけ更新する (レイアウト計算なし)
    if (w.type === 'analog') { updateAnalog(rec.el, w.options || {}); continue; }
    const html = widgetHtml(w);
    if (html !== rec.lastHtml) {
      rec.lastHtml = html;
      rec.el.innerHTML = html;
      if (w.type === 'stats') drawSparks(rec.el, w);
    } else if (w.type === 'stats' && (w.options || {}).showGraph) {
      drawSparks(rec.el, w);
    }
  }
}

// 秒表示がある時だけ毎秒、それ以外は毎分しか起きない (省電力の要)
function scheduleTick() {
  clearTimeout(tickTimer);
  if (paused || !config) return;
  const needSec = myWidgets().some(w =>
    (w.type === 'clock' && w.options && w.options.showSeconds) ||
    (w.type === 'analog' && (!w.options || w.options.showSeconds !== false)) ||
    (w.type === 'rss' && w.options && +w.options.rotateSec > 0 && +w.options.rotateSec < 60));
  const now = Date.now();
  const delay = needSec ? (1000 - now % 1000) + 5 : (60000 - now % 60000) + 10;
  tickTimer = setTimeout(() => {
    tick(['clock', 'date', 'analog', 'calendar', 'countdown', 'rss']);
    scheduleTick();
  }, delay);
}

function renderAll() {
  if (!config) return;
  renderMedia();
  renderWidgets();
  tick();
  scheduleTick();
}

// ---------------------------------------------------------------- 編集モード
let drag = null; // { w, el, mode:'move'|'resize', offX, offY }

function findWidget(el) {
  const box = el && el.closest ? el.closest('.widget') : null;
  if (!box) return null;
  const w = config.widgets.find(x => x.id === box.dataset.id);
  return w ? { w, el: box } : null;
}

function showBadge(text, x, y) {
  sizeBadge.style.display = 'block';
  sizeBadge.textContent = text;
  sizeBadge.style.left = Math.min(x + 18, innerWidth - 220) + 'px';
  sizeBadge.style.top = Math.min(y + 22, innerHeight - 40) + 'px';
  clearTimeout(showBadge.t);
  showBadge.t = setTimeout(() => { sizeBadge.style.display = 'none'; }, 1200);
}

widgetsBox.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  const hit = findWidget(e.target);
  if (!hit) return;
  const isHandle = e.target.classList && e.target.classList.contains('rs-handle');
  const rect = hit.el.getBoundingClientRect();
  drag = {
    w: hit.w, el: hit.el,
    mode: isHandle ? 'resize' : 'move',
    offX: e.clientX - (rect.left + rect.width / 2),
    offY: e.clientY - (rect.top + rect.height / 2),
  };
  hit.el.classList.add('dragging');
  hit.el.setPointerCapture(e.pointerId);
});

widgetsBox.addEventListener('pointermove', (e) => {
  if (!editing || !drag) return;
  const w = drag.w;
  const o = w.options || {};

  if (drag.mode === 'resize') {
    const cx = (w.x / 100) * innerWidth;
    const cy = (w.y / 100) * innerHeight;
    if (w.type === 'zone') {
      o.w = Math.max(4, Math.min(100, (Math.abs(e.clientX - cx) * 2 / innerWidth) * 100));
      o.h = Math.max(4, Math.min(100, (Math.abs(e.clientY - cy) * 2 / innerHeight) * 100));
      o.w = Math.round(o.w * 10) / 10;
      o.h = Math.round(o.h * 10) / 10;
      window.wall.editLive(w.id, { options: { w: o.w, h: o.h } });
      showBadge(`${o.w.toFixed(0)}% × ${o.h.toFixed(0)}%`, e.clientX, e.clientY);
    } else if (w.type === 'line') {
      if (o.orient === 'v') {
        o.len = Math.max(3, Math.min(100, (Math.abs(e.clientY - cy) * 2 / innerHeight) * 100));
      } else {
        o.len = Math.max(3, Math.min(100, (Math.abs(e.clientX - cx) * 2 / innerWidth) * 100));
      }
      o.len = Math.round(o.len * 10) / 10;
      window.wall.editLive(w.id, { options: { len: o.len } });
      showBadge(`長さ ${o.len.toFixed(0)}%`, e.clientX, e.clientY);
    }
    applyWidgetStyle(drag.el, w);
    return;
  }

  let x = ((e.clientX - drag.offX) / innerWidth) * 100;
  let y = ((e.clientY - drag.offY) / innerHeight) * 100;

  const xs = [50], ys = [50];
  for (const other of myWidgets()) {
    if (other.id !== w.id) { xs.push(other.x); ys.push(other.y); }
  }
  let sx = null, sy = null;
  for (const c of xs) if (Math.abs(x - c) < 0.7) { x = c; sx = c; break; }
  for (const c of ys) if (Math.abs(y - c) < 0.7) { y = c; sy = c; break; }
  guideV.style.display = sx != null ? 'block' : 'none';
  guideH.style.display = sy != null ? 'block' : 'none';
  if (sx != null) guideV.style.left = sx + '%';
  if (sy != null) guideH.style.top = sy + '%';

  w.x = Math.max(0, Math.min(100, x));
  w.y = Math.max(0, Math.min(100, y));
  drag.el.style.left = w.x + '%';
  drag.el.style.top = w.y + '%';
  window.wall.editLive(w.id, { x: w.x, y: w.y });
  showBadge(`${Math.round(w.size)}px ・ ${w.x.toFixed(1)}% , ${w.y.toFixed(1)}%`, e.clientX, e.clientY);
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
  const w = hit.w;
  const o = w.options || {};
  const up = e.deltaY < 0;

  if (w.type === 'line') {
    o.thick = Math.max(1, Math.min(14, (o.thick ?? 2) + (up ? 1 : -1)));
    window.wall.editLive(w.id, { options: { thick: o.thick } });
    showBadge(`太さ ${o.thick}px`, e.clientX, e.clientY);
  } else if (w.type === 'image') {
    const step = e.shiftKey ? 4 : 1;
    o.w = Math.max(3, Math.min(100, Math.round(((o.w || 18) + (up ? step : -step)) * 10) / 10));
    window.wall.editLive(w.id, { options: { w: o.w } });
    showBadge(`幅 ${o.w}%`, e.clientX, e.clientY);
  } else if (['note', 'pomo', 'volume', 'nowplaying'].includes(w.type)) {
    const f = up ? 1.05 : 0.95;
    const defs = { note: [240, 180], pomo: [210, 150], volume: [260, 120], nowplaying: [320, 96] }[w.type];
    o.w = Math.round(Math.max(140, Math.min(800, (o.w || defs[0]) * f)));
    o.h = Math.round(Math.max(60, Math.min(600, (o.h || defs[1]) * f)));
    window.wall.editLive(w.id, { options: { w: o.w, h: o.h } });
    showBadge(`${o.w} × ${o.h}px`, e.clientX, e.clientY);
  } else if (w.type === 'folder') {
    o.iconSize = Math.max(20, Math.min(72, (o.iconSize || 34) + (up ? 2 : -2)));
    window.wall.editLive(w.id, { options: { iconSize: o.iconSize } });
    hit.el.innerHTML = widgetHtml(w);
    fillFolderIcons(hit.el);
    showBadge(`アイコン ${o.iconSize}px`, e.clientX, e.clientY);
  } else {
    const step = e.shiftKey ? 8 : 2;
    w.size = Math.max(8, Math.min(600, w.size + (up ? step : -step)));
    window.wall.editLive(w.id, { size: w.size });
    showBadge(`${Math.round(w.size)}px`, e.clientX, e.clientY);
  }
  applyWidgetStyle(hit.el, w);
}, { passive: false });

$('#edit-done').addEventListener('click', () => window.wall.finishEdit());

// デスクトップアイコンの表示切替 (編集モード中のみ操作できる)
const iconsBtn = $('#edit-icons');
function renderIconsBtn(visible) {
  iconsBtn.textContent = visible ? 'アイコンを隠す' : 'アイコンを表示';
  iconsBtn.classList.toggle('on', !visible);
}
iconsBtn.addEventListener('click', async () => {
  const now = await window.wall.getIconsVisible();
  renderIconsBtn(await window.wall.setIconsVisible(!now));
});
window.wall.onIconsState((v) => renderIconsBtn(v));
window.addEventListener('keydown', (e) => {
  if (editing && e.key === 'Escape') window.wall.finishEdit();
});

// ---------------------------------------------------------------- フォント / 購読 / 初期化
async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.wall.getFontsCss();
  } catch (_) {}
}

function applyEnv(env) {
  config = env.config;
  systemWallpaper = env.systemWallpaper || '';
  renderAll();
}

window.wall.onConfig((env) => applyEnv(env));
window.wall.onWeather((d) => { weatherData = d; tick(['weather']); });
window.wall.onHw((d) => {
  hwData = d;
  if (d && d.ok) {
    pushHist('cpu', d.cpu && d.cpu.load);
    pushHist('gpu', d.gpu && d.gpu.load);
    pushHist('mem', d.mem && d.mem.load);
  }
  tick(['stats']);
});
window.wall.onMedia((d) => {
  mediaData = d;
  tick(['nowplaying']);
  if (myWallpaper().type === 'nowplaying') renderMedia();
});
window.wall.onRss((d) => {
  rssData.set(d.url, d);
  tick(['rss']);
});
window.wall.onTicker((d) => {
  tickerData.set(d.symbol, d);
  tick(['ticker']);
});
window.wall.onFontsChanged(() => injectFonts());
window.wall.onEditMode((v) => {
  editing = v;
  document.body.classList.toggle('edit', v);
  if (!v) {
    guideV.style.display = guideH.style.display = 'none';
    sizeBadge.style.display = 'none';
  } else {
    renderWidgets();
    tick();
    window.wall.getIconsVisible().then(renderIconsBtn);
  }
});
window.wall.onPower(({ paused: p }) => {
  paused = p;
  document.body.classList.toggle('paused', p);
  const video = mediaBox.querySelector('video');
  if (video) { if (p) video.pause(); else video.play().catch(() => {}); }
  if (!p) { tick(); }
  scheduleTick();
});

(async () => {
  const st = await window.wall.requestState();
  config = st.config;
  systemWallpaper = st.systemWallpaper || '';
  weatherData = st.weather;
  hwData = st.hw;
  mediaData = st.media;
  if (st.feeds) {
    for (const [url, v] of Object.entries(st.feeds.rss || {})) rssData.set(url, { url, ...v });
    for (const [sym, v] of Object.entries(st.feeds.ticker || {})) tickerData.set(sym, { symbol: sym, ...v });
  }
  editing = !!st.editing;
  document.body.classList.toggle('edit', editing);
  injectFonts();
  renderAll();
})();
