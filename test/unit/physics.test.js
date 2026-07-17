'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Physics = require('../../js/core/physics.js');

test('a launched ball rises then falls back to the ground', () => {
  const ball = { x: 0, y: 0, vx: 800, vy: 900, radius: 16, resting: false };
  let maxHeight = 0;
  let landed = false;
  for (let i = 0; i < 2000 && !landed; i++) {
    Physics.stepBall(ball, 1 / 120, {});
    maxHeight = Math.max(maxHeight, ball.y);
    if (i > 5 && ball.y === 0 && ball.vy <= 0) landed = true;
  }
  assert.ok(maxHeight > 100, 'ball should gain real height, got ' + maxHeight);
  assert.ok(ball.x > 0, 'ball should travel downrange');
  assert.strictEqual(ball.y, 0, 'ball should return to the ground');
});

test('the ball eventually comes to rest', () => {
  const ball = { x: 0, y: 0, vx: 700, vy: 700, radius: 16, resting: false };
  let ev = '';
  for (let i = 0; i < 6000 && ev !== 'rest'; i++) {
    ev = Physics.stepBall(ball, 1 / 120, {});
  }
  assert.strictEqual(ev, 'rest');
  assert.strictEqual(ball.resting, true);
  assert.strictEqual(ball.vx, 0);
});

test('stepping a resting ball is a no-op that reports rest', () => {
  const ball = { x: 5, y: 0, vx: 0, vy: 0, radius: 16, resting: true };
  const ev = Physics.stepBall(ball, 1 / 120, {});
  assert.strictEqual(ev, 'rest');
  assert.strictEqual(ball.x, 5);
});

test('higher restitution produces a higher rebound', () => {
  function firstBounceApex(restitution) {
    const ball = { x: 0, y: 300, vx: 400, vy: -50, radius: 16, resting: false };
    let bounced = false;
    let apex = 0;
    for (let i = 0; i < 3000; i++) {
      const ev = Physics.stepBall(ball, 1 / 120, { restitution });
      if (ev === 'bounce') bounced = true;
      if (bounced) apex = Math.max(apex, ball.y);
      if (bounced && ball.y === 0 && ball.vy <= 0 && i > 5) break;
    }
    return apex;
  }
  assert.ok(firstBounceApex(0.8) > firstBounceApex(0.3), 'bouncier ball should rebound higher');
});

test('boomerang acceleration pulls the ball back downrange', () => {
  const plain = { x: 0, y: 0, vx: 900, vy: 900, radius: 16, resting: false };
  const boomer = { x: 0, y: 0, vx: 900, vy: 900, radius: 16, resting: false };
  for (let i = 0; i < 200; i++) {
    Physics.stepBall(plain, 1 / 120, {});
    Physics.stepBall(boomer, 1 / 120, { boomerangAccel: 1500 });
  }
  assert.ok(boomer.vx < plain.vx, 'boomerang should reduce forward velocity vs plain');
});

test('launchFromDrag inverts the drag and clamps to maxLaunch', () => {
  // Drag down-left (screen y down positive) -> launch up-right.
  const v = Physics.launchFromDrag(-100, 80, 3, 2600);
  assert.ok(v.vx > 0, 'dragging left should launch right');
  assert.ok(v.vy > 0, 'dragging down should launch up (height+)');
  const big = Physics.launchFromDrag(-100000, 80000, 3, 2600);
  assert.ok(Math.hypot(big.vx, big.vy) <= 2600 + 1e-6, 'velocity is clamped');
});

test('predictTrajectory returns a sequence of points without mutating inputs', () => {
  const pts = Physics.predictTrajectory(0, 0, 800, 800, {}, 20, 1 / 30);
  assert.ok(pts.length > 1);
  assert.deepStrictEqual(pts[0], { x: 0, y: 0 });
  assert.ok(pts[5].x > pts[0].x, 'trajectory advances downrange');
});
