/**
 * Props — the funny targets scattered across the range.
 * Each type declares points, hit-box size, and reaction metadata used by the
 * renderer/audio. Pure data + helpers so it can be unit-tested in Node.
 */
(function (global) {
  'use strict';

  // width/height are hit-box dimensions in world units, anchored at the prop's
  // (x, y) = bottom-centre on the ground.
  const PROP_TYPES = {
    cartcreature: {
      label: 'Cart Creature',
      points: 150,
      width: 70,
      height: 80,
      sound: 'boing',
      reaction: 'launch', // creature cartwheels off
      voice: true
    },
    portaloo: {
      label: 'Porta-loo',
      points: 200,
      width: 74,
      height: 120,
      sound: 'door',
      reaction: 'burst',
      voice: true
    },
    scarecrow: {
      label: 'Scarecrow',
      points: 120,
      width: 56,
      height: 110,
      sound: 'whirl',
      reaction: 'spin' // spins, loses hat
    },
    buckets: {
      label: 'Bucket Stack',
      points: 90,
      width: 60,
      height: 90,
      sound: 'clatter',
      reaction: 'scatter' // topples like bowling pins
    },
    sprinkler: {
      label: 'Sprinkler',
      points: 110,
      width: 50,
      height: 46,
      sound: 'spray',
      reaction: 'haywire'
    },
    golfcart: {
      label: 'Golf Cart',
      points: 180,
      width: 100,
      height: 74,
      sound: 'honk',
      reaction: 'flip'
    },
    picnic: {
      label: 'Napping Creature',
      points: 160,
      width: 96,
      height: 60,
      sound: 'gasp',
      reaction: 'flip',
      voice: true
    },
    // Not scored — a gameplay modifier that bounces the ball with a multiplier.
    trampoline: {
      label: 'Trampoline',
      points: 0,
      width: 90,
      height: 30,
      sound: 'sproing',
      reaction: 'bounce',
      bounce: 1.35, // velocity multiplier applied on contact
      comboBonus: true // hitting it raises the combo multiplier for the shot
    },
    // A creature that patrols left/right — a timing challenge. `patrol` is how
    // far it roams from its home x; `speed` sets the pace.
    movingcreature: {
      label: 'Runaway Creature',
      points: 220,
      width: 60,
      height: 80,
      sound: 'boing',
      reaction: 'launch',
      voice: true,
      moving: true,
      patrol: 130,
      speed: 1.5
    },
    // A high-floating jackpot: you have to loft a shot to reach it. `float` is
    // the height (world units) of the balloon's underside above the ground.
    balloon: {
      label: 'Jackpot Balloon',
      points: 400,
      width: 66,
      height: 78,
      sound: 'pop',
      reaction: 'pop',
      jackpot: true,
      float: 250
    },
    // A duck pond: the ball SKIPS off it (like a stone), ducks scatter, and you
    // score — a fun beat instead of a dead stop. `skip` bounces the ball onward.
    water: {
      label: 'Duck Pond',
      points: 120,
      width: 240,
      height: 22,
      sound: 'splash',
      reaction: 'skip',
      pond: true,
      skip: 0.5
    },
    // A crate that detonates when hit, area-smashing nearby props — chain it!
    tnt: {
      label: 'TNT Crate',
      points: 130,
      width: 64,
      height: 60,
      sound: 'explode',
      reaction: 'blast',
      blast: 150 // area-smash radius (world units)
    },
    // A beehive: whack it and the bees swarm out.
    beehive: {
      label: 'Beehive',
      points: 170,
      width: 56,
      height: 72,
      sound: 'buzz',
      reaction: 'swarm'
    },
    // A defensive obstacle: the oversized catcher/net kicks normal hits back
    // toward the tee. The operator is decorative; the catapult stays on.
    catapult: {
      label: 'Catapult Crew',
      points: 0,
      width: 170,
      height: 170,
      sound: 'clatter',
      reaction: 'fling',
      catapult: true,
      fling: 0.82,
      operator: { x: -64, y: 0, width: 38, height: 78 },
      catcher: { x: 45, y: 72, width: 144, height: 100 }
    }
  };

  function getPropType(type) {
    return PROP_TYPES[type] || null;
  }

  /** Points for a prop type (0 if unknown or non-scoring). */
  function propPoints(type) {
    const t = PROP_TYPES[type];
    return t ? t.points : 0;
  }

  /**
   * Axis-aligned hit test between a circle (ball) and a prop's box.
   * prop: { x, y, type } with (x, y) = bottom-centre on the ground.
   * Coordinate convention matches physics: y is HEIGHT above ground (up = +y),
   * so the box spans from the ground (prop.y) up to prop.y + height.
   * Returns true if the circle overlaps the box.
   */
  function hitsProp(ballX, ballY, radius, prop) {
    const t = PROP_TYPES[prop.type];
    if (!t) return false;
    const left = prop.x - t.width / 2;
    const right = prop.x + t.width / 2;
    const bottom = prop.y; // ground level
    const top = prop.y + t.height; // top of the prop, up in the air
    // Closest point on the box to the circle centre.
    const cx = Math.max(left, Math.min(ballX, right));
    const cy = Math.max(bottom, Math.min(ballY, top));
    const dx = ballX - cx;
    const dy = ballY - cy;
    return dx * dx + dy * dy <= radius * radius;
  }


  function hitsPropRegion(ballX, ballY, radius, prop, region) {
    const left = prop.x + region.x - region.width / 2;
    const right = prop.x + region.x + region.width / 2;
    const bottom = prop.y + region.y;
    const top = prop.y + region.y + region.height;
    const cx = Math.max(left, Math.min(ballX, right));
    const cy = Math.max(bottom, Math.min(ballY, top));
    const dx = ballX - cx;
    const dy = ballY - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  function hitsCatapultCatcher(ballX, ballY, radius, prop) {
    const t = PROP_TYPES[prop.type];
    return !!(t && t.catcher && hitsPropRegion(ballX, ballY, radius, prop, t.catcher));
  }

  const api = { PROP_TYPES, getPropType, propPoints, hitsProp, hitsCatapultCatcher };

  global.GS = global.GS || {};
  global.GS.Props = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
