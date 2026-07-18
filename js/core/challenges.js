/**
 * Challenges — per-level optional missions that give a reason to replay.
 * Each level references a few challenge ids (with optional params); after a
 * round we build a stats object and evaluate which ones were completed.
 * Pure and deterministic for testing.
 */
(function (global) {
  'use strict';

  // Each entry has a test(stats, param) -> boolean, and either a fixed `label`
  // or a `labelTemplate(param)` for parameterised goals.
  const REGISTRY = {
    combo3: {
      label: 'Chain a 3-hit combo',
      test: (s) => s.bestCombo >= 3
    },
    combo5: {
      label: 'Chain a 5-hit combo',
      test: (s) => s.bestCombo >= 5
    },
    balloon: {
      label: 'Pop a jackpot balloon',
      test: (s) => (s.typeHits.balloon || 0) >= 1
    },
    moving: {
      label: 'Bag a runaway creature',
      test: (s) => (s.typeHits.movingcreature || 0) >= 1
    },
    nosplash: {
      label: 'Finish with no splashes',
      test: (s) => !s.splashed
    },
    bigdrive: {
      labelTemplate: (p) => 'Drive it ' + p + 'm in one shot',
      defaultParam: 1200,
      test: (s, p) => s.maxDistance >= p
    },
    score: {
      labelTemplate: (p) => 'Score ' + p + '+ in the round',
      defaultParam: 1500,
      test: (s, p) => s.score >= p
    }
  };

  function get(id) {
    return REGISTRY[id] || null;
  }

  function paramFor(ch) {
    const def = REGISTRY[ch.id];
    if (!def) return undefined;
    return ch.param != null ? ch.param : def.defaultParam;
  }

  /** Human-readable label for a level challenge entry ({ id, param? }). */
  function label(ch) {
    const def = REGISTRY[ch.id];
    if (!def) return ch.id;
    return def.labelTemplate ? def.labelTemplate(paramFor(ch)) : def.label;
  }

  /**
   * Build the stats object a round's challenges are evaluated against.
   * `round` is a Scoring round (see scoring.js).
   */
  function statsFromRound(round) {
    const shots = round.shots || [];
    const maxDistance = shots
      .filter((s) => !s.voided)
      .reduce((m, s) => Math.max(m, s.distance), 0);
    const splashed = shots.some((s) => s.voided);
    const totalTargets = shots.reduce((n, s) => n + (s.targetHits || 0), 0);
    return {
      score: round.total,
      bestCombo: round.bestCombo || 0,
      maxDistance,
      splashed,
      totalTargets,
      typeHits: round.typeHits || {}
    };
  }

  /**
   * Return the ids of the level's challenges that `stats` satisfies.
   * `levelChallenges` is an array of { id, param? }.
   */
  function evaluate(levelChallenges, stats) {
    return (levelChallenges || [])
      .filter((ch) => {
        const def = REGISTRY[ch.id];
        return def && def.test(stats, paramFor(ch));
      })
      .map((ch) => ch.id);
  }

  const api = { REGISTRY, get, label, statsFromRound, evaluate, paramFor };

  global.GS = global.GS || {};
  global.GS.Challenges = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
