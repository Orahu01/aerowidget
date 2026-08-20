// グローバルホットキー。設定 (settings.hotkeys) に従って登録し直す。
'use strict';

const { globalShortcut } = require('electron');

// name -> コールバック。main.js が登録する
let actions = {};
let lastKey = '';
let lastResults = {};   // name -> 登録できたか

function setActions(map) {
  actions = map || {};
}

// 設定が変わるたびに呼ぶ。差分がなければ何もしない
function sync(hotkeys) {
  const hk = hotkeys || {};
  const key = JSON.stringify(hk);
  if (key === lastKey) return;
  lastKey = key;

  globalShortcut.unregisterAll();
  lastResults = {};
  if (!hk.enabled) return;

  const results = lastResults;
  for (const [name, accel] of Object.entries(hk)) {
    if (name === 'enabled' || !accel || !actions[name]) continue;
    try {
      results[name] = globalShortcut.register(accel, actions[name]);
    } catch (_) {
      results[name] = false;
    }
  }
  if (process.env.WW_DEBUG) {
    const failed = Object.entries(results).filter(([, ok]) => !ok).map(([n]) => n);
    console.log('[hotkeys] registered=', Object.keys(results).join(','), failed.length ? ' FAILED=' + failed.join(',') : '');
  }
  return results;
}

function dispose() {
  try { globalShortcut.unregisterAll(); } catch (_) {}
}

// 他のアプリに取られていたキー。設定画面で理由を出すために使う
function failed() {
  return Object.entries(lastResults).filter(([, ok]) => !ok).map(([name]) => name);
}

module.exports = { setActions, sync, dispose, failed };
