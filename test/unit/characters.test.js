'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Characters = require('../../js/core/characters.js');

test('v1 ships the three named, selectable characters', () => {
  const ids = Characters.CHARACTERS.map((c) => c.id);
  assert.deepStrictEqual(ids, ['henry', 'casper', 'nina']);
});

test('characters are cosmetic-only: distinct look/voice, complete fields', () => {
  const colors = new Set();
  const pitches = new Set();
  for (const c of Characters.CHARACTERS) {
    assert.ok(c.name && c.body && c.belly && c.eye, c.id + ' needs full styling');
    assert.ok(c.voicePitch > 0, c.id + ' needs a voice pitch');
    colors.add(c.body);
    pitches.add(c.voicePitch);
  }
  assert.strictEqual(colors.size, 3, 'each character has a distinct colour');
  assert.strictEqual(pitches.size, 3, 'each character has a distinct voice');
});

test('getCharacter finds by id and falls back to the first', () => {
  assert.strictEqual(Characters.getCharacter('nina').name, 'Nina');
  assert.strictEqual(Characters.getCharacter('missing').id, 'henry');
});
