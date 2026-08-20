// 旧名 (WidgetWall) からの引っ越し。
//
// アプリ名を変えると app.getPath('userData') の行き先も変わるため、
// 何もしないと今までの壁紙・ウィジェット配置がそっくり見えなくなる。
// 初回起動で旧フォルダを見つけたら中身を運び込む。
//
// 旧フォルダは消さない。取り込みに失敗しても手で戻せるようにしておくため。
'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LEGACY_DIR = 'widgetwall';           // %APPDATA%\widgetwall
// 運ぶのは自前で作ったものだけ。Chromium のキャッシュ類は持って行かない
const ITEMS = ['config.json', 'fonts', 'online'];

function legacyPath() {
  return path.join(path.dirname(app.getPath('userData')), LEGACY_DIR);
}

function copyInto(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyInto(path.join(src, name), path.join(dest, name));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 初回起動時に一度だけ。戻り値は運んだものの名前
function run() {
  const dir = app.getPath('userData');
  const old = legacyPath();
  if (dir === old) return [];                                   // 改名前のビルド
  if (fs.existsSync(path.join(dir, 'config.json'))) return [];  // すでに自前の設定がある
  if (!fs.existsSync(path.join(old, 'config.json'))) return []; // 引き継ぐものがない

  const moved = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ITEMS) {
    const from = path.join(old, name);
    if (!fs.existsSync(from)) continue;
    try {
      copyInto(from, path.join(dir, name));
      moved.push(name);
    } catch (e) {
      console.error(`migrate ${name} failed:`, e.message);      // 1 つ失敗しても残りは運ぶ
    }
  }
  if (moved.length) console.log('[migrate] WidgetWall から引き継ぎました:', moved.join(', '));
  return moved;
}

module.exports = { run, legacyPath };
