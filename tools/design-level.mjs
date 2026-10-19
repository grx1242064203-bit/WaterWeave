/**
 * 关卡设计工具（仅开发期使用，不进最终包）。
 *
 * 用法：node tools/design-level.mjs <配置文件>
 * 配置文件是一个 JSON：
 * {
 *   "cols": 5, "rows": 5,
 *   "loop": [[i,j], [i,j], ...],     // 闭合一圈的水口序列（相邻必须只差一格，首尾自动相连）
 *   "targetDigits": 6,               // 目标数字数
 *   "requireZeros": 1,               // 至少保留几个 0（可选）
 *   "requireThrees": 1               // 至少保留几个 3（可选）
 * }
 *
 * 流程：
 *   1. 校验 loop 是一条不自交的简单闭合水路
 *   2. 由 loop 推出全部地格数字（全量数字必然只有 loop 一个解）
 *   3. 贪心删减：逐个尝试去掉一个数字，若解仍唯一则删，直到达到目标数字数
 *   4. 打印最终数字表、水路口水口列表（供摆闸口/聚落用）、以及可直接粘进 levels.js 的片段
 */

import { readFileSync } from 'node:fs';
import { makeGrid, hEdgeId, vEdgeId, edgeAt, pointId, cellId, CHANNEL } from '../src/logic/topology.js';
import { createLevel, createState } from '../src/logic/model.js';
import { solveAll } from '../src/logic/solver.js';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { cols, rows, loop, targetDigits } = cfg;
const requireZeros = cfg.requireZeros ?? 0;
const requireThrees = cfg.requireThrees ?? 0;

const grid = makeGrid(cols, rows);

/* 1. 由水口序列生成渠集合，并校验 */
const loopEdges = new Set();
const seenPoints = new Set();
function edgeBetween(a, b) {
  const [ai, aj] = a;
  const [bi, bj] = b;
  if (ai === bi && Math.abs(aj - bj) === 1) return vEdgeId(grid, ai, Math.min(aj, bj));
  if (aj === bj && Math.abs(ai - bi) === 1) return hEdgeId(grid, Math.min(ai, bi), aj);
  throw new Error(`loop 相邻水口不相邻: (${ai},${aj}) -> (${bi},${bj})`);
}
for (let k = 0; k < loop.length; k++) {
  const a = loop[k];
  const b = loop[(k + 1) % loop.length];
  const eid = edgeBetween(a, b);
  if (loopEdges.has(eid)) throw new Error(`loop 自交：渠 ${JSON.stringify(edgeAt(grid, eid))} 被用了两次`);
  loopEdges.add(eid);
  const key = a.join(',');
  if (seenPoints.has(key)) throw new Error(`loop 自交：水口 (${key}) 重复`);
  seenPoints.add(key);
}
console.log(`水路合法：${loopEdges.size} 条渠，${loop.length} 个水口`);

/* 2. 全量数字（含 0 —— 0 也是给定数字，「此处一格也不许开」） */
const fullDigits = new Map(); // cid -> n
for (let cid = 0; cid < grid.cellCount; cid++) {
  const i = cid % cols;
  const j = (cid - i) / cols;
  const edges = [
    hEdgeId(grid, i, j),
    hEdgeId(grid, i, j + 1),
    vEdgeId(grid, i, j),
    vEdgeId(grid, i + 1, j),
  ];
  const n = edges.filter((e) => loopEdges.has(e)).length;
  fullDigits.set(cid, n);
}
console.log(`全量数字 ${fullDigits.size} 个（含 0）`);

function uniqueWith(digits) {
  const numbers = [...digits].map(([cid, n]) => [cid % cols, (cid - cid % cols) / cols, n]);
  const level = createLevel({ id: 'design', cols, rows, numbers });
  const r = solveAll(level, { limit: 2 });
  if (r.count !== 1) return false;
  return true;
}

if (!uniqueWith(fullDigits)) throw new Error('全量数字下解不唯一？这不该发生');

function countOf(d, v) {
  let c = 0;
  for (const n of d.values()) if (n === v) c++;
  return c;
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let k = a.length - 1; k > 0; k--) {
    const m = Math.floor(rand() * (k + 1));
    [a[k], a[m]] = [a[m], a[k]];
  }
  return a;
}

/** 从给定数字集出发贪心删减：按给定顺序逐个尝试，能删则删 */
function reduceFrom(start, order) {
  const digits = new Map(start);
  let changed = true;
  while (changed && digits.size > targetDigits) {
    changed = false;
    for (const cid of order) {
      if (digits.size <= targetDigits) break;
      if (!digits.has(cid)) continue;
      const n = digits.get(cid);
      if (n === 0 && countOf(digits, 0) <= requireZeros) continue;
      if (n === 3 && countOf(digits, 3) <= requireThrees) continue;
      digits.delete(cid);
      if (uniqueWith(digits)) changed = true;
      else digits.set(cid, n);
    }
  }
  return digits;
}

function score(d) {
  // 先看数字总数，再看 0/3 配额达成度
  return digitsScoreCache(d);
}
function digitsScoreCache(d) {
  return d.size * 100 - Math.min(countOf(d, 0), requireZeros) * 10 - Math.min(countOf(d, 3), requireThrees) * 10;
}

/* 3. 盆地跳跃：贪心到局部最优后，随机放回几个已删数字再删一轮 */
const restarts = cfg.restarts ?? 60;
const kickSize = cfg.kickSize ?? 3;
let seed = 42;
const rand = () => {
  // 确定性伪随机（xorshift），保证同一配置多次跑结果一致
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296);
};
const allCids = [...fullDigits.keys()];

let best = reduceFrom(fullDigits, shuffle(allCids, rand));
for (let r = 0; r < restarts; r++) {
  // 扰动：从当前最优里放回 kickSize 个已删数字
  const removed = allCids.filter((c) => !best.has(c));
  const kicked = new Map(best);
  for (const cid of shuffle(removed, rand).slice(0, kickSize)) {
    kicked.set(cid, fullDigits.get(cid));
  }
  const cand = reduceFrom(kicked, shuffle(allCids, rand));
  if (score(cand) < score(best)) best = cand;
  if (best.size <= targetDigits
      && countOf(best, 0) >= requireZeros
      && countOf(best, 3) >= requireThrees) break;
}
const digits = best;

if (digits.size !== targetDigits) {
  console.log(`⚠ 只能减到 ${digits.size} 个数字（目标 ${targetDigits}），再删会破坏唯一解`);
}
if (countOf(digits, 0) < requireZeros) console.log(`⚠ 0 的个数不足 ${requireZeros}`);
if (countOf(digits, 3) < requireThrees) console.log(`⚠ 3 的个数不足 ${requireThrees}`);

/* 4. 输出 */
const numbers = [...digits]
  .map(([cid, n]) => [cid % cols, (cid - cid % cols) / cols, n])
  .sort((a, b) => a[1] - b[1] || a[0] - b[0]);

console.log('\n数字表（i, j, n）：');
console.log(JSON.stringify(numbers));

console.log('\n水路口水口（可摆闸口/聚落）：');
console.log(loop.map(([i, j]) => `(${i},${j})`).join(' '));

console.log('\n可粘贴片段：');
console.log(`    numbers: ${JSON.stringify(numbers.map((n) => n))},`);
