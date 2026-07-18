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

test('multiplierForCombo grows with the chain and caps', () => {
  assert.strictEqual(Scoring.multiplierForCombo(0), 1);
  assert.strictEqual(Scoring.multiplierForCombo(1), 1);
  assert.strictEqual(Scoring.multiplierForCombo(2), 1.5);
  assert.strictEqual(Scoring.multiplierForCombo(3), 2);
  const capped = Scoring.multiplierForCombo(999);
  assert.strictEqual(capped, Scoring.multiplierForCombo(Scoring.COMBO_CAP));
});

test('a single-target shot scores base points plus distance bonus', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const r = round.registerHit('golfcart'); // 180 at combo 1 -> x1
  assert.strictEqual(r.awarded, 180);
  const s = round.endShot(200); // +5 distance
  assert.strictEqual(s.targetScore, 180);
  assert.strictEqual(s.distanceBonus, 5);
  assert.strictEqual(s.shotTotal, 185);
  assert.strictEqual(round.total, 185);
});

test('chaining hits applies an escalating live multiplier', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const a = round.registerHit('golfcart'); // combo1 x1 -> 180
  const b = round.registerHit('portaloo'); // combo2 x1.5 -> 300
  const c = round.registerHit('scarecrow'); // combo3 x2 -> 240
  assert.strictEqual(a.awarded, 180);
  assert.strictEqual(b.awarded, 300);
  assert.strictEqual(c.awarded, 240);
  assert.strictEqual(round.total, 720);
  assert.strictEqual(round.bestCombo, 3);
});

test('the combo drops when the timer runs out, and rebuilds from 1', () => {
  const round = Scoring.createRound(Props.propPoints, { comboWindow: 1.0 });
  round.startShot();
  round.registerHit('golfcart'); // combo 1
  round.registerHit('golfcart'); // combo 2
  assert.strictEqual(round.combo, 2);
  round.tick(1.1); // let the window lapse
  assert.strictEqual(round.combo, 0);
  const r = round.registerHit('buckets'); // back to combo 1 -> x1
  assert.strictEqual(r.combo, 1);
  assert.strictEqual(r.awarded, 90);
});

test('tick refreshes fraction and a hit re-arms the timer', () => {
  const round = Scoring.createRound(Props.propPoints, { comboWindow: 2.0 });
  round.registerHit('buckets');
  assert.ok(round.comboFraction() > 0.99);
  round.tick(1.0);
  assert.ok(Math.abs(round.comboFraction() - 0.5) < 1e-6);
  round.registerHit('buckets'); // re-arm
  assert.ok(round.comboFraction() > 0.99);
});

test('trampoline extends the chain and boosts the multiplier without scoring', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const t = round.registerHit('trampoline'); // combo 1, 0 pts
  const g = round.registerHit('golfcart'); // combo 2 -> x1.5 -> 270
  assert.strictEqual(t.awarded, 0);
  assert.strictEqual(g.awarded, 270);
  assert.strictEqual(round.combo, 2);
});

test('a voided (hazard) shot scores no distance and breaks the chain', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  round.registerHit('golfcart');
  round.voidShot();
  const s = round.endShot(800);
  assert.strictEqual(s.voided, true);
  assert.strictEqual(s.distanceBonus, 0);
  assert.strictEqual(round.combo, 0);
});

test('combo persists across shots while the timer is alive', () => {
  const round = Scoring.createRound(Props.propPoints, { comboWindow: 2.0 });
  round.startShot();
  round.registerHit('buckets'); // combo 1
  round.endShot(0);
  round.tick(0.5); // still within window
  round.startShot();
  const r = round.registerHit('buckets'); // continues to combo 2
  assert.strictEqual(r.combo, 2);
});

test('a whiffed shot still scores distance only', () => {
  const round = Scoring.createRound(Props.propPoints);
  round.startShot();
  const s = round.endShot(160);
  assert.strictEqual(s.targetScore, 0);
  assert.strictEqual(s.distanceBonus, 4);
  assert.strictEqual(s.shotTotal, 4);
});
