// メインプロセスの定期処理を単一タイマーに集約する。
// Electron の main プロセスは複数の setInterval が存在するだけで
// メッセージポンプが空回りして CPU を消費するため (実測 +10%/コア)、
// すべての周期タスクをこの 1 本のハートビートに登録して回す。
'use strict';

const tasks = new Map(); // name -> { period, next, fn }
let timer = null;

function ensure() {
  if (timer || tasks.size === 0) return;
  timer = setInterval(() => {
    const now = Date.now();
    for (const t of tasks.values()) {
      if (now >= t.next) {
        t.next = now + t.period;
        try { t.fn(); } catch (e) { console.error('heartbeat task error:', e.message); }
      }
    }
  }, 1000);
}

// periodMs 間隔で fn を実行するタスクを登録 (同名は上書き)
function register(name, periodMs, fn, immediate = false) {
  tasks.set(name, { period: Math.max(1000, periodMs), next: immediate ? 0 : Date.now() + periodMs, fn });
  ensure();
}

function unregister(name) {
  tasks.delete(name);
  if (!tasks.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { register, unregister };
