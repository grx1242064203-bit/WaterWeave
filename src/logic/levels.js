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
  createLevel({
    id: 1,
    title: '瀍水小渠',
    subtitle: '水过城东北',
    cols: 4,
    rows: 4,
    numbers: [[0,0,2],[1,0,1],[3,1,1],[0,2,1],[2,2,0],[2,3,1]],
    settlements: [
      { i: 2, j: 0, type: 'village', name: '瀍西人家' },
      { i: 4, j: 3, type: 'dock', name: '瀍口渡' },
    ],
    notecard: {
      title: '瀍水',
      lines: [
        '周公营洛邑，卜涧水东、瀍水西——瀍水自此见于典籍。',
        '瀍水出孟津，东流穿洛阳城北而入洛，是城东北的水脉。',
      ],
    },
  }),
  createLevel({
    id: 2,
    title: '洛水南岸',
    subtitle: '一水中分，两岸人家',
    cols: 5,
    rows: 5,
    numbers: [[1,0,1],[1,1,0],[3,1,0],[4,1,1],[0,3,1],[1,3,0],[3,3,0],[3,4,1]],
    settlements: [
      { i: 2, j: 0, type: 'village', name: '北岸里坊' },
      { i: 5, j: 3, type: 'dock', name: '上东门渡' },
      { i: 1, j: 5, type: 'village', name: '南岸人家' },
    ],
    notecard: {
      title: '洛水贯都',
      lines: [
        '隋唐洛阳城跨洛水而建：北岸是宫城与皇城，南岸是里坊与人家。',
        '《大业杂记》称「洛水贯都，有河汉之象」——一条水，把城分成天街两岸。',
      ],
    },
  }),
  createLevel({
    id: 3,
    title: '伊水渡口',
    subtitle: '水从龙门来',
    cols: 5,
    rows: 5,
    numbers: [[3,0,1],[0,1,1],[1,1,0],[3,1,0],[1,3,1],[2,3,3],[4,3,1],[1,4,2],[4,4,2]],
    settlements: [
      { i: 4, j: 0, type: 'village', name: '伊阙北村' },
      { i: 5, j: 2, type: 'dock', name: '伊水渡' },
      { i: 0, j: 3, type: 'village', name: '南市人家' },
    ],
    notecard: {
      title: '伊水与伊阙',
      lines: [
        '伊水出栾川，至洛阳城南穿两山而成阙，是为伊阙，亦即龙门。',
        '自北魏至唐，石窟沿伊水两岸开凿四百年，水声与斧凿声相和。',
      ],
    },
  }),
  createLevel({
    id: 4,
    title: '天津桥',
    subtitle: '桥这头，桥那头',
    cols: 6,
    rows: 6,
    numbers: [[0,0,2],[1,0,1],[4,0,1],[4,1,0],[0,3,1],[4,3,1],[5,3,2],[1,4,0],[4,4,1],[1,5,1],[4,5,0]],
    gates: [[6, 2]],
    settlements: [
      { i: 4, j: 0, type: 'village', name: '宫城南市' },
      { i: 3, j: 5, type: 'bridge', name: '天津桥' },
      { i: 0, j: 2, type: 'dock', name: '桥西渡' },
    ],
    notecard: {
      title: '天津桥',
      lines: [
        '隋大业元年建天津桥跨洛水，以铁锁连舟为浮桥，北接宫城、南连里坊。',
        '「天津」取天河渡口之意；唐贞观十四年改建石柱桥，仍为南北要津。',
      ],
    },
  }),
  createLevel({
    id: 5,
    title: '回洛仓',
    subtitle: '粮船要过闸',
    cols: 6,
    rows: 6,
    numbers: [[0,0,1],[3,0,2],[4,0,1],[0,1,2],[4,1,0],[0,2,1],[2,2,0],[5,3,1],[1,4,0],[4,4,0],[5,4,1],[1,5,1],[2,5,1]],
    gates: [[6, 4], [1, 1]],
    settlements: [
      { i: 3, j: 0, type: 'granary', name: '回洛仓' },
      { i: 6, j: 3, type: 'dock', name: '仓前渡' },
      { i: 0, j: 4, type: 'village', name: '仓西人家' },
    ],
    notecard: {
      title: '回洛仓',
      lines: [
        '隋大业年间置回洛仓于洛阳城北，仓城周回十里，穿三百窖。',
        '漕粮自江淮溯黄河、入洛水而至，先经此仓，再供东都。',
      ],
    },
  }),
  createLevel({
    id: 6,
    title: '含嘉仓',
    subtitle: '一窖五十万斤',
    cols: 7,
    rows: 7,
    numbers: [[0,0,2],[4,0,1],[5,0,1],[6,0,2],[0,1,1],[2,1,0],[6,3,1],[0,4,1],[1,4,0],[3,4,0],[5,4,0],[5,5,0],[1,6,1],[3,6,1],[5,6,1]],
    settlements: [
      { i: 3, j: 0, type: 'granary', name: '含嘉仓' },
      { i: 7, j: 4, type: 'dock', name: '仓东渡' },
      { i: 0, j: 5, type: 'village', name: '仓西坊' },
    ],
    notecard: {
      title: '含嘉仓',
      lines: [
        '唐代官仓，遗址在今洛阳老城北侧，已探出粮窖四百余座。',
        '一窖出土铭砖，记载储粟约五十万斤；窖中谷物历经千年，炭化而形尚存。',
      ],
    },
  }),
  createLevel({
    id: 7,
    title: '洛口仓',
    subtitle: '河洛交汇，千窖之仓',
    cols: 7,
    rows: 7,
    numbers: [[0,0,2],[2,0,1],[5,0,1],[6,0,2],[0,1,1],[2,2,0],[5,2,1],[2,3,0],[5,3,1],[0,4,1],[1,4,0],[3,4,1],[4,4,1],[1,6,1],[3,6,2],[4,6,1]],
    gates: [[7, 1], [4, 5], [0, 5]],
    settlements: [
      { i: 4, j: 6, type: 'granary', name: '洛口仓' },
      { i: 7, j: 2, type: 'dock', name: '洛口渡' },
      { i: 0, j: 3, type: 'village', name: '河口人家' },
    ],
    notecard: {
      title: '洛口仓（兴洛仓）',
      lines: [
        '隋大业二年置兴洛仓于巩县洛口，仓城周回二十余里，穿三千窖，窖容八千石，为隋代第一巨仓。',
        '洛口扼黄河、洛水交汇之地，天下漕粮在此中转；后世李密据仓放粮，远近归附。',
      ],
    },
  }),
];
