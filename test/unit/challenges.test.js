'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Challenges = require('../../js/core/challenges.js');

function fakeRound(over) {
  return Object.assign(
    {
      total: 0,
      bestCombo: 0,
      typeHits: {},
      shots: []
    },
    over
  );
}

test('statsFromRound derives distance, splash, combo, and type hits', () => {
  const round = fakeRound({
    total: 900,
    bestCombo: 4,
    typeHits: { balloon: 1, golfcart: 2 },
    shots: [
      { distance: 800, voided: false, targetHits: 2 },
      { distance: 1400, voided: true, targetHits: 1 }, // voided splash — ignored for drive
      { distance: 1200, voided: false, targetHits: 1 }
    ]
  });
  const s = Challenges.statsFromRound(round);
  assert.strictEqual(s.score, 900);
  assert.strictEqual(s.bestCombo, 4);
  assert.strictEqual(s.maxDistance, 1200, 'voided shot distance is excluded');
  assert.strictEqual(s.splashed, true);
  assert.strictEqual(s.totalTargets, 4);
  assert.strictEqual(s.typeHits.balloon, 1);
});

test('evaluate returns the ids of satisfied challenges', () => {
  const stats = {
    score: 1200,
    bestCombo: 3,
    maxDistance: 1000,
    splashed: true,
    typeHits: { balloon: 1 }
  };
  const level = [{ id: 'combo3' }, { id: 'balloon' }, { id: 'nosplash' }];
  const done = Challenges.evaluate(level, stats);
  assert.ok(done.includes('combo3'), 'combo of 3 completes combo3');
  assert.ok(done.includes('balloon'), 'popped balloon completes balloon');
  assert.ok(!done.includes('nosplash'), 'splashed fails nosplash');
});

test('parameterised challenges respect their param', () => {
  const near = { maxDistance: 1250, bestCombo: 0, splashed: false, score: 0, typeHits: {} };
  assert.deepStrictEqual(Challenges.evaluate([{ id: 'bigdrive', param: 1300 }], near), []);
  assert.deepStrictEqual(
    Challenges.evaluate([{ id: 'bigdrive', param: 1200 }], near),
    ['bigdrive']
  );
});

test('label renders fixed and templated challenge text', () => {
  assert.strictEqual(Challenges.label({ id: 'balloon' }), 'Pop a jackpot balloon');
  assert.strictEqual(Challenges.label({ id: 'bigdrive', param: 1300 }), 'Drive it 1300m in one shot');
  // Falls back to default param when none supplied.
  assert.match(Challenges.label({ id: 'bigdrive' }), /\d+m/);
});

test('pond and tnt challenges read the right type hits', () => {
  const stats = { score: 0, bestCombo: 0, maxDistance: 0, splashed: false, typeHits: { water: 2, tnt: 1 } };
  const done = Challenges.evaluate([{ id: 'pond' }, { id: 'tnt' }, { id: 'moving' }], stats);
  assert.ok(done.includes('pond'));
  assert.ok(done.includes('tnt'));
  assert.ok(!done.includes('moving'));
});

test('unknown challenge ids are ignored, not thrown', () => {
  assert.deepStrictEqual(Challenges.evaluate([{ id: 'nope' }], { score: 999, typeHits: {} }), []);
  assert.strictEqual(Challenges.label({ id: 'nope' }), 'nope');
});
