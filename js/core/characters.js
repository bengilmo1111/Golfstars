/**
 * Characters — the selectable creature cast.
 * v1: purely cosmetic (identical gameplay stats), different colour + voice only.
 * Environment-agnostic: usable in the browser and in Node tests.
 */
(function (global) {
  'use strict';

  const CHARACTERS = [
    {
      id: 'henry',
      name: 'Henry',
      body: '#39d3c0', // teal/mint
      belly: '#bff6ee',
      eye: '#20303a',
      // voice: base pitch (Hz) for gibberish blips
      voicePitch: 220,
      personality: 'bouncy',
      blurb: 'Bouncy and brave. Honks when happy.'
    },
    {
      id: 'casper',
      name: 'Casper',
      body: '#ff8a3d', // orange
      belly: '#ffd9b8',
      eye: '#3a2410',
      voicePitch: 300,
      personality: 'goofy',
      blurb: 'Goofy show-off. Squeaks on every swing.'
    },
    {
      id: 'nina',
      name: 'Nina',
      body: '#b46cff', // purple
      belly: '#e9d4ff',
      eye: '#2a1840',
      voicePitch: 380,
      personality: 'sneaky',
      blurb: 'Sneaky and clever. Giggles at chaos.'
    }
  ];

  function getCharacter(id) {
    return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  const api = { CHARACTERS, getCharacter };

  global.GS = global.GS || {};
  global.GS.Characters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
