import test from 'node:test';
import assert from 'node:assert/strict';

import { createLevel, createState } from '../src/logic/model.js';
import {
  CHANNEL,
  EMPTY,
  MARKED,
  hEdgeId,
  vEdgeId,
  pointId,
  pointEdges,
  edgeEndpoints,
} from '../src/logic/topology.js';
import {
  validate,
  loopPath,
  litSettlementsInOrder,
  channelEdges,
  degreesOf,
} from '../src/logic/validator.js';
import {
  PERIMETER_DIGITS,
  perimeterLevel,
  perimeterState,
  blankLevel,
  twoLoopsState,
} from './fixtures.js';

test('外圈解：四条约束全部满足，判定为通关', () => {
  const level = perimeterLevel();
  const state = perimeterState(level);
  const result = validate(level, state);
  assert.deepEqual(result.issues, [], `不应有任何问题：${JSON.stringify(result.issues)}`);
  assert.equal(result.digitsOk, true);
  assert.equal(result.degreesOk, true);
  assert.equal(result.singleLoop, true);
  assert.equal(result.gatesOk, true);
  assert.equal(result.solved, true);
  assert.equal(result.components, 1);
});

test('初始空白：不判通关，但也不报「度数」问题', () => {
  const level = perimeterLevel();
  const state = createState(level.grid);
  const result = validate(level, state);
  assert.equal(result.solved, false);
  assert.equal(result.degreesOk, true, '空白状态的度数全是 0，合法');
  assert.equal(result.digitsOk, false, '数字未被满足');
  assert.equal(result.singleLoop, false);
  assert.ok(result.issues.every((i) => i.type === 'digit'), '只应有数字问题');
});

test('抽掉一条渠：同时暴露「数字」与「水口分叉」问题', () => {
  const level = perimeterLevel();
  const state = perimeterState(level);
  state[hEdgeId(level.grid, 1, 0)] = EMPTY;

  const result = validate(level, state);
  const types = new Set(result.issues.map((i) => i.type));
  assert.ok(types.has('digit'), '应有数字问题');
  assert.ok(types.has('degree'), '应有水口分叉问题');
  assert.equal(result.solved, false);
  assert.equal(result.singleLoop, false);
  assert.equal(types.has('notSingleLoop'), false,
    '断路虽只有 1 个连通分量，但不是闭合水路；此时不应误报「水路成环」');

  const badPoints = result.issues.filter((i) => i.type === 'degree').map((i) => i.pid);
  assert.deepEqual(
    badPoints.sort((a, b) => a - b),
    [pointId(level.grid, 1, 0), pointId(level.grid, 2, 0)].sort((a, b) => a - b),
    '断头应出现在该渠的两个端点',
  );
});

test('两个环：分组数为 2，报「水路成环」问题', () => {
  const level = blankLevel(5, 5);
  const state = twoLoopsState(level);
  const result = validate(level, state);
  assert.equal(result.degreesOk, true, '每个水口渠数都是 0 或 2');
  assert.equal(result.singleLoop, false);
  assert.equal(result.components, 2);
  assert.equal(result.solved, false);
  assert.ok(result.issues.some((i) => i.type === 'notSingleLoop'));
});

test('单个环：分组数为 1', () => {
  const level = blankLevel(5, 5);
  const state = createState(level.grid);
  for (let i = 0; i < 5; i++) {
    state[hEdgeId(level.grid, i, 0)] = CHANNEL;
    state[hEdgeId(level.grid, i, 5)] = CHANNEL;
  }
  for (let j = 0; j < 5; j++) {
    state[vEdgeId(level.grid, 0, j)] = CHANNEL;
    state[vEdgeId(level.grid, 5, j)] = CHANNEL;
  }
  const result = validate(level, state);
  assert.equal(result.components, 1);
  assert.equal(result.singleLoop, true);
  assert.equal(result.solved, true);
});

test('两个环 + 一段孤立渠：报水口分叉，且不误报「水路成环」', () => {
  const level = blankLevel(5, 5);
  const state = twoLoopsState(level);
  state[hEdgeId(level.grid, 2, 2)] = CHANNEL;

  const result = validate(level, state);
  assert.equal(result.degreesOk, false, '孤立渠的两个端点度数为 1');
  assert.equal(result.components, 3, '两个环 + 一段孤立渠');
  assert.equal(result.solved, false);
  assert.equal(result.issues.some((i) => i.type === 'degree'), true);
  assert.equal(result.issues.some((i) => i.type === 'notSingleLoop'), false,
    '分叉非法时不应报「水路成环」');
});

test('标记态不影响任何约束', () => {
  const level = perimeterLevel();
  const state = perimeterState(level);
  for (let eid = 0; eid < state.length; eid++) {
    if (state[eid] === EMPTY) state[eid] = MARKED;
  }
  const result = validate(level, state);
  assert.equal(result.solved, true, '把空白改成标记不应改变判定');
  assert.equal(channelEdges(state).length, 12, '渠数不变');
});

test('数字不符：报告期望值与实际值', () => {
  const digits = PERIMETER_DIGITS.map(([i, j, n]) => (i === 1 && j === 1 ? [i, j, 1] : [i, j, n]));
  const level = createLevel({ id: 'wrong-digit', cols: 3, rows: 3, numbers: digits });
  const state = perimeterState(level);
  const result = validate(level, state);
  const bad = result.issues.filter((i) => i.type === 'digit');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].expected, 1);
  assert.equal(bad[0].actual, 0);
  assert.equal(result.solved, false);
});

test('闸口未经过：报「闸口」问题', () => {
  const level = perimeterLevel({ gates: [[1, 1]] });
  const state = perimeterState(level);
  const result = validate(level, state);
  assert.equal(result.solved, false, '闸口没被水路经过，不能算通关');
  assert.equal(result.gatesOk, false);
  const gate = result.issues.filter((i) => i.type === 'gate');
  assert.equal(gate.length, 1);
  assert.equal(gate[0].pid, pointId(level.grid, 1, 1));
});

test('闸口已在水路上：不报闸口问题', () => {
  const level = perimeterLevel({ gates: [[0, 0]] });
  const state = perimeterState(level);
  const result = validate(level, state);
  assert.equal(result.gatesOk, true);
  assert.equal(result.solved, true);
});

test('loopPath：外圈解返回 12 个水口，首尾相接且不回头', () => {
  const level = perimeterLevel();
  const g = level.grid;
  const state = perimeterState(level);
  const path = loopPath(level, state);
  assert.ok(path, '应能走出水路');
  assert.equal(path.length, 12);
  assert.equal(new Set(path).size, 12, '水路不回头');

  for (let k = 0; k < path.length; k++) {
    const a = path[k];
    const b = path[(k + 1) % path.length];
    const shared = pointEdges(g, a).filter((eid) => edgeEndpoints(g, eid).includes(b));
    assert.equal(shared.length, 1, `水口 ${a} 与 ${b} 之间应恰有一条渠`);
    assert.equal(state[shared[0]], CHANNEL, `水口 ${a} 与 ${b} 之间的渠应已开渠`);
  }
});

test('loopPath：非单一水路返回 null', () => {
  const level = blankLevel(5, 5);
  assert.equal(loopPath(level, twoLoopsState(level)), null, '两个环');
  assert.equal(loopPath(level, createState(level.grid)), null, '空白');
  const partial = createState(level.grid);
  partial[hEdgeId(level.grid, 0, 0)] = CHANNEL;
  assert.equal(loopPath(level, partial), null, '断头');
});

test('litSettlementsInOrder：只返回水路经过的聚落，且按水流顺序', () => {
  const level = perimeterLevel({
    settlements: [
      { i: 0, j: 0, type: 'village', name: '水路经过' },
      { i: 1, j: 1, type: 'granary', name: '水路不经过' },
      { i: 3, j: 0, type: 'dock', name: '水路经过的转角' },
    ],
  });
  const state = perimeterState(level);
  const lit = litSettlementsInOrder(level, state);
  assert.deepEqual(lit.map((s) => s.name), ['水路经过', '水路经过的转角']);

  const empty = litSettlementsInOrder(level, createState(level.grid));
  assert.deepEqual(empty, [], '未通航时没有聚落亮灯');
});

test('fuzz：任意随机状态都不抛异常，且 solved 一定伴随单一回路', () => {
  const sizes = [[3, 3], [5, 5], [7, 7]];
  for (const [cols, rows] of sizes) {
    const level = blankLevel(cols, rows);
    const state = createState(level.grid);
    for (let iter = 0; iter < 500; iter++) {
      for (let eid = 0; eid < state.length; eid++) {
        state[eid] = Math.floor(Math.random() * 3);
      }
      const result = validate(level, state);
      assert.doesNotThrow(() => loopPath(level, state));
      assert.doesNotThrow(() => degreesOf(level, state));
      if (result.solved) {
        assert.equal(result.singleLoop, true);
        assert.equal(result.digitsOk, true);
      }
      assert.ok(result.issues.length >= 0);
    }
  }
});
