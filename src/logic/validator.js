/**
 * 实时校验器。
 *
 * 设计原则：**只提示，不判负**。校验器只负责把事实算出来（哪里不满足、哪里已满足），
 * 由表现层决定怎么呈现。校验器自己绝不打断玩家、绝不重置状态。
 *
 * 五条硬约束（见设计稿 2.1）：
 *   1. 数字约束   带数字 N 的地格，四周恰好 N 条渠
 *   2. 单一回路   所有渠恰好构成一条闭合水路
 *   3. 水口分叉   每个水口的渠数 ∈ {0, 2}
 *   4. 无孤立渠   由「单一回路」自动蕴含（只有一条环时，所有渠都在环上）
 *   5. 闸口约束   闸口水口必须被水路经过
 */

import { CHANNEL, cellEdges, pointEdges, edgeEndpoints } from './topology.js';

function countChannels(state, eids) {
  let n = 0;
  for (let k = 0; k < eids.length; k++) if (state[eids[k]] === CHANNEL) n++;
  return n;
}

/** 所有已开渠的 ID */
export function channelEdges(state) {
  const out = [];
  for (let eid = 0; eid < state.length; eid++) if (state[eid] === CHANNEL) out.push(eid);
  return out;
}

/** 每个水口的渠数 */
export function degreesOf(level, state) {
  const g = level.grid;
  const deg = new Uint8Array(g.pointCount);
  for (let pid = 0; pid < g.pointCount; pid++) {
    deg[pid] = countChannels(state, pointEdges(g, pid));
  }
  return deg;
}

/**
 * 统计「含有渠的连通分量的个数」。
 *
 * 因为水口渠数被约束为 0 或 2，每个分量必然是一条简单环，
 * 所以「分量个数 = 1」等价于「恰好一条闭合水路」，不需要再单独判环。
 */
export function countLoopComponents(level, state, edges) {
  const g = level.grid;
  if (edges.length === 0) return 0;

  const parent = new Int32Array(g.pointCount);
  for (let p = 0; p < g.pointCount; p++) parent[p] = p;

  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const nx = parent[x];
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const roots = new Set();
  for (const eid of edges) {
    const [a, b] = edgeEndpoints(g, eid);
    union(a, b);
    roots.add(a);
  }
  const finalRoots = new Set();
  for (const p of roots) finalRoots.add(find(p));
  return finalRoots.size;
}

/**
 * 校验当前状态。
 *
 * 返回 {
 *   issues:  原始问题列表（表现层自行决定怎么用）
 *   digitsOk / degreesOk / singleLoop / gatesOk
 *   solved:  四条同时成立
 * }
 */
export function validate(level, state) {
  const g = level.grid;
  const issues = [];

  // 1. 数字约束
  let digitsOk = true;
  for (const [cid, expected] of level.numbers) {
    const actual = countChannels(state, cellEdges(g, cid));
    if (actual !== expected) {
      digitsOk = false;
      issues.push({ type: 'digit', cid, expected, actual });
    }
  }

  // 3. 水口分叉
  const degrees = degreesOf(level, state);
  let degreesOk = true;
  for (let pid = 0; pid < g.pointCount; pid++) {
    const d = degrees[pid];
    if (d !== 0 && d !== 2) {
      degreesOk = false;
      issues.push({ type: 'degree', pid, actual: d });
    }
  }

  // 2. 单一回路
  //
  // 注意：只有在水口分叉合法（每个水口渠数 ∈ {0,2}）时，「含有渠的连通分量个数 = 1」
  // 才等价于「恰好一条闭合水路」。否则分量可能是断路（一条链也只有 1 个分量），
  // 因此在分叉非法时不报「水路成环」，交给「水口分叉」问题说明。
  const edges = channelEdges(state);
  const components = countLoopComponents(level, state, edges);
  const singleLoop = edges.length > 0 && degreesOk && components === 1;
  if (edges.length > 0 && degreesOk && components !== 1) {
    issues.push({ type: 'notSingleLoop', components });
  }

  // 5. 闸口约束
  let gatesOk = true;
  for (const pid of level.gates) {
    if (degrees[pid] !== 2) {
      gatesOk = false;
      issues.push({ type: 'gate', pid });
    }
  }

  return {
    issues,
    degrees,
    components,
    digitsOk,
    degreesOk,
    singleLoop,
    gatesOk,
    solved: digitsOk && degreesOk && singleLoop && gatesOk,
  };
}

/**
 * 沿水路走一圈，返回有序的水口序列；若不是单一闭合水路则返回 null。
 *
 * 用途：灯火级联的先后顺序、漕船巡行的路径。
 */
export function loopPath(level, state) {
  const g = level.grid;
  const edges = channelEdges(state);
  if (edges.length === 0) return null;

  const deg = degreesOf(level, state);
  for (let pid = 0; pid < g.pointCount; pid++) {
    if (deg[pid] !== 0 && deg[pid] !== 2) return null;
  }
  if (countLoopComponents(level, state, edges) !== 1) return null;

  const adjacency = new Map();
  for (const eid of edges) {
    const [a, b] = edgeEndpoints(g, eid);
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ to: b, eid });
    adjacency.get(b).push({ to: a, eid });
  }

  const used = new Set();
  const start = edgeEndpoints(g, edges[0])[0];
  const first = adjacency.get(start)[0];
  used.add(first.eid);
  let cur = first.to;
  const path = [start, cur];

  while (cur !== start) {
    const next = adjacency.get(cur).find((step) => !used.has(step.eid));
    if (!next) return null;
    used.add(next.eid);
    cur = next.to;
    if (cur !== start) path.push(cur);
  }

  if (used.size !== edges.length) return null;
  return path;
}

/**
 * 水路经过的聚落，按水流顺序排列。
 * 这是「繁荣是被发现的」在逻辑层的确切含义：聚落是否亮灯完全由水路决定。
 */
export function litSettlementsInOrder(level, state) {
  const path = loopPath(level, state);
  if (!path) return [];
  const byPoint = new Map(level.settlements.map((s) => [s.pointId, s]));
  const lit = [];
  for (const pid of path) {
    const s = byPoint.get(pid);
    if (s) lit.push(s);
  }
  return lit;
}
