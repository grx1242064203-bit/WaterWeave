/**
 * 拓扑层：网格寻址。
 *
 * 命名（游戏内文案对应关系见设计稿 4.3）：
 *   水口 P(i,j) —— 抽象意义上的「顶点」，i ∈ [0..cols]，j ∈ [0..rows]
 *   地格 C(i,j) —— 抽象意义上的「格」，  i ∈ [0..cols-1]，j ∈ [0..rows-1]
 *   横渠 H(i,j) —— 连接 P(i,j) 与 P(i+1,j)
 *   纵渠 V(i,j) —— 连接 P(i,j) 与 P(i,j+1)
 *
 * 所有索引统一编成单个整数 ID，供校验器、求解器、渲染热区共用，
 * 避免三处各自解析坐标导致偏移错误。
 */

/** 渠的三态：空白 / 开渠 / 标记 */
export const EMPTY = 0;
export const CHANNEL = 1;
export const MARKED = 2;

function requireRange(value, lo, hi, label) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new Error(`${label} 越界: ${value}（应在 ${lo}..${hi}）`);
  }
}

/**
 * 建立网格描述。纯数据，不做任何状态持有。
 */
export function makeGrid(cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error(`网格尺寸非法: ${cols}×${rows}`);
  }
  const hCount = cols * (rows + 1);
  const vCount = (cols + 1) * rows;
  return Object.freeze({
    cols,
    rows,
    hCount,
    vCount,
    edgeCount: hCount + vCount,
    pointCount: (cols + 1) * (rows + 1),
    cellCount: cols * rows,
  });
}

export function pointId(g, i, j) {
  requireRange(i, 0, g.cols, '水口 i');
  requireRange(j, 0, g.rows, '水口 j');
  return j * (g.cols + 1) + i;
}

export function pointAt(g, pid) {
  requireRange(pid, 0, g.pointCount - 1, '水口 ID');
  const i = pid % (g.cols + 1);
  return { i, j: (pid - i) / (g.cols + 1) };
}

export function cellId(g, i, j) {
  requireRange(i, 0, g.cols - 1, '地格 i');
  requireRange(j, 0, g.rows - 1, '地格 j');
  return j * g.cols + i;
}

export function cellAt(g, cid) {
  requireRange(cid, 0, g.cellCount - 1, '地格 ID');
  const i = cid % g.cols;
  return { i, j: (cid - i) / g.cols };
}

export function hEdgeId(g, i, j) {
  requireRange(i, 0, g.cols - 1, '横渠 i');
  requireRange(j, 0, g.rows, '横渠 j');
  return j * g.cols + i;
}

export function vEdgeId(g, i, j) {
  requireRange(i, 0, g.cols, '纵渠 i');
  requireRange(j, 0, g.rows - 1, '纵渠 j');
  return g.hCount + j * (g.cols + 1) + i;
}

/** 把渠 ID 还原成 { dir, i, j } */
export function edgeAt(g, eid) {
  requireRange(eid, 0, g.edgeCount - 1, '渠 ID');
  if (eid < g.hCount) {
    const i = eid % g.cols;
    return { dir: 'h', i, j: (eid - i) / g.cols };
  }
  const e = eid - g.hCount;
  const i = e % (g.cols + 1);
  return { dir: 'v', i, j: (e - i) / (g.cols + 1) };
}

/** 一条渠的两个端点水口 [p1, p2] */
export function edgeEndpoints(g, eid) {
  const { dir, i, j } = edgeAt(g, eid);
  const pid = j * (g.cols + 1) + i;
  return dir === 'h' ? [pid, pid + 1] : [pid, pid + (g.cols + 1)];
}

/** 一个地格的四条边，顺序为 [上, 下, 左, 右] */
export function cellEdges(g, cid) {
  const { i, j } = cellAt(g, cid);
  return [
    hEdgeId(g, i, j),
    hEdgeId(g, i, j + 1),
    vEdgeId(g, i, j),
    vEdgeId(g, i + 1, j),
  ];
}

/** 一个水口相邻的渠（最多 4 条） */
export function pointEdges(g, pid) {
  const { i, j } = pointAt(g, pid);
  const out = [];
  if (i > 0) out.push(hEdgeId(g, i - 1, j));
  if (i < g.cols) out.push(hEdgeId(g, i, j));
  if (j > 0) out.push(vEdgeId(g, i, j - 1));
  if (j < g.rows) out.push(vEdgeId(g, i, j));
  return out;
}

/** 一条渠相邻的地格（边界渠只有 1 个，内部渠有 2 个） */
export function edgeCells(g, eid) {
  const { dir, i, j } = edgeAt(g, eid);
  const out = [];
  if (dir === 'h') {
    if (j > 0) out.push(cellId(g, i, j - 1));
    if (j < g.rows) out.push(cellId(g, i, j));
  } else {
    if (i > 0) out.push(cellId(g, i - 1, j));
    if (i < g.cols) out.push(cellId(g, i, j));
  }
  return out;
}
