// 配布物から、このアプリが使わない実行時ファイルを外す。
//
// dxcompiler.dll / dxil.dll は WebGPU (Dawn) のシェーダコンパイラ。
// AeroWidget の描画は Canvas2D・CSS・<video> だけで WebGPU に触れないため、
// 合わせて約 27MB がまるごと不要。外した状態で起動・壁紙描画・
// ビジュアライザーが動くことを確認済み。
'use strict';

const fs = require('fs');
const path = require('path');

const DROP = ['dxcompiler.dll', 'dxil.dll'];

exports.default = async function afterPack(context) {
  let freed = 0;
  for (const name of DROP) {
    const p = path.join(context.appOutDir, name);
    try {
      const size = fs.statSync(p).size;
      fs.unlinkSync(p);
      freed += size;
      console.log(`  afterPack: ${name} を削除 (${(size / 1048576).toFixed(1)} MB)`);
    } catch (_) { /* 無ければ何もしない (Electron の構成が変わった場合) */ }
  }
  if (freed) console.log(`  afterPack: 合計 ${(freed / 1048576).toFixed(1)} MB 削減`);
};
