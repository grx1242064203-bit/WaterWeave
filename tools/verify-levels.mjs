#!/usr/bin/env node
/**
 * 逐关唯一解校验工具（M2 交付物）。
 *
 * 用法：npm run verify
 * 行为：读 src/logic/levels.js，逐关跑求解器，打印「尺寸 / 解数 / 耗时」；
 *       任一关不是恰好 1 解，退出码 1（便于接进 CI 或 pre-commit）。
 *
 * 顺带断言：每关的聚落布点必须落在解出的那条水路上，
 * 否则该聚落永远不亮灯——这是「繁荣是被发现的」这层隐喻不被悄悄破坏的底线。
 */

import { solveAll } from '../src/logic/solver.js';
import { loopPath } from '../src/logic/validator.js';

const levelsUrl = new URL('../src/logic/levels.js', import.meta.url);

let levels;
try {
  ({ levels } = await import(levelsUrl.href));
} catch (err) {
  if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
    console.log('未找到 src/logic/levels.js（M4 交付物）。求解器已就绪，逐关校验待关卡数据接入后启用。');
    process.exit(0);
  }
  throw err;
}

let failures = 0;

for (const level of levels) {
  const t0 = performance.now();
  const { count, solutions } = solveAll(level, { limit: 2 });
  const ms = performance.now() - t0;

  const verdict = count === 0 ? '无解' : count === 1 ? '唯一解' : '多解(≥2)';
  const ok = count === 1;
  if (!ok) failures++;

  console.log(
    `${ok ? '✓' : '✗'} 第 ${level.id} 关「${level.title}」 ${level.cols}×${level.rows}`
    + `  解数=${count}（${verdict}）  ${ms.toFixed(1)}ms`,
  );

  if (ok && level.settlements.length > 0) {
    const path = loopPath(level, solutions[0]);
    const onLoop = new Set(path);
    const stray = level.settlements.filter((s) => !onLoop.has(s.pointId));
    if (stray.length > 0) {
      failures++;
      const names = stray.map((s) => `${s.name || '(未命名)'}@${s.i},${s.j}`).join('、');
      console.log(`  ✗ 聚落未落在水路上（将永不亮灯）：${names}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} 处未通过。关卡需回炉：加数字直到每步都可推理，或调整聚落布点。`);
  process.exit(1);
}

console.log(`\n全部 ${levels.length} 关恰好唯一解，聚落布点全部在水路上。`);
