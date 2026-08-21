// 切り替えボタン: デスクトップ上からレイアウトプリセット、または
// デスクトップアイコンのモードを切り替える (options.target で選ぶ)。
//
// シーンが「状況で自動」なら、こちらは「手で今すぐ」。
// いま当たっているものはボタンが光るので、どの構成にいるか一目で分かる。
'use strict';

let widget = null;
let osLocale = 'ja';
let names = [];      // 表示する名前
let current = '';    // いま当たっているもの

// 何を切り替えるか。'icons' ならデスクトップアイコンのモード
function target() {
  if (widget && widget.type === 'modeswitch') return 'icons';   // モード切替ボタンは常にアイコンのモード
  return ((widget && widget.options && widget.options.target) === 'icons') ? 'icons' : 'layout';
}
const SRC = {
  layout: { list: () => window.fw.listLayouts(), now: () => window.fw.currentLayout(),
            apply: (n) => window.fw.applyLayout(n) },
  icons:  { list: () => window.fw.listIconModes(), now: () => window.fw.currentIconMode(),
            apply: (n) => window.fw.applyIconMode(n) },
};

const card = document.getElementById('card');
const buttons = document.getElementById('buttons');

function en() {
  const l = (widget && widget._lang) || 'auto';
  if (l === 'en') return true;
  if (l === 'ja') return false;
  return !(osLocale || 'ja').toLowerCase().startsWith('ja');
}

function applyStyle() {
  if (!widget) return;
  const o = widget.options || {};
  document.body.classList.toggle('vertical', !!o.vertical);
  card.style.setProperty('--bg', String(o.bgOpacity ?? 0.55));
  card.style.setProperty('--fg', widget.color || '#dfe2e8');
  card.style.setProperty('--accent', o.accent || '#e3a94f');
  card.style.fontFamily = `"${widget.font}", "Segoe UI", "Yu Gothic UI", sans-serif`;
  card.style.fontSize = Math.max(9, widget.size || 13) + 'px';
  card.style.fontWeight = String(widget.weight || 500);
  card.style.letterSpacing = (widget.letterSpacing ?? 1) + 'px';
  card.style.opacity = String(widget.opacity ?? 1);
}

function render() {
  buttons.innerHTML = '';
  if (!names.length) {
    const p = document.createElement('div');
    p.id = 'empty';
    p.textContent = target() === 'icons'
      ? (en() ? 'Create an icon mode first' : '先にアイコンのモードを作ってください')
      : (en() ? 'Save a layout preset first' : '先にレイアウトを保存してください');
    buttons.appendChild(p);
    return;
  }
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = name;
    b.title = name;
    if (name === current) b.classList.add('active');
    b.addEventListener('click', async () => {
      if (name === current) return;
      const ok = await SRC[target()].apply(name);
      if (ok) { current = name; render(); }
    });
    buttons.appendChild(b);
  }
}

// options.items が指定されていればその順で、無ければ保存済み全部
async function refresh() {
  const src = SRC[target()];
  const all = (await src.list()) || [];
  const want = ((widget && widget.options && widget.options.items) || [])
    .map(s => String(s || '').trim()).filter(Boolean);
  names = want.length ? want.filter(n => all.includes(n)) : all;
  current = (await src.now()) || '';
  render();
}

window.fw.onWidget((w) => { widget = w; applyStyle(); refresh(); });
window.fw.onConfig((env) => {
  if (env.osLocale) osLocale = env.osLocale;
  const w = (env.config.widgets || []).find(x => x.id === window.fw.id);
  if (w) {
    widget = w;
    widget._lang = (env.config.settings || {}).language || 'auto';
    applyStyle();
  }
  // レイアウトの増減や、シーンによる切り替えにも追従する
  refresh();
});

async function injectFonts() {
  document.getElementById('gfonts').textContent = await window.fw.getFontsCss();
}
window.fw.onFontsChanged(() => injectFonts());

(async () => {
  // getState() は {widget, fontsCss, osLocale, ...} をそのまま返す
  const st = await window.fw.getState();
  if (st) {
    osLocale = st.osLocale || osLocale;
    if (st.widget) widget = st.widget;
    document.getElementById('gfonts').textContent = st.fontsCss || '';
  }
  applyStyle();
  await refresh();
})();
