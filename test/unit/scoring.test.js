'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Scoring = require('../../js/core/scoring.js');
const Props = require('../../js/core/props.js');

test('distance bonus is one point per DISTANCE_PER_POINT units', () => {
  assert.strictEqual(Scoring.distanceBonus(0), 0);
  assert.strictEqual(Scoring.distanceBonus(-50), 0);
  assert.strictEqual(Scoring.distanceBonus(39), 0);
  assert.strictEqual(Scoring.distanceBonus(80), 2);
  assert.strictEqual(Scoring.distanceBonus(400), 10);
});

test('comboMultiplier grows with target hits and trampolines', () => {
  assert.strictEqual(Scoring.comboMultiplier(0, 0), 1);
  assert.strictEqual(Scoring.comboMultiplier(1, 0), 1);
  assert.strictEqual(Scoring.comboMultiplier(2, 0), 1.5);
  assert.strictEqual(Scoring.comboMultiplier(3, 0), 2);
  assert.strictEqual(Scoring.comboMultiplier(1, 2), 2);
});

test('a single-target shot scores base points plus distance bonus', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  round.registerHit('golfcart'); // 180
  const s = round.endShot(200); // +5 distance
  assert.strictEqual(s.targetScore, 180);
  assert.strictEqual(s.distanceBonus, 5);
  assert.strictEqual(s.shotTotal, 185);
  assert.strictEqual(round.total, 185);
});

test('multi-target shots apply a combo multiplier', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  round.registerHit('golfcart'); // 180
  round.registerHit('portaloo'); // 200
  const s = round.endShot(0);
  // (180 + 200) * 1.5 = 570
  assert.strictEqual(s.targetHits, 2);
  assert.strictEqual(s.multiplier, 1.5);
  assert.strictEqual(s.targetScore, 570);
});

test('trampoline adds combo bonus but no base points', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const pts = round.registerHit('trampoline');
  round.registerHit('golfcart'); // 180
  const s = round.endShot(0);
  assert.strictEqual(pts, 0, 'trampoline itself scores nothing');
  // 1 target + 1 trampoline -> multiplier 1 + 0 + 0.5 = 1.5
  assert.strictEqual(s.multiplier, 1.5);
  assert.strictEqual(s.targetScore, 270);
});

test('round total accumulates across shots and tracks best combo', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  round.registerHit('buckets'); // 90
  round.endShot(40); // +1
  round.startShot();
  round.registerHit('golfcart');
  round.registerHit('portaloo');
  round.registerHit('scarecrow');
  round.endShot(0);
  assert.strictEqual(round.shots.length, 2);
  assert.strictEqual(round.bestCombo, 3);
  assert.ok(round.total > 90);
});

test('a whiffed shot still scores distance only', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const s = round.endShot(160);
  assert.strictEqual(s.targetScore, 0);
  assert.strictEqual(s.distanceBonus, 4);
  assert.strictEqual(s.shotTotal, 4);
});
