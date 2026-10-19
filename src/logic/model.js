/**
 * 数据模型层：关卡数据与玩家状态的构造。
 */

import {
  EMPTY,
  CHANNEL,
  MARKED,
  makeGrid,
  cellId,
  pointId,
} from './topology.js';

function assertCell(g, i, j, levelId) {
  if (!Number.isInteger(i) || !Number.isInteger(j)
      || i < 0 || i >= g.cols || j < 0 || j >= g.rows) {
    throw new Error(`[${levelId}] 地格坐标越界: ${i},${j}`);
  }
}

function assertPoint(g, i, j, levelId) {
  if (!Number.isInteger(i) || !Number.isInteger(j)
      || i < 0 || i > g.cols || j < 0 || j > g.rows) {
    throw new Error(`[${levelId}] 水口坐标越界: ${i},${j}`);
  }
}

/**
 * 关卡数据是手工编写的「作者数据」，属于系统边界，因此在这里做一次完整校验。
 *
 * spec = {
 *   id, title, subtitle,
 *   cols, rows,
 *   numbers:     [[i, j, n], ...]          n ∈ {0,1,2,3}
 *   gates:       [[i, j], ...]             闸口水口
 *   settlements: [{ i, j, type, name }, ...]
 *   notecard:    { title, lines: [...] }
 * }
 */
export function createLevel(spec) {
  const grid = makeGrid(spec.cols, spec.rows);

  const numbers = new Map();
  for (const [i, j, n] of spec.numbers ?? []) {
    if (!Number.isInteger(n) || n < 0 || n > 3) {
      throw new Error(`[${spec.id}] 数字非法: ${n}`);
    }
    assertCell(grid, i, j, spec.id);
    const cid = cellId(grid, i, j);
    if (numbers.has(cid)) throw new Error(`[${spec.id}] 地格 ${i},${j} 重复给定数字`);
    numbers.set(cid, n);
  }

  const gates = new Set();
  for (const [i, j] of spec.gates ?? []) {
    assertPoint(grid, i, j, spec.id);
    gates.add(pointId(grid, i, j));
  }

  const settlements = (spec.settlements ?? []).map((s) => {
    assertPoint(grid, s.i, s.j, spec.id);
    return {
      pointId: pointId(grid, s.i, s.j),
      i: s.i,
      j: s.j,
      type: s.type ?? 'village',
      name: s.name ?? '',
    };
  });

  return {
    id: spec.id,
    title: spec.title ?? '',
    subtitle: spec.subtitle ?? '',
    cols: spec.cols,
    rows: spec.rows,
    grid,
    numbers,
    gates,
    settlements,
    notecard: spec.notecard ?? null,
  };
}

export function createState(grid) {
  return new Uint8Array(grid.edgeCount);
}

export function cloneState(state) {
  return Uint8Array.from(state);
}

/** 点击一条渠：空白 → 开渠 → 标记 → 空白 */
export function nextEdgeValue(value) {
  if (value === EMPTY) return CHANNEL;
  if (value === CHANNEL) return MARKED;
  return EMPTY;
}

export function cycleEdge(state, eid) {
  state[eid] = nextEdgeValue(state[eid]);
  return state[eid];
}

export function setEdge(state, eid, value) {
  if (value !== EMPTY && value !== CHANNEL && value !== MARKED) {
    throw new Error(`渠状态非法: ${value}`);
  }
  state[eid] = value;
  return state;
}

