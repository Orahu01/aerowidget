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
const phaseSec = () => (phase === 'work' ? (o().workMin || 25) : (o().breakMin || 5)) * 60;

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function render() {
  phaseEl.textContent = phase === 'work' ? '作業' : '休憩';
  phaseEl.classList.toggle('break', phase === 'break');
  card.classList.toggle('break', phase === 'break');
  timeEl.textContent = fmt(remaining);
  const total = phaseSec();
  fillEl.style.transform = `scaleX(${total ? (1 - remaining / total) : 0})`;
  toggleBtn.textContent = running ? '一時停止' : '開始';
  toggleBtn.classList.toggle('running', running);
  const done = o().doneCount || 0;
  countEl.textContent = done > 0 ? `今日 ${done} セット完了` : '';
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
      body: next === 'break' ? '作業おつかれさま。休憩しましょう ☕' : '休憩おわり。作業に戻りましょう',
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
  phase = 'work';
  remaining = phaseSec();
  applyStyle();
  render();
})();
