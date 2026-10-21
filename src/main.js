/**
 * 胶水层：把逻辑层、渲染层、输入层、动效层缝在一起。
 *
 * 这里是**唯一持有游戏状态**的地方：
 *   - 玩家状态 state（Uint8Array）
 *   - 校验结果 validation 与由此派生的提示集合 alerts
 *   - 通关奖励的时序 reward（灯火 → 巡船 → 一纸注记）
 *   - 阶段 mode（教学关播放 / 自由开渠）
 *
 * 三条产品硬规矩在这里落地：
 *   1. 没有分数、没有失败判定、没有倒计时 —— 代码里不存在这些东西
 *   2. 校验器只提示不判负 —— 数字不满足变暖红、真分叉点红，断头只给淡色空心提示
 *   3. 繁荣是被发现的 —— 聚落亮灯完全由「水路是否流经」决定，玩家不需要为它做取舍
 */

import { levels } from './logic/levels.js';
import { createState } from './logic/model.js';
import { validate, litSettlementsInOrder, loopPath } from './logic/validator.js';
import { pointAt as pointIndexAt, EMPTY } from './logic/topology.js';
import { layoutFor, gridPoint, pathSampler, drawFrame, easeOut } from './render/scene.js';
import { createRenderer } from './render/renderer.js';
import { attachInput } from './ui/input.js';
import { createTutorial } from './ui/tutorial.js';

/* 奖励三段的时序（设计稿第三节） */
const LIGHTS_SECONDS = 1.2;
const SHIP_SECONDS = 3.0;
const BLOOM_SECONDS = 0.15;

const level = levels[0];
const canvas = document.getElementById('board');
const card = document.getElementById('notecard');
const cardTitle = document.getElementById('notecard-title');
const cardBody = document.getElementById('notecard-body');
const hint = document.getElementById('hint');

let state = createState(level.grid);
let validation = validate(level, state);
let alerts = alertsOf(validation);
let layout = null;
let mode = 'tutorial';
let reward = { phase: 'idle', t: 0, order: [], loop: [] };
let cardFilled = false;

/**
 * 把校验结果翻译成「画面上要标红的位置」。
 *
 * 刻意区分两类水口问题：
 *   actual ≥ 3 —— 真分叉，这局不可能对了 → 暖红实心点
 *   actual = 1 —— 只是还没连线到头，玩家正在施工中 → 淡色空心点
 * 后者绝不能标红：每落下一笔就红一片，会把「无压力」直接变成「随时在犯错」。
 */
function alertsOf(v) {
  const digits = new Set();
  const forks = new Set();
  const ends = new Set();
  for (const issue of v.issues) {
    if (issue.type === 'digit') digits.add(issue.cid);
    else if (issue.type === 'degree') {
      if (issue.actual >= 3) forks.add(issue.pid);
      else ends.add(issue.pid);
    }
  }
  return { digits, forks, ends };
}

/** 每次玩家改动后重跑校验；只在「刚刚解出」与「刚刚破坏解」两个跳变上做事。 */
function refresh() {
  const wasSolved = validation.solved;
  validation = validate(level, state);
  alerts = alertsOf(validation);
  syncHint();
  if (validation.solved && !wasSolved) startReward();
  else if (!validation.solved && wasSolved) resetReward();
}

function startReward() {
  reward = {
    phase: 'lights',
    t: 0,
    order: litSettlementsInOrder(level, state),
    loop: loopPath(level, state) ?? [],
  };
  cardFilled = false;
}

function resetReward() {
  reward = { phase: 'idle', t: 0, order: [], loop: [] };
  cardFilled = false;
  card.classList.remove('show');
}

const tutorial = createTutorial({
  onFinish() {
    mode = 'play';
    syncHint();
  },
});

/**
 * 提示条只在「教学关已播完、玩家还没落笔」时出现；开了第一条渠就淡出，不再回来。
 * 这是对设计稿「规则用动效讲，不用文字」的一处实测让步：动效没讲清，就先补一行。
 */
function syncHint() {
  const painted = state.some((v) => v !== EMPTY);
  hint.classList.toggle('gone', mode === 'tutorial' || painted);
}

syncHint();

const renderer = createRenderer(canvas, (ctx, view, size) => {
  if (mode === 'tutorial') {
    tutorial.draw(ctx, size);
    return;
  }
  drawFrame(ctx, view);
});

function advanceReward(dt) {
  if (reward.phase === 'lights') {
    reward.t += dt;
    if (reward.t >= LIGHTS_SECONDS) {
      reward.phase = 'ship';
      reward.t = 0;
    }
  } else if (reward.phase === 'ship') {
    reward.t += dt;
    if (reward.t >= SHIP_SECONDS) {
      reward.phase = 'card';
      reward.t = 0;
      showCard();
    }
  }
}

function showCard() {
  if (!cardFilled) {
    cardTitle.textContent = level.notecard?.title ?? level.title;
    cardBody.replaceChildren(
      ...(level.notecard?.lines ?? []).map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
    cardFilled = true;
  }
  card.classList.add('show');
}

function buildView(dt) {
  const { w, h } = renderer.size();
  const pad = Math.max(28, Math.min(w, h) * 0.1);
  layout = layoutFor(level.cols, level.rows, { x: 0, y: 0, w, h }, { padding: pad });

  advanceReward(dt);

  // 灯火：回路上聚落按水流顺序依次绽放
  const lit = new Map();
  if (reward.phase !== 'idle') {
    const n = reward.order.length;
    const step = n > 0 ? LIGHTS_SECONDS / n : 0;
    reward.order.forEach((s, idx) => {
      const raw = reward.phase === 'lights' ? (reward.t - idx * step) / BLOOM_SECONDS : 1;
      if (raw > 0) lit.set(s.pointId, Math.min(1, raw));
    });
  }

  // 巡船：弧长比例 = 时间比例，匀速一周
  let ship = null;
  if (reward.phase === 'ship' && reward.loop.length > 2) {
    const pts = reward.loop.map((pid) => {
      const { i, j } = pointIndexAt(level.grid, pid);
      return gridPoint(layout, i, j);
    });
    ship = { t: Math.min(1, reward.t / SHIP_SECONDS), sampler: pathSampler(pts) };
  }

  const night = reward.phase === 'idle'
    ? 0
    : reward.phase === 'lights'
      ? easeOut(Math.min(1, reward.t / LIGHTS_SECONDS))
      : 1;

  return { level, state, layout, size: { w, h }, alerts, lit, ship, night };
}

attachInput(canvas, {
  getLevel: () => level,
  getState: () => state,
  getLayout: () => layout,
  enabled: () => mode === 'play' && reward.phase !== 'card',
  onChange: refresh,
});

// 教学关跳过：任意点击 / 按键。注册顺序在输入层之后 —— 输入层先看到事件，
// 那时 mode 还是 'tutorial'，会直接返回，绝不会把这一下误当成开渠。
canvas.addEventListener('pointerdown', () => {
  if (mode === 'tutorial') tutorial.skip();
});
window.addEventListener('keydown', () => {
  if (mode === 'tutorial') tutorial.skip();
});

card.addEventListener('click', () => {
  if (reward.phase === 'card') {
    reward.phase = 'done';
    card.classList.remove('show');
  }
});

window.addEventListener('resize', () => renderer.resize());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (mode === 'tutorial') tutorial.update(dt);

  renderer.render(buildView(dt));
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
