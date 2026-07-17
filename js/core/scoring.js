/**
 * Scoring — target hits are primary, distance is a secondary bonus, and hitting
 * multiple targets in one shot builds a combo multiplier.
 * Pure and deterministic for easy testing.
 */
(function (global) {
  'use strict';

  const DISTANCE_PER_POINT = 40; // world units of distance per bonus point

  function distanceBonus(distance) {
    if (!(distance > 0)) return 0;
    return Math.floor(distance / DISTANCE_PER_POINT);
  }

  /**
   * comboMultiplier grows with the number of scoring targets hit in a single
   * shot, plus a bonus for each trampoline touched.
   */
  function comboMultiplier(targetHits, trampolineHits) {
    const t = Math.max(0, targetHits - 1);
    return 1 + 0.5 * t + 0.5 * (trampolineHits || 0);
  }

  /**
   * Create a mutable score tracker for one round (a level attempt).
   * `propPoints(type)` returns the base points for a prop type.
   */
  function createRound(propPoints) {
    return {
      total: 0,
      bestCombo: 0,
      shots: [],
      // per-shot working state
      _raw: 0,
      _targetHits: 0,
      _trampolineHits: 0,

      startShot() {
        this._raw = 0;
        this._targetHits = 0;
        this._trampolineHits = 0;
      },

      /** Register a prop contact during the current shot. Returns base points. */
      registerHit(type) {
        const pts = propPoints(type);
        if (pts > 0) {
          this._raw += pts;
          this._targetHits += 1;
        } else if (type === 'trampoline') {
          this._trampolineHits += 1;
        }
        return pts;
      },

      /** Close the shot, fold in distance, and return the shot summary. */
      endShot(distance) {
        const mult = comboMultiplier(this._targetHits, this._trampolineHits);
        const targetScore = Math.round(this._raw * mult);
        const distBonus = distanceBonus(distance);
        const shotTotal = targetScore + distBonus;
        const summary = {
          targetScore,
          distanceBonus: distBonus,
          shotTotal,
          targetHits: this._targetHits,
          trampolineHits: this._trampolineHits,
          multiplier: mult,
          distance: Math.max(0, Math.round(distance))
        };
        this.total += shotTotal;
        this.bestCombo = Math.max(this.bestCombo, this._targetHits);
        this.shots.push(summary);
        return summary;
      }
    };
  }

  const api = { DISTANCE_PER_POINT, distanceBonus, comboMultiplier, createRound };

  global.GS = global.GS || {};
  global.GS.Scoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
