// アイコン復元の計画 (planMoves / unparkRows) の机上テスト。
// デスクトップには一切書き込まない。画面判定は全部偽物を注入する。
//
// 実行: node scripts/plantest.js
'use strict';

const icons = require('../src/main/icons');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`✗ ${label}\n    got : ${g}\n    want: ${w}`);
}

// ---- 偽の画面: モニタ1 = (0,0)-(1000,800), モニタ2 = (1000,200)-(2000,800)
//      仮想画面の原点は (0,0)。左上 1000x200 の右上… ではなく (1000,0)-(2000,200) が死角
function mkEnv(origin) {
  const isOff = (sx, sy) => {
    const inM1 = sx >= 0 && sx < 1000 && sy >= 0 && sy < 800;
    const inM2 = sx >= 1000 && sx < 2000 && sy >= 200 && sy < 800;
    return !(inM1 || inM2);
  };
  return {
    origin,
    isOff,
    slots: (n) => Array.from({ length: n }, (_, i) => ({ x: 1000 + i * 130, y: 0 })),
    freeCells: (n, taken) => {
      const out = [];
      for (let y = 0; y < 800 && out.length < n; y += 126) {
        for (let x = 0; x < 1000 && out.length < n; x += 130) {
          const k = Math.round(x / 130) + ',' + Math.round(y / 126);
          if (taken && taken.has(k)) continue;
          if (taken) taken.add(k);
          out.push({ x, y });
        }
      }
      return out;
    },
  };
}

// ================================================================
// 1. 同じモニタ構成なら、保存どおりの位置に戻る
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 10, y: 20 }, { name: 'B', x: 140, y: 20 }];
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, {}, [], env);
  eq('同構成: そのまま', plan.moves, [{ name: 'A', x: 10, y: 20 }, { name: 'B', x: 140, y: 20 }]);
  eq('同構成: 退避なし', plan.parked, []);
}

// 2. 原点がずれたら差分を引き直す (タブレットを抜いて原点が (‑500,0) -> (0,0) になった等)
{
  const env = mkEnv({ x: 0, y: 0 });
  // 保存時は原点 (-500, 0)。アイコンは listview 座標 (510, 20) = 画面座標 (10, 20)
  const want = [{ name: 'A', x: 510, y: 20 }];
  const plan = icons.planMoves(want, [], { x: -500, y: 0 }, {}, [], env);
  eq('原点ずれ: 画面上の同じ場所へ', plan.moves, [{ name: 'A', x: 10, y: 20 }]);
}

// 3. 原点情報が無い古いデータは「今と同じ」とみなす (今までと同じ動き)
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 10, y: 20 }];
  const plan = icons.planMoves(want, [], undefined, {}, [], env);
  eq('原点なし: 従来どおり', plan.moves, [{ name: 'A', x: 10, y: 20 }]);
}

// 4. 保存座標が今の画面に無い -> 控えてある元位置へ
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 1500, y: 0 }];     // (1000,0)-(2000,200) は死角
  const home = { A: { x: 100, y: 100, ox: 0, oy: 0 } };
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, home, [], env);
  eq('死角座標: 元位置に救出', plan.moves, [{ name: 'A', x: 100, y: 100 }]);
  eq('救出数', plan.rescued, 1);
}

// 5. 元位置も無ければ空きセルへ (見えなくならないことが最優先)
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 1500, y: 0 }];
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, {}, [], env);
  eq('救出先なし: 空きセルへ', plan.moves, [{ name: 'A', x: 0, y: 0 }]);
  eq('セル行き数', plan.celled, 1);
}

// 6. home 自体も記録時の原点から引き直す
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 1500, y: 0 }];
  // home は原点 (-500,0) 時代に記録した (600,100) = 画面座標 (100,100)
  const home = { A: { x: 600, y: 100, ox: -500, oy: 0 } };
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, home, [], env);
  eq('home の原点補正', plan.moves, [{ name: 'A', x: 100, y: 100 }]);
}

// 7. 隠す指定が最優先。退避スロットに並ぶ
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 10, y: 20 }, { name: 'B', x: 140, y: 20 }];
  const plan = icons.planMoves(want, ['B'], { x: 0, y: 0 }, {}, [], env);
  eq('隠す優先: 表示は A だけ', plan.moves, [{ name: 'A', x: 10, y: 20 }]);
  eq('隠す優先: B は死角へ', plan.parked, [{ name: 'B', x: 1000, y: 0 }]);
}

// 8. スナップに無い現存アイコンのセルには割り込まない
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 1500, y: 0 }];     // 救出が必要
  const stay = [{ name: 'Z', x: 0, y: 0 }];        // 先頭セルは Z が使用中
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, {}, stay, env);
  eq('先客がいるセルは避ける', plan.moves, [{ name: 'A', x: 130, y: 0 }]);
}

// 9. 複数の救出が同じセルに重ならない
{
  const env = mkEnv({ x: 0, y: 0 });
  const want = [{ name: 'A', x: 1500, y: 0 }, { name: 'B', x: 1600, y: 0 }];
  const plan = icons.planMoves(want, [], { x: 0, y: 0 }, {}, [], env);
  const cells = plan.moves.map(m => m.x + ',' + m.y);
  eq('救出先が重複しない', new Set(cells).size, cells.length);
}

// 10. unparkRows: 原点を引き直し、死角の分だけ home へ直す
{
  // このテストだけは本物の画面判定を使う (今の実構成でも壊れないことの確認)
  const o = icons.origin();
  const rows = [{ name: 'A', x: 100, y: 100 }];
  const out = icons.unparkRows(rows, { x: o.x - 40, y: o.y }, {});
  eq('unparkRows: 原点差分 40 を引き直す', [{ name: out[0].name, x: out[0].x, y: out[0].y }],
    [{ name: 'A', x: 60, y: 100 }]);
}

console.log(fail ? `\n${fail} 件失敗 / ${pass + fail} 件` : `全 ${pass} 件 PASS`);
process.exit(fail ? 1 : 0);
