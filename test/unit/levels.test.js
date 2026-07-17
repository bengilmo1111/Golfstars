'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Levels = require('../../js/core/levels.js');
const Props = require('../../js/core/props.js');

test('v1 ships at least the PRD-scoped 3-5 levels', () => {
  assert.ok(Levels.LEVELS.length >= 3 && Levels.LEVELS.length <= 6);
});

test('levels are well-formed and reference real prop types', () => {
  const ids = new Set();
  for (const lvl of Levels.LEVELS) {
    assert.ok(lvl.id && !ids.has(lvl.id), 'unique level id: ' + lvl.id);
    ids.add(lvl.id);
    assert.ok(lvl.shots >= 1, lvl.id + ' needs shots');
    assert.ok(lvl.length > 0, lvl.id + ' needs length');
    assert.ok(Array.isArray(lvl.sky) && lvl.sky.length === 2, lvl.id + ' needs a 2-stop sky');
    assert.ok(lvl.props.length > 0, lvl.id + ' needs props');
    for (const p of lvl.props) {
      assert.ok(Props.getPropType(p.type), lvl.id + ' has unknown prop: ' + p.type);
      assert.ok(p.x > 0 && p.x <= lvl.length, lvl.id + ' prop ' + p.type + ' is within the range');
    }
  }
});

test('each level has at least one scoring target', () => {
  for (const lvl of Levels.LEVELS) {
    const scoring = lvl.props.filter((p) => Props.propPoints(p.type) > 0);
    assert.ok(scoring.length > 0, lvl.id + ' must have scoring targets');
  }
});

test('getLevel works by index and by id', () => {
  const byIndex = Levels.getLevel(0);
  assert.ok(byIndex);
  assert.strictEqual(Levels.getLevel(byIndex.id), byIndex);
  assert.strictEqual(Levels.getLevel(999), null);
  assert.strictEqual(Levels.getLevel('missing'), null);
});

test('levelMaxPoints sums scoring props', () => {
  const lvl = Levels.getLevel(0);
  const expected = lvl.props.reduce((s, p) => s + Props.propPoints(p.type), 0);
  assert.strictEqual(Levels.levelMaxPoints(lvl, Props.propPoints), expected);
  assert.ok(expected > 0);
});
