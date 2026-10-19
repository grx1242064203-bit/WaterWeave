/**
 * 三屏规则动效（设计稿 4.2）。
 *
 * 三屏一个字的文案都没有 —— 规则靠动效讲，不靠文字。
 * 附带好处：术语禁区（边 / 顶点 / 回路 / 格点 …）根本无从违反。
 *
 *   屏 1：一格亮起数字 2，它四条边里两条亮起  → 数字 = 四周渠数
 *   屏 2：渠连成一个圈，接缝处闭合发光          → 水路必须成环
 *   屏 3：圈流过一个村落，村落亮起灯火          → 通航即点亮人家
 *
 * 每屏 3s，合计 9s；任意点击或按键可跳过（底部三点指示进度）。
 */

import { PALETTE } from '../render/palette.js';
import {
  layoutFor,
  gridPoint,
  cellCenter,
  edgeSegment,
  lerpSegment,
  strokePolylineProgress,
  pathSampler,
  easeOut,
} from '../render/scene.js';

export const SCREEN_SECONDS = 3;
export const SCREEN_COUNT = 3;
export const TOTAL_SECONDS = SCREEN_SECONDS * SCREEN_COUNT;

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 教学用的 2×2 小水网：外圈八个水口 */
function miniLoopPoints(layout) {
  return [
    gridPoint(layout, 0, 0),
    gridPoint(layout, 1, 0),
    gridPoint(layout, 2, 0),
    gridPoint(layout, 2, 1),
    gridPoint(layout, 2, 2),
    gridPoint(layout, 1, 2),
    gridPoint(layout, 0, 2),
    gridPoint(layout, 0, 1),
  ];
}

/** 村落占外圈水口的第 2 个（上沿中点），沿环走一圈的位置约 1/8 */
const VILLAGE_SLOT = 1;
const VILLAGE_T = VILLAGE_SLOT / 8;

export function createTutorial({ onFinish } = {}) {
  let elapsed = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    onFinish?.();
  }

  return {
    get active() {
      return !done;
    },
    get elapsed() {
      return elapsed;
    },
    update(dt) {
      if (done) return;
      elapsed += dt;
      if (elapsed >= TOTAL_SECONDS) {
        elapsed = TOTAL_SECONDS;
        finish();
      }
    },
    skip() {
      if (!done) {
        elapsed = TOTAL_SECONDS;
        finish();
      }
    },
    draw(ctx, size) {
      drawScreens(ctx, size, elapsed);
    },
  };
}

function drawScreens(ctx, size, elapsed) {
  ctx.fillStyle = PALETTE.dusk;
  ctx.fillRect(0, 0, size.w, size.h);

  const screen = Math.min(SCREEN_COUNT - 1, Math.floor(elapsed / SCREEN_SECONDS));
  const local = Math.min(SCREEN_SECONDS, elapsed - screen * SCREEN_SECONDS);
  const p = local / SCREEN_SECONDS;

  const side = Math.min(size.w, size.h) * 0.56;
  const bounds = { x: (size.w - side) / 2, y: (size.h - side) / 2, w: side, h: side };
  const layout = layoutFor(2, 2, bounds);

  ctx.save();
  ctx.strokeStyle = PALETTE.gridline;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let j = 0; j <= 2; j++) {
    const a = gridPoint(layout, 0, j);
    const b = gridPoint(layout, 2, j);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let i = 0; i <= 2; i++) {
    const a = gridPoint(layout, i, 0);
    const b = gridPoint(layout, i, 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  if (screen === 0) screenDigits(ctx, layout, p);
  else if (screen === 1) screenLoop(ctx, layout, p);
  else screenVillage(ctx, layout, local, p);

  drawDots(ctx, size, screen);
}

function strokeWater(ctx, seg, cell, alpha = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.water;
  ctx.globalAlpha = 0.16 * alpha;
  ctx.lineWidth = Math.max(3, cell * 0.13) * 1.9;
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(3, cell * 0.13);
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
  ctx.restore();
}

/* 屏 1：数字 = 四周渠数 —— 一格亮起 2，其四条边里两条亮起 */
function screenDigits(ctx, layout, p) {
  const cell = layout.cell;
  const c = cellCenter(layout, 0, 0);

  const appear = easeOut(clamp01(p / 0.25));
  ctx.save();
  ctx.globalAlpha = 0.12 * appear;
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(layout.ox, layout.oy, cell, cell);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = appear;
  ctx.fillStyle = PALETTE.text;
  const size = Math.round(cell * 0.44 * (0.75 + 0.25 * appear));
  ctx.font = `600 ${size}px "Songti SC", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2', c.x, c.y);
  ctx.restore();

  const growTop = easeOut(clamp01((p - 0.35) / 0.28));
  const growLeft = easeOut(clamp01((p - 0.53) / 0.28));
  if (growTop > 0) strokeWater(ctx, lerpSegment(edgeSegment(layout, 'h', 0, 0), growTop), cell);
  if (growLeft > 0) strokeWater(ctx, lerpSegment(edgeSegment(layout, 'v', 0, 0), growLeft), cell);
}

/* 屏 2：水路必须成环 —— 渠连成一个圈，接缝处闭合发光 */
function screenLoop(ctx, layout, p) {
  const cell = layout.cell;
  const pts = miniLoopPoints(layout);
  const prog = easeOut(clamp01(p / 0.7));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.water;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = Math.max(3, cell * 0.13) * 1.9;
  strokePolylineProgress(ctx, pts, prog, { closed: true });
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(3, cell * 0.13);
  strokePolylineProgress(ctx, pts, prog, { closed: true });
  ctx.restore();

  if (p > 0.68) {
    const seam = easeOut(clamp01((p - 0.68) / 0.3));
    const pt = pts[0];
    const r = cell * (0.42 + 0.14 * seam);
    const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
    grad.addColorStop(0, `rgba(143, 166, 184, ${0.42 * seam})`);
    grad.addColorStop(1, 'rgba(143, 166, 184, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* 屏 3：通航即点亮人家 —— 圈流过一个村落，村落亮起灯火 */
function screenVillage(ctx, layout, local, p) {
  const cell = layout.cell;
  const pts = miniLoopPoints(layout);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.water;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = Math.max(3, cell * 0.13) * 1.9;
  strokePolylineProgress(ctx, pts, 1, { closed: true });
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(3, cell * 0.13);
  strokePolylineProgress(ctx, pts, 1, { closed: true });
  ctx.restore();

  const sampler = pathSampler(pts, { closed: true });
  const beadT = ((local * 0.6) % 1);
  const bead = sampler.at(beadT);

  // 水珠子沿环走；走过村落之后，村落亮起灯火并**不再熄灭**
  const bloom = easeOut(clamp01((local * 0.6 - VILLAGE_T) / 0.045));
  const vp = pts[VILLAGE_SLOT];

  if (bloom > 0) {
    const r = cell * 0.6;
    const grad = ctx.createRadialGradient(vp.x, vp.y, 0, vp.x, vp.y, r);
    grad.addColorStop(0, `rgba(242, 200, 121, ${0.32 * bloom})`);
    grad.addColorStop(1, 'rgba(242, 200, 121, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(vp.x, vp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.fillStyle = PALETTE.silhouette;
  const w = cell * 0.32;
  const h = cell * 0.32;
  const x0 = vp.x - w / 2;
  const y0 = vp.y - h / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h * 0.42);
  ctx.lineTo(vp.x, y0);
  ctx.lineTo(x0 + w, y0 + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x0 + w * 0.16, y0 + h * 0.42, w * 0.68, h * 0.44);
  ctx.restore();

  if (bloom > 0.45) {
    ctx.save();
    ctx.globalAlpha = (bloom - 0.45) / 0.55;
    ctx.fillStyle = PALETTE.lamp;
    ctx.beginPath();
    ctx.arc(vp.x, vp.y + cell * 0.035, Math.max(1.6, cell * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = PALETTE.water;
  ctx.beginPath();
  ctx.arc(bead.x, bead.y, Math.max(2.5, cell * 0.075), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDots(ctx, size, screen) {
  const gap = 18;
  const y = size.h - Math.max(24, size.h * 0.06);
  const x0 = size.w / 2 - gap * (SCREEN_COUNT - 1) / 2;
  ctx.save();
  for (let k = 0; k < SCREEN_COUNT; k++) {
    ctx.beginPath();
    ctx.arc(x0 + k * gap, y, 3.5, 0, Math.PI * 2);
    if (k === screen) {
      ctx.fillStyle = PALETTE.text;
      ctx.globalAlpha = 0.9;
    } else {
      ctx.fillStyle = PALETTE.mark;
      ctx.globalAlpha = 0.5;
    }
    ctx.fill();
  }
  ctx.restore();
}
