// 音量ウィジェット (音量スライダー / ミュート / 出力デバイス切替)
'use strict';

let widget = null;
let state = null;      // { volume, muted, current, devices }
let dragging = false;

const card = document.getElementById('card');
const slider = document.getElementById('slider');
const pct = document.getElementById('pct');
const deviceSel = document.getElementById('device');
const muteBtn = document.getElementById('mute');

function applyStyle() {
  if (!widget) return;
  const o = widget.options || {};
  card.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.6})`;
  card.style.color = widget.color || '#e6e7ea';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.style.fontSize = Math.max(10, widget.size || 15) + 'px';
  document.body.classList.toggle('no-dev', o.showDevices === false);
}

// デバイス名は長いので、括弧の前までを表示に使う
function shortName(name) {
  const m = /^(.+?)\s*\(/.exec(name || '');
  return (m ? m[1] : (name || '')).trim() || name || '';
}

function renderDevices() {
  if (!state || !state.devices) return;
  const sig = state.devices.map(d => d.id).join('|') + '#' + state.current;
  if (deviceSel.dataset.sig === sig) return;
  deviceSel.dataset.sig = sig;
  deviceSel.innerHTML = '';
  for (const d of state.devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = shortName(d.name);
    opt.title = d.name;
    deviceSel.appendChild(opt);
  }
  deviceSel.value = state.current;
}

function render() {
  if (!state) { pct.textContent = '--'; return; }
  document.body.classList.toggle('muted', !!state.muted);
  if (!dragging && document.activeElement !== slider) slider.value = state.volume;
  pct.textContent = (state.muted ? 'OFF' : state.volume + '%');
  renderDevices();
}

slider.addEventListener('pointerdown', () => { dragging = true; });
slider.addEventListener('pointerup', () => { dragging = false; });
slider.addEventListener('input', () => {
  const v = +slider.value;
  pct.textContent = v + '%';
  if (state) state = { ...state, volume: v, muted: false };
  document.body.classList.remove('muted');
  window.fw.setVolume(v);
});

// ホイールでも音量を変えられるようにする
card.addEventListener('wheel', (e) => {
  if (!state) return;
  e.preventDefault();
  const v = Math.max(0, Math.min(100, (state.volume || 0) + (e.deltaY < 0 ? 2 : -2)));
  state = { ...state, volume: v };
  slider.value = v;
  pct.textContent = v + '%';
  window.fw.setVolume(v);
}, { passive: false });

muteBtn.addEventListener('click', () => {
  if (!state) return;
  const m = !state.muted;
  state = { ...state, muted: m };
  render();
  window.fw.setMute(m);
});

deviceSel.addEventListener('change', () => window.fw.setDevice(deviceSel.value));

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
window.fw.onAudio((d) => { state = d; render(); });

(async () => {
  const st = await window.fw.getState();
  widget = st.widget;
  state = st.audio || null;
  document.getElementById('gfonts').textContent = st.fontsCss || '';
  applyStyle();
  render();
  window.fw.refreshAudio();
})();
