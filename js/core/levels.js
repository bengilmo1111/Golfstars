/**
 * Levels — each scene's downrange length, shot count, ground theme, and prop
 * layout. Props are placed at world x (downrange). Tee sits at x = TEE_X.
 */
(function (global) {
  'use strict';

  const TEE_X = 120;
  const GROUND_Y = 0; // world ground line (height above ground is negative y going up)

  // `wind` (world units/s^2, + right / - left) is applied to the airborne ball.
  const LEVELS = [
    {
      id: 'sunny-range',
      name: 'Sunny Range',
      shots: 5,
      length: 2600, // downrange world length
      wind: 0,
      stars: [500, 1000, 1700], // bronze / silver / gold score thresholds
      challenges: [{ id: 'combo3' }, { id: 'balloon' }, { id: 'nosplash' }],
      sky: ['#8fd6ff', '#d7f2ff'],
      ground: '#6fca5a',
      props: [
        { type: 'buckets', x: 520 },
        { type: 'cartcreature', x: 780 },
        { type: 'golfcart', x: 820 },
        { type: 'balloon', x: 1000 },
        { type: 'scarecrow', x: 1150 },
        { type: 'trampoline', x: 1400 },
        { type: 'movingcreature', x: 1600 },
        { type: 'sprinkler', x: 1800 },
        { type: 'water', x: 2100 },
        { type: 'portaloo', x: 2350 },
        { type: 'picnic', x: 2520 }
      ]
    },
    {
      id: 'sunset-hills',
      name: 'Sunset Hills',
      shots: 5,
      length: 3000,
      wind: 240, // gentle tailwind
      stars: [700, 1400, 2200],
      challenges: [{ id: 'balloon' }, { id: 'bigdrive', param: 1300 }, { id: 'moving' }],
      sky: ['#ffb36b', '#ffe0a3'],
      ground: '#7c9e46', // warm olive-green to match the sunset
      props: [
        { type: 'scarecrow', x: 500 },
        { type: 'buckets', x: 700 },
        { type: 'trampoline', x: 900 },
        { type: 'balloon', x: 1050 },
        { type: 'cartcreature', x: 1200 },
        { type: 'golfcart', x: 1250 },
        { type: 'water', x: 1550 },
        { type: 'movingcreature', x: 1850 },
        { type: 'picnic', x: 2050 },
        { type: 'portaloo', x: 2300 },
        { type: 'scarecrow', x: 2550 },
        { type: 'cartcreature', x: 2800 }
      ]
    },
    {
      id: 'chaos-carnival',
      name: 'Chaos Carnival',
      shots: 6,
      length: 3400,
      wind: -200, // tricky headwind
      stars: [900, 1700, 2600],
      challenges: [{ id: 'combo5' }, { id: 'balloon' }, { id: 'nosplash' }],
      sky: ['#b48cff', '#ffd0f0'],
      ground: '#3fa578', // deeper dusk green
      props: [
        { type: 'trampoline', x: 460 },
        { type: 'portaloo', x: 620 },
        { type: 'buckets', x: 850 },
        { type: 'balloon', x: 1000 },
        { type: 'sprinkler', x: 1150 },
        { type: 'trampoline', x: 1300 },
        { type: 'movingcreature', x: 1550 },
        { type: 'golfcart', x: 1700 },
        { type: 'water', x: 1950 },
        { type: 'scarecrow', x: 2200 },
        { type: 'picnic', x: 2400 },
        { type: 'balloon', x: 2600 },
        { type: 'trampoline', x: 2800 },
        { type: 'picnic', x: 3050 }
      ]
    },
    {
      id: 'moonlight-madness',
      name: 'Moonlight Madness',
      shots: 6,
      length: 3800,
      wind: 180,
      stars: [1000, 1900, 2900],
      challenges: [{ id: 'bigdrive', param: 1600 }, { id: 'moving' }, { id: 'combo5' }],
      sky: ['#2b3a6b', '#5b6bb0'],
      ground: '#2d6353', // dark, moonlit blue-green
      props: [
        { type: 'buckets', x: 520 },
        { type: 'cartcreature', x: 760 },
        { type: 'golfcart', x: 810 },
        { type: 'balloon', x: 1000 },
        { type: 'trampoline', x: 1100 },
        { type: 'portaloo', x: 1300 },
        { type: 'movingcreature', x: 1600 },
        { type: 'water', x: 1900 },
        { type: 'scarecrow', x: 2150 },
        { type: 'sprinkler', x: 2400 },
        { type: 'balloon', x: 2600 },
        { type: 'cartcreature', x: 2800 },
        { type: 'golfcart', x: 2860 },
        { type: 'portaloo', x: 3100 },
        { type: 'picnic', x: 3400 },
        { type: 'movingcreature', x: 3600 }
      ]
    }
  ];

  function getLevel(idOrIndex) {
    if (typeof idOrIndex === 'number') return LEVELS[idOrIndex] || null;
    return LEVELS.find((l) => l.id === idOrIndex) || null;
  }

  /** Max scorable points in a level (props only, ignoring combos). */
  function levelMaxPoints(level, propPoints) {
    return level.props.reduce((sum, p) => sum + propPoints(p.type), 0);
  }

  /** Stars (0..3) earned for a given best score on a level. */
  function levelStars(level, score) {
    if (!level || !level.stars) return 0;
    let n = 0;
    for (const t of level.stars) if (score >= t) n += 1;
    return n;
  }

  /**
   * A level is unlocked if it's the first, or the previous level has earned at
   * least one star. `getBest(levelId)` returns the stored best score.
   */
  function isUnlocked(index, getBest) {
    if (index <= 0) return true;
    const prev = LEVELS[index - 1];
    if (!prev) return false;
    return levelStars(prev, getBest(prev.id) || 0) >= 1;
  }

  const api = { TEE_X, GROUND_Y, LEVELS, getLevel, levelMaxPoints, levelStars, isUnlocked };

  global.GS = global.GS || {};
  global.GS.Levels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
