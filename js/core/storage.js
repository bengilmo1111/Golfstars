/**
 * Storage — local persistence for the leaderboard (best score per level),
 * career score (drives unlocks), and player selections.
 * The backing store is injectable so it can be unit-tested with a stub in Node;
 * in the browser it defaults to window.localStorage.
 */
(function (global) {
  'use strict';

  const KEY = 'golfstars.save.v1';

  function defaultState() {
    return {
      careerScore: 0,
      best: {}, // levelId -> best round score
      selectedCharacter: 'henry',
      selectedBall: 'standard',
      selectedClub: 'starter'
    };
  }

  function pickStore(explicit) {
    if (explicit) return explicit;
    if (typeof localStorage !== 'undefined') return localStorage;
    // In-memory fallback (e.g. Node without a stub, or private-mode failures).
    const mem = {};
    return {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => {
        mem[k] = String(v);
      },
      removeItem: (k) => {
        delete mem[k];
      }
    };
  }

  function createStorage(backend) {
    const store = pickStore(backend);

    function load() {
      try {
        const raw = store.getItem(KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return Object.assign(defaultState(), parsed, {
          best: Object.assign({}, parsed.best)
        });
      } catch (e) {
        return defaultState();
      }
    }

    function save(state) {
      try {
        store.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* storage full or unavailable — ignore, game still playable */
      }
      return state;
    }

    return {
      load,
      save,
      reset() {
        try {
          store.removeItem(KEY);
        } catch (e) {
          /* ignore */
        }
        return defaultState();
      },

      getBest(levelId) {
        return load().best[levelId] || 0;
      },

      /**
       * Record a completed round. Adds to career score and updates the level
       * best if beaten. Returns { state, isBest, prevCareer }.
       */
      recordRound(levelId, roundScore) {
        const state = load();
        const prevCareer = state.careerScore;
        state.careerScore += roundScore;
        const prevBest = state.best[levelId] || 0;
        const isBest = roundScore > prevBest;
        if (isBest) state.best[levelId] = roundScore;
        save(state);
        return { state, isBest, prevCareer };
      },

      setSelection(partial) {
        const state = load();
        Object.assign(state, partial);
        save(state);
        return state;
      }
    };
  }

  const api = { KEY, defaultState, createStorage };

  global.GS = global.GS || {};
  global.GS.Storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
