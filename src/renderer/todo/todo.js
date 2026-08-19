// ToDo ウィジェット (チェックボックス付きタスクリスト、自動保存)
'use strict';

let widget = null;
let items = [];       // [{text, done}]
let saveTimer = null;

const card = document.getElementById('card');
const titleEl = document.getElementById('title');
const listEl = document.getElementById('list');
const addEl = document.getElementById('add');

const CHECK = '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.fw.save({ items }), 300);
}

function en() {
  const l = (widget && widget._lang) || 'auto';
  if (l === 'en') return true;
  if (l === 'ja') return false;
  return !(osLocale || 'ja').toLowerCase().startsWith('ja');
}
let osLocale = 'ja';

function applyStyle() {
  if (!widget) return;
  addEl.placeholder = en() ? 'Add a task…' : 'タスクを追加…';
  const o = widget.options || {};
  card.style.background = `rgba(13, 16, 22, ${o.bgOpacity ?? 0.6})`;
  card.style.color = widget.color || '#e6e7ea';
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.style.fontSize = Math.max(10, widget.size || 14) + 'px';
  titleEl.textContent = o.title || '';
}

function render() {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${en() ? 'Add tasks below' : '下の欄からタスクを追加'}</div>`;
    return;
  }
  // 未完了を上、完了を下に
  const order = [...items.keys()].sort((a, b) => (items[a].done ? 1 : 0) - (items[b].done ? 1 : 0));
  for (const i of order) {
    const it = items[i];
    const row = document.createElement('div');
    row.className = 'item' + (it.done ? ' done' : '');
    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.innerHTML = CHECK;
    chk.addEventListener('click', () => {
      it.done = !it.done;
      render();
      save();
    });
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = it.text;
    txt.title = it.text;
    const del = document.createElement('button');
    del.className = 'del';
    del.innerHTML = X;
    del.addEventListener('click', () => {
      items.splice(i, 1);
      render();
      save();
    });
    row.appendChild(chk);
    row.appendChild(txt);
    row.appendChild(del);
    listEl.appendChild(row);
  }
}

addEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const text = addEl.value.trim();
  if (!text) return;
  items.push({ text, done: false });
  addEl.value = '';
  render();
  save();
});

function applyWidget(w) {
  widget = w;
  const next = (w.options || {}).items || [];
  // 自分の編集がラウンドトリップして戻ってくるので、入力中でなければ同期
  if (document.activeElement !== addEl || !addEl.value) {
    items = JSON.parse(JSON.stringify(next));
    render();
  }
  applyStyle();
}

async function injectFonts() {
  try {
    document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
  } catch (_) {}
}

window.fw.onWidget(applyWidget);
window.fw.onConfig((env) => {
  if (env.osLocale) osLocale = env.osLocale;
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) { w._lang = (env.config.settings || {}).language || 'auto'; applyWidget(w); }
});
window.fw.onFontsChanged(() => injectFonts());

(async () => {
  const st = await window.fw.getState();
  if (st.osLocale) osLocale = st.osLocale;
  if (st.widget) applyWidget(st.widget);
  document.getElementById('gfonts').textContent = st.fontsCss || '';
})();
