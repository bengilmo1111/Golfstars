'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Unlocks = require('../../js/core/unlocks.js');

test('the starter ball and club are always unlocked', () => {
  assert.ok(Unlocks.isUnlocked(Unlocks.getBall('standard'), 0));
  assert.ok(Unlocks.isUnlocked(Unlocks.getClub('starter'), 0));
  assert.strictEqual(Unlocks.unlockedBalls(0).length, 1);
  assert.strictEqual(Unlocks.unlockedClubs(0).length, 1);
});

test('unlocks open up as career score grows', () => {
  const balls0 = Unlocks.unlockedBalls(0).length;
  const balls500 = Unlocks.unlockedBalls(500).length;
  const ballsMax = Unlocks.unlockedBalls(99999).length;
  assert.ok(balls500 > balls0);
  assert.strictEqual(ballsMax, Unlocks.BALLS.length);
});

test('thresholds are strictly increasing per category', () => {
  for (const list of [Unlocks.BALLS, Unlocks.CLUBS]) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].threshold > list[i - 1].threshold, 'thresholds increase');
    }
  }
});

test('newlyUnlocked reports only items crossed between two scores', () => {
  const bouncy = Unlocks.getBall('bouncy'); // threshold 400
  const gained = Unlocks.newlyUnlocked(399, 400);
  assert.ok(gained.some((g) => g.item.id === bouncy.id && g.kind === 'ball'));
  // Nothing new if we were already past it.
  assert.strictEqual(Unlocks.newlyUnlocked(400, 500).length, 0);
});

test('newlyUnlocked can return several items across a big jump', () => {
  const gained = Unlocks.newlyUnlocked(0, 99999);
  // Every non-zero-threshold item should appear exactly once.
  const nonStarters = [...Unlocks.BALLS, ...Unlocks.CLUBS].filter((i) => i.threshold > 0);
  assert.strictEqual(gained.length, nonStarters.length);
});

test('every ball carries a radius and a physics modifier object', () => {
  for (const b of Unlocks.BALLS) {
    assert.ok(b.radius > 0, b.id + ' needs a radius');
    assert.strictEqual(typeof b.physics, 'object');
  }
});

test('getBall/getClub fall back to the default for unknown ids', () => {
  assert.strictEqual(Unlocks.getBall('nope').id, 'standard');
  assert.strictEqual(Unlocks.getClub('nope').id, 'starter');
});

test('clubs expose power and a loft bias (high pop vs flat carry)', () => {
  for (const c of Unlocks.CLUBS) assert.ok(c.power > 0, c.id + ' needs power');
  assert.ok(Unlocks.getClub('lobwedge').loft > 1, 'lob wedge pops higher');
  assert.ok(Unlocks.getClub('driver').loft < 1, 'driver flattens the shot');
});
