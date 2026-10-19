/**
 * 渲染层几何 / 色板 / 教学动效时序的 Node 用例。
 *
 * 说明：这里的对象都是**纯函数**（不碰 DOM、不碰 Canvas），
 * 所以可以在没有浏览器的环境里断言 —— 审美靠人眼，几何与守线靠机器。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PALETTE, hexToHsl, hexToRgb, mixHex, assertWaterSaturation, WATER_MAX_SATURATION } from '../src/render/palette.js';
import { layoutFor, gridPoint, cellCenter, edgeSegment, edgeSegmentById, hitEdge, lerpSegment, pathSampler, easeOut, drawFrame } from '../src/render/scene.js';
import { hitTolerance, MIN_HIT_BAND } from '../src/ui/input.js';
import { createTutorial, SCREEN_COUNT, SCREEN_SECONDS, TOTAL_SECONDS } from '../src/ui/tutorial.js';
import { blankLevel } from './fixtures.js';
import { levels } from '../src/logic/levels.js';
import { solveAll } from '../src/logic/solver.js';
import { loopPath } from '../src/logic/validator.js';
import { hEdgeId, vEdgeId, pointAt as pointIndexAt } from '../src/logic/topology.js';

/* ------------------------------------------------------------------ 色板 */

test('水面饱和度守线：≤ 30%', () => {
  const hsl = assertWaterSaturation();
  assert.ok(hsl.s <= WATER_MAX_SATURATION + 1e-9, `实际 ${(hsl.s * 100).toFixed(1)}%`);
  assert.ok(hsl.s > 0.15, '太灰也不行，水面要能认出是水');
});

test('色值换算', () => {
  assert.deepEqual(hexToRgb('#EDE6D6'), { r: 237, g: 230, b: 214 });
  const white = hexToHsl('#FFFFFF');
  assert.equal(white.s, 0);
  assert.equal(white.l, 1);

  assert.equal(mixHex('#000000', '#FFFFFF', 0), 'rgb(0, 0, 0)');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), 'rgb(255, 255, 255)');
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), 'rgb(128, 128, 128)');
  // 越界 t 要夹住，不能产生非法色值
  assert.equal(mixHex('#000000', '#FFFFFF', 9), 'rgb(255, 255, 255)');
});

test('色板齐全：灯火与水面是不同色值，且没有把暖黄误用在水面', () => {
  assert.notEqual(PALETTE.water, PALETTE.lamp);
  assert.equal(PALETTE.lamp, '#F2C879');
});

/* ------------------------------------------------------------------ 布局 */

test('布局：正方形地格、整块居中', () => {
  const l = layoutFor(3, 3, { x: 0, y: 0, w: 300, h: 300 });
  assert.equal(l.cell, 100);
  assert.equal(l.ox, 0);
  assert.equal(l.oy, 0);
  assert.equal(l.width, 300);
  assert.equal(l.height, 300);

  // 非正方形容器：取小的那一维，另一维居中
  const m = layoutFor(3, 3, { x: 0, y: 0, w: 500, h: 300 });
  assert.equal(m.cell, 100);
  assert.equal(m.ox, 100);
  assert.equal(m.oy, 0);

  // padding 从两维各扣
  const p = layoutFor(2, 2, { x: 0, y: 0, w: 220, h: 220 }, { padding: 10 });
  assert.equal(p.cell, 100);
  assert.equal(p.ox, 10);
  assert.equal(p.oy, 10);
});

test('几何：水口 / 地格中心 / 渠的端点', () => {
  const l = layoutFor(3, 3, { x: 0, y: 0, w: 300, h: 300 });
  assert.deepEqual(gridPoint(l, 1, 1), { x: 100, y: 100 });
  assert.deepEqual(cellCenter(l, 0, 0), { x: 50, y: 50 });
  assert.deepEqual(edgeSegment(l, 'h', 1, 1), { x1: 100, y1: 100, x2: 200, y2: 100 });
  assert.deepEqual(edgeSegment(l, 'v', 1, 1), { x1: 100, y1: 100, x2: 100, y2: 200 });
});

test('几何：按 ID 取渠，与拓扑层编号一致', () => {
  const level = blankLevel(3, 3);
  const g = level.grid;
  const l = layoutFor(3, 3, { x: 0, y: 0, w: 300, h: 300 });
  assert.deepEqual(
    edgeSegmentById(level, l, hEdgeId(g, 1, 1)),
    { x1: 100, y1: 100, x2: 200, y2: 100 },
  );
  assert.deepEqual(
    edgeSegmentById(level, l, vEdgeId(g, 2, 2)),
    { x1: 200, y1: 200, x2: 200, y2: 300 },
  );
});

test('命中测试：点在渠上命中该渠；点在格心不误吞', () => {
  const level = blankLevel(3, 3);
  const g = level.grid;
  const l = layoutFor(3, 3, { x: 0, y: 0, w: 300, h: 300 });
  const tol = hitTolerance(l);

  const onEdge = hitEdge(level, l, 150, 100, tol);
  assert.ok(onEdge);
  assert.equal(onEdge.eid, hEdgeId(g, 1, 1));
  assert.equal(onEdge.dist, 0);

  // 稍微偏一点也要吸得住
  const nearEdge = hitEdge(level, l, 150, 105, tol);
  assert.ok(nearEdge);
  assert.equal(nearEdge.eid, hEdgeId(g, 1, 1));

  // 地格正中（离四条渠各 50px）不该命中任何渠
  assert.equal(hitEdge(level, l, 50, 50, tol), null);
  assert.equal(hitEdge(level, l, -40, -40, tol), null);
});

test('无障碍：真实画布下命中带宽 ≥ 24px，且不会胖到吞掉格心', () => {
  const realistic = [
    { w: 360, h: 360 },
    { w: 720, h: 720 },
    { w: 1200, h: 1200 },
    { w: 1600, h: 400 },
  ];
  for (const bounds of realistic) {
    const l = layoutFor(3, 3, { x: 0, y: 0, ...bounds });
    const band = hitTolerance(l) * 2;
    assert.ok(band >= MIN_HIT_BAND, `带宽 ${band} < ${MIN_HIT_BAND}`);
    assert.ok(hitTolerance(l) < l.cell / 2, '容差不得触及相邻渠');
  }

  // 极端小画布：带宽随格子一起收缩（几何上不可能再大），但仍不许吞相邻渠
  const tiny = layoutFor(3, 3, { x: 0, y: 0, w: 60, h: 60 });
  assert.ok(hitTolerance(tiny) < tiny.cell / 2);
});

test('生长动画：截段落点正确', () => {
  const seg = { x1: 0, y1: 0, x2: 10, y2: 0 };
  assert.deepEqual(lerpSegment(seg, 0.5), { x1: 0, y1: 0, x2: 5, y2: 0 });
  assert.deepEqual(lerpSegment(seg, -1), { x1: 0, y1: 0, x2: 0, y2: 0 });
  assert.deepEqual(lerpSegment(seg, 2), seg);
});

/* -------------------------------------------------------------- 路径采样 */

test('路径采样：闭合环的弧长与匀速落点', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const sampler = pathSampler(square, { closed: true });
  assert.equal(sampler.length, 40);

  assert.deepEqual(pick(sampler.at(0)), { x: 0, y: 0 });
  assert.deepEqual(pick(sampler.at(0.25)), { x: 10, y: 0 });
  assert.deepEqual(pick(sampler.at(0.5)), { x: 10, y: 10 });
  assert.deepEqual(pick(sampler.at(1)), { x: 0, y: 0 });

  // 匀速：等弧长间隔的落点间距相等
  const a = sampler.at(0.1);
  const b = sampler.at(0.2);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 4) < 1e-9);
});

test('路径采样：开放式折线不回头', () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
  const sampler = pathSampler(line, { closed: false });
  assert.equal(sampler.length, 20);
  assert.deepEqual(pick(sampler.at(1)), { x: 20, y: 0 });
  assert.deepEqual(pick(sampler.at(0.75)), { x: 15, y: 0 });
});

test('缓动：ease-out，单调、无弹跳', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(Math.abs(easeOut(0.5) - 0.875) < 1e-9);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = easeOut(t);
    assert.ok(v >= prev, `t=${t} 处回退了`);
    assert.ok(v >= 0 && v <= 1, `t=${t} 处越界 ${v}`);
    prev = v;
  }
});

/* ------------------------------------------------------------ 教学关时序 */

test('教学关：三屏合计 9s，可跳过，收尾回调只触发一次', () => {
  assert.equal(SCREEN_COUNT, 3);
  assert.equal(SCREEN_SECONDS, 3);
  assert.equal(TOTAL_SECONDS, 9);

  let finished = 0;
  const t = createTutorial({ onFinish: () => { finished++; } });
  assert.equal(t.active, true);
  t.update(2);
  assert.equal(t.active, true);
  t.update(2.5);
  assert.equal(t.active, true);
  assert.equal(finished, 0);

  t.update(5);
  assert.equal(t.active, false);
  assert.equal(finished, 1);
  // 播完之后再 update / skip 都不该重复触发
  t.update(1);
  t.skip();
  assert.equal(finished, 1);
});

test('教学关：中途跳过立刻收尾', () => {
  let finished = 0;
  const t = createTutorial({ onFinish: () => { finished++; } });
  t.update(1.5);
  t.skip();
  assert.equal(t.active, false);
  assert.equal(finished, 1);
  assert.equal(t.elapsed, TOTAL_SECONDS);
});

/* ------------------------------------------------- 绘制冒烟（假上下文） */

test('绘制不抛异常，且数字确实被画了出来', () => {
  const level = levels[0];
  const solved = solveAll(level, { limit: 1 }).solutions[0];
  const layout = layoutFor(3, 3, { x: 0, y: 0, w: 720, h: 720 }, { padding: 72 });
  const ctx = mockCtx();
  drawFrame(ctx, {
    level,
    state: solved,
    layout,
    size: { w: 720, h: 720 },
    alerts: { digits: new Set(), forks: new Set(), ends: new Set() },
    lit: new Map(level.settlements.map((s) => [s.pointId, 1])),
    ship: { t: 0.4, sampler: pathSampler(loopPoints(level, solved, layout)) },
    night: 1,
  });
  const texts = ctx.calls.texts.map((t) => t.text).sort();
  assert.deepEqual(texts, ['0', '2', '2']);
});

test('教学关三屏不写任何文案，只出现演示用的数字', () => {
  const tut = createTutorial();
  const check = () => {
    const ctx = mockCtx();
    tut.draw(ctx, { w: 600, h: 600 });
    for (const { text } of ctx.calls.texts) {
      assert.match(text, /^[0-3]$/, `教学关出现了文案/术语: ${text}`);
    }
  };
  check();                       // 屏 1 起点（此处允许出现数字 2）
  for (const dt of [1.5, 1.5, 1.5, 1.5, 1.5, 1.5]) {
    tut.update(dt);
    check();                     // 覆盖三屏的中段与末段
  }
  assert.equal(tut.active, false);
});

test('审美守线：灯火只出现在聚落，未通航时一处也不亮', () => {
  const level = levels[0];
  const layout = layoutFor(3, 3, { x: 0, y: 0, w: 720, h: 720 }, { padding: 72 });
  const spots = level.settlements.map((s) => gridPoint(layout, s.i, s.j));
  const base = {
    level,
    state: solveAll(level, { limit: 1 }).solutions[0],
    layout,
    size: { w: 720, h: 720 },
    alerts: { digits: new Set(), forks: new Set(), ends: new Set() },
  };

  // 已通航：暖黄渐变只能以聚落为圆心
  const litCtx = mockCtx();
  drawFrame(litCtx, { ...base, lit: new Map(level.settlements.map((s) => [s.pointId, 1])), ship: null, night: 1 });
  const lampGradients = litCtx.calls.gradients.filter((g) => g.stops.some((s) => s.color.includes('242, 200, 121')));
  assert.equal(lampGradients.length, level.settlements.length);
  for (const g of lampGradients) {
    assert.ok(
      spots.some((p) => Math.hypot(p.x - g.center.x, p.y - g.center.y) < 1e-6),
      `灯火出现在非聚落处: ${g.center.x},${g.center.y}`,
    );
  }

  // 未通航：一处灯火都没有
  const darkCtx = mockCtx();
  drawFrame(darkCtx, { ...base, lit: new Map(), ship: null, night: 0 });
  assert.equal(
    darkCtx.calls.gradients.filter((g) => g.stops.some((s) => s.color.includes('242, 200, 121'))).length,
    0,
  );
});

function loopPoints(level, state, layout) {
  return loopPath(level, state).map((pid) => {
    const { i, j } = pointIndexAt(level.grid, pid);
    return gridPoint(layout, i, j);
  });
}

/** 只记录、不绘制的假 2D 上下文：用来在没有浏览器时冒烟测试绘制代码。 */
function mockCtx() {
  const calls = { texts: [], gradients: [] };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    rect() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    translate() {},
    rotate() {},
    setTransform() {},
    clearRect() {},
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const g = { center: { x: x0, y: y0 }, radius: r1 ?? r0, stops: [] };
      calls.gradients.push(g);
      return { addColorStop(offset, color) { g.stops.push({ offset, color }); } };
    },
    fillText(text, x, y) {
      calls.texts.push({ text, x, y });
    },
  };
  ctx.calls = calls;
  return ctx;
}

function pick(p) {
  return { x: p.x, y: p.y };
}
