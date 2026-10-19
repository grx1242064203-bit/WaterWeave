/**
 * 输入层：把指针动作翻译成渠的状态变化。只做翻译，不做校验、不做反馈。
 *
 * 规则：
 *   - 单点一条渠：空白 → 开渠 → 标记 → 空白（循环，永不判负）
 *   - 按住拖拽：整条拖拽用**同一个**目标状态连续涂抹，像刷子；
 *     同一条渠在一次拖拽里只被涂一次，避免来回抖动
 *
 * 无障碍：命中带宽度 ≥ 24px（一只手在触屏上不会点空），上限随地格收敛，
 * 保证指尖落在格子中央时不会误吞边缘的渠。
 */

import { nextEdgeValue, setEdge } from '../logic/model.js';
import { hitEdge } from '../render/scene.js';

/** 命中带最小宽度（px） */
export const MIN_HIT_BAND = 24;

/**
 * 命中容差（半径，px）= 命中带宽的一半。
 * 纯函数，可直接在 Node 里断言「带宽始终 ≥ 24px」。
 */
export function hitTolerance(layout) {
  return Math.min(layout.cell * 0.45, Math.max(MIN_HIT_BAND / 2, layout.cell * 0.32));
}

/**
 * 挂上输入。
 *
 * deps = {
 *   getLevel(), getState(), getLayout(),
 *   enabled(): boolean        // 教学关播放中 / 注记卡展开时为 false
 *   onChange(): void          // 每次改动后回调，由 main.js 重新跑校验器
 * }
 */
export function attachInput(canvas, { getLevel, getState, getLayout, onChange, enabled }) {
  let painting = false;
  let strokeTarget = null;
  const strokeEdges = new Set();

  function pointOf(ev) {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function pick(ev) {
    const layout = getLayout();
    if (!layout) return null;
    const { x, y } = pointOf(ev);
    return hitEdge(getLevel(), layout, x, y, hitTolerance(layout));
  }

  function paint(eid) {
    if (strokeEdges.has(eid)) return;
    setEdge(getState(), eid, strokeTarget);
    strokeEdges.add(eid);
    onChange();
  }

  function onDown(ev) {
    if (!enabled()) return;
    const hit = pick(ev);
    if (!hit) return;
    painting = true;
    strokeEdges.clear();
    strokeTarget = nextEdgeValue(getState()[hit.eid]);
    paint(hit.eid);
    canvas.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!painting) return;
    const hit = pick(ev);
    if (hit) paint(hit.eid);
    ev.preventDefault();
  }

  function onUp() {
    painting = false;
    strokeTarget = null;
    strokeEdges.clear();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);

  return {
    detach() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    },
  };
}
