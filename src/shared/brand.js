// アプリ名の単一の出どころ。
//
// electron-builder はビルド時に package.json を静的に読むので、そちらが本体。
// ここはそれを読み直すだけにしてある。こうしておけば package.json の
// name / productName を書き換えるだけで、アプリ内の表示も追従する。
//
// 追従しないもの (仕様上どうしても静的になる):
//   - %APPDATA% のフォルダ名   … package.json の name から Electron が決める
//   - 配布 exe のファイル名     … productName から electron-builder が決める
//   - winget のマニフェスト     … 別リポジトリの静的 YAML
//   - 紹介サイトの HTML         … 検索に読ませる必要があるので実テキストで書く
'use strict';

const pkg = require('../../package.json');

// 表示名 (AeroWidget)
const NAME = (pkg.build && pkg.build.productName) || pkg.name;
// 内部識別子 (aerowidget) — userData のフォルダ名と同じ
const ID = pkg.name;
const VERSION = pkg.version;

// 外部へ名乗るときの User-Agent。相手のサーバに出るので版も添える
const UA = `${NAME}/${VERSION}`;

module.exports = { NAME, ID, VERSION, UA };
