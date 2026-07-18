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

test('new target types carry their behavior flags', () => {
  const mv = Props.getPropType('movingcreature');
  assert.strictEqual(mv.moving, true);
  assert.ok(mv.patrol > 0 && mv.speed > 0, 'moving target needs patrol + speed');
  assert.ok(mv.points > 0, 'moving target scores');

  const bal = Props.getPropType('balloon');
  assert.strictEqual(bal.jackpot, true);
  assert.ok(bal.float > 100, 'balloon floats high');
  assert.ok(bal.points >= 300, 'balloon is a jackpot');

  // The pond is now a fun scoring skip target, not a dead-stop hazard.
  const pond = Props.getPropType('water');
  assert.strictEqual(pond.pond, true);
  assert.ok(pond.skip > 0, 'pond skips the ball onward');
  assert.ok(Props.propPoints('water') > 0, 'pond scores');

  const tnt = Props.getPropType('tnt');
  assert.ok(tnt.blast > 0, 'TNT has a blast radius');
  assert.ok(tnt.points > 0);

  const hive = Props.getPropType('beehive');
  assert.strictEqual(hive.reaction, 'swarm');
  assert.ok(hive.points > 0);
});

test('a floating balloon is only hit when the ball reaches its height', () => {
  const bal = Props.getPropType('balloon');
  const prop = { type: 'balloon', x: 500, y: bal.float }; // bottom at float height
  assert.strictEqual(Props.hitsProp(500, bal.float + 10, 16, prop), true, 'hit up at height');
  assert.strictEqual(Props.hitsProp(500, 0, 16, prop), false, 'ground ball misses the balloon');
});

test('hitsProp on an unknown prop type is false', () => {
  assert.strictEqual(Props.hitsProp(0, 0, 16, { type: 'ghost', x: 0, y: 0 }), false);
});
