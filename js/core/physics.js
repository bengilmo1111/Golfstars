/**
 * Physics — projectile stepping for the ball.
 * Coordinate convention (world units):
 *   x increases downrange (to the right).
 *   y is HEIGHT above the ground; ground is y = 0, up is +y.
 * Deterministic and side-effect-free apart from mutating the passed ball, so it
 * is straightforward to unit-test.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    gravity: 1400, // world units / s^2, pulls the ball down
    restitution: 0.5, // vertical energy kept on a ground bounce
    groundFriction: 0.72, // horizontal speed kept per ground bounce/roll tick
    airDrag: 0.0008, // per-step velocity damping in the air
    minRestSpeed: 22, // below this, a grounded ball is considered at rest
    maxSpeed: 4200
  };

  function clampSpeed(ball, maxSpeed) {
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > maxSpeed) {
      const k = maxSpeed / s;
      ball.vx *= k;
      ball.vy *= k;
    }
  }

  /**
   * Advance the ball by dt seconds. `opts` may override DEFAULTS and supply
   * per-ball modifiers:
   *   restitution, groundFriction, gravity, airDrag  — tuning
   *   boomerangAccel — horizontal accel (world/s^2) pulling vx toward negative,
   *                    engaged only while airborne and moving downrange.
   * Returns an event string when something notable happens this step:
   *   'bounce' on a ground bounce, 'rest' when the ball comes to rest, else ''.
   */
  function stepBall(ball, dt, opts) {
    if (ball.resting) return 'rest';
    const cfg = Object.assign({}, DEFAULTS, opts || {});

    // Integrate velocity.
    ball.vy -= cfg.gravity * dt; // gravity reduces height velocity
    if (cfg.boomerangAccel && ball.y > 0) {
      ball.vx -= cfg.boomerangAccel * dt;
    }
    // Wind pushes the airborne ball sideways (per-level, +right / -left).
    if (cfg.wind && ball.y > 0) {
      ball.vx += cfg.wind * dt;
    }
    // Air drag.
    const drag = 1 - cfg.airDrag * (Math.hypot(ball.vx, ball.vy) * dt);
    ball.vx *= drag;
    ball.vy *= drag;
    clampSpeed(ball, cfg.maxSpeed);

    // Integrate position.
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    let event = '';
    const spin = cfg.spin || 0; // -1 backspin .. +1 topspin

    // Ground collision.
    if (ball.y <= 0) {
      ball.y = 0;
      if (ball.vy < 0) {
        const impact = -ball.vy;
        // Bounce if moving down with enough speed, else settle to rolling.
        if (impact > cfg.minRestSpeed) {
          ball.vy = impact * cfg.restitution;
          ball.vx *= cfg.groundFriction;
          // Spin bites on the bounce: topspin drives forward, backspin checks
          // it (and can spin the ball back toward the tee).
          if (spin) ball.vx += spin * impact * 0.5;
          event = 'bounce';
        } else {
          ball.vy = 0;
        }
      }
      // Rolling friction while grounded (topspin rolls out, backspin grabs).
      if (ball.vy === 0) {
        let fr = cfg.groundFriction;
        if (spin) fr = Math.max(0.4, Math.min(0.98, fr * (1 - 0.12 * spin)));
        ball.vx *= Math.pow(fr, dt * 12);
        if (Math.abs(ball.vx) < cfg.minRestSpeed) {
          ball.vx = 0;
          ball.resting = true;
          event = 'rest';
        }
      }
    }

    return event;
  }

  /**
   * Predict the trajectory from a starting state for the aim preview.
   * Returns an array of {x, y} sample points (does not mutate inputs).
   */
  function predictTrajectory(x0, y0, vx0, vy0, opts, steps, dt) {
    steps = steps || 34;
    dt = dt || 1 / 30;
    const ball = { x: x0, y: y0, vx: vx0, vy: vy0, radius: 0, resting: false };
    const pts = [{ x: ball.x, y: ball.y }];
    for (let i = 0; i < steps; i++) {
      const ev = stepBall(ball, dt, opts);
      pts.push({ x: ball.x, y: ball.y });
      if (ev === 'rest') break;
    }
    return pts;
  }

  /**
   * Convert a slingshot drag vector into a launch velocity.
   * dragX/dragY are screen-space drag from ball to current pointer (down = +y
   * on screen). Pulling back-and-down launches forward-and-up.
   * `power` scales the whole thing; result is clamped to maxLaunch.
   */
  function launchFromDrag(dragX, dragY, power, maxLaunch) {
    power = power == null ? 3.2 : power;
    maxLaunch = maxLaunch || 2200;
    // Invert: launch opposite to the drag direction.
    let vx = -dragX * power;
    let vy = dragY * power; // screen y-down drag -> upward launch (+height)
    const s = Math.hypot(vx, vy);
    if (s > maxLaunch) {
      const k = maxLaunch / s;
      vx *= k;
      vy *= k;
    }
    return { vx, vy };
  }

  const api = { DEFAULTS, stepBall, predictTrajectory, launchFromDrag };

  global.GS = global.GS || {};
  global.GS.Physics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
