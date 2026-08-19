// グローバルホットキー。設定 (settings.hotkeys) に従って登録し直す。
'use strict';

const { globalShortcut } = require('electron');

// name -> コールバック。main.js が登録する
let actions = {};
let lastKey = '';

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
  if (!hk.enabled) return;

  const results = {};
  for (const [name, accel] of Object.entries(hk)) {
    if (name === 'enabled' || !accel || !actions[name]) continue;
    try {
      results[name] = globalShortcut.register(accel, actions[name]);
    } catch (_) {
      results[name] = false;
    }
  }
  return results;
}

function dispose() {
  try { globalShortcut.unregisterAll(); } catch (_) {}
}

module.exports = { setActions, sync, dispose };
