// WidgetWall — 設定画面 (v2)
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
  clock: { icon: '🕐', label: '時計' },
  date: { icon: '📅', label: '日付' },
  weather: { icon: '⛅', label: '天気' },
  text: { icon: '✏️', label: 'テキスト' },
  stats: { icon: '📊', label: 'ハードウェアモニタ' },
  zone: { icon: '🔲', label: 'ゾーン (色分け枠)' },
  line: { icon: '📏', label: 'ライン (線)' },
  folder: { icon: '📁', label: 'フォルダ (アプリまとめ)' },
};

const FALLBACK_FONTS = [
  'Segoe UI', 'Segoe UI Light', 'Yu Gothic UI', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'MS Gothic',
  'BIZ UDGothic', 'BIZ UDPGothic', 'UD Digi Kyokasho N-R', 'Consolas', 'Cascadia Code', 'Courier New',
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Georgia', 'Impact', 'Lucida Console', 'Malgun Gothic', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

let cfg = null;
let sysWall = '';
let displays = [];
let wpTarget = null;          // null = すべて (default), number = モニタ index
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

function touch() { suppressUntil = Date.now() + 1500; }

function debounced(key, ms, fn) {
  clearTimeout(debTimers.get(key));
  debTimers.set(key, setTimeout(fn, ms));
}

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
  const colors = (v.colors && v.colors.length) ? v.colors : ['#223', '#112'];
  if (v.kind === 'solid' || colors.length === 1) return colors[0];
  if (v.kind === 'radial') return `radial-gradient(120% 120% at 25% 20%, ${colors.join(', ')})`;
  return `linear-gradient(${v.angle ?? 135}deg, ${colors.join(', ')})`;
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
  row.style.display = 'block';
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

function renderPresets() {
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  const wp = curWp();

  // 「今の壁紙のまま」(透過モード相当)
  const sys = document.createElement('div');
  sys.className = 'preset-card sys-card';
  if (wp.type === 'system') sys.classList.add('selected');
  sys.innerHTML = `🖼️<span class="p-name">今の壁紙のまま</span>`;
  sys.title = 'Windows の壁紙はそのままに、ウィジェットだけ表示します';
  sys.addEventListener('click', () => setWp({ type: 'system', value: '' }));
  grid.appendChild(sys);

  for (const [key, p] of Object.entries(PRESETS)) {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.style.background = p.css;
    if (wp.type === 'preset' && wp.value === key) card.classList.add('selected');
    card.innerHTML = `<span class="p-name">${p.label}</span>`;
    card.addEventListener('click', () => setWp({ type: 'preset', value: key }));
    grid.appendChild(card);
  }
}

// ---- カスタムビルダー ----
const cb = { kind: 'linear', angle: 135, colors: ['#6366f1', '#22d3ee'] };

function renderCustomBuilder() {
  $('#cb-kind').value = cb.kind;
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
      Object.assign(cb, JSON.parse(JSON.stringify(v)));
      renderCustomBuilder();
      setWp({ type: 'custom', value: JSON.parse(JSON.stringify(v)) });
    });
    grid.appendChild(card);
  });
}

$('#cb-kind').addEventListener('change', (e) => { cb.kind = e.target.value; renderCbPreview(); });
$('#cb-angle').addEventListener('input', (e) => {
  cb.angle = +e.target.value;
  $('#cb-angle-val').textContent = cb.angle + '°';
  renderCbPreview();
});
$('#cb-add-color').addEventListener('click', () => {
  if (cb.colors.length < 5) { cb.colors.push('#8b5cf6'); renderCustomBuilder(); }
});
$('#cb-del-color').addEventListener('click', () => {
  if (cb.colors.length > 1) { cb.colors.pop(); renderCustomBuilder(); }
});
$('#cb-apply').addEventListener('click', () => setWp({ type: 'custom', value: JSON.parse(JSON.stringify(cb)) }));
$('#cb-save').addEventListener('click', () => {
  touch();
  const v = JSON.parse(JSON.stringify(cb));
  cfg.settings.customPresets = [v, ...(cfg.settings.customPresets || [])].slice(0, 12);
  window.api.saveCustomPreset(v);
  renderSavedPresets();
});

function renderWallpaperTab() {
  renderTargetChips();
  renderPresets();
  const wp = curWp();
  const label = $('#file-label');
  if (wp.type === 'image' || wp.type === 'video') {
    label.textContent = (wp.type === 'video' ? '🎬 ' : '🖼️ ') + wp.value.split(/[\\/]/).pop();
  } else {
    label.textContent = '未選択';
  }
  if (document.activeElement !== $('#wp-dim')) $('#wp-dim').value = wp.dim;
  if (document.activeElement !== $('#wp-blur')) $('#wp-blur').value = wp.blur;
  $('#wp-dim-val').textContent = wp.dim + '%';
  $('#wp-blur-val').textContent = wp.blur + 'px';
  $('#wp-animate').checked = !!wp.animate;
}

$('#btn-pick').addEventListener('click', async () => {
  const r = await window.api.pickFile();
  if (!r) return;
  setWp({ type: r.kind, value: r.path });
});

for (const [id, prop, unit] of [['wp-dim', 'dim', '%'], ['wp-blur', 'blur', 'px']]) {
  $('#' + id).addEventListener('input', (e) => {
    touch();
    const v = +e.target.value;
    $('#' + id + '-val').textContent = v + unit;
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
  fontDropdown.style.minWidth = Math.max(260, r.width) + 'px';
  const maxH = 280;
  if (r.bottom + maxH + 8 > innerHeight && r.top > maxH + 8) {
    fontDropdown.style.top = (r.top - Math.min(maxH, fontDropdown.offsetHeight || maxH) - 4) + 'px';
  } else {
    fontDropdown.style.top = (r.bottom + 4) + 'px';
  }
  fontDropdown.style.left = Math.min(r.left, innerWidth - 300) + 'px';
}

function renderFontDropdown() {
  if (!fdInput) return;
  const q = fdInput.value.trim().toLowerCase();
  const match = (n) => !q || n.toLowerCase().includes(q);
  const gf = gFontFamilies().filter(match);
  const sys = systemFonts.filter(match).slice(0, 400);
  let html = '';
  if (gf.length) {
    html += '<div class="fd-group">GOOGLE FONTS</div>';
    for (const f of gf) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'"><span class="fd-cloud">☁</span>${esc(f)}</button>`;
  }
  if (sys.length) {
    html += '<div class="fd-group">システムフォント</div>';
    for (const f of sys) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</button>`;
  }
  if (!html) html = '<div class="fd-empty">見つかりません</div>';
  fontDropdown.innerHTML = html;
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

// ---------------------------------------------------------------- ウィジェットタブ
function renderAddRow() {
  const row = $('#add-row');
  row.innerHTML = '';
  for (const [type, meta] of Object.entries(TYPES)) {
    const b = document.createElement('button');
    b.className = 'add-btn';
    b.textContent = `＋ ${meta.icon} ${meta.label}`;
    b.addEventListener('click', async () => {
      const created = await window.api.addWidget(type);
      if (created) expanded.add(created.id);
      cfg = (await window.api.getConfig()).config;
      renderWidgetList();
    });
    row.appendChild(b);
  }
}

function ctlRow(labelText, ...els) {
  const row = document.createElement('div');
  row.className = 'ctl-row';
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
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = '💡 秒を表示すると毎秒描画になります (省電力なら分表示のまま)。';
    wrap.appendChild(note);

  } else if (w.type === 'date') {
    wrap.appendChild(ctlRow('表示形式', mkSelect([
      ['ja-long', '2026年8月19日 水曜日'],
      ['ja-md', '8月19日 (水)'],
      ['slash', '2026/08/19'],
      ['iso', '2026-08-19'],
      ['en-long', 'Wednesday, August 19'],
      ['en-md', 'Wed, Aug 19'],
    ], o.style || 'ja-long', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'weather') {
    const cur = document.createElement('p');
    cur.className = 'note';
    cur.textContent = `現在の都市: ${o.city || '未設定'}`;
    wrap.appendChild(cur);

    const searchRow = document.createElement('div');
    searchRow.className = 'ctl-row';
    const inp = mkText('', '都市名で検索 (例: 東京, Osaka)', () => {});
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '検索';
    const results = document.createElement('div');
    results.className = 'city-results';
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
    wrap.appendChild(row);

    const urlRow = ctlRow('LHM URL', mkText(cfg.settings.lhmUrl, 'http://127.0.0.1:8085/data.json', v => {
      touch();
      cfg.settings.lhmUrl = v;
      window.api.setSettings({ lhmUrl: v });
    }));
    wrap.appendChild(urlRow);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = '温度・GPU・SSD・ネット速度の表示には Libre Hardware Monitor が必要です。LHM を起動し、Options → Remote Web Server → Run を有効にしてください。';
    wrap.appendChild(note);

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
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = '💡 デスクトップのアイコンを囲んで「ゲーム」「仕事」のように仕分けできます。編集モードで右下ハンドルからリサイズ。';
    wrap.appendChild(note);

  } else if (w.type === 'line') {
    wrap.appendChild(ctlRow('向き', mkSelect([['h', '横'], ['v', '縦']], o.orient || 'h', v => patchWidget(w.id, { options: { orient: v } }))));
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
    wrap.appendChild(ctlRow('スタイル', mkSelect([['solid', '実線'], ['dashed', '破線'], ['dotted', '点線']], o.style || 'solid', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'folder') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: ゲーム / ツール', v => patchWidget(w.id, { options: { title: v } }))));

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.textContent = '＋ アプリ・ファイルを追加…';
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
        const del = document.createElement('button');
        del.className = 'wc-del';
        del.textContent = '🗑';
        del.addEventListener('click', () => {
          o.items.splice(i, 1);
          patchWidget(w.id, { options: { items: o.items } });
          renderItems();
        });
        row.appendChild(img);
        row.appendChild(name);
        row.appendChild(del);
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
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = '💡 スマホのフォルダのように複数アプリを 1 つにまとめ、デスクトップ上でクリックして起動できます。';
    wrap.appendChild(note);
  }
  return wrap;
}

const NO_TEXT_TYPES = new Set(['line']);

function widgetCard(w) {
  const meta = TYPES[w.type] || { icon: '❔', label: w.type };
  const card = document.createElement('div');
  card.className = 'widget-card' + (expanded.has(w.id) ? ' open' : '');

  const head = document.createElement('div');
  head.className = 'wc-head';
  const dispLabel = displays.length > 1 ? ` ・ モニタ${(w.display || 0) + 1}` : '';
  head.innerHTML = `
    <span class="wc-ico">${meta.icon}</span>
    <span class="wc-title">${meta.label}</span>
    <span class="wc-sub">${esc(w.font)} ・ ${w.size}px${dispLabel}</span>
    <span class="wc-spacer"></span>`;
  const del = document.createElement('button');
  del.className = 'wc-del';
  del.title = '削除';
  del.textContent = '🗑';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    expanded.delete(w.id);
    await window.api.removeWidget(w.id);
    cfg = (await window.api.getConfig()).config;
    renderWidgetList();
  });
  const chev = document.createElement('span');
  chev.className = 'wc-chev';
  chev.textContent = '▼';
  head.appendChild(del);
  head.appendChild(chev);
  head.addEventListener('click', () => {
    if (expanded.has(w.id)) expanded.delete(w.id); else expanded.add(w.id);
    card.classList.toggle('open');
  });
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'wc-body';
  const grid = document.createElement('div');
  grid.className = 'wc-grid';

  // モニタ割り当て
  if (displays.length > 1) {
    grid.appendChild(ctlRow('モニタ', mkSelect(
      displays.map(d => [String(d.index), d.label]),
      String(w.display || 0),
      v => patchWidget(w.id, { display: +v }))));
  }

  // フォント (ラインには不要)
  if (!NO_TEXT_TYPES.has(w.type)) {
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

  grid.appendChild(ctlRow('色', mkColor(w.color, v => patchWidget(w.id, { color: v }, { debounce: true }))));

  if (!NO_TEXT_TYPES.has(w.type)) {
    grid.appendChild(ctlRow('影', mkSelect(
      [['soft', 'ソフト'], ['glow', 'ネオン発光'], ['none', 'なし']],
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
    x.style.width = '76px';
    x.addEventListener('change', () => patchWidget(w.id, { x: +x.value }));
    const y = document.createElement('input');
    y.type = 'number'; y.min = 0; y.max = 100; y.step = 0.5; y.value = w.y;
    y.style.width = '76px';
    y.addEventListener('change', () => patchWidget(w.id, { y: +y.value }));
    const pct = document.createElement('span');
    pct.className = 'note';
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
    row.innerHTML = `<span class="gf-name" style="font-family:'${esc(f.family)}'">${esc(f.family)}</span><span class="gf-spacer"></span>`;
    const del = document.createElement('button');
    del.className = 'wc-del';
    del.textContent = '🗑';
    del.addEventListener('click', async () => {
      touch();
      await window.api.removeGoogleFont(f.family);
      cfg.settings.googleFonts = cfg.settings.googleFonts.filter(x => x.family !== f.family);
      renderGfList();
    });
    row.appendChild(del);
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
    status.textContent = `✅ 「${r.family}」を追加しました。フォント選択で ☁ 付きで表示されます。`;
    inp.value = '';
    cfg = (await window.api.getConfig()).config;
    renderGfList();
  } else {
    status.textContent = `❌ ${r.msg}`;
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
    Object.assign(cb, JSON.parse(JSON.stringify(cfg.wallpapers.default.value)));
  }
  renderAddRow();
  renderWallpaperTab();
  renderCustomBuilder();
  renderWidgetList();
  renderGeneral();
  injectFonts();
  loadFonts();
  document.addEventListener('pointerdown', () => loadFonts(), { once: true });
})();
