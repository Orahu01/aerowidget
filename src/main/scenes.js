// シーン: 文脈に応じてレイアウトプリセットを自動で切り替える。
//
// 文脈 = 前面アプリ / フルスクリーン / 時間帯 / バッテリー駆動。
// シーンは構成データを持たない。既存のレイアウトプリセットを「指す」だけにしてある。
// エンジンが誤動作しても変わるのは「いまどれが当たっているか」だけで、
// レイアウト本体には触れない — 自動でユーザーの配置を書き換える機能は、
// これくらい臆病に作るべきという判断。
//
// 評価はイベント駆動 (前面変化 / フルスクリーン変化 / 電源変化) + 毎分の tick (時間帯用)。
// ルールは上から評価して最初に当たったものが勝ち。何も当たらなければ「通常時」。
'use strict';

const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

let cfg = { enabled: false, defaultLayout: '', rules: [] };
let applyFn = null;        // (layoutName) => bool  適用できたら true
let paused = false;        // 編集モード中は評価しない
let lastTarget = null;     // 直近に適用を指示したレイアウト名
let lastIcons = null;      // 直近に適用を指示したアイコン配置名
let lastKey = '';          // cfg の変化検出
let modeWatch = null;      // 条件の成立状況が変わりうるたびに呼ぶ (モードの重ね用)

const state = {
  foreground: '',          // 前面 exe 名 (小文字、デスクトップなら '')
  fsMonitors: new Set(),   // フルスクリーン中のモニタ index
  onBattery: false,
};

function parseHM(s, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return fallback;
  return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]);
}

function ruleMatches(rule, now = new Date()) {
  const t = rule.trigger || {};
  switch (t.type) {
    case 'app': {
      if (!state.foreground) return false;
      const apps = (Array.isArray(t.apps) ? t.apps : [])
        .map(a => String(a || '').trim().toLowerCase()).filter(Boolean);
      return apps.includes(state.foreground);
    }
    case 'fullscreen':
      return state.fsMonitors.size > 0;
    case 'battery':
      return state.onBattery;
    case 'time': {
      const days = Array.isArray(t.days) && t.days.length ? t.days : [0, 1, 2, 3, 4, 5, 6];
      const from = parseHM(t.from, 0);
      const to = parseHM(t.to, 24 * 60);
      const cur = now.getHours() * 60 + now.getMinutes();
      if (from <= to) {
        return days.includes(now.getDay()) && cur >= from && cur < to;
      }
      // 日またぎ (例 22:00→06:00): 当日の夜側、または前日から続く朝側
      const prevDay = (now.getDay() + 6) % 7;
      return (days.includes(now.getDay()) && cur >= from) ||
             (days.includes(prevDay) && cur < to);
    }
    default:
      return false;
  }
}

function evaluate(reason) {
  if (!cfg.enabled || paused || !applyFn) return;
  let target = String(cfg.defaultLayout || '');
  let icons = String(cfg.defaultIcons || '');
  let matched = 'default';
  for (const r of cfg.rules || []) {
    if (!r || r.enabled === false) continue;
    // レイアウトだけ / アイコンだけ の指定も認める
    if (!r.layout && !r.icons) continue;
    if (ruleMatches(r)) {
      target = String(r.layout || cfg.defaultLayout || '');
      icons = String(r.icons || '');
      matched = r.name || r.trigger?.type;
      break;
    }
  }
  // レイアウトが同じでもアイコンだけ変わることがあるので両方見る
  if (target === lastTarget && icons === lastIcons) return;
  if (!target && !icons) return;
  if (process.env.WW_DEBUG) {
    console.log(`[scenes] ${reason || 'eval'}: -> "${target}" icons="${icons}" (${matched}) fg=${state.foreground || '-'} fs=${state.fsMonitors.size} bat=${state.onBattery}`);
  }
  // applyFn は {layoutOk} を返す。アイコンだけの指定でも呼ぶ
  const ok = applyFn(target, icons);
  lastIcons = icons;
  if (ok || !target) {
    if (target) lastTarget = target;
    emitter.emit('applied', target);
  }
}

// ---- main.js から流し込むイベント ----

function setForeground(exe) {
  state.foreground = String(exe || '').toLowerCase();
  if (modeWatch) modeWatch();
  evaluate('foreground');
}

function setFullscreen(index, on) {
  if (on) state.fsMonitors.add(index); else state.fsMonitors.delete(index);
  if (modeWatch) modeWatch();
  evaluate('fullscreen');
}

function setBattery(on) {
  state.onBattery = !!on;
  if (modeWatch) modeWatch();
  evaluate('battery');
}

// 編集モード中は止める。抜けたときに再評価はしない —
// 抜けた直後の config は「ユーザーが直し終えた配置」で、それを
// エンジンがプリセットで上書きするのが一番起きてほしくない事故だから。
// 次に文脈が変わったときから普通に効き始める。
function setPaused(p) {
  paused = !!p;
}

function sync(scenesCfg) {
  const next = scenesCfg || { enabled: false, defaultLayout: '', rules: [] };
  const key = JSON.stringify(next);
  if (key === lastKey) return;
  const wasEnabled = cfg.enabled;
  lastKey = key;
  cfg = JSON.parse(key);
  if (!cfg.enabled) {
    lastTarget = null;         // 無効化したら次の有効化はまっさらから
    lastIcons = null;
    return;
  }
  if (!wasEnabled) { lastTarget = null; lastIcons = null; }
  evaluate('config');
}

function init(apply) {
  applyFn = apply;
  // 時間帯トリガーのために毎分見る (heartbeat 集約)
  heartbeat.register('scenes-tick', 60 * 1000, () => {
    if (modeWatch) modeWatch();
    evaluate('tick');
  });
}

function status() {
  return { lastTarget, foreground: state.foreground, fullscreen: state.fsMonitors.size > 0, onBattery: state.onBattery };
}

// モードの重ね: 条件が成立しているかだけを判定して返す (適用はしない)
function matches(trigger) {
  return trigger ? ruleMatches({ trigger }) : false;
}

function watchModes(fn) { modeWatch = fn; }

module.exports = {
  init, sync, setForeground, setFullscreen, setBattery, setPaused,
  evaluate, status, matches, watchModes, on: (...a) => emitter.on(...a) };
