/**
 * 求解器（仅开发期使用，不进最终交付包）。
 *
 * 它存在的理由只有一个：**逐关断言唯一解**。
 * 没有它，8 关关卡就只能靠手气试；而「每步都可推理、不靠试错」恰恰是本作的地基。
 *
 * 变量三态（沿用拓扑层常量，语义在此收窄）：
 *   EMPTY(0)   未定
 *   CHANNEL(1) 已确定开渠
 *   MARKED(2)  已确定不开渠
 *
 * 算法：约束传播 + 最受限变量优先回溯，解数上限默认 2（只需区分 0 / 1 / ≥2）。
 */

import {
  EMPTY,
  CHANNEL,
  MARKED,
  cellEdges,
  pointEdges,
  edgeEndpoints,
} from './topology.js';
import { validate } from './validator.js';

/**
 * 闭合水路剪枝。
 *
 * 当前已开渠里若已出现一个「完整闭合的水路」（该分组内每个水口都已连满两条渠），
 * 这条水路再也没法延长，因此它只能是最终那条唯一水路。于是：
 *   - 其余已开渠一律矛盾（会凑成第二条水路）；
 *   - 其余未定渠一律标记为不开渠。
 */
function closedCycleCheck(level, vars) {
  const g = level.grid;
  const deg = new Int32Array(g.pointCount);
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

  const active = new Set();
  for (let e = 0; e < g.edgeCount; e++) {
    if (vars[e] !== CHANNEL) continue;
    const [a, b] = edgeEndpoints(g, e);
    deg[a]++;
    deg[b]++;
    union(a, b);
    active.add(a);
    active.add(b);
  }
  if (active.size === 0) return { ok: true, changed: false };

  const byRoot = new Map();
  for (const p of active) {
    const r = find(p);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(p);
  }

  let closedGroups = 0;
  let closedPoints = 0;
  for (const pts of byRoot.values()) {
    let allTwo = true;
    for (const p of pts) {
      if (deg[p] !== 2) {
        allTwo = false;
        break;
      }
    }
    if (allTwo) {
      closedGroups++;
      closedPoints += pts.length;
    }
  }

  if (closedGroups === 0) return { ok: true, changed: false };
  // 两条及以上闭环、或闭环之外还有已开渠（无法合并成一条水路）→ 剪枝
  if (closedGroups > 1 || closedPoints !== active.size) return { ok: false };

  let changed = false;
  for (let e = 0; e < g.edgeCount; e++) {
    if (vars[e] === EMPTY) {
      vars[e] = MARKED;
      changed = true;
    }
  }
  return { ok: true, changed };
}

/**
 * 约束传播，就地修改 vars；发现矛盾返回 false。
 *
 * 规则：
 *   地格数字 N：已开渠 = N → 其余标记；已开渠 + 未定 < N → 矛盾；
 *              已开渠 + 未定 = N → 未定全开渠
 *   水口：      已开渠 = 2 → 其余标记；已开渠 > 2 → 矛盾；
 *              已开渠 = 1 → 至少再开一条（只剩一条未定时即定它）
 *   闸口水口：   必经水路，等价于「数字 2」约束（度数恰为 2）
 */
function propagate(level, vars) {
  const g = level.grid;
  let changed = true;

  while (changed) {
    changed = false;

    for (const [cid, n] of level.numbers) {
      const eids = cellEdges(g, cid);
      let on = 0;
      const unknown = [];
      for (const e of eids) {
        if (vars[e] === CHANNEL) on++;
        else if (vars[e] === EMPTY) unknown.push(e);
      }
      if (on > n || on + unknown.length < n) return false;
      if (on === n) {
        for (const e of unknown) {
          vars[e] = MARKED;
          changed = true;
        }
      } else if (on + unknown.length === n) {
        for (const e of unknown) {
          vars[e] = CHANNEL;
          changed = true;
        }
      }
    }

    for (let pid = 0; pid < g.pointCount; pid++) {
      const eids = pointEdges(g, pid);
      let on = 0;
      const unknown = [];
      for (const e of eids) {
        if (vars[e] === CHANNEL) on++;
        else if (vars[e] === EMPTY) unknown.push(e);
      }
      if (on > 2) return false;

      if (level.gates.has(pid)) {
        if (on + unknown.length < 2) return false;
        if (on === 2) {
          for (const e of unknown) {
            vars[e] = MARKED;
            changed = true;
          }
        } else if (on + unknown.length === 2) {
          for (const e of unknown) {
            vars[e] = CHANNEL;
            changed = true;
          }
        }
      } else if (on === 2) {
        for (const e of unknown) {
          vars[e] = MARKED;
          changed = true;
        }
      } else if (on === 1) {
        if (unknown.length === 0) return false;
        if (unknown.length === 1) {
          vars[unknown[0]] = CHANNEL;
          changed = true;
        }
      }
    }

    const cycle = closedCycleCheck(level, vars);
    if (!cycle.ok) return false;
    if (cycle.changed) changed = true;
  }

  return true;
}

/**
 * 挑下一个分支变量：最受约束优先。
 *
 * 优先顺序：数字格中未定渠最少的那个格 → 已有 1 条渠的水口 → 任意未定渠。
 */
function pickVariable(level, vars) {
  const g = level.grid;

  let bestEdge = -1;
  let bestUnknown = Infinity;
  for (const [cid] of level.numbers) {
    let unknown = 0;
    let firstUnknown = -1;
    for (const e of cellEdges(g, cid)) {
      if (vars[e] === EMPTY) {
        unknown++;
        if (firstUnknown < 0) firstUnknown = e;
      }
    }
    if (unknown > 0 && unknown < bestUnknown) {
      bestUnknown = unknown;
      bestEdge = firstUnknown;
    }
  }
  if (bestEdge >= 0) return bestEdge;

  for (let pid = 0; pid < g.pointCount; pid++) {
    let on = 0;
    let firstUnknown = -1;
    for (const e of pointEdges(g, pid)) {
      if (vars[e] === CHANNEL) on++;
      else if (vars[e] === EMPTY && firstUnknown < 0) firstUnknown = e;
    }
    if (on === 1 && firstUnknown >= 0) return firstUnknown;
  }

  for (let e = 0; e < g.edgeCount; e++) {
    if (vars[e] === EMPTY) return e;
  }
  return -1;
}

/**
 * 求所有解（最多 limit 条）。
 *
 * 返回 { count, solutions }。
 *   count = solutions.length（被 limit 截断），因此 count >= limit 意为「至少这么多解」。
 *   判定口径：0 = 无解，1 = 唯一解，>= 2 = 多解（关卡不合格）。
 */
export function solveAll(level, { limit = 2 } = {}) {
  const g = level.grid;
  const solutions = [];

  const search = (vars) => {
    if (solutions.length >= limit) return;
    if (!propagate(level, vars)) return;

    const pick = pickVariable(level, vars);
    if (pick < 0) {
      // 全部渠已定，用正式校验器做最终确认（防传播漏判）
      if (validate(level, vars).solved) solutions.push(Uint8Array.from(vars));
      return;
    }

    for (const value of [CHANNEL, MARKED]) {
      const next = Uint8Array.from(vars);
      next[pick] = value;
      search(next);
      if (solutions.length >= limit) return;
    }
  };

  search(new Uint8Array(g.edgeCount));

  return { count: solutions.length, solutions };
}

/** 便捷判定：关卡是否恰好唯一解 */
export function hasUniqueSolution(level) {
  return solveAll(level, { limit: 2 }).count === 1;
}
