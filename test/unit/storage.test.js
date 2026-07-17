'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Storage = require('../../js/core/storage.js');

// A tiny in-memory localStorage stub matching the Web Storage surface we use.
function stubBackend() {
  const mem = {};
  return {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => {
      mem[k] = String(v);
    },
    removeItem: (k) => {
      delete mem[k];
    },
    _mem: mem
  };
}

test('a fresh store returns the default state', () => {
  const s = Storage.createStorage(stubBackend());
  const state = s.load();
  assert.strictEqual(state.careerScore, 0);
  assert.deepStrictEqual(state.best, {});
  assert.strictEqual(state.selectedCharacter, 'henry');
});

test('recording a round adds to career score and sets a best', () => {
  const s = Storage.createStorage(stubBackend());
  const r1 = s.recordRound('sunny-range', 300);
  assert.strictEqual(r1.isBest, true);
  assert.strictEqual(r1.prevCareer, 0);
  assert.strictEqual(s.getBest('sunny-range'), 300);
  assert.strictEqual(s.load().careerScore, 300);
});

test('best only updates when beaten, but career always grows', () => {
  const s = Storage.createStorage(stubBackend());
  s.recordRound('sunny-range', 300);
  const r2 = s.recordRound('sunny-range', 250);
  assert.strictEqual(r2.isBest, false);
  assert.strictEqual(s.getBest('sunny-range'), 300);
  assert.strictEqual(s.load().careerScore, 550);
  const r3 = s.recordRound('sunny-range', 500);
  assert.strictEqual(r3.isBest, true);
  assert.strictEqual(s.getBest('sunny-range'), 500);
});

test('selections persist and merge', () => {
  const s = Storage.createStorage(stubBackend());
  s.setSelection({ selectedBall: 'bouncy' });
  s.setSelection({ selectedCharacter: 'nina' });
  const st = s.load();
  assert.strictEqual(st.selectedBall, 'bouncy');
  assert.strictEqual(st.selectedCharacter, 'nina');
});

test('reset clears saved state', () => {
  const s = Storage.createStorage(stubBackend());
  s.recordRound('sunny-range', 300);
  s.reset();
  assert.strictEqual(s.load().careerScore, 0);
});

test('corrupt saved data falls back to defaults instead of throwing', () => {
  const backend = stubBackend();
  backend.setItem(Storage.KEY, '{not valid json');
  const s = Storage.createStorage(backend);
  assert.strictEqual(s.load().careerScore, 0);
});

test('state survives a reload through the same backend', () => {
  const backend = stubBackend();
  const a = Storage.createStorage(backend);
  a.recordRound('sunset-hills', 420);
  const b = Storage.createStorage(backend);
  assert.strictEqual(b.getBest('sunset-hills'), 420);
});
