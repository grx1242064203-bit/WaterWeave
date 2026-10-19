import test from 'node:test';
import assert from 'node:assert/strict';

import { createLevel, createState } from '../src/logic/model.js';
import { CHANNEL, hEdgeId, vEdgeId } from '../src/logic/topology.js';
import { channelEdges, loopPath } from '../src/logic/validator.js';
import { solveAll, hasUniqueSolution } from '../src/logic/solver.js';
import { PERIMETER_DIGITS, perimeterLevel, blankLevel } from './fixtures.js';

/** 生成 n×n 的外圈数字方案：四角 2，边缘 1，内部 0 */
function perimeterDigits(n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let d = 0;
      if (i === 0 || i === n - 1) d++;
      if (j === 0 || j === n - 1) d++;
      out.push([i, j, d]);
    }
  }
  return out;
}

/** 外圈解 */
function perimeterStateOf(level) {
  const g = level.grid;
  const n = level.cols;
  const state = createState(g);
  for (let i = 0; i < n; i++) {
    state[hEdgeId(g, i, 0)] = CHANNEL;
    state[hEdgeId(g, i, n)] = CHANNEL;
  }
  for (let j = 0; j < n; j++) {
    state[vEdgeId(g, 0, j)] = CHANNEL;
    state[vEdgeId(g, n, j)] = CHANNEL;
  }
  return state;
}

/** 比较两条解：只比「开了哪些渠」 */
function sameChannels(a, b) {
  const ea = channelEdges(a).sort((x, y) => x - y);
  const eb = channelEdges(b).sort((x, y) => x - y);
  return ea.length === eb.length && ea.every((v, k) => v === eb[k]);
}

test('3×3 已知关卡：恰好 1 解，且与手工外圈解一致', () => {
  const level = perimeterLevel();
  const { count, solutions } = solveAll(level, { limit: 2 });
  assert.equal(count, 1, '外圈方案应唯一');
  assert.ok(sameChannels(solutions[0], perimeterStateOf(level)),
    '求解结果应与手工外圈解一致');
});

test('外圈方案在 n=3..7 上都恰好 1 解（数字 0 封锁内部，只剩外圈）', () => {
  for (const n of [3, 4, 5, 6, 7]) {
    const level = createLevel({ id: `perim-${n}`, cols: n, rows: n, numbers: perimeterDigits(n) });
    const { count, solutions } = solveAll(level, { limit: 2 });
    assert.equal(count, 1, `${n}×${n} 应唯一解`);
    assert.ok(sameChannels(solutions[0], perimeterStateOf(level)), `${n}×${n} 解应与外圈一致`);
  }
});

test('空白关卡：无数字约束，解远多于 1（返回 >= 2 即判定多解）', () => {
  const level = blankLevel(5, 5);
  const { count } = solveAll(level, { limit: 2 });
  assert.ok(count >= 2, `多解关卡应返回 >= 2，实际 ${count}`);
});

test('默认上限为 2：任何关卡最多返回 2 条解', () => {
  const { count, solutions } = solveAll(blankLevel(6, 6));
  assert.ok(count <= 2);
  assert.equal(solutions.length, count);
});

test('无解关卡：数字自相矛盾时返回 0 解', () => {
  // 1×1：唯一的闭合水路要用到全部 4 条渠，而任何数字都 <= 3，故 1 条渠的要求不可满足
  const level = createLevel({ id: 'unsat', cols: 1, rows: 1, numbers: [[0, 0, 1]] });
  assert.equal(solveAll(level, { limit: 2 }).count, 0);
});

test('闸口约束：闸口落在外圈上仍唯一；落在回路之外则无解', () => {
  const onLoop = perimeterLevel({ gates: [[0, 0]] });
  assert.equal(solveAll(onLoop, { limit: 2 }).count, 1, '闸口在唯一解上，解数不变');

  const offLoop = perimeterLevel({ gates: [[1, 1]] });
  assert.equal(solveAll(offLoop, { limit: 2 }).count, 0,
    '闸口不在外圈上，而外圈又是唯一数字解，故无解');
});

test('传播充分性：闭合剪枝不会漏掉唯一解', () => {
  // 数字 0 的三格把内部锁死，若剪枝过早会误判无解
  const level = createLevel({ id: 'prune-check', cols: 3, rows: 3, numbers: PERIMETER_DIGITS });
  assert.equal(hasUniqueSolution(level), true);
});

test('7×7 求解在 10 秒内完成（M4 关卡速度上限）', () => {
  const level = createLevel({ id: 'perim-7', cols: 7, rows: 7, numbers: perimeterDigits(7) });
  const t0 = performance.now();
  const { count, solutions } = solveAll(level, { limit: 1 });
  const ms = performance.now() - t0;
  assert.equal(count, 1);
  assert.ok(ms < 10000, `7×7 求解耗时 ${ms.toFixed(1)}ms，应 < 10000ms`);
  assert.ok(loopPath(level, solutions[0]), '解应是一条闭合水路');
});

test('solveAll 不修改关卡对象', () => {
  const level = perimeterLevel();
  const before = JSON.stringify({
    numbers: [...level.numbers.entries()],
    gates: [...level.gates.values()],
  });
  solveAll(level, { limit: 2 });
  const after = JSON.stringify({
    numbers: [...level.numbers.entries()],
    gates: [...level.gates.values()],
  });
  assert.equal(after, before);
});
