/**
 * 场景层：网格几何 + Canvas 2D 绘制。
 *
 * 分工：
 *   几何部分（布局、渠的两端、命中测试、路径采样、缓动）是纯函数，可在 Node 里直接测；
 *   绘制部分只读逻辑状态，不做任何判断、不改任何状态。
 *
 * M3 只求「读得懂」：色板已定，但布局是正投影而非等距，不做过场与光晕的最终审美。
 * 最终视觉在 M5 落地，届时本文件的绘制函数会被重写，几何函数保持不变。
 */

import { EMPTY, CHANNEL, MARKED, edgeAt, cellAt } from '../logic/topology.js';
import { PALETTE, mixHex } from './palette.js';

/* ------------------------------------------------------------------ 缓动 */

/** 全项目唯一缓动：ease-out，禁弹跳。 */
export function easeOut(t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - k) ** 3;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* ------------------------------------------------------------ 布局与几何 */

/**
 * 把 cols×rows 个水口间的水路铺进一块矩形区域。
 * 正方形地格：cell = min(横向可容, 纵向可容)，整块居中。
 *
 * bounds = { x, y, w, h }
 */
export function layoutFor(cols, rows, bounds, { padding = 0 } = {}) {
  const availW = Math.max(1, bounds.w - padding * 2);
  const availH = Math.max(1, bounds.h - padding * 2);
  const cell = Math.min(availW / cols, availH / rows);
  const width = cell * cols;
  const height = cell * rows;
  return {
    cols,
    rows,
    cell,
    width,
    height,
    bounds,
    ox: bounds.x + (bounds.w - width) / 2,
    oy: bounds.y + (bounds.h - height) / 2,
  };
}

export function gridPoint(layout, i, j) {
  return { x: layout.ox + i * layout.cell, y: layout.oy + j * layout.cell };
}

export function cellCenter(layout, i, j) {
  return { x: layout.ox + (i + 0.5) * layout.cell, y: layout.oy + (j + 0.5) * layout.cell };
}

export function edgeSegment(layout, dir, i, j) {
  const a = gridPoint(layout, i, j);
  const b = dir === 'h' ? gridPoint(layout, i + 1, j) : gridPoint(layout, i, j + 1);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function edgeSegmentById(level, layout, eid) {
  const { dir, i, j } = edgeAt(level.grid, eid);
  return edgeSegment(layout, dir, i, j);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp01(t);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 命中测试：返回容差内最近的渠；空手返回 null。 */
export function hitEdge(level, layout, x, y, tolerance) {
  let best = null;
  for (let eid = 0; eid < level.grid.edgeCount; eid++) {
    const s = edgeSegmentById(level, layout, eid);
    const dist = distanceToSegment(x, y, s.x1, s.y1, s.x2, s.y2);
    if (dist <= tolerance && (!best || dist < best.dist)) best = { eid, dist };
  }
  return best;
}

/** 从起点截取到 k ∈ [0,1] 的一段，用于生长动画 */
export function lerpSegment(seg, k) {
  const t = clamp01(k);
  return {
    x1: seg.x1,
    y1: seg.y1,
    x2: seg.x1 + (seg.x2 - seg.x1) * t,
    y2: seg.y1 + (seg.y2 - seg.y1) * t,
  };
}

/**
 * 沿折线匀速采样。
 * points 为像素坐标点列；closed 时末点自动回到首点（成环）。
 * 返回 { length, at(t) → { x, y, angle } }，t ∈ [0,1] 为弧长比例 —— 这正是「巡船匀速」的实现。
 */
export function pathSampler(points, { closed = true } = {}) {
  const pts = closed && points.length > 1 ? [...points, points[0]] : [...points];
  const segs = [];
  let total = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return {
    length: total,
    at(t) {
      const d = clamp01(t) * total;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (d <= s.start + s.len || k === segs.length - 1) {
          const f = s.len === 0 ? 0 : (d - s.start) / s.len;
          return {
            x: s.a.x + (s.b.x - s.a.x) * f,
            y: s.a.y + (s.b.y - s.a.y) * f,
            angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x),
          };
        }
      }
      const last = pts[pts.length - 1];
      return { x: last.x, y: last.y, angle: 0 };
    },
  };
}

/* ---------------------------------------------------------------- 绘制 */

function strokeSeg(ctx, seg) {
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
}

/** 把一串点画到 progress 位置（生长动画 / 尾迹） */
export function strokePolylineProgress(ctx, points, progress, { closed = true } = {}) {
  const sampler = pathSampler(points, { closed });
  const target = clamp01(progress) * sampler.length;
  let walked = 0;
  for (let k = 0; k + 1 < points.length || (closed && k < points.length); k++) {
    const a = points[k % points.length];
    const b = points[(k + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked >= target) break;
    const f = Math.min(1, (target - walked) / (len || 1));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    ctx.stroke();
    walked += len;
  }
}

function drawLattice(ctx, layout) {
  ctx.save();
  ctx.strokeStyle = PALETTE.gridline;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  for (let j = 0; j <= layout.rows; j++) {
    const a = gridPoint(layout, 0, j);
    const b = gridPoint(layout, layout.cols, j);
    strokeSeg(ctx, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  for (let i = 0; i <= layout.cols; i++) {
    const a = gridPoint(layout, i, 0);
    const b = gridPoint(layout, i, layout.rows);
    strokeSeg(ctx, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  ctx.restore();
}

function drawChannels(ctx, level, state, layout) {
  const water = PALETTE.water;
  const width = Math.max(3, layout.cell * 0.13);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = water;

  // 一层淡光晕，让渠从地格上浮起来
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = width * 1.9;
  for (let eid = 0; eid < state.length; eid++) {
    if (state[eid] !== CHANNEL) continue;
    strokeSeg(ctx, edgeSegmentById(level, layout, eid));
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  for (let eid = 0; eid < state.length; eid++) {
    if (state[eid] !== CHANNEL) continue;
    strokeSeg(ctx, edgeSegmentById(level, layout, eid));
  }
  ctx.restore();
}

function drawMarks(ctx, level, state, layout) {
  const arm = layout.cell * 0.2;
  ctx.save();
  ctx.strokeStyle = PALETTE.mark;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(1.5, layout.cell * 0.035);
  ctx.lineCap = 'round';
  for (let eid = 0; eid < state.length; eid++) {
    if (state[eid] !== MARKED) continue;
    const s = edgeSegmentById(level, layout, eid);
    const cx = (s.x1 + s.x2) / 2;
    const cy = (s.y1 + s.y2) / 2;
    strokeSeg(ctx, { x1: cx - arm, y1: cy - arm, x2: cx + arm, y2: cy + arm });
    strokeSeg(ctx, { x1: cx - arm, y1: cy + arm, x2: cx + arm, y2: cy - arm });
  }
  ctx.restore();
}

function drawDigits(ctx, level, layout, alertDigits) {
  const size = Math.round(layout.cell * 0.44);
  ctx.save();
  ctx.font = `600 ${size}px "Songti SC", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [cid, n] of level.numbers) {
    const { i, j } = cellAt(level.grid, cid);
    const c = cellCenter(layout, i, j);
    const bad = alertDigits.has(cid);
    ctx.fillStyle = bad ? PALETTE.alert : PALETTE.text;
    ctx.globalAlpha = bad ? 1 : 0.86;
    ctx.fillText(String(n), c.x, c.y);
  }
  ctx.restore();
}

function housePath(ctx, p, cell) {
  const w = cell * 0.32;
  const h = cell * 0.32;
  const x0 = p.x - w / 2;
  const y0 = p.y - h / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h * 0.42);
  ctx.lineTo(p.x, y0);
  ctx.lineTo(x0 + w, y0 + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x0 + w * 0.16, y0 + h * 0.42, w * 0.68, h * 0.44);
}

function dockPath(ctx, p, cell) {
  const w = cell * 0.34;
  const h = cell * 0.07;
  ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
  ctx.fillRect(p.x - w * 0.34, p.y, h, h * 3);
  ctx.fillRect(p.x + w * 0.34 - h, p.y, h, h * 3);
}

function defaultPath(ctx, p, cell) {
  const r = cell * 0.13;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - r);
  ctx.lineTo(p.x + r, p.y);
  ctx.lineTo(p.x, p.y + r);
  ctx.lineTo(p.x - r, p.y);
  ctx.closePath();
  ctx.fill();
}

function drawSettlements(ctx, level, layout, lit) {
  const cell = layout.cell;
  for (const s of level.settlements) {
    const p = gridPoint(layout, s.i, s.j);
    const bloom = easeOut(lit.get(s.pointId) ?? 0);

    if (bloom > 0) {
      const r = cell * 0.55;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(242, 200, 121, ${0.30 * bloom})`);
      grad.addColorStop(1, 'rgba(242, 200, 121, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.fillStyle = PALETTE.silhouette;
    if (s.type === 'dock') dockPath(ctx, p, cell);
    else if (s.type === 'village') housePath(ctx, p, cell);
    else defaultPath(ctx, p, cell);
    ctx.restore();

    if (bloom > 0.45) {
      ctx.save();
      ctx.globalAlpha = (bloom - 0.45) / 0.55;
      ctx.fillStyle = PALETTE.lamp;
      const r = Math.max(1.6, cell * 0.05);
      const lit_at = s.type === 'dock'
        ? { x: p.x, y: p.y - cell * 0.11 }
        : { x: p.x, y: p.y + cell * 0.035 };
      ctx.beginPath();
      ctx.arc(lit_at.x, lit_at.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawShip(ctx, view) {
  const { layout, ship } = view;
  const cell = layout.cell;
  const sampler = ship.sampler;

  // 尾迹：越靠后越淡，渐隐的银蓝
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.water;
  const steps = 8;
  for (let k = 0; k < steps; k++) {
    const t0 = Math.max(0, ship.t - 0.08 * (1 - k / steps));
    const t1 = Math.max(0, ship.t - 0.08 * (1 - (k + 1) / steps));
    const a = sampler.at(t0);
    const b = sampler.at(t1);
    ctx.globalAlpha = 0.42 * (k / steps);
    ctx.lineWidth = cell * 0.09;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  const head = sampler.at(ship.t);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(head.angle);
  ctx.fillStyle = PALETTE.silhouette;
  const L = cell * 0.36;
  const W = cell * 0.14;
  ctx.beginPath();
  ctx.moveTo(-L / 2, -W / 2);
  ctx.quadraticCurveTo(L * 0.25, -W, L / 2, 0);
  ctx.quadraticCurveTo(L * 0.25, W, -L / 2, W / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawViolations(ctx, view) {
  const { level, layout, alerts } = view;
  const r = Math.max(3, layout.cell * 0.085);
  ctx.save();
  for (let pid = 0; pid < level.grid.pointCount; pid++) {
    // 分叉（≥3 条渠）：真错，暖红实心点
    if (alerts.forks.has(pid)) {
      const p = gridPoint(layout, ...pointIndex(level, pid));
      ctx.fillStyle = PALETTE.alert;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (alerts.ends.has(pid)) {
      // 断头（1 条渠）：还没成环而已，不是错 —— 用空心淡点提示，绝不用红色
      const p = gridPoint(layout, ...pointIndex(level, pid));
      ctx.strokeStyle = PALETTE.mark;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function pointIndex(level, pid) {
  const g = level.grid;
  const i = pid % (g.cols + 1);
  return [i, (pid - i) / (g.cols + 1)];
}

/* ------------------------------------------------------------ 入口 */

/**
 * 画一帧。
 *
 * view = {
 *   level, state, layout, size: { w, h },
 *   alerts: { digits: Set<cid>, forks: Set<pid>, ends: Set<pid> },
 *   lit:    Map<pid, 0..1>      // 聚落点亮进度（含绽放）
 *   ship:   { t: 0..1, sampler } | null
 *   night:  0..1                // 暮色 → 深夜
 * }
 *
 * 绘制层不做任何规则判断：所有「哪里不满足」都在 main.js 用校验器算好，这里只负责上色。
 */
export function drawFrame(ctx, view) {
  const { level, state, layout, size, alerts, lit, ship, night } = view;

  ctx.fillStyle = mixHex(PALETTE.dusk, PALETTE.night, night);
  ctx.fillRect(0, 0, size.w, size.h);

  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(layout.ox, layout.oy, layout.width, layout.height);

  drawLattice(ctx, layout);
  drawViolations(ctx, view);
  drawChannels(ctx, level, state, layout);
  drawMarks(ctx, level, state, layout);
  drawDigits(ctx, level, layout, alerts.digits);
  drawSettlements(ctx, level, layout, lit);
  if (ship) drawShip(ctx, view);
}
