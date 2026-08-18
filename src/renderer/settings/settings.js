// WidgetWall — 設定画面
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
  stats: { icon: '📊', label: 'システム情報' },
};

const FALLBACK_FONTS = [
  'Segoe UI', 'Segoe UI Light', 'Yu Gothic UI', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'MS Gothic',
  'BIZ UDGothic', 'BIZ UDPGothic', 'UD Digi Kyokasho N-R', 'Consolas', 'Cascadia Code', 'Courier New',
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Georgia', 'Impact', 'Lucida Console', 'Malgun Gothic', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

let cfg = null;
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

// ---------------------------------------------------------------- タブ
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
}));

$('#btn-min').addEventListener('click', () => window.api.minimize());
$('#btn-close').addEventListener('click', () => window.api.close());
$('#btn-edit-layout').addEventListener('click', () => window.api.enterEditMode());
$('#btn-quit').addEventListener('click', () => window.api.quitApp());

// ---------------------------------------------------------------- 壁紙タブ
function renderPresets() {
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  for (const [key, p] of Object.entries(PRESETS)) {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.style.background = p.css;
    if (cfg.wallpaper.type === 'preset' && cfg.wallpaper.value === key) card.classList.add('selected');
    card.innerHTML = `<span class="p-name">${p.label}</span>`;
    card.addEventListener('click', () => {
      touch();
      cfg.wallpaper.type = 'preset';
      cfg.wallpaper.value = key;
      window.api.setWallpaper({ type: 'preset', value: key });
      renderWallpaperTab();
    });
    grid.appendChild(card);
  }
}

function renderWallpaperTab() {
  renderPresets();
  const wp = cfg.wallpaper;
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
}

$('#btn-pick').addEventListener('click', async () => {
  const r = await window.api.pickFile();
  if (!r) return;
  touch();
  cfg.wallpaper.type = r.kind;
  cfg.wallpaper.value = r.path;
  window.api.setWallpaper({ type: r.kind, value: r.path });
  renderWallpaperTab();
});

for (const [id, prop, unit] of [['wp-dim', 'dim', '%'], ['wp-blur', 'blur', 'px']]) {
  $('#' + id).addEventListener('input', (e) => {
    touch();
    const v = +e.target.value;
    cfg.wallpaper[prop] = v;
    $('#' + id + '-val').textContent = v + unit;
    debounced('wp:' + prop, 140, () => window.api.setWallpaper({ [prop]: v }));
  });
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
      cfg = await window.api.getConfig();
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
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = '都市名で検索 (例: 東京, Osaka)';
    inp.style.flex = '1';
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
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('CPU 使用率', o.showCpu !== false, v => patchWidget(w.id, { options: { showCpu: v } })));
    row.appendChild(mkCheck('メモリ使用率', o.showMem !== false, v => patchWidget(w.id, { options: { showMem: v } })));
    wrap.appendChild(row);
  }
  return wrap;
}

function widgetCard(w) {
  const meta = TYPES[w.type] || { icon: '❔', label: w.type };
  const card = document.createElement('div');
  card.className = 'widget-card' + (expanded.has(w.id) ? ' open' : '');

  // ---- ヘッダ
  const head = document.createElement('div');
  head.className = 'wc-head';
  head.innerHTML = `
    <span class="wc-ico">${meta.icon}</span>
    <span class="wc-title">${meta.label}</span>
    <span class="wc-sub">${esc(w.font)} ・ ${w.size}px</span>
    <span class="wc-spacer"></span>`;
  const del = document.createElement('button');
  del.className = 'wc-del';
  del.title = '削除';
  del.textContent = '🗑';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    expanded.delete(w.id);
    await window.api.removeWidget(w.id);
    cfg = await window.api.getConfig();
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

  // ---- ボディ
  const body = document.createElement('div');
  body.className = 'wc-body';
  const grid = document.createElement('div');
  grid.className = 'wc-grid';

  // フォント
  const fontInp = document.createElement('input');
  fontInp.type = 'text';
  fontInp.setAttribute('list', 'fonts');
  fontInp.value = w.font;
  fontInp.style.flex = '1';
  fontInp.addEventListener('change', () => patchWidget(w.id, { font: fontInp.value }));
  grid.appendChild(ctlRow('フォント', fontInp));

  // 太さ
  grid.appendChild(ctlRow('太さ', mkSelect(
    [['100', '100 (極細)'], ['200', '200'], ['300', '300'], ['400', '400 (標準)'], ['500', '500'], ['600', '600'], ['700', '700 (太字)'], ['800', '800'], ['900', '900 (極太)']],
    w.weight, v => patchWidget(w.id, { weight: +v }))));

  // サイズ
  {
    const [r, val, show] = mkRange(8, 400, 1, w.size, v => {
      show(v + 'px');
      patchWidget(w.id, { size: v }, { debounce: true });
    });
    val.textContent = w.size + 'px';
    grid.appendChild(ctlRow('サイズ', r, val));
  }

  // 字間
  {
    const [r, val, show] = mkRange(0, 30, 1, w.letterSpacing, v => {
      show(v + 'px');
      patchWidget(w.id, { letterSpacing: v }, { debounce: true });
    });
    val.textContent = w.letterSpacing + 'px';
    grid.appendChild(ctlRow('字間', r, val));
  }

  // 色
  {
    const c = document.createElement('input');
    c.type = 'color';
    c.value = w.color;
    c.addEventListener('input', () => patchWidget(w.id, { color: c.value }, { debounce: true }));
    grid.appendChild(ctlRow('色', c));
  }

  // 影
  grid.appendChild(ctlRow('影', mkSelect(
    [['soft', 'ソフト'], ['glow', 'ネオン発光'], ['none', 'なし']],
    w.shadow, v => patchWidget(w.id, { shadow: v }))));

  // 不透明度
  {
    const [r, val, show] = mkRange(10, 100, 5, Math.round(w.opacity * 100), v => {
      show(v + '%');
      patchWidget(w.id, { opacity: v / 100 }, { debounce: true });
    });
    val.textContent = Math.round(w.opacity * 100) + '%';
    grid.appendChild(ctlRow('不透明度', r, val));
  }

  // 位置 (数値微調整)
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

  const sel = $('#weather-interval');
  sel.value = String(cfg.settings.weatherIntervalMin || 30);
  sel.onchange = () => { touch(); window.api.setSettings({ weatherIntervalMin: +sel.value }); };

  $('#btn-weather-refresh').onclick = async () => {
    $('#weather-status').textContent = '更新中…';
    await window.api.refreshWeather();
  };

  updateWeatherStatus(await window.api.getWeather());
  $('#version').textContent = 'v' + await window.api.getVersion();
}

function updateWeatherStatus(w) {
  const el = $('#weather-status');
  if (!w) { el.textContent = '天気ウィジェットを追加すると自動で取得します。'; return; }
  if (w.error || w.temp == null) { el.textContent = '取得に失敗しました。ネットワークを確認してください。'; return; }
  const t = new Date(w.fetchedAt);
  el.textContent = `最終更新 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ・ ${w.city} ${w.temp}° ${w.desc}`;
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
  $('#fonts').innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
}

// ---------------------------------------------------------------- 初期化
window.api.onConfig((c) => {
  cfg = c;
  renderWallpaperTab();
  renderGeneral();
  if (Date.now() > suppressUntil) renderWidgetList();
});

window.api.onWeather((w) => updateWeatherStatus(w));

(async () => {
  cfg = await window.api.getConfig();
  renderAddRow();
  renderWallpaperTab();
  renderWidgetList();
  renderGeneral();
  loadFonts();
  document.addEventListener('pointerdown', () => loadFonts(), { once: true });
})();
