// ポモドーロタイマーウィジェット。
// タイマーは動作中のみ 1 秒 tick (停止中はタイマーなし = 省電力)。
'use strict';

let widget = null;
let phase = 'work';       // 'work' | 'break'
let remaining = 25 * 60;  // 秒
let running = false;
let timer = null;

const card = document.getElementById('card');
const phaseEl = document.getElementById('phase');
const timeEl = document.getElementById('time');
const fillEl = document.getElementById('bar-fill');
const toggleBtn = document.getElementById('btn-toggle');
const resetBtn = document.getElementById('btn-reset');
const countEl = document.getElementById('count');

const o = () => (widget && widget.options) || {};
function en() {
  const l = (widget && widget._lang) || 'auto';
  if (l === 'en') return true;
  if (l === 'ja') return false;
  return !(osLocale || 'ja').toLowerCase().startsWith('ja');
}
let osLocale = 'ja';
const phaseSec = () => (phase === 'work' ? (o().workMin || 25) : (o().breakMin || 5)) * 60;

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function render() {
  phaseEl.textContent = phase === 'work' ? (en() ? 'FOCUS' : '作業') : (en() ? 'BREAK' : '休憩');
  phaseEl.classList.toggle('break', phase === 'break');
  card.classList.toggle('break', phase === 'break');
  timeEl.textContent = fmt(remaining);
  const total = phaseSec();
  fillEl.style.transform = `scaleX(${total ? (1 - remaining / total) : 0})`;
  toggleBtn.textContent = running ? (en() ? 'Pause' : '一時停止') : (en() ? 'Start' : '開始');
  toggleBtn.classList.toggle('running', running);
  resetBtn.textContent = en() ? 'Reset' : 'リセット';
  const done = o().doneCount || 0;
  countEl.textContent = done > 0 ? (en() ? `${done} sets done` : `今日 ${done} セット完了`) : '';
}

function applyStyle() {
  if (!widget) return;
  card.style.background = `rgba(13, 16, 22, ${o().bgOpacity ?? 0.6})`;
  card.style.color = widget.color || '#e6e7ea';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.style.fontSize = Math.max(10, widget.size || 14) + 'px';
  if (!running) {
    remaining = Math.min(remaining, phaseSec());
    render();
  }
}

function notifyPhase(next) {
  try {
    new Notification('WidgetWall', {
      body: next === 'break' ? (en() ? 'Nice work. Time for a break ☕' : '作業おつかれさま。休憩しましょう ☕') : (en() ? 'Break is over. Back to work' : '休憩おわり。作業に戻りましょう'),
      silent: false,
    });
  } catch (_) {}
}

function tick() {
  remaining--;
  if (remaining <= 0) {
    if (phase === 'work') {
      window.fw.save({ doneCount: (o().doneCount || 0) + 1 });
      if (widget) widget.options.doneCount = (o().doneCount || 0) + 1;
      phase = 'break';
    } else {
      phase = 'work';
    }
    remaining = phaseSec();
    notifyPhase(phase);
  }
  render();
}

function setRunning(v) {
  running = v;
  clearInterval(timer);
  timer = null;
  if (running) timer = setInterval(tick, 1000);
  render();
}

toggleBtn.addEventListener('click', () => setRunning(!running));
resetBtn.addEventListener('click', () => {
  setRunning(false);
  phase = 'work';
  remaining = phaseSec();
  render();
});

async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
  } catch (_) {}
}

window.fw.onPomoToggle(() => setRunning(!running));
window.fw.onWidget((w) => { widget = w; applyStyle(); });
window.fw.onConfig((env) => {
  if (env.osLocale) osLocale = env.osLocale;
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) { widget = w; widget._lang = (env.config.settings || {}).language || 'auto'; applyStyle(); render(); }
});
window.fw.onFontsChanged(() => injectFonts());

(async () => {
  const st = await window.fw.getState();
  if (st.osLocale) osLocale = st.osLocale;
  widget = st.widget;
  document.getElementById('gfonts').textContent = st.fontsCss || '';
  phase = 'work';
  remaining = phaseSec();
  applyStyle();
  render();
})();
