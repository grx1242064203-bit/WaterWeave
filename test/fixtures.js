/**
 * 测试用固定数据。
 *
 * 参照谜题：3×3 网格，唯一解是「整块 3×3 区域的外圈」。
 * 各数字 = 该地格在外圈上所占的边数，可手工核对：
 *   四角各 2，四边中点各 1，正中 0。
 */

import { createLevel, createState } from '../src/logic/model.js';
import { CHANNEL, hEdgeId, vEdgeId } from '../src/logic/topology.js';

export const PERIMETER_DIGITS = [
  [0, 0, 2], [1, 0, 1], [2, 0, 2],
  [0, 1, 1], [1, 1, 0], [2, 1, 1],
  [0, 2, 2], [1, 2, 1], [2, 2, 2],
];

export function perimeterLevel(extra = {}) {
  return createLevel({
    id: 'fixture-3x3',
    cols: 3,
    rows: 3,
    numbers: PERIMETER_DIGITS,
    ...extra,
  });
}

/** 外圈解 */
export function perimeterState(level) {
  const g = level.grid;
  const state = createState(g);
  for (let i = 0; i < 3; i++) {
    state[hEdgeId(g, i, 0)] = CHANNEL;
    state[hEdgeId(g, i, 3)] = CHANNEL;
  }
  for (let j = 0; j < 3; j++) {
    state[vEdgeId(g, 0, j)] = CHANNEL;
    state[vEdgeId(g, 3, j)] = CHANNEL;
  }
  return state;
}

/** 5×5 空白关卡（无数字、无闸口） */
export function blankLevel(cols = 5, rows = 5) {
  return createLevel({ id: `fixture-blank-${cols}x${rows}`, cols, rows });
}

/** 两个互不相交的环：外层整块边界 + 内层 (1,1)–(4,4) 子块边界 */
export function twoLoopsState(level) {
  const g = level.grid;
  const state = createState(g);
  for (let i = 0; i < 5; i++) {
    state[hEdgeId(g, i, 0)] = CHANNEL;
    state[hEdgeId(g, i, 5)] = CHANNEL;
  }
  for (let j = 0; j < 5; j++) {
    state[vEdgeId(g, 0, j)] = CHANNEL;
    state[vEdgeId(g, 5, j)] = CHANNEL;
  }
  for (let i = 1; i < 4; i++) {
    state[hEdgeId(g, i, 1)] = CHANNEL;
    state[hEdgeId(g, i, 4)] = CHANNEL;
  }
  for (let j = 1; j < 4; j++) {
    state[vEdgeId(g, 1, j)] = CHANNEL;
    state[vEdgeId(g, 4, j)] = CHANNEL;
  }
  return state;
}
