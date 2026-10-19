/**
 * 色板：全项目唯一色值来源。
 *
 * 所有色值取自设计稿 6.2「暮色为主方案」。绘制代码里不允许出现裸色值 ——
 * 审美控制点必须集中在一处，否则改一次配色要翻遍全工程。
 *
 * 审美红线（在这里工程化成断言）：
 *   水面 / 渠的颜色 HSL 饱和度必须 ≤ 30%。宁灰勿艳。
 */

export const PALETTE = Object.freeze({
  dusk: '#2A3440',       // 底色：暮色，保留残余天光，剪影仍可读
  night: '#16202B',      // 底色：通航后切深夜，情绪高点
  ground: '#33414E',     // 地格
  water: '#8FA6B8',      // 水面 / 渠：银蓝（饱和度锁 ≤ 30%）
  lamp: '#F2C879',       // 灯火：暖黄，只允许出现在聚落
  silhouette: '#0E161E', // 建筑剪影：近乎黑的青
  text: '#EDE6D6',       // 文字 / 注记：米白
  gridline: '#3A4750',   // 格线
  mark: '#6B7A88',       // 标记（细叉）
  alert: '#C96A5A',      // 提示：暖红，用于数字不满足
});

/** 水面饱和度上限（HSL 的 s，取值 0..1） */
export const WATER_MAX_SATURATION = 0.3;

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`色值格式非法: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 返回 { h ∈ [0,360), s ∈ [0,1], l ∈ [0,1] } */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s, l };
}

/** 两个色值按 t ∈ [0,1] 线性混合，返回可直接喂给 Canvas 的 rgb() 字符串 */
export function mixHex(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * k);
  const g = Math.round(A.g + (B.g - A.g) * k);
  const bl = Math.round(A.b + (B.b - A.b) * k);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * 断言水面饱和度守线。挂在测试里跑，任何一次调色越线都会立刻红。
 * 返回实际算出的 HSL，便于测试直接核对。
 */
export function assertWaterSaturation() {
  const hsl = hexToHsl(PALETTE.water);
  if (hsl.s > WATER_MAX_SATURATION + 1e-9) {
    throw new Error(
      `水面饱和度越线: ${(hsl.s * 100).toFixed(1)}% > ${(WATER_MAX_SATURATION * 100).toFixed(0)}%（${PALETTE.water}）`,
    );
  }
  return hsl;
}
