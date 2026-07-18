/**
 * Scoring — target hits are primary, distance is a secondary bonus.
 * Combos are a LIVE chain: each target (or trampoline) hit bumps a combo counter
 * and refreshes a short timer; let the timer run out and the chain resets. The
 * multiplier grows with the chain, so stringing hits together — within and even
 * across shots — is where the points are. Pure and deterministic for testing.
 */
(function (global) {
  'use strict';

  const DISTANCE_PER_POINT = 40; // world units of distance per bonus point
  const COMBO_WINDOW = 1.6; // seconds to land the next hit before the chain drops
  const COMBO_CAP = 10; // combo count beyond which the multiplier stops growing

  function distanceBonus(distance) {
    if (!(distance > 0)) return 0;
    return Math.floor(distance / DISTANCE_PER_POINT);
  }

  /** Multiplier for a given live combo count (1 = first hit, no bonus yet). */
  function multiplierForCombo(combo) {
    if (combo <= 1) return 1;
    const c = Math.min(combo, COMBO_CAP);
    return 1 + 0.5 * (c - 1);
  }

  /**
   * Create a mutable score tracker for one round (a level attempt).
   * `propPoints(type)` returns the base points for a prop type.
   */
  function createRound(propPoints, opts) {
    opts = opts || {};
    const windowLen = opts.comboWindow || COMBO_WINDOW;
    return {
      total: 0,
      combo: 0, // live chain length
      comboTimer: 0, // seconds left to extend the chain
      bestCombo: 0,
      shots: [],
      typeHits: {}, // count of scoring hits per prop type (for challenges)
      _shotPoints: 0,
      _shotHits: 0,
      _shotMaxMult: 1,
      voided: false, // set when the shot lands in a hazard

      currentMultiplier() {
        return multiplierForCombo(this.combo);
      },
      /** 0..1 fraction of the combo timer remaining (for the meter UI). */
      comboFraction() {
        return this.combo > 0 ? Math.max(0, this.comboTimer / windowLen) : 0;
      },

      startShot() {
        this._shotPoints = 0;
        this._shotHits = 0;
        this._shotMaxMult = 1;
        this.voided = false;
      },

      /** Decay the combo timer; drop the chain when it expires. */
      tick(dt) {
        if (this.combo > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) {
            this.combo = 0;
            this.comboTimer = 0;
          }
        }
      },

      /**
       * Register a prop contact. Scoring targets and trampolines both extend the
       * chain; only scoring targets award points (× the live multiplier).
       * Returns { awarded, base, combo, multiplier }.
       */
      registerHit(type) {
        const base = propPoints(type);
        const chains = base > 0 || type === 'trampoline';
        if (chains) {
          this.combo += 1;
          this.comboTimer = windowLen;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
        }
        const multiplier = multiplierForCombo(this.combo);
        let awarded = 0;
        if (base > 0) {
          awarded = Math.round(base * multiplier);
          this.total += awarded;
          this._shotPoints += awarded;
          this._shotHits += 1;
          this._shotMaxMult = Math.max(this._shotMaxMult, multiplier);
          this.typeHits[type] = (this.typeHits[type] || 0) + 1;
        }
        return { awarded, base, combo: this.combo, multiplier };
      },

      /** Landing in a hazard: void the shot's distance bonus and break the chain. */
      voidShot() {
        this.voided = true;
        this.combo = 0;
        this.comboTimer = 0;
      },

      /** Close the shot, fold in distance, and return the shot summary. */
      endShot(distance) {
        const distBonus = this.voided ? 0 : distanceBonus(distance);
        this.total += distBonus;
        const summary = {
          targetScore: this._shotPoints,
          distanceBonus: distBonus,
          shotTotal: this._shotPoints + distBonus,
          targetHits: this._shotHits,
          maxMultiplier: this._shotMaxMult,
          voided: this.voided,
          distance: Math.max(0, Math.round(distance))
        };
        this.shots.push(summary);
        return summary;
      }
    };
  }

  const api = {
    DISTANCE_PER_POINT,
    COMBO_WINDOW,
    COMBO_CAP,
    distanceBonus,
    multiplierForCombo,
    createRound
  };

  global.GS = global.GS || {};
  global.GS.Scoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
