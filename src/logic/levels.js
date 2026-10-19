/**
 * 关卡数据（全部手工设计，逐关用求解器验证唯一解）。
 *
 * 两条硬规矩：
 *   1. 唯一解 —— 由 tools/verify-levels.mjs 断言（0/1/≥2 三档）
 *   2. 聚落必须落在解出的那条水路上 —— 否则它永远不亮灯，同一工具顺带断言
 *
 * M3 阶段先落第 0 关（教学关），第 1–7 关在 M4 补齐。
 */

import { createLevel } from './model.js';

export const levels = [
  createLevel({
    id: 0,
    title: '第一渠',
    subtitle: '水要绕成一个圈',
    cols: 3,
    rows: 3,
    // 教学关：两个 2（对角，教「数字 = 四周渠数」）加一个 0（教「一处也不许开」）
    numbers: [
      [0, 0, 2],
      [2, 0, 2],
      [1, 2, 0],
    ],
    settlements: [
      { i: 1, j: 0, type: 'village', name: '北岸人家' },
      { i: 3, j: 1, type: 'dock', name: '东码头' },
    ],
    notecard: {
      title: '洛阳水系',
      lines: [
        '洛阳居天下之中，隋唐两代以洛水、伊水、瀍水、涧水织成城中之网。',
        '你是一名河渠吏：开水路、绕成圈，水到之处，人家便亮起灯火。',
      ],
    },
  }),
];
