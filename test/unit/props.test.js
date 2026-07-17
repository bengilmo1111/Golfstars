'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Props = require('../../js/core/props.js');

test('every prop type has the fields the engine and renderer need', () => {
  for (const [key, def] of Object.entries(Props.PROP_TYPES)) {
    assert.ok(typeof def.label === 'string' && def.label, key + ' needs a label');
    assert.ok(def.width > 0 && def.height > 0, key + ' needs positive size');
    assert.ok(typeof def.points === 'number' && def.points >= 0, key + ' needs points >= 0');
    assert.ok(typeof def.sound === 'string', key + ' needs a sound');
    assert.ok(typeof def.reaction === 'string', key + ' needs a reaction');
  }
});

test('propPoints returns base points and 0 for unknown/non-scoring types', () => {
  assert.strictEqual(Props.propPoints('golfcart'), 180);
  assert.strictEqual(Props.propPoints('trampoline'), 0);
  assert.strictEqual(Props.propPoints('nope'), 0);
});

test('hitsProp detects overlap with a prop box anchored at bottom-centre', () => {
  const prop = { type: 'golfcart', x: 500, y: 0 }; // 100 wide, 74 tall
  // Centre of the box (~37 above ground) should hit.
  assert.strictEqual(Props.hitsProp(500, 37, 16, prop), true);
  // Just left of the box, but within the ball radius, still hits.
  assert.strictEqual(Props.hitsProp(500 - 50 - 10, 37, 16, prop), true);
  // Far away misses.
  assert.strictEqual(Props.hitsProp(800, 37, 16, prop), false);
  // Well above the box misses.
  assert.strictEqual(Props.hitsProp(500, 300, 16, prop), false);
});

test('trampoline declares a bounce multiplier and combo bonus', () => {
  const t = Props.getPropType('trampoline');
  assert.ok(t.bounce > 1, 'bounce should amplify velocity');
  assert.strictEqual(t.comboBonus, true);
});

test('hitsProp on an unknown prop type is false', () => {
  assert.strictEqual(Props.hitsProp(0, 0, 16, { type: 'ghost', x: 0, y: 0 }), false);
});
