// WidgetWall — 設定画面 (v3)
'use strict';

const PRESETS = {
  aurora: { label: 'オーロラ', css: `radial-gradient(45% 60% at 18% 82%, rgba(56,110,240,.55), transparent 65%), radial-gradient(50% 55% at 82% 20%, rgba(20,190,180,.4), transparent 65%), radial-gradient(55% 65% at 70% 85%, rgba(120,80,220,.45), transparent 65%), linear-gradient(155deg, #070b18, #0b1228 55%, #081120)` },
  sunset: { label: 'サンセット', css: `radial-gradient(50% 60% at 20% 85%, rgba(255,120,90,.5), transparent 65%), radial-gradient(55% 60% at 80% 25%, rgba(255,180,90,.35), transparent 60%), radial-gradient(60% 70% at 65% 80%, rgba(190,70,140,.4), transparent 65%), linear-gradient(155deg, #190f1e, #2a1226 55%, #190c18)` },
  midnight: { label: 'ミッドナイト', css: `radial-gradient(60% 80% at 70% 20%, rgba(40,70,160,.28), transparent 65%), radial-gradient(50% 60% at 20% 80%, rgba(30,50,110,.22), transparent 65%), linear-gradient(170deg, #05070d, #090d1a 60%, #05070d)` },
  sakura: { label: 'サクラ', css: `radial-gradient(50% 60% at 22% 80%, rgba(240,120,170,.38), transparent 65%), radial-gradient(55% 60% at 80% 22%, rgba(200,140,240,.3), transparent 62%), radial-gradient(60% 70% at 70% 85%, rgba(255,170,190,.25), transparent 65%), linear-gradient(155deg, #1c1220, #2a1626 55%, #1b1020)` },
  forest: { label: 'フォレスト', css: `radial-gradient(50% 60% at 20% 82%, rgba(30,160,120,.35), transparent 65%), radial-gradient(55% 60% at 82% 22%, rgba(90,180,90,.22), transparent 62%), radial-gradient(60% 70% at 68% 85%, rgba(20,110,110,.35), transparent 65%), linear-gradient(155deg, #08120e, #0c1c16 55%, #081410)` },
  mono: { label: 'モノトーン', css: `radial-gradient(60% 75% at 30% 25%, rgba(255,255,255,.06), transparent 60%), linear-gradient(160deg, #101014, #16161c 55%, #0e0e12)` },
};

const TYPES = {
  clock: { icon: 'i-clock', label: '時計 (デジタル)' },
  analog: { icon: 'i-analog', label: '時計 (アナログ)' },
  date: { icon: 'i-date', label: '日付' },
  calendar: { icon: 'i-caldays', label: 'カレンダー' },
  weather: { icon: 'i-weather', label: '天気' },
  text: { icon: 'i-text', label: 'テキスト' },
  image: { icon: 'i-photo', label: '画像' },
  stats: { icon: 'i-stats', label: 'ハードウェアモニタ' },
  nowplaying: { icon: 'i-music', label: '再生中の曲' },
  volume: { icon: 'i-volume', label: '音量・出力切替' },
  countdown: { icon: 'i-flag', label: 'カウントダウン' },
  rss: { icon: 'i-rss', label: 'ニュース (RSS)' },
  ticker: { icon: 'i-trend', label: '株価・為替' },
  note: { icon: 'i-note', label: 'メモ (書き込める付箋)' },
  pomo: { icon: 'i-timer', label: 'ポモドーロタイマー' },
  zone: { icon: 'i-zone', label: 'ゾーン (色分け枠)' },
  line: { icon: 'i-line', label: 'ライン (線)' },
  folder: { icon: 'i-folder', label: 'フォルダ (アプリまとめ)' },
};

const FALLBACK_FONTS = [
  'Segoe UI', 'Segoe UI Light', 'Yu Gothic UI', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'MS Gothic',
  'BIZ UDGothic', 'BIZ UDPGothic', 'UD Digi Kyokasho N-R', 'Consolas', 'Cascadia Code', 'Courier New',
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Georgia', 'Impact', 'Lucida Console', 'Malgun Gothic', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

const MAX_CUSTOM_COLORS = 10;

let cfg = null;
let sysWall = '';
let displays = [];
let wpTarget = null;          // null = すべて共通, number = モニタ index
let lhmOnline = false;
let systemFonts = [];
let suppressUntil = 0;
const expanded = new Set();
const debTimers = new Map();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function svgIcon(id, cls = 'ic') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

function touch() { suppressUntil = Date.now() + 1500; }

function debounced(key, ms, fn) {
  clearTimeout(debTimers.get(key));
  debTimers.set(key, setTimeout(fn, ms));
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function patchWidget(id, patch, opts = {}) {
  touch();
  const w = cfg.widgets.find(x => x.id === id);
  if (w) {
    const { options, ...rest } = patch;
    Object.assign(w, rest);
    if (options) Object.assign(w.options, options);
  }
  if (opts.debounce) {
    debounced('w:' + id + ':' + Object.keys(patch).join(','), 140, () => window.api.updateWidget(id, patch));
  } else {
    window.api.updateWidget(id, patch);
  }
}

function customCss(v) {
  const colors = (v && v.colors && v.colors.length) ? v.colors : ['#223', '#112'];
  if (v.kind === 'solid' || colors.length === 1) return colors[0];
  if (v.kind === 'radial') return `radial-gradient(120% 120% at 25% 20%, ${colors.join(', ')})`;
  return `linear-gradient(${v.angle ?? 135}deg, ${colors.join(', ')})`;
}

// 壁紙設定オブジェクト → プレビュー用 CSS
function wpCss(wp) {
  if (!wp) return '';
  if (wp.type === 'preset') return (PRESETS[wp.value] || PRESETS.aurora).css;
  if (wp.type === 'custom') return customCss(wp.value || {});
  if (wp.type === 'color') return wp.value;
  if (wp.type === 'nowplaying') return PRESETS.midnight.css;
  return 'linear-gradient(155deg, #202329, #16181c)';
}

// ---------------------------------------------------------------- タブ / タイトルバー
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
}));

$('#btn-min').addEventListener('click', () => window.api.minimize());
$('#btn-close').addEventListener('click', () => window.api.close());
$('#btn-edit-layout').addEventListener('click', () => window.api.enterEditMode());
$('#btn-quit').addEventListener('click', () => window.api.quitApp());

// ---------------------------------------------------------------- 壁紙タブ
function curWp() {
  if (wpTarget == null) return cfg.wallpapers.default;
  return cfg.wallpapers.byDisplay[String(wpTarget)] || cfg.wallpapers.default;
}

function setWp(patch) {
  touch();
  if (wpTarget == null) {
    Object.assign(cfg.wallpapers.default, patch);
  } else {
    const k = String(wpTarget);
    cfg.wallpapers.byDisplay[k] = Object.assign({}, cfg.wallpapers.default, cfg.wallpapers.byDisplay[k] || {}, patch);
  }
  window.api.setWallpaper(patch, wpTarget);
  renderWallpaperTab();
}

function renderTargetChips() {
  const row = $('#wp-target-row');
  if (displays.length <= 1) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  const box = $('#wp-target-chips');
  box.innerHTML = '';
  const mkChip = (label, target, hasOverride) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + ((wpTarget === target) ? ' active' : '');
    chip.textContent = label;
    if (hasOverride) {
      const x = document.createElement('span');
      x.className = 'clear-ov';
      x.textContent = '✕';
      x.title = 'このモニタの個別設定を解除';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        touch();
        delete cfg.wallpapers.byDisplay[String(target)];
        window.api.clearWallpaperOverride(target);
        renderWallpaperTab();
      });
      chip.appendChild(x);
    }
    chip.addEventListener('click', () => { wpTarget = target; renderWallpaperTab(); });
    box.appendChild(chip);
  };
  mkChip('すべて共通', null, false);
  for (const d of displays) {
    mkChip(d.label, d.index, !!cfg.wallpapers.byDisplay[String(d.index)]);
  }
}

function presetCard(inner, selected, name, onClick) {
  const card = document.createElement('div');
  card.className = 'preset-card' + (selected ? ' selected' : '');
  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  if (typeof inner === 'string') swatch.style.background = inner;
  else if (inner) swatch.appendChild(inner);
  const check = document.createElement('span');
  check.className = 'p-check';
  check.appendChild(svgIcon('i-check'));
  const label = document.createElement('span');
  label.className = 'p-name';
  label.textContent = name;
  card.appendChild(swatch);
  card.appendChild(check);
  card.appendChild(label);
  card.addEventListener('click', onClick);
  return card;
}

function renderPresets() {
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  const wp = curWp();

  // 透過モード: Windows の壁紙のままウィジェットだけ表示
  const sys = presetCard(svgIcon('i-monitor'), wp.type === 'system', '今の壁紙のまま',
    () => setWp({ type: 'system', value: '' }));
  sys.title = 'Windows の壁紙はそのままに、ウィジェットだけ表示します';
  grid.appendChild(sys);

  // 再生中の曲のアルバムアートを壁紙に
  const np = presetCard(svgIcon('i-music'), wp.type === 'nowplaying', 'アルバムアート',
    () => setWp({ type: 'nowplaying', value: '' }));
  np.title = 'Spotify やブラウザで再生中の曲のジャケットを、ぼかして壁紙にします';
  grid.appendChild(np);

  for (const [key, p] of Object.entries(PRESETS)) {
    grid.appendChild(presetCard(p.css, wp.type === 'preset' && wp.value === key, p.label,
      () => setWp({ type: 'preset', value: key })));
  }
}

// ---- カスタムビルダー ----
const cb = { kind: 'linear', angle: 135, colors: ['#e3a94f', '#22262e'] };

function renderCustomBuilder() {
  $$('#cb-kind-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === cb.kind));
  $('#cb-angle-row').style.display = cb.kind === 'linear' ? 'flex' : 'none';
  $('#cb-angle').value = cb.angle;
  $('#cb-angle-val').textContent = cb.angle + '°';
  const row = $('#cb-colors');
  row.innerHTML = '';
  cb.colors.forEach((c, i) => {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = c;
    inp.addEventListener('input', () => { cb.colors[i] = inp.value; renderCbPreview(); });
    row.appendChild(inp);
  });
  renderCbPreview();
  renderSavedPresets();
}

function renderCbPreview() {
  $('#cb-preview').style.background = customCss(cb);
}

function renderSavedPresets() {
  const grid = $('#cb-saved');
  grid.innerHTML = '';
  (cfg.settings.customPresets || []).forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'saved-card';
    card.style.background = customCss(v);
    card.title = 'クリックで壁紙に適用';
    const del = document.createElement('span');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      cfg.settings.customPresets.splice(i, 1);
      window.api.removeCustomPreset(i);
      renderSavedPresets();
    });
    card.appendChild(del);
    card.addEventListener('click', () => {
      Object.assign(cb, clone(v));
      renderCustomBuilder();
      setWp({ type: 'custom', value: clone(v) });
    });
    grid.appendChild(card);
  });
}

$$('#cb-kind-seg button').forEach(b => b.addEventListener('click', () => {
  cb.kind = b.dataset.v;
  renderCustomBuilder();
}));
$('#cb-angle').addEventListener('input', (e) => {
  cb.angle = +e.target.value;
  $('#cb-angle-val').textContent = cb.angle + '°';
  renderCbPreview();
});
$('#cb-add-color').addEventListener('click', () => {
  if (cb.colors.length < MAX_CUSTOM_COLORS) {
    const palette = ['#8b5cf6', '#2dd4bf', '#f472b6', '#facc15', '#60a5fa', '#34d399', '#fb923c', '#e879f9'];
    cb.colors.push(palette[cb.colors.length % palette.length]);
    renderCustomBuilder();
  }
});
$('#cb-del-color').addEventListener('click', () => {
  if (cb.colors.length > 1) { cb.colors.pop(); renderCustomBuilder(); }
});
$('#cb-apply').addEventListener('click', () => setWp({ type: 'custom', value: clone(cb) }));
$('#cb-save').addEventListener('click', () => {
  touch();
  const v = clone(cb);
  cfg.settings.customPresets = [v, ...(cfg.settings.customPresets || [])].slice(0, 24);
  window.api.saveCustomPreset(v);
  renderSavedPresets();
});

function renderWallpaperTab() {
  renderTargetChips();
  renderPresets();
  const wp = curWp();
  const label = $('#file-label');
  if (wp.type === 'image' || wp.type === 'video') {
    label.textContent = (wp.type === 'video' ? '動画: ' : '画像: ') + wp.value.split(/[\\/]/).pop();
  } else {
    label.textContent = '未選択';
  }
  const ssLabel = $('#slideshow-label');
  if (wp.type === 'slideshow' && wp.value && wp.value.files) {
    ssLabel.textContent = `${wp.value.files.length} 枚を再生中`;
    $('#slideshow-interval').value = String(wp.value.intervalMin || 5);
  } else {
    ssLabel.textContent = '未設定';
  }
  if (document.activeElement !== $('#wp-dim')) $('#wp-dim').value = wp.dim;
  if (document.activeElement !== $('#wp-bright')) $('#wp-bright').value = wp.bright || 0;
  if (document.activeElement !== $('#wp-blur')) $('#wp-blur').value = wp.blur;
  $('#wp-dim-val').textContent = wp.dim + '%';
  $('#wp-bright-val').textContent = '+' + (wp.bright || 0) + '%';
  $('#wp-blur-val').textContent = wp.blur + 'px';
  $('#wp-animate').checked = !!wp.animate;
}

$('#btn-pick').addEventListener('click', async () => {
  const r = await window.api.pickFile();
  if (!r) return;
  setWp({ type: r.kind, value: r.path });
});

$('#btn-pick-slideshow').addEventListener('click', async () => {
  const files = await window.api.pickImages();
  if (!files || !files.length) return;
  setWp({ type: 'slideshow', value: { files, intervalMin: +$('#slideshow-interval').value || 5, fade: true } });
});

$('#slideshow-interval').addEventListener('change', (e) => {
  const wp = curWp();
  if (wp.type === 'slideshow' && wp.value) {
    setWp({ value: { ...wp.value, intervalMin: +e.target.value || 5 } });
  }
});

for (const [id, prop, unit] of [['wp-dim', 'dim', '%'], ['wp-bright', 'bright', '%'], ['wp-blur', 'blur', 'px']]) {
  $('#' + id).addEventListener('input', (e) => {
    touch();
    const v = +e.target.value;
    $('#' + id + '-val').textContent = (prop === 'bright' ? '+' : '') + v + unit;
    debounced('wp:' + prop, 140, () => setWp({ [prop]: v }));
  });
}
$('#wp-animate').addEventListener('change', (e) => setWp({ animate: e.target.checked }));

// ---------------------------------------------------------------- フォントピッカー
const fontDropdown = $('#font-dropdown');
let fdOnPick = null;
let fdInput = null;

function gFontFamilies() {
  return (cfg.settings.googleFonts || []).map(f => f.family);
}

function openFontDropdown(input, onPick) {
  fdInput = input;
  fdOnPick = onPick;
  renderFontDropdown();
  const r = input.getBoundingClientRect();
  fontDropdown.style.display = 'block';
  fontDropdown.style.minWidth = Math.max(280, r.width) + 'px';
  const maxH = 300;
  if (r.bottom + maxH + 8 > innerHeight && r.top > maxH + 8) {
    fontDropdown.style.top = Math.max(8, r.top - maxH - 4) + 'px';
    fontDropdown.style.maxHeight = Math.min(maxH, r.top - 12) + 'px';
  } else {
    fontDropdown.style.top = (r.bottom + 4) + 'px';
    fontDropdown.style.maxHeight = Math.min(maxH, innerHeight - r.bottom - 16) + 'px';
  }
  fontDropdown.style.left = Math.min(r.left, innerWidth - 320) + 'px';
}

function renderFontDropdown() {
  if (!fdInput) return;
  const q = fdInput.value.trim().toLowerCase();
  const match = (n) => !q || n.toLowerCase().includes(q);
  const gf = gFontFamilies().filter(match);
  const sys = systemFonts.filter(match).slice(0, 400);
  let html = '';
  if (gf.length) {
    html += '<div class="fd-group">Google Fonts</div>';
    for (const f of gf) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'"><span class="fd-cloud">G</span>${esc(f)}</button>`;
  }
  if (sys.length) {
    html += '<div class="fd-group">システムフォント</div>';
    for (const f of sys) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</button>`;
  }
  if (!html) html = '<div class="fd-empty">見つかりません</div>';
  fontDropdown.innerHTML = html;
  fontDropdown.scrollTop = 0;
}

fontDropdown.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.fd-item');
  if (!item) return;
  e.preventDefault();
  const f = item.dataset.f;
  if (fdInput) fdInput.value = f;
  if (fdOnPick) fdOnPick(f);
  closeFontDropdown();
});

function closeFontDropdown() {
  fontDropdown.style.display = 'none';
  fdInput = null;
  fdOnPick = null;
}

document.addEventListener('mousedown', (e) => {
  if (fontDropdown.style.display === 'block' && !fontDropdown.contains(e.target) && e.target !== fdInput) {
    closeFontDropdown();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFontDropdown(); });
// コンテンツ側を実際にスクロールした時だけ閉じる (ドロップダウン内のスクロールでは閉じない)
$('#content').addEventListener('scroll', () => closeFontDropdown());

function mkFontPicker(value, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'font-pick';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value;
  inp.placeholder = 'フォント名で検索…';
  inp.addEventListener('focus', () => openFontDropdown(inp, onPick));
  inp.addEventListener('input', () => { if (fdInput === inp) renderFontDropdown(); else openFontDropdown(inp, onPick); });
  inp.addEventListener('change', () => onPick(inp.value));
  wrap.appendChild(inp);
  return wrap;
}

// ---------------------------------------------------------------- 小さな UI 部品
function ctlRow(labelText, ...els) {
  const row = document.createElement('div');
  row.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = labelText;
  row.appendChild(lab);
  for (const el of els) row.appendChild(el);
  return row;
}

function mkRange(min, max, step, value, onInput) {
  const r = document.createElement('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
  const val = document.createElement('span');
  val.className = 'val';
  const show = (v) => { val.textContent = v; };
  show(value);
  r.addEventListener('input', () => { show(r.value); onInput(+r.value); });
  return [r, val, show];
}

function mkSelect(optionPairs, value, onChange) {
  const s = document.createElement('select');
  for (const [v, label] of optionPairs) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    s.appendChild(o);
  }
  s.value = String(value);
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function mkSeg(optionPairs, value, onChange) {
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const [v, label] of optionPairs) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', String(v) === String(value));
    b.addEventListener('click', () => {
      [...seg.children].forEach(x => x.classList.toggle('on', x === b));
      onChange(v);
    });
    seg.appendChild(b);
  }
  return seg;
}

function mkCheck(labelText, checked, onChange) {
  const lab = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox'; c.checked = !!checked;
  c.addEventListener('change', () => onChange(c.checked));
  lab.appendChild(c);
  lab.appendChild(document.createTextNode(' ' + labelText));
  return lab;
}

function mkColor(value, onInput) {
  const c = document.createElement('input');
  c.type = 'color';
  c.value = value;
  c.addEventListener('input', () => onInput(c.value));
  return c;
}

function mkText(value, placeholder, onChange) {
  const t = document.createElement('input');
  t.type = 'text';
  t.value = value || '';
  t.placeholder = placeholder || '';
  t.style.flex = '1';
  t.addEventListener('change', () => onChange(t.value));
  return t;
}

function mkDelBtn(onClick, title = '削除') {
  const b = document.createElement('button');
  b.className = 'wc-del';
  b.title = title;
  b.appendChild(svgIcon('i-trash'));
  b.addEventListener('click', onClick);
  return b;
}

function noteEl(text) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = text;
  return p;
}

// ---------------------------------------------------------------- ウィジェットタブ
function renderAddRow() {
  const row = $('#add-row');
  row.innerHTML = '';
  for (const [type, meta] of Object.entries(TYPES)) {
    const b = document.createElement('button');
    b.className = 'add-btn';
    b.appendChild(svgIcon(meta.icon));
    b.appendChild(document.createTextNode(meta.label));
    b.addEventListener('click', async () => {
      const created = await window.api.addWidget(type);
      if (created) expanded.add(created.id);
      cfg = (await window.api.getConfig()).config;
      renderWidgetList();
    });
    row.appendChild(b);
  }
}

// ---- タイプ別オプション UI ----
function typeOptionsUI(w) {
  const wrap = document.createElement('div');
  wrap.className = 'full';
  const o = w.options || {};

  if (w.type === 'clock') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('秒を表示', o.showSeconds, v => patchWidget(w.id, { options: { showSeconds: v } })));
    row.appendChild(mkCheck('12時間表示', o.hour12, v => patchWidget(w.id, { options: { hour12: v } })));
    row.appendChild(mkCheck('AM / PM を表示', o.showAmPm, v => patchWidget(w.id, { options: { showAmPm: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('秒を表示すると毎秒描画になります。省電力を優先するなら分表示のままがおすすめです。'));

  } else if (w.type === 'analog') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('秒針', o.showSeconds !== false, v => patchWidget(w.id, { options: { showSeconds: v } })));
    row.appendChild(mkCheck('目盛り', o.showTicks !== false, v => patchWidget(w.id, { options: { showTicks: v } })));
    wrap.appendChild(row);
    wrap.appendChild(ctlRow('文字盤', mkSeg(
      [['dark', 'ダーク'], ['light', 'ライト'], ['none', 'なし']],
      o.face || 'dark', v => patchWidget(w.id, { options: { face: v } }))));
    {
      const [r, val, show] = mkRange(0, 90, 5, Math.round((o.faceOpacity ?? 0.25) * 100), v => {
        show(v + '%');
        patchWidget(w.id, { options: { faceOpacity: v / 100 } }, { debounce: true });
      });
      val.textContent = Math.round((o.faceOpacity ?? 0.25) * 100) + '%';
      wrap.appendChild(ctlRow('文字盤の濃さ', r, val));
    }

  } else if (w.type === 'date') {
    wrap.appendChild(ctlRow('表示形式', mkSelect([
      ['ja-long', '2026年8月19日 水曜日'],
      ['ja-md', '8月19日 (水)'],
      ['slash', '2026/08/19'],
      ['iso', '2026-08-19'],
      ['en-long', 'Wednesday, August 19'],
      ['en-md', 'Wed, Aug 19'],
    ], o.style || 'ja-long', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'calendar') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('曜日の行', o.showWeekdays !== false, v => patchWidget(w.id, { options: { showWeekdays: v } })));
    row.appendChild(mkCheck('日曜・土曜に色', o.sundayColor !== false, v => patchWidget(w.id, { options: { sundayColor: v } })));
    row.appendChild(mkCheck('背景パネル', o.bg !== false, v => patchWidget(w.id, { options: { bg: v } })));
    wrap.appendChild(row);
    wrap.appendChild(ctlRow('今日の色', mkColor(o.accent || '#e3a94f', v => patchWidget(w.id, { options: { accent: v } }, { debounce: true }))));
    {
      const [r, val, show] = mkRange(0, 80, 5, Math.round((o.bgOpacity ?? 0.3) * 100), v => {
        show(v + '%');
        patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true });
      });
      val.textContent = Math.round((o.bgOpacity ?? 0.3) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }

  } else if (w.type === 'weather') {
    const cur = noteEl(`現在の都市: ${o.city || '未設定'}`);
    wrap.appendChild(cur);

    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    const inp = mkText('', '都市名で検索 (例: 東京, Osaka)', () => {});
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.appendChild(svgIcon('i-search'));
    btn.appendChild(document.createTextNode('検索'));
    const results = document.createElement('div');
    results.className = 'city-results full';
    const doSearch = async () => {
      btn.disabled = true;
      const list = await window.api.searchCity(inp.value);
      btn.disabled = false;
      results.innerHTML = list.length ? '' : '<p class="note">見つかりませんでした</p>';
      for (const c of list) {
        const item = document.createElement('button');
        item.className = 'city-item';
        item.innerHTML = `${esc(c.name)}<span class="adm">${esc(c.admin)}</span>`;
        item.addEventListener('click', () => {
          patchWidget(w.id, { options: { city: c.name, lat: c.lat, lon: c.lon } });
          cur.textContent = `現在の都市: ${c.name}`;
          results.innerHTML = '';
          window.api.refreshWeather();
        });
        results.appendChild(item);
      }
    };
    btn.addEventListener('click', doSearch);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    searchRow.appendChild(inp);
    searchRow.appendChild(btn);
    wrap.appendChild(searchRow);
    wrap.appendChild(results);

    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('アイコン', o.showIcon !== false, v => patchWidget(w.id, { options: { showIcon: v } })));
    row.appendChild(mkCheck('都市名', o.showCity !== false, v => patchWidget(w.id, { options: { showCity: v } })));
    row.appendChild(mkCheck('天気の説明', o.showDesc !== false, v => patchWidget(w.id, { options: { showDesc: v } })));
    row.appendChild(mkCheck('最高 / 最低気温', !!o.showHiLow, v => patchWidget(w.id, { options: { showHiLow: v } })));
    wrap.appendChild(row);

  } else if (w.type === 'text') {
    const ta = document.createElement('textarea');
    ta.value = o.text || '';
    ta.placeholder = '表示するテキスト (改行可)';
    ta.addEventListener('input', () => patchWidget(w.id, { options: { text: ta.value } }, { debounce: true }));
    wrap.appendChild(ta);

  } else if (w.type === 'image') {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-label';
    nameSpan.textContent = o.path ? o.path.split(/[\\/]/).pop() : '未選択';
    const pick = document.createElement('button');
    pick.className = 'btn';
    pick.textContent = '画像を選択…';
    pick.addEventListener('click', async () => {
      const p = await window.api.pickImage();
      if (!p) return;
      patchWidget(w.id, { options: { path: p } });
      nameSpan.textContent = p.split(/[\\/]/).pop();
    });
    wrap.appendChild(ctlRow('ファイル', nameSpan, pick));
    {
      const [r, val, show] = mkRange(3, 100, 0.5, o.w ?? 18, v => {
        show(v + '%');
        patchWidget(w.id, { options: { w: v } }, { debounce: true });
      });
      val.textContent = (o.w ?? 18) + '%';
      wrap.appendChild(ctlRow('幅 (画面比)', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 60, 1, o.radius ?? 12, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { radius: v } }, { debounce: true });
      });
      val.textContent = (o.radius ?? 12) + 'px';
      wrap.appendChild(ctlRow('角丸', r, val));
    }
    wrap.appendChild(noteEl('お気に入りの写真やロゴ、キャラクター画像 (透過 png も可) を壁紙の上に配置できます。編集モードのホイールで大きさを変えられます。'));

  } else if (w.type === 'stats') {
    const badge = document.createElement('span');
    badge.className = 'lhm-badge ' + (lhmOnline ? 'on' : 'off');
    badge.textContent = lhmOnline ? 'LHM 接続中' : 'LHM 未接続';
    const srcRow = ctlRow('データソース', mkSelect([
      ['auto', '自動 (LHM があれば使う)'],
      ['lhm', 'Libre Hardware Monitor'],
      ['builtin', '内蔵 (CPU/MEM のみ)'],
    ], o.source || 'auto', v => patchWidget(w.id, { options: { source: v } })));
    srcRow.appendChild(badge);
    wrap.appendChild(srcRow);

    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('CPU', o.showCpu !== false, v => patchWidget(w.id, { options: { showCpu: v } })));
    row.appendChild(mkCheck('GPU', o.showGpu !== false, v => patchWidget(w.id, { options: { showGpu: v } })));
    row.appendChild(mkCheck('メモリ', o.showMem !== false, v => patchWidget(w.id, { options: { showMem: v } })));
    row.appendChild(mkCheck('ストレージ (SSD)', !!o.showDrives, v => patchWidget(w.id, { options: { showDrives: v } })));
    row.appendChild(mkCheck('ネットワーク', !!o.showNet, v => patchWidget(w.id, { options: { showNet: v } })));
    row.appendChild(mkCheck('温度を表示', o.showTemps !== false, v => patchWidget(w.id, { options: { showTemps: v } })));
    row.appendChild(mkCheck('1行にまとめる', !!o.compact, v => patchWidget(w.id, { options: { compact: v } })));
    row.appendChild(mkCheck('グラフを表示', !!o.showGraph, v => patchWidget(w.id, { options: { showGraph: v } })));
    wrap.appendChild(row);

    {
      const warn = document.createElement('input');
      warn.type = 'number'; warn.min = 40; warn.max = 110; warn.step = 1;
      warn.value = o.tempWarn || 85;
      warn.style.width = '72px';
      warn.addEventListener('change', () => patchWidget(w.id, { options: { tempWarn: +warn.value || 85 } }));
      const unit = document.createElement('span');
      unit.className = 'note';
      unit.style.padding = '0';
      unit.textContent = '°C 以上で赤く表示';
      wrap.appendChild(ctlRow('温度アラート', warn, unit));
    }

    wrap.appendChild(ctlRow('LHM URL', mkText(cfg.settings.lhmUrl, 'http://127.0.0.1:8085/data.json', v => {
      touch();
      cfg.settings.lhmUrl = v;
      window.api.setSettings({ lhmUrl: v });
    })));
    wrap.appendChild(noteEl('温度・GPU・SSD・ネット速度の表示には Libre Hardware Monitor が必要です。LHM を起動し、Options → Remote Web Server → Run を有効にしてください。'));

  } else if (w.type === 'countdown') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: 誕生日 / 締切 / 旅行', v => patchWidget(w.id, { options: { title: v } }))));
    {
      const d = document.createElement('input');
      d.type = 'date';
      d.value = o.date || '';
      d.addEventListener('change', () => patchWidget(w.id, { options: { date: d.value } }));
      wrap.appendChild(ctlRow('日付', d));
    }
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('過ぎたら経過日数を表示', o.showPast !== false, v => patchWidget(w.id, { options: { showPast: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('複数のカウントダウンを置きたいときは、ウィジェットを複数追加してください。'));

  } else if (w.type === 'rss') {
    wrap.appendChild(ctlRow('フィード URL', mkText(o.url, 'https://…/rss.xml', v => patchWidget(w.id, { options: { url: v.trim() } }))));
    wrap.appendChild(ctlRow('表示件数', mkSelect(
      [['1', '1件'], ['2', '2件'], ['3', '3件'], ['5', '5件'], ['8', '8件']],
      String(o.count || 3), v => patchWidget(w.id, { options: { count: +v } }))));
    wrap.appendChild(ctlRow('見出しの切替', mkSelect(
      [['0', 'なし (リスト表示)'], ['10', '10秒ごとに1件'], ['30', '30秒ごとに1件'], ['60', '60秒ごとに1件']],
      String(o.rotateSec || 0), v => patchWidget(w.id, { options: { rotateSec: +v } }))));
    wrap.appendChild(noteEl('例: NHK https://www.nhk.or.jp/rss/news/cat0.xml ・ ITmedia https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml ・ 30分ごとに自動更新します。'));

  } else if (w.type === 'ticker') {
    wrap.appendChild(ctlRow('銘柄 (カンマ区切り)', mkText(o.symbols, '例: AAPL, 7203.T, USDJPY=X, BTC-USD', v => patchWidget(w.id, { options: { symbols: v } }))));
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('前日比を表示', o.showChange !== false, v => patchWidget(w.id, { options: { showChange: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('Yahoo Finance のティッカーが使えます。日本株は「7203.T」(トヨタ) のように .T、為替は「USDJPY=X」、暗号資産は「BTC-USD」。10分ごとに更新 (データは遅延があります)。'));

  } else if (w.type === 'nowplaying') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('アルバムアート', o.showArt !== false, v => patchWidget(w.id, { options: { showArt: v } })));
    row.appendChild(mkCheck('アーティスト名', o.showArtist !== false, v => patchWidget(w.id, { options: { showArtist: v } })));
    row.appendChild(mkCheck('再生ボタン', o.showControls !== false, v => patchWidget(w.id, { options: { showControls: v } })));
    row.appendChild(mkCheck('停止中は隠す', !!o.hideWhenStopped, v => patchWidget(w.id, { options: { hideWhenStopped: v } })));
    wrap.appendChild(row);
    for (const [key, label, min, max, def] of [['w', '幅', 200, 800, 320], ['h', '高さ', 60, 300, 96]]) {
      const [r, val, show] = mkRange(min, max, 5, o[key] ?? def, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { [key]: v } }, { debounce: true });
      });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.55) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.55) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('Spotify・ブラウザの YouTube など、Windows のメディア再生 (SMTC) に対応したアプリの曲名・ジャケットを表示し、デスクトップ上で再生 / 一時停止・曲送りができます。'));

  } else if (w.type === 'volume') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('出力デバイスの切替を表示', o.showDevices !== false, v => patchWidget(w.id, { options: { showDevices: v } })));
    wrap.appendChild(row);
    for (const [key, label, min, max, def] of [['w', '幅', 180, 600, 260], ['h', '高さ', 60, 260, 120]]) {
      const [r, val, show] = mkRange(min, max, 5, o[key] ?? def, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { [key]: v } }, { debounce: true });
      });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上でスライダー (またはホイール) から音量を変更でき、再生先のスピーカー / ヘッドホンをその場で切り替えられます。'));

  } else if (w.type === 'note') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: メモ / TODO', v => patchWidget(w.id, { options: { title: v } }))));
    {
      const [r, val, show] = mkRange(140, 700, 10, o.w ?? 240, v => { show(v + 'px'); patchWidget(w.id, { options: { w: v } }, { debounce: true }); });
      val.textContent = (o.w ?? 240) + 'px';
      wrap.appendChild(ctlRow('幅', r, val));
    }
    {
      const [r, val, show] = mkRange(100, 600, 10, o.h ?? 180, v => { show(v + 'px'); patchWidget(w.id, { options: { h: v } }, { debounce: true }); });
      val.textContent = (o.h ?? 180) + 'px';
      wrap.appendChild(ctlRow('高さ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上のカードに直接文字を書けます。内容は自動保存されます。'));

  } else if (w.type === 'pomo') {
    {
      const work = document.createElement('input');
      work.type = 'number'; work.min = 1; work.max = 120; work.value = o.workMin || 25;
      work.style.width = '64px';
      work.addEventListener('change', () => patchWidget(w.id, { options: { workMin: +work.value || 25 } }));
      const brk = document.createElement('input');
      brk.type = 'number'; brk.min = 1; brk.max = 60; brk.value = o.breakMin || 5;
      brk.style.width = '64px';
      brk.addEventListener('change', () => patchWidget(w.id, { options: { breakMin: +brk.value || 5 } }));
      const unit = document.createElement('span');
      unit.className = 'note';
      unit.style.padding = '0';
      unit.textContent = '分 (作業 / 休憩)';
      wrap.appendChild(ctlRow('時間', work, brk, unit));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上でクリックして開始・一時停止。作業セット完了時に通知が届きます。'));

  } else if (w.type === 'zone') {
    {
      const [r, val, show] = mkRange(4, 100, 0.5, o.w ?? 22, v => { show(v + '%'); patchWidget(w.id, { options: { w: v } }, { debounce: true }); });
      val.textContent = (o.w ?? 22) + '%';
      wrap.appendChild(ctlRow('幅', r, val));
    }
    {
      const [r, val, show] = mkRange(4, 100, 0.5, o.h ?? 34, v => { show(v + '%'); patchWidget(w.id, { options: { h: v } }, { debounce: true }); });
      val.textContent = (o.h ?? 34) + '%';
      wrap.appendChild(ctlRow('高さ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 40, 1, o.radius ?? 16, v => { show(v + 'px'); patchWidget(w.id, { options: { radius: v } }, { debounce: true }); });
      val.textContent = (o.radius ?? 16) + 'px';
      wrap.appendChild(ctlRow('角丸', r, val));
    }
    {
      const fill = mkColor(o.fill || '#4f8cff', v => patchWidget(w.id, { options: { fill: v } }, { debounce: true }));
      const [r, val, show] = mkRange(0, 60, 1, Math.round((o.fillOpacity ?? 0.08) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { fillOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.fillOpacity ?? 0.08) * 100) + '%';
      wrap.appendChild(ctlRow('塗りつぶし', fill, r, val));
    }
    {
      const bc = mkColor(o.borderColor || '#7db4ff', v => patchWidget(w.id, { options: { borderColor: v } }, { debounce: true }));
      const style = mkSelect([['dashed', '破線'], ['solid', '実線'], ['dotted', '点線'], ['none', 'なし']], o.borderStyle || 'dashed', v => patchWidget(w.id, { options: { borderStyle: v } }));
      const [r, val, show] = mkRange(0.5, 6, 0.5, o.borderWidth ?? 1.5, v => { show(v + 'px'); patchWidget(w.id, { options: { borderWidth: v } }, { debounce: true }); });
      val.textContent = (o.borderWidth ?? 1.5) + 'px';
      wrap.appendChild(ctlRow('枠線', bc, style, r, val));
    }
    wrap.appendChild(ctlRow('ラベル', mkText(o.label, '例: ゲーム / 仕事 / よく使う', v => patchWidget(w.id, { options: { label: v } }))));
    wrap.appendChild(ctlRow('ラベル位置', mkSelect([
      ['tl', '左上'], ['tc', '中央上'], ['tr', '右上'], ['bl', '左下'], ['out', '枠の外 (上)'],
    ], o.labelPos || 'tl', v => patchWidget(w.id, { options: { labelPos: v } }))));
    wrap.appendChild(noteEl('デスクトップのアイコンを囲んで「ゲーム」「仕事」のように仕分けできます。編集モードで右下ハンドルからリサイズ。'));

  } else if (w.type === 'line') {
    wrap.appendChild(ctlRow('向き', mkSeg([['h', '横'], ['v', '縦']], o.orient || 'h', v => patchWidget(w.id, { options: { orient: v } }))));
    {
      const [r, val, show] = mkRange(3, 100, 0.5, o.len ?? 26, v => { show(v + '%'); patchWidget(w.id, { options: { len: v } }, { debounce: true }); });
      val.textContent = (o.len ?? 26) + '%';
      wrap.appendChild(ctlRow('長さ', r, val));
    }
    {
      const [r, val, show] = mkRange(1, 14, 1, o.thick ?? 2, v => { show(v + 'px'); patchWidget(w.id, { options: { thick: v } }, { debounce: true }); });
      val.textContent = (o.thick ?? 2) + 'px';
      wrap.appendChild(ctlRow('太さ', r, val));
    }
    wrap.appendChild(ctlRow('スタイル', mkSeg([['solid', '実線'], ['dashed', '破線'], ['dotted', '点線']], o.style || 'solid', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'folder') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: ゲーム / ツール', v => patchWidget(w.id, { options: { title: v } }))));

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.appendChild(svgIcon('i-plus'));
    addBtn.appendChild(document.createTextNode('アプリ・ショートカットを追加…'));
    const list = document.createElement('div');
    list.className = 'fitem-list';

    const renderItems = () => {
      list.innerHTML = '';
      for (const [i, it] of (o.items || []).entries()) {
        const row = document.createElement('div');
        row.className = 'fitem';
        const img = document.createElement('img');
        window.api.getIcon(it.path).then(u => { if (u) img.src = u; });
        const name = document.createElement('span');
        name.className = 'fi-name';
        name.textContent = it.name || it.path;
        name.title = it.path;
        row.appendChild(img);
        row.appendChild(name);
        row.appendChild(mkDelBtn(() => {
          o.items.splice(i, 1);
          patchWidget(w.id, { options: { items: o.items } });
          renderItems();
        }));
        list.appendChild(row);
      }
    };
    addBtn.addEventListener('click', async () => {
      const picked = await window.api.pickFolderItems();
      if (!picked.length) return;
      o.items = [...(o.items || []), ...picked];
      patchWidget(w.id, { options: { items: o.items } });
      renderItems();
    });
    wrap.appendChild(ctlRow('アイテム', addBtn));
    wrap.appendChild(list);
    renderItems();

    wrap.appendChild(ctlRow('列数', mkSelect([
      ['0', '自動'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'],
    ], String(o.columns || 0), v => patchWidget(w.id, { options: { columns: +v } }))));
    {
      const [r, val, show] = mkRange(20, 72, 2, o.iconSize ?? 34, v => { show(v + 'px'); patchWidget(w.id, { options: { iconSize: v } }, { debounce: true }); });
      val.textContent = (o.iconSize ?? 34) + 'px';
      wrap.appendChild(ctlRow('アイコンサイズ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.55) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.55) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('名前を表示', o.showLabels !== false, v => patchWidget(w.id, { options: { showLabels: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('.exe だけでなく .lnk (ショートカット) や .url もアイコン付きで追加できます。スマホのフォルダのようにまとめて、クリックで起動。'));
  }
  return wrap;
}

// タイプごとの表示コントロール
const NO_FONT_TYPES = new Set(['line', 'image', 'analog']);
const NO_SHADOW_TYPES = new Set(['line']);

function widgetCard(w) {
  const meta = TYPES[w.type] || { icon: 'i-widgets', label: w.type };
  const card = document.createElement('div');
  card.className = 'widget-card' + (expanded.has(w.id) ? ' open' : '');

  const head = document.createElement('div');
  head.className = 'wc-head';
  const glyph = document.createElement('span');
  glyph.className = 'wc-glyph';
  glyph.appendChild(svgIcon(meta.icon));
  const title = document.createElement('span');
  title.className = 'wc-title';
  title.textContent = meta.label;
  const sub = document.createElement('span');
  sub.className = 'wc-sub';
  const dispLabel = displays.length > 1 ? ` ・ モニタ${(w.display || 0) + 1}` : '';
  sub.textContent = NO_FONT_TYPES.has(w.type) ? dispLabel.replace(' ・ ', '') : `${w.font} ・ ${w.size}px${dispLabel}`;
  const spacer = document.createElement('span');
  spacer.className = 'wc-spacer';
  const chev = document.createElement('span');
  chev.className = 'wc-chev';
  chev.appendChild(svgIcon('i-chev'));

  head.appendChild(glyph);
  head.appendChild(title);
  head.appendChild(sub);
  head.appendChild(spacer);
  head.appendChild(mkDelBtn(async (e) => {
    e.stopPropagation();
    expanded.delete(w.id);
    await window.api.removeWidget(w.id);
    cfg = (await window.api.getConfig()).config;
    renderWidgetList();
  }));
  head.appendChild(chev);
  head.addEventListener('click', (e) => {
    if (e.target.closest('.wc-del')) return;
    if (expanded.has(w.id)) expanded.delete(w.id); else expanded.add(w.id);
    card.classList.toggle('open');
  });
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'wc-body';
  const grid = document.createElement('div');
  grid.className = 'wc-grid';

  if (displays.length > 1) {
    grid.appendChild(ctlRow('モニタ', mkSelect(
      displays.map(d => [String(d.index), d.label]),
      String(w.display || 0),
      v => patchWidget(w.id, { display: +v }))));
  }

  if (!NO_FONT_TYPES.has(w.type)) {
    grid.appendChild(ctlRow('フォント', mkFontPicker(w.font, f => patchWidget(w.id, { font: f }))));
    grid.appendChild(ctlRow('太さ', mkSelect(
      [['100', '100 (極細)'], ['200', '200'], ['300', '300'], ['400', '400 (標準)'], ['500', '500'], ['600', '600'], ['700', '700 (太字)'], ['800', '800'], ['900', '900 (極太)']],
      w.weight, v => patchWidget(w.id, { weight: +v }))));
    {
      const [r, val, show] = mkRange(8, 400, 1, w.size, v => {
        show(v + 'px');
        patchWidget(w.id, { size: v }, { debounce: true });
      });
      val.textContent = w.size + 'px';
      grid.appendChild(ctlRow('サイズ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 30, 1, w.letterSpacing, v => {
        show(v + 'px');
        patchWidget(w.id, { letterSpacing: v }, { debounce: true });
      });
      val.textContent = w.letterSpacing + 'px';
      grid.appendChild(ctlRow('字間', r, val));
    }
  }

  if (w.type === 'analog') {
    const [r, val, show] = mkRange(60, 600, 2, w.size, v => {
      show(v + 'px');
      patchWidget(w.id, { size: v }, { debounce: true });
    });
    val.textContent = w.size + 'px';
    grid.appendChild(ctlRow('直径', r, val));
  }

  grid.appendChild(ctlRow(w.type === 'analog' ? '針の色' : '色',
    mkColor(w.color, v => patchWidget(w.id, { color: v }, { debounce: true }))));

  if (!NO_SHADOW_TYPES.has(w.type) && w.type !== 'analog') {
    grid.appendChild(ctlRow('影', mkSeg(
      [['soft', 'ソフト'], ['glow', 'ネオン'], ['none', 'なし']],
      w.shadow, v => patchWidget(w.id, { shadow: v }))));
  }

  {
    const [r, val, show] = mkRange(10, 100, 5, Math.round(w.opacity * 100), v => {
      show(v + '%');
      patchWidget(w.id, { opacity: v / 100 }, { debounce: true });
    });
    val.textContent = Math.round(w.opacity * 100) + '%';
    grid.appendChild(ctlRow('不透明度', r, val));
  }

  {
    const x = document.createElement('input');
    x.type = 'number'; x.min = 0; x.max = 100; x.step = 0.5; x.value = w.x;
    x.style.width = '72px';
    x.addEventListener('change', () => patchWidget(w.id, { x: +x.value }));
    const y = document.createElement('input');
    y.type = 'number'; y.min = 0; y.max = 100; y.step = 0.5; y.value = w.y;
    y.style.width = '72px';
    y.addEventListener('change', () => patchWidget(w.id, { y: +y.value }));
    const pct = document.createElement('span');
    pct.className = 'note';
    pct.style.padding = '0';
    pct.textContent = '% (X, Y)';
    grid.appendChild(ctlRow('位置', x, y, pct));
  }

  grid.appendChild(typeOptionsUI(w));
  body.appendChild(grid);
  card.appendChild(body);
  return card;
}

function renderWidgetList() {
  const list = $('#widget-list');
  list.innerHTML = '';
  if (!cfg.widgets.length) {
    list.innerHTML = '<p class="hint">ウィジェットがありません。上のボタンから追加してください。</p>';
    return;
  }
  for (const w of cfg.widgets) list.appendChild(widgetCard(w));
}

// ---------------------------------------------------------------- 一般タブ
async function renderGeneral() {
  const a = await window.api.getAutostart();
  const chk = $('#autostart');
  chk.checked = a.enabled;
  chk.disabled = !a.supported;
  $('#autostart-note').textContent = a.supported
    ? 'サインイン時に壁紙が自動で表示されます (設定画面は開きません)。'
    : '開発モードでは変更できません。ビルド版 (exe) で有効になります。';
  chk.onchange = async () => {
    const r = await window.api.setAutostart(chk.checked);
    chk.checked = r.enabled;
  };

  const pfs = $('#pause-fs');
  pfs.checked = cfg.settings.pauseOnFullscreen !== false;
  pfs.onchange = () => { touch(); window.api.setSettings({ pauseOnFullscreen: pfs.checked }); };

  renderSchedule();
  renderLayouts();
  updateStatusText(await window.api.getUpdateStatus());

  const sel = $('#weather-interval');
  sel.value = String(cfg.settings.weatherIntervalMin || 30);
  sel.onchange = () => { touch(); window.api.setSettings({ weatherIntervalMin: +sel.value }); };

  $('#btn-weather-refresh').onclick = async () => {
    $('#weather-status').textContent = '更新中…';
    await window.api.refreshWeather();
  };

  updateWeatherStatus(await window.api.getWeather());
  renderGfList();
  $('#version').textContent = 'v' + await window.api.getVersion();
}

// ---- 壁紙スケジュール ----
const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
let schedDay = new Date().getDay();  // 曜日モードで選択中の曜日

function schedState() {
  return Object.assign(
    { enabled: false, mode: 'daynight', dayStart: '07:00', nightStart: '19:00', day: null, night: null, weekly: {} },
    cfg.settings.schedule || {},
  );
}

function pushSched(patch) {
  touch();
  const s = Object.assign(schedState(), patch);
  cfg.settings.schedule = s;
  window.api.setSettings({ schedule: s });
  renderSchedule();
}

function paintSwatch(el, wp) {
  el.style.background = wp ? wpCss(wp) : 'transparent';
  el.title = wp
    ? (wp.type === 'image' || wp.type === 'video' ? String(wp.value).split(/[\\/]/).pop() : '登録済み')
    : '未登録 (壁紙タブで設定してから登録してください)';
}

function renderSchedule() {
  const s = schedState();
  $('#sched-on').checked = !!s.enabled;
  $$('#sched-mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === (s.mode || 'daynight')));
  const weekly = s.mode === 'weekly';
  $$('.sched-daynight').forEach(el => { el.style.display = weekly ? 'none' : 'flex'; });
  $$('.sched-weekly').forEach(el => { el.style.display = weekly ? 'flex' : 'none'; });

  if (document.activeElement !== $('#sched-day')) $('#sched-day').value = s.dayStart;
  if (document.activeElement !== $('#sched-night')) $('#sched-night').value = s.nightStart;
  paintSwatch($('#sched-day-prev'), s.day);
  paintSwatch($('#sched-night-prev'), s.night);

  const chips = $('#sched-week-chips');
  chips.innerHTML = '';
  WEEK_LABELS.forEach((lb, i) => {
    const c = document.createElement('button');
    c.className = 'chip' + (schedDay === i ? ' active' : '');
    c.textContent = lb + ((s.weekly || {})[String(i)] ? ' ●' : '');
    c.addEventListener('click', () => { schedDay = i; renderSchedule(); });
    chips.appendChild(c);
  });
  $('#sched-week-sel-label').textContent = `選択中: ${WEEK_LABELS[schedDay]}曜日`;
  paintSwatch($('#sched-week-prev'), (s.weekly || {})[String(schedDay)]);
}

$('#sched-on').addEventListener('change', (e) => pushSched({ enabled: e.target.checked }));
$$('#sched-mode-seg button').forEach(b => b.addEventListener('click', () => pushSched({ mode: b.dataset.v })));
$('#sched-day').addEventListener('change', (e) => pushSched({ dayStart: e.target.value || '07:00' }));
$('#sched-night').addEventListener('change', (e) => pushSched({ nightStart: e.target.value || '19:00' }));
$('#sched-set-day').addEventListener('click', () => pushSched({ day: clone(cfg.wallpapers.default) }));
$('#sched-set-night').addEventListener('click', () => pushSched({ night: clone(cfg.wallpapers.default) }));
$('#sched-week-set').addEventListener('click', () => {
  const weekly = { ...(schedState().weekly || {}) };
  weekly[String(schedDay)] = clone(cfg.wallpapers.default);
  pushSched({ weekly });
});
$('#sched-week-clear').addEventListener('click', () => {
  const weekly = { ...(schedState().weekly || {}) };
  delete weekly[String(schedDay)];
  pushSched({ weekly });
});

// ---- レイアウトプリセット ----
function renderLayouts() {
  const list = $('#layout-list');
  list.innerHTML = '';
  const layouts = cfg.settings.layouts || [];
  for (const [i, l] of layouts.entries()) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    const name = document.createElement('span');
    name.className = 'gf-name';
    name.textContent = l.name;
    const meta = document.createElement('span');
    meta.className = 'note';
    meta.style.padding = '0';
    meta.textContent = `ウィジェット ${(l.widgets || []).length} 個`;
    const apply = document.createElement('button');
    apply.className = 'btn';
    apply.textContent = '適用';
    apply.addEventListener('click', async () => {
      touch();
      await window.api.applyLayout(i);
      cfg = (await window.api.getConfig()).config;
      renderWallpaperTab();
      renderWidgetList();
      renderLayouts();
    });
    const over = document.createElement('button');
    over.className = 'btn';
    over.textContent = '上書き';
    over.title = '現在の構成でこのプリセットを上書き';
    over.addEventListener('click', async () => {
      touch();
      cfg.settings.layouts = await window.api.overwriteLayout(i);
      renderLayouts();
    });
    row.appendChild(name);
    row.appendChild(meta);
    row.appendChild(apply);
    row.appendChild(over);
    row.appendChild(mkDelBtn(async () => {
      touch();
      cfg.settings.layouts = await window.api.removeLayout(i);
      renderLayouts();
    }));
    list.appendChild(row);
  }
}

$('#layout-save').addEventListener('click', async () => {
  touch();
  cfg.settings.layouts = await window.api.saveLayout($('#layout-name').value.trim());
  $('#layout-name').value = '';
  renderLayouts();
});
$('#layout-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#layout-save').click(); });

// ---- バックアップ ----
$('#btn-export').addEventListener('click', async () => {
  const r = await window.api.exportConfig();
  $('#backup-status').textContent = r.msg;
});
$('#btn-import').addEventListener('click', async () => {
  const r = await window.api.importConfig();
  $('#backup-status').textContent = r.msg;
  if (r.ok) {
    cfg = (await window.api.getConfig()).config;
    renderWallpaperTab();
    renderWidgetList();
    renderGeneral();
  }
});

// ---- アップデート / 修復 / アンインストール ----
function updateStatusText(s) {
  const t = $('#update-status-text');
  const install = $('#btn-update-install');
  install.style.display = s.state === 'ready' ? '' : 'none';
  switch (s.state) {
    case 'checking': t.textContent = '確認中…'; break;
    case 'available': t.textContent = `v${s.version} をダウンロード中…`; break;
    case 'downloading': t.textContent = `v${s.version || ''} をダウンロード中 ${s.message || ''}`; break;
    case 'ready': t.textContent = `v${s.version} の準備ができました`; break;
    case 'latest': t.textContent = '最新版です'; break;
    case 'portable': t.textContent = 'ポータブル版は手動更新です (Releases から最新版をダウンロード)'; break;
    case 'dev': t.textContent = '開発モードでは無効'; break;
    case 'error': t.textContent = `確認できませんでした${s.message ? ' (' + s.message + ')' : ''}`; break;
    default: t.textContent = '未確認';
  }
}

$('#btn-update-check').addEventListener('click', async () => {
  updateStatusText(await window.api.checkUpdate());
});
$('#btn-update-install').addEventListener('click', () => window.api.installUpdate());
window.api.onUpdateStatus((s) => updateStatusText(s));

$('#btn-repair').addEventListener('click', async () => {
  $('#repair-note').textContent = '再適用中…';
  await window.api.repair();
  $('#repair-note').textContent = '壁紙を貼り付け直しました。';
});

$('#btn-uninstall').addEventListener('click', async () => {
  const r = await window.api.uninstall();
  if (!r.ok && r.msg) $('#uninstall-note').textContent = r.msg;
});

function updateWeatherStatus(w) {
  const el = $('#weather-status');
  if (!w) { el.textContent = '天気ウィジェットを追加すると自動で取得します。'; return; }
  if (w.error || w.temp == null) { el.textContent = '取得に失敗しました。ネットワークを確認してください。'; return; }
  const t = new Date(w.fetchedAt);
  el.textContent = `最終更新 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ・ ${w.city} ${w.temp}° ${w.desc}`;
}

// ---- Google Fonts ----
function renderGfList() {
  const list = $('#gf-list');
  list.innerHTML = '';
  for (const f of (cfg.settings.googleFonts || [])) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    const name = document.createElement('span');
    name.className = 'gf-name';
    name.style.fontFamily = `'${f.family}'`;
    name.textContent = f.family;
    row.appendChild(name);
    row.appendChild(mkDelBtn(async () => {
      touch();
      await window.api.removeGoogleFont(f.family);
      cfg.settings.googleFonts = cfg.settings.googleFonts.filter(x => x.family !== f.family);
      renderGfList();
    }));
    list.appendChild(row);
  }
}

$('#gf-add').addEventListener('click', async () => {
  const inp = $('#gf-input');
  const status = $('#gf-status');
  const name = inp.value.trim();
  if (!name) return;
  status.textContent = `「${name}」をダウンロード中…`;
  $('#gf-add').disabled = true;
  const r = await window.api.addGoogleFont(name);
  $('#gf-add').disabled = false;
  if (r.ok) {
    status.textContent = `「${r.family}」を追加しました。フォント選択で G バッジ付きで表示されます。`;
    inp.value = '';
    cfg = (await window.api.getConfig()).config;
    renderGfList();
  } else {
    status.textContent = `追加できませんでした: ${r.msg}`;
  }
});
$('#gf-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gf-add').click(); });

async function injectFonts() {
  try {
    $('#gfonts').textContent = await window.api.getFontsCss();
  } catch (_) {}
}

// ---------------------------------------------------------------- フォント一覧
let fontsLoaded = false;
async function loadFonts() {
  if (fontsLoaded) return;
  let names = [];
  try {
    if (window.queryLocalFonts) {
      const fonts = await window.queryLocalFonts();
      names = [...new Set(fonts.map(f => f.family))];
    }
  } catch (_) { /* 権限やジェスチャ要件で失敗したらフォールバック */ }
  if (!names.length) names = FALLBACK_FONTS.slice();
  else fontsLoaded = true;
  names.sort((a, b) => a.localeCompare(b, 'ja'));
  systemFonts = names;
}

// ---------------------------------------------------------------- 初期化・購読
window.api.onConfig((env) => {
  cfg = env.config;
  sysWall = env.systemWallpaper || '';
  renderWallpaperTab();
  renderGeneral();
  if (Date.now() > suppressUntil) renderWidgetList();
});

window.api.onWeather((w) => updateWeatherStatus(w));
window.api.onLhmStatus((v) => { lhmOnline = v; });
window.api.onFontsChanged(() => injectFonts());

(async () => {
  const env = await window.api.getConfig();
  cfg = env.config;
  sysWall = env.systemWallpaper || '';
  displays = await window.api.listDisplays();
  try {
    const hw = await window.api.getHw();
    lhmOnline = !!hw.lhmOnline;
  } catch (_) {}
  if (cfg.wallpapers.default.type === 'custom' && cfg.wallpapers.default.value) {
    Object.assign(cb, clone(cfg.wallpapers.default.value));
  }
  renderAddRow();
  renderWallpaperTab();
  renderCustomBuilder();
  renderWidgetList();
  renderGeneral();
  injectFonts();
  loadFonts();
  document.addEventListener('pointerdown', () => loadFonts(), { once: true });

  // 開発用: ?tab=widgets などで初期タブを指定
  const t = new URLSearchParams(location.search).get('tab');
  if (t) {
    const btn = document.querySelector(`.nav-item[data-tab="${t}"]`);
    if (btn) btn.click();
  }
})();
