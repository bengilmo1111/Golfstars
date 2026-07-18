/**
 * Unlocks — balls and clubs, gated by cumulative career score.
 * Each ball/club carries the physics modifiers the engine applies, so gameplay
 * effects live next to their unlock rules and stay testable.
 */
(function (global) {
  'use strict';

  // radius is the ball's world radius; `physics` overrides Physics DEFAULTS.
  const BALLS = [
    {
      id: 'standard',
      name: 'Standard Ball',
      threshold: 0,
      radius: 16,
      color: '#ffffff',
      blurb: 'Reliable and round.',
      physics: {}
    },
    {
      id: 'bouncy',
      name: 'Bouncy Ball',
      threshold: 400,
      radius: 16,
      color: '#ff5d8f',
      blurb: 'Boing! Extra bounces = extra chaos.',
      physics: { restitution: 0.78, groundFriction: 0.85 }
    },
    {
      id: 'boomerang',
      name: 'Boomerang Ball',
      threshold: 1000,
      radius: 16,
      color: '#39d3c0',
      blurb: 'Curves back for a second pass.',
      physics: { boomerangAccel: 900, restitution: 0.55 }
    },
    {
      id: 'beachball',
      name: 'Beach Ball',
      threshold: 1800,
      radius: 30,
      color: '#ffd23f',
      blurb: 'Giant and floaty. Smashes everything.',
      physics: { gravity: 950, airDrag: 0.0016, restitution: 0.62 }
    },
    {
      id: 'exploding',
      name: 'Exploding Ball',
      threshold: 2800,
      radius: 17,
      color: '#ff6a3d',
      blurb: 'KABOOM! Smashes nearby targets too.',
      // explodeRadius is read by the engine to area-smash props on first hit.
      physics: {},
      explodeRadius: 150
    },
    {
      id: 'rocket',
      name: 'Rocket Ball',
      threshold: 3600,
      radius: 15,
      color: '#5b8cff',
      blurb: 'Low gravity — screaming distance.',
      physics: { gravity: 1050, airDrag: 0.0004 }
    },
    {
      id: 'feather',
      name: 'Feather Ball',
      threshold: 4600,
      radius: 16,
      color: '#eaf3ff',
      blurb: 'Floats forever — reach the high stuff.',
      physics: { gravity: 780, airDrag: 0.0024, groundFriction: 0.6 }
    }
  ];

  // `loft` biases launch angle (>1 pops the ball higher for less distance;
  // <1 flattens it for more carry). Defaults to 1 when absent.
  const CLUBS = [
    {
      id: 'starter',
      name: 'Starter Club',
      threshold: 0,
      power: 3.2,
      loft: 1,
      blurb: 'Trusty first swing.'
    },
    {
      id: 'bigbertha',
      name: 'Big Bertha',
      threshold: 700,
      power: 4.0,
      loft: 1,
      blurb: 'More power, more distance.'
    },
    {
      id: 'lobwedge',
      name: 'Lob Wedge',
      threshold: 1400,
      power: 3.2,
      loft: 1.35,
      blurb: 'High pop — perfect for balloons and clearing ponds.'
    },
    {
      id: 'driver',
      name: 'Power Driver',
      threshold: 2200,
      power: 4.6,
      loft: 0.9,
      blurb: 'Flat and ferocious. Maximum carry.'
    }
  ];

  function isUnlocked(item, careerScore) {
    return careerScore >= item.threshold;
  }

  function unlockedBalls(careerScore) {
    return BALLS.filter((b) => isUnlocked(b, careerScore));
  }

  function unlockedClubs(careerScore) {
    return CLUBS.filter((c) => isUnlocked(c, careerScore));
  }

  function getBall(id) {
    return BALLS.find((b) => b.id === id) || BALLS[0];
  }

  function getClub(id) {
    return CLUBS.find((c) => c.id === id) || CLUBS[0];
  }

  /**
   * Given the previous and new career score, return the items that just crossed
   * their threshold (for "New unlock!" toasts).
   */
  function newlyUnlocked(prevScore, newScore) {
    const crossed = (item) =>
      prevScore < item.threshold && newScore >= item.threshold;
    return [
      ...BALLS.filter(crossed).map((b) => ({ kind: 'ball', item: b })),
      ...CLUBS.filter(crossed).map((c) => ({ kind: 'club', item: c }))
    ];
  }

  const api = {
    BALLS,
    CLUBS,
    isUnlocked,
    unlockedBalls,
    unlockedClubs,
    getBall,
    getClub,
    newlyUnlocked
  };

  global.GS = global.GS || {};
  global.GS.Unlocks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
