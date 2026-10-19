/**
 * 渲染器接口 —— 这是「逻辑正确性」与「主观审美」的分界线，
 * 也是 M7 把 Canvas 2D 换成 Three.js 时的**唯一替换点**。
 *
 * 契约（任何实现都必须满足，换实现时 main.js 不需要改）：
 *
 *   createRenderer(canvas, draw) → {
 *     size():   { w, h }        画布的 CSS 像素尺寸
 *     resize(): void            重新量画布（窗口尺寸或 DPR 变化时调用）
 *     render(view): void        按 view 画一帧
 *     dispose(): void
 *   }
 *
 *   draw(ctx, view, size)      把一帧画进 2D 上下文（实现由 scene.js 提供）
 *
 * view 的结构见 scene.js 顶部注释。渲染器自己不构造 view，只消费它 ——
 * 这样逻辑状态永远只存在于 main.js 一处。
 */

/**
 * Canvas 2D 实现。只做三件事：量画布、按 DPR 设置变换、把绘制委托出去。
 * 不参与任何游戏规则。
 */
export function createRenderer(canvas, draw) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let w = 1;
  let h = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function render(view) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, view, { w, h });
  }

  resize();

  return {
    size: () => ({ w, h }),
    resize,
    render,
    dispose() {},
  };
}
