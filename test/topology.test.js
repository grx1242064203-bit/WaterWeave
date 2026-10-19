import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY,
  CHANNEL,
  MARKED,
  makeGrid,
  pointId,
  pointAt,
  cellId,
  cellAt,
  hEdgeId,
  vEdgeId,
  edgeAt,
  edgeEndpoints,
  cellEdges,
  pointEdges,
  edgeCells,
} from '../src/logic/topology.js';

const G3 = makeGrid(3, 3);

test('尺寸计数：3×3', () => {
  assert.equal(G3.hCount, 12, '横渠 3×4');
  assert.equal(G3.vCount, 12, '纵渠 4×3');
  assert.equal(G3.edgeCount, 24);
  assert.equal(G3.pointCount, 16, '水口 4×4');
  assert.equal(G3.cellCount, 9);
});

test('水口 ID 往返一致', () => {
  for (let j = 0; j <= 3; j++) {
    for (let i = 0; i <= 3; i++) {
      const pid = pointId(G3, i, j);
      assert.deepEqual(pointAt(G3, pid), { i, j });
    }
  }
  const ids = new Set();
  for (let pid = 0; pid < G3.pointCount; pid++) ids.add(pointId(G3, pointAt(G3, pid).i, pointAt(G3, pid).j));
  assert.equal(ids.size, G3.pointCount);
});

test('地格 ID 往返一致', () => {
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const cid = cellId(G3, i, j);
      assert.deepEqual(cellAt(G3, cid), { i, j });
    }
  }
});

test('渠 ID 往返一致（横渠与纵渠）', () => {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const eid = hEdgeId(G3, i, j);
      assert.deepEqual(edgeAt(G3, eid), { dir: 'h', i, j });
    }
  }
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j < 3; j++) {
      const eid = vEdgeId(G3, i, j);
      assert.deepEqual(edgeAt(G3, eid), { dir: 'v', i, j });
    }
  }
});

test('每条渠恰好 2 个端点，且端点确实相邻于该渠', () => {
  for (let eid = 0; eid < G3.edgeCount; eid++) {
    const ends = edgeEndpoints(G3, eid);
    assert.equal(ends.length, 2);
    assert.notEqual(ends[0], ends[1], `渠 ${eid} 两端点重合`);
    for (const pid of ends) {
      assert.ok(pointEdges(G3, pid).includes(eid), `渠 ${eid} 的端点 ${pid} 未登记该渠`);
    }
  }
});

test('双向一致：水口登记的每条渠，其端点必含该水口', () => {
  for (let pid = 0; pid < G3.pointCount; pid++) {
    for (const eid of pointEdges(G3, pid)) {
      assert.ok(edgeEndpoints(G3, eid).includes(pid), `水口 ${pid} 与渠 ${eid} 双向不一致`);
    }
  }
});

test('水口度数上限：四角 2、边缘 3、内部 4', () => {
  for (let pid = 0; pid < G3.pointCount; pid++) {
    const { i, j } = pointAt(G3, pid);
    const corner = (i === 0 || i === 3) && (j === 0 || j === 3);
    const interior = i > 0 && i < 3 && j > 0 && j < 3;
    const want = corner ? 2 : interior ? 4 : 3;
    assert.equal(pointEdges(G3, pid).length, want, `水口 ${pid}(${i},${j})`);
  }
});

test('地格四条边顺序为 [上, 下, 左, 右]', () => {
  const center = cellId(G3, 1, 1);
  assert.deepEqual(cellEdges(G3, center), [
    hEdgeId(G3, 1, 1), hEdgeId(G3, 1, 2),
    vEdgeId(G3, 1, 1), vEdgeId(G3, 2, 1),
  ]);
});

test('渠相邻地格：内部渠 2 个，边界渠 1 个', () => {
  assert.equal(edgeCells(G3, hEdgeId(G3, 0, 0)).length, 1, '顶部边界渠');
  assert.equal(edgeCells(G3, hEdgeId(G3, 1, 1)).length, 2, '内部横渠');
  assert.equal(edgeCells(G3, vEdgeId(G3, 0, 1)).length, 1, '左侧边界渠');
  assert.equal(edgeCells(G3, vEdgeId(G3, 1, 1)).length, 2, '内部纵渠');
});

test('越界输入一律抛错，不静默返回错误 ID', () => {
  assert.throws(() => pointId(G3, 4, 0));
  assert.throws(() => pointId(G3, 0, -1));
  assert.throws(() => cellId(G3, 3, 0));
  assert.throws(() => hEdgeId(G3, 3, 0));
  assert.throws(() => vEdgeId(G3, 0, 3));
  assert.throws(() => makeGrid(0, 3));
  assert.throws(() => makeGrid(2.5, 3));
});

test('三态常量互异且覆盖 0/1/2', () => {
  assert.deepEqual([EMPTY, CHANNEL, MARKED], [0, 1, 2]);
});
