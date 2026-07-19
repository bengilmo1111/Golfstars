/**
 * Game — the browser glue: canvas loop, camera, slingshot input, screen state
 * machine, and HUD. Pure rules live in js/core/*; this file orchestrates them.
 * A small programmatic API is exposed on GS.game for the e2e smoke test.
 */
(function (global) {
  'use strict';

  const { Physics, Scoring, Props, Levels, Characters, Unlocks, Storage, Render, Audio, Challenges } = global.GS;

  const storage = Storage.createStorage();

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.add('active');
    state.screen = name;
    const playing = name === 'play';
    $('#hud').style.display = playing ? 'flex' : 'none';
    const spinBar = $('#spin-bar');
    if (spinBar) spinBar.style.display = playing ? 'flex' : 'none';
    // Menu screens use the title theme; play uses the level track (set in
    // startLevel); results keeps the level's music playing.
    if (Audio.playLevel && name !== 'play' && name !== 'results') Audio.playLevel('title');
  }

  // ---------- Game state ----------
  const state = {
    screen: 'title',
    save: storage.load(),
    level: null,
    round: null,
    props: [],
    ball: null,
    ballDef: null,
    clubDef: null,
    character: null,
    shotsLeft: 0,
    phase: 'ready', // ready | aiming | flight | settling | over
    aim: null, // { startX, startY, dragX, dragY, vx, vy, traj }
    trail: [],
    particles: [],
    floaters: [],
    camX: 0,
    groundScreenY: 0,
    scale: 1,
    swingT: 0,
    flightTime: 0,
    shotStartX: 0,
    lastSummary: null,
    spin: 0, // -1 backspin, 0 none, +1 topspin
    worldTime: 0
  };

  // ---------- Game feel / juice ----------
  // Screen shake, hit-stop (brief freeze), slow-mo, camera punch, and flash.
  const fx = {
    shake: 0, // current shake magnitude (px)
    flash: 0, // full-screen flash alpha 0..1
    flashColor: '#fff',
    timeScale: 1, // gameplay speed (slow-mo < 1)
    slowmoTimer: 0,
    slowmoScale: 1,
    hitstop: 0, // seconds of full freeze remaining
    zoom: 1, // camera punch multiplier
    comboPulse: 0 // combo-meter pop 0..1
  };
  function fxShake(a) {
    fx.shake = Math.min(24, Math.max(fx.shake, a));
  }
  function fxFlash(a, color) {
    fx.flash = Math.max(fx.flash, a);
    if (color) fx.flashColor = color;
  }
  function fxHitstop(s) {
    fx.hitstop = Math.max(fx.hitstop, s);
  }
  function fxSlowmo(scale, dur) {
    fx.slowmoScale = scale;
    fx.slowmoTimer = Math.max(fx.slowmoTimer, dur);
  }
  function fxPunch(a) {
    fx.zoom = Math.max(fx.zoom, 1 + a);
  }
  function updateFx(rdt) {
    fx.shake = Math.max(0, fx.shake - rdt * (fx.shake * 9 + 16));
    fx.flash = Math.max(0, fx.flash - rdt * 3);
    fx.comboPulse = Math.max(0, fx.comboPulse - rdt * 4);
    fx.zoom = fx.zoom + (1 - fx.zoom) * Math.min(1, rdt * 8);
    if (fx.slowmoTimer > 0) {
      fx.slowmoTimer -= rdt;
      fx.timeScale = fx.slowmoTimer > 0 ? fx.slowmoScale : 1;
    } else {
      fx.timeScale = 1;
    }
  }

  let canvas, ctx, W, H, DPR;

  function resize() {
    canvas = $('#game');
    DPR = Math.min(2, global.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Scale so we always frame ~560 world-units of height (keeps the ball and
    // the tee readable) AND up to ~900 world-units of width. Taking the min of
    // the two means a wide landscape viewport zooms out to reveal much more of
    // the course down-range, while portrait stays comfortably framed.
    state.scale = clamp(Math.min(W / 900, (H - 120) / 560), 0.45, 1.1);
    state.groundScreenY = H - 96;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Build the world -> screen transform for the current frame.
  function makeView() {
    const scale = state.scale;
    const camX = state.camX;
    const gsy = state.groundScreenY;
    return {
      scale,
      camX,
      teeX: Levels.TEE_X,
      groundScreenY: gsy,
      toScreen(wx, hy) {
        return { x: (wx - camX) * scale, y: gsy - hy * scale };
      }
    };
  }

  // ---------- Round setup ----------
  function startLevel(levelIndex) {
    const level = Levels.getLevel(levelIndex);
    if (!level) return;
    state.levelIndex = levelIndex;
    state.level = level;
    state.character = Characters.getCharacter(state.save.selectedCharacter);
    state.ballDef = Unlocks.getBall(state.save.selectedBall);
    state.clubDef = Unlocks.getClub(state.save.selectedClub);
    state.round = Scoring.createRound(Props.propPoints);
    state.props = level.props.map((p) => {
      const def = Props.getPropType(p.type);
      const homeX = Levels.TEE_X + p.x;
      return {
        type: p.type,
        x: homeX,
        homeX,
        y: def && def.float ? def.float : 0, // balloons sit at their float height
        phase: Math.random() * Math.PI * 2,
        hit: false,
        hitT: null,
        cooldown: 0
      };
    });
    state.shotsLeft = level.shots;
    state.particles = [];
    state.floaters = [];
    state.lastSummary = null;
    state.worldTime = 0;
    state.spin = 0;
    updateSpinButtons();
    teeUpBall();
    state.camX = Levels.TEE_X - (W / 3) / state.scale;
    updateHud();
    if (Audio.playLevel) Audio.playLevel(level.id);
    showScreen('play');
  }

  function teeUpBall() {
    state.ball = { x: Levels.TEE_X, y: 0, vx: 0, vy: 0, radius: state.ballDef.radius, resting: true };
    state.trail = [];
    state.phase = 'ready';
    state.aim = null;
    state.flightTime = 0;
    state.swingT = 0;
    state.pendingShot = null;
  }

  // ---------- Input ----------
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function onDown(e) {
    Audio.unlock();
    if (state.screen !== 'play') return;
    if (state.phase !== 'ready') return;
    const pos = pointerPos(e);
    state.aim = { startX: pos.x, startY: pos.y, dragX: 0, dragY: 0, vx: 0, vy: 0, traj: [] };
    state.phase = 'aiming';
    e.preventDefault();
  }

  function onMove(e) {
    if (state.phase !== 'aiming' || !state.aim) return;
    const pos = pointerPos(e);
    // Drag vector: from press point to current. Pull back to launch forward.
    let dragX = pos.x - state.aim.startX;
    let dragY = pos.y - state.aim.startY;
    // Cap the visible band length.
    const maxDrag = 200;
    const len = Math.hypot(dragX, dragY);
    if (len > maxDrag) {
      dragX *= maxDrag / len;
      dragY *= maxDrag / len;
    }
    state.aim.dragX = dragX;
    state.aim.dragY = dragY;
    updateAimVelocity();
    e.preventDefault();
  }

  // Convert a drag into a launch velocity, applying the club's power and loft.
  function launchVelocity(dragX, dragY) {
    const power = state.clubDef.power * 3;
    const v = Physics.launchFromDrag(dragX, dragY, power, 2600);
    const loft = state.clubDef.loft || 1;
    if (loft !== 1) {
      v.vy *= loft;
      const sp = Math.hypot(v.vx, v.vy);
      if (sp > 2600) {
        const k = 2600 / sp;
        v.vx *= k;
        v.vy *= k;
      }
    }
    return v;
  }

  function updateAimVelocity() {
    const v = launchVelocity(state.aim.dragX, state.aim.dragY);
    state.aim.vx = v.vx;
    state.aim.vy = v.vy;
    state.aim.traj = Physics.predictTrajectory(
      state.ball.x,
      state.ball.y,
      v.vx,
      v.vy,
      ballPhysicsOpts(),
      40,
      1 / 30
    );
  }

  function onUp(e) {
    if (state.phase !== 'aiming' || !state.aim) return;
    const power = Math.hypot(state.aim.dragX, state.aim.dragY);
    if (power < 12) {
      // Tap without a real drag — cancel.
      state.phase = 'ready';
      state.aim = null;
      return;
    }
    fireShot(state.aim.vx, state.aim.vy);
    e && e.preventDefault && e.preventDefault();
  }

  function ballPhysicsOpts() {
    return Object.assign({}, state.ballDef.physics, {
      wind: (state.level && state.level.wind) || 0,
      spin: state.spin || 0
    });
  }

  // Impact happens partway through the swing so the club connects with the ball.
  const IMPACT_T = 0.12;

  // Begin a shot: the golfer swings, and the ball launches at impact (see
  // launchPending). Exposed for the smoke test.
  function fireShot(vx, vy) {
    if (state.phase !== 'ready' && state.phase !== 'aiming') return false;
    if (state.shotsLeft <= 0) return false;
    state.pendingShot = { vx, vy };
    state.phase = 'windup';
    state.aim = null;
    state.swingT = 0;
    Audio.play('swing');
    if (state.character) Audio.voice(state.character.voicePitch, 'happy');
    return true;
  }

  // Fired mid-swing: actually send the ball on its way.
  function launchPending() {
    const v = state.pendingShot || { vx: 0, vy: 0 };
    state.ball.vx = v.vx;
    state.ball.vy = v.vy;
    state.ball.resting = false;
    state.phase = 'flight';
    state.flightTime = 0;
    state.shotStartX = state.ball.x;
    state.pendingShot = null;
    state.round.startShot();
    Audio.play('thwack');
    // A little kick on contact.
    fxPunch(0.045);
    fxShake(4);
    spawnDust(state.ball.x);
  }

  // ---------- Collision + effects ----------
  function handleCollisions() {
    const ball = state.ball;
    for (const prop of state.props) {
      const def = Props.getPropType(prop.type);
      if (!def) continue;

      if (prop.type === 'trampoline') {
        prop.cooldown = Math.max(0, prop.cooldown - 1);
        if (prop.cooldown === 0 && Props.hitsProp(ball.x, ball.y, ball.radius, prop) && ball.vy < 0) {
          ball.vy = Math.abs(ball.vy) * def.bounce + 200;
          prop.cooldown = 30;
          prop.hitT = 0;
          state.round.registerHit('trampoline');
          Audio.play('sproing');
          spawnFloater(prop.x, def.height, 'BOING!', '#ff4d9d');
          fxPunch(0.03);
          fxShake(4);
        }
        continue;
      }

      if (def.catapult) {
        prop.cooldown = Math.max(0, prop.cooldown - 1);
        if (prop.cooldown === 0 && Props.hitsCatapultCatcher(ball.x, ball.y, ball.radius, prop)) {
          ball.vx = -Math.max(260, Math.abs(ball.vx) * def.fling);
          ball.vy = Math.abs(ball.vy) * 0.45 + 240;
          prop.cooldown = 36;
          prop.hitT = 0;
          Audio.play('clatter');
          spawnFloater(prop.x + def.catcher.x, def.catcher.y + def.catcher.height, 'FLUNG BACK!', '#ff9b3d');
          fxPunch(0.04);
          fxShake(8);
        }
        continue;
      }

      // Duck pond: the ball SKIPS off it (once for points), ducks scatter.
      if (def.pond) {
        if (!prop.hit && Props.hitsProp(ball.x, ball.y, ball.radius, prop) && ball.vy < 60) {
          const res = state.round.registerHit('water');
          prop.hit = true;
          prop.hitT = 0;
          // Skim the ball onward instead of stopping it dead.
          ball.vy = Math.abs(ball.vy) * def.skip + 150;
          ball.vx *= 0.92;
          Audio.play('splash');
          Audio.play('quack');
          if (res.combo >= 2) Audio.play('combo');
          spawnSplash(ball.x);
          spawnDuckScatter(prop.x);
          if (res.awarded > 0) {
            const label = '+' + res.awarded + (res.multiplier > 1 ? ' x' + res.multiplier.toFixed(1) : '');
            spawnFloater(prop.x, def.height + 22, label, '#7ad0ff');
          }
          fxShake(6);
          fxFlash(0.12, '#7ad0ff');
          fxHitstop(0.03);
        }
        continue;
      }

      if (prop.hit) continue;
      if (Props.hitsProp(ball.x, ball.y, ball.radius, prop)) {
        smashProp(prop);
        // Exploding ball area-smash on first contact.
        if (state.ballDef.explodeRadius) {
          Audio.play('explode');
          spawnExplosion(ball.x, ball.y);
          fxShake(20);
          fxFlash(0.35, '#fff');
          fxHitstop(0.07);
          fxSlowmo(0.35, 0.18);
          areaSmash(ball.x, ball.y, state.ballDef.explodeRadius, prop);
        }
        // TNT crate detonates and takes out its neighbours.
        if (def.blast) {
          spawnExplosion(prop.x, def.height * 0.5);
          fxShake(18);
          fxFlash(0.32, '#ffcaa0');
          fxHitstop(0.06);
          fxSlowmo(0.4, 0.16);
          areaSmash(prop.x, def.height * 0.5, def.blast, prop);
        }
      }
    }
  }

  // Smash every un-hit scoring prop within `radius` of (cx, cy).
  function areaSmash(cx, cy, radius, exclude) {
    for (const other of state.props) {
      if (other === exclude || other.hit) continue;
      const od = Props.getPropType(other.type);
      if (!od || other.type === 'trampoline' || od.pond || od.catapult) continue;
      const d = Math.hypot(other.x - cx, (od.jackpot ? other.y : od.height / 2) - cy);
      if (d <= radius) smashProp(other);
    }
  }

  function smashProp(prop) {
    const def = Props.getPropType(prop.type);
    prop.hit = true;
    prop.hitT = 0;
    const res = state.round.registerHit(prop.type);
    Audio.play(def.sound);
    if (def.voice && state.character) Audio.voice(state.character.voicePitch + 60, 'hurt');
    const burstY = def.jackpot ? prop.y + def.height * 0.5 : def.height * 0.6;
    spawnBurst(prop.x, burstY, def.jackpot ? 20 : 12);
    if (def.reaction === 'swarm') spawnSwarm(prop.x, def.height * 0.7);
    if (res.awarded > 0) {
      const label = '+' + res.awarded + (res.multiplier > 1 ? ' x' + res.multiplier.toFixed(1) : '');
      const y = (def.jackpot ? prop.y + def.height : def.height) + 10;
      spawnFloater(prop.x, y, label, def.jackpot ? '#ffd23f' : '#ffe38a');
    }

    // ----- Juice -----
    fx.comboPulse = 1;
    fxHitstop(0.035);
    fxShake(5 + Math.min(9, res.awarded / 60));
    fxFlash(0.1, '#fff');
    if (def.jackpot) {
      // Balloon jackpot is a big moment.
      Audio.play('combo');
      fxShake(12);
      fxFlash(0.22, '#ffd23f');
      fxHitstop(0.06);
    }
    // Combo milestones get an escalating slow-mo + sparkle.
    if (res.combo >= 2) Audio.play('combo');
    if (res.combo === 3) {
      fxSlowmo(0.4, 0.16);
      fxFlash(0.14, '#ffe38a');
    } else if (res.combo >= 5) {
      fxSlowmo(0.3, 0.26);
      fxShake(14);
      fxFlash(0.24, '#ffe38a');
    }
  }

  function spawnSplash(x) {
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const sp = 80 + Math.random() * 180;
      state.particles.push({
        x,
        y: 6,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a) * sp) + 60,
        r: 2 + Math.random() * 3,
        life: 0.8,
        maxLife: 0.8,
        color: ['#7ad0ff', '#bfeaff', '#fff'][i % 3]
      });
    }
  }

  function spawnDuckScatter(x) {
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      state.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: 10,
        vx: dir * (60 + Math.random() * 120),
        vy: 120 + Math.random() * 120,
        r: 4 + Math.random() * 2,
        life: 1,
        maxLife: 1,
        color: '#ffd23f' // little yellow ducklings
      });
    }
  }

  function spawnSwarm(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 150;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 40,
        r: 2 + Math.random() * 1.5,
        life: 0.9,
        maxLife: 0.9,
        color: i % 2 ? '#2a2a2a' : '#ffd23f' // buzzing bees
      });
    }
  }

  function spawnFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.2, maxLife: 1.2 });
  }

  function spawnBurst(x, y, count) {
    count = count || 12;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a) * sp) + 40,
        r: 2 + Math.random() * 3,
        life: 0.7,
        maxLife: 0.7,
        color: ['#fff', '#ffd23f', '#ff5d8f'][i % 3]
      });
    }
  }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 60,
        r: 3 + Math.random() * 4,
        life: 0.9,
        maxLife: 0.9,
        color: ['#ff6a3d', '#ffd23f', '#fff'][i % 3]
      });
    }
  }

  function spawnDust(x) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 30 + Math.random() * 70;
      state.particles.push({
        x,
        y: 2,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a) * sp) + 20,
        r: 2 + Math.random() * 2,
        life: 0.5,
        maxLife: 0.5,
        color: 'rgba(230,230,220,0.9)'
      });
    }
  }

  // ---------- Update ----------
  const SUBSTEP = 1 / 120;
  function update(dt) {
    state.worldTime += dt;
    // Advance the swing clock through the wind-up and flight.
    if (state.phase === 'windup' || state.phase === 'flight' || state.phase === 'settling') {
      state.swingT += dt;
    }
    // Let the live combo timer decay even between shots.
    if (state.round) state.round.tick(dt);

    updateParticles(dt);
    updateFloaters(dt);
    for (const p of state.props) {
      if (p.hitT != null) p.hitT += dt;
      // Roaming targets patrol left/right until smashed.
      const def = Props.getPropType(p.type);
      if (def && def.moving && !p.hit) {
        p.x = p.homeX + Math.sin((state.worldTime + p.phase) * def.speed) * def.patrol;
      }
    }

    // Mid-swing: release the ball at the moment of impact.
    if (state.phase === 'windup' && state.swingT >= IMPACT_T) {
      launchPending();
    }

    if (state.phase === 'flight') {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(SUBSTEP, remaining);
        remaining -= step;
        const ev = Physics.stepBall(state.ball, step, ballPhysicsOpts());
        handleCollisions();
        if (ev === 'bounce') {
          Audio.play('land');
          spawnDust(state.ball.x);
        }
        if (ev === 'rest') break;
      }
      state.flightTime += dt;
      recordTrail();

      const past = state.ball.x > Levels.TEE_X + state.level.length + 300;
      const behind = state.ball.x < Levels.TEE_X - 200;
      if (state.ball.resting || past || behind || state.flightTime > 14) {
        endShot();
      }
    }

    updateCamera(dt);
  }

  function recordTrail() {
    state.trail.push({ x: state.ball.x, y: state.ball.y });
    if (state.trail.length > 40) state.trail.shift();
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.vy -= 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < 0) {
        p.y = 0;
        p.vy *= -0.4;
        p.vx *= 0.6;
      }
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updateFloaters(dt) {
    for (const f of state.floaters) f.life -= dt;
    state.floaters = state.floaters.filter((f) => f.life > 0);
  }

  function endShot() {
    const distance = state.ball.x - Levels.TEE_X;
    const summary = state.round.endShot(distance);
    state.lastSummary = summary;
    state.shotsLeft -= 1;
    state.phase = 'settling';
    if (summary.shotTotal > 0) {
      spawnFloater(state.ball.x, 60, '+' + summary.shotTotal, '#8affc1');
    }
    updateHud();
    setTimeout(() => {
      if (state.shotsLeft > 0) {
        teeUpBall();
      } else {
        finishRound();
      }
    }, 900);
  }

  function updateCamera(dt) {
    const scale = state.scale;
    // Horizontal: keep the ball ~1/3 from the left.
    let targetCamX = state.ball.x - (W / 3) / scale;
    const minCam = Levels.TEE_X - (W / 3) / scale;
    const maxCam = Levels.TEE_X + state.level.length + 200 - W / scale;
    targetCamX = clamp(targetCamX, minCam, Math.max(minCam, maxCam));
    state.camX = Render.lerp(state.camX, targetCamX, Math.min(1, dt * 6));

    // Vertical: shift the ground down so a high ball stays on screen.
    const ballScreenYStatic = H - 96 - state.ball.y * scale;
    let targetGround = H - 96;
    if (ballScreenYStatic < H * 0.28) {
      targetGround = H - 96 + (H * 0.28 - ballScreenYStatic);
    }
    state.groundScreenY = Render.lerp(state.groundScreenY, targetGround, Math.min(1, dt * 4));
  }

  // ---------- Render frame ----------
  function draw(t) {
    if (!ctx) return;
    const view = makeView();

    // The world is drawn inside a shake + camera-punch transform; the HUD-ish
    // overlays (wind, combo meter, flash) sit outside it so they stay steady.
    ctx.save();
    if (fx.shake > 0.1) {
      ctx.translate((Math.random() * 2 - 1) * fx.shake, (Math.random() * 2 - 1) * fx.shake);
    }
    if (fx.zoom !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(fx.zoom, fx.zoom);
      ctx.translate(-W / 2, -H / 2);
    }
    Render.drawBackground(ctx, W, H, view, state.level, t);
    Render.drawGround(ctx, W, H, view, state.level);
    for (const prop of state.props) Render.drawProp(ctx, view, prop, t);
    Render.drawTee(ctx, view, state.character, {
      swingT: state.swingT,
      aiming: state.phase === 'aiming',
      power: state.aim ? Math.min(1, Math.hypot(state.aim.dragX, state.aim.dragY) / 200) : 0
    });
    Render.drawParticles(ctx, view, state.particles);
    if (state.phase === 'ready' || state.phase === 'windup' || state.phase === 'flight' || state.phase === 'settling') {
      Render.drawBall(ctx, view, state.ball, state.ballDef, state.phase === 'flight' ? state.trail : null);
    }
    if (state.phase === 'aiming' && state.aim) {
      const bs = view.toScreen(state.ball.x, state.ball.y);
      Render.drawBall(ctx, view, state.ball, state.ballDef, null);
      Render.drawAim(ctx, view, bs, -state.aim.dragX, -state.aim.dragY, state.aim.traj);
    }
    Render.drawFloaters(ctx, view, state.floaters);
    ctx.restore();

    // Full-screen flash (explosions, big combos, splashes).
    if (fx.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // On-screen depth UI: wind indicator + live combo meter (steady, with pop).
    Render.drawWind(ctx, W, H, (state.level && state.level.wind) || 0);
    Render.drawComboMeter(ctx, W, H, state.round, fx.comboPulse);
    // Score ticks up live as the combo scores during flight.
    if (state.round) $('#hud-score').textContent = state.round.total;
  }

  // ---------- HUD ----------
  function updateHud() {
    if (!state.round) return;
    $('#hud-score').textContent = state.round.total;
    $('#hud-shots').textContent = state.shotsLeft;
    $('#hud-level').textContent = state.level ? state.level.name : '';
  }

  // ---------- Results ----------
  function finishRound() {
    state.phase = 'over';
    const score = state.round.total;
    const stats = Challenges.statsFromRound(state.round);
    const completed = Challenges.evaluate(state.level.challenges, stats);
    const prevStars = Levels.levelStars(state.level, storage.getBest(state.level.id));
    const rec = storage.recordRound(state.level.id, score, completed);
    state.save = rec.state;
    const gained = Unlocks.newlyUnlocked(rec.prevCareer, rec.state.careerScore);
    const stars = Levels.levelStars(state.level, storage.getBest(state.level.id));
    Audio.play('cheer');
    renderResults(score, rec.isBest, gained, stars, prevStars, rec.newChallenges);
    showScreen('results');
  }

  function renderResults(score, isBest, gained, stars, prevStars, newChallenges) {
    $('#result-level').textContent = state.level.name;
    $('#result-score').textContent = score;
    $('#result-best').textContent = storage.getBest(state.level.id);
    $('#result-bestflag').style.display = isBest ? 'inline' : 'none';

    // Star rating (filled up to `stars`, with the newly-earned ones popping).
    const starsEl = $('#result-stars');
    starsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      const earned = i < stars;
      span.className = 'star' + (earned ? ' earned' : '') + (earned && i >= prevStars ? ' pop' : '');
      span.textContent = earned ? '★' : '☆';
      starsEl.appendChild(span);
    }

    const comboEl = $('#result-combo');
    if (comboEl) {
      comboEl.textContent = state.round.bestCombo >= 2 ? '🔥 Best combo: x' + state.round.bestCombo : '';
    }

    // Challenge checklist for this level.
    const chEl = $('#result-challenges');
    chEl.innerHTML = '';
    const done = storage.getChallenges(state.level.id);
    (state.level.challenges || []).forEach((ch) => {
      const li = document.createElement('li');
      const isDone = !!done[ch.id];
      const isNew = (newChallenges || []).indexOf(ch.id) >= 0;
      li.className = 'challenge' + (isDone ? ' done' : '') + (isNew ? ' just' : '');
      li.textContent = (isDone ? '✓ ' : '○ ') + Challenges.label(ch) + (isNew ? '  NEW!' : '');
      chEl.appendChild(li);
    });

    const shotsEl = $('#result-shots');
    shotsEl.innerHTML = '';
    state.round.shots.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent =
        'Shot ' + (i + 1) + ': ' + s.shotTotal + ' pts' +
        (s.maxMultiplier > 1 ? ' (x' + s.maxMultiplier.toFixed(1) + ')' : '') +
        (s.voided ? ' 💦 splash!' : '') +
        ' — ' + s.distance + 'm';
      shotsEl.appendChild(li);
    });

    const unlockEl = $('#result-unlocks');
    unlockEl.innerHTML = '';
    if (gained.length) {
      $('#result-unlock-wrap').style.display = 'block';
      gained.forEach((g) => {
        const div = document.createElement('div');
        div.className = 'unlock-toast';
        div.textContent = '🎉 New ' + g.kind + ': ' + g.item.name;
        unlockEl.appendChild(div);
      });
    } else {
      $('#result-unlock-wrap').style.display = 'none';
    }

    // Next level is only offered once it's unlocked (needs a star here).
    const nextIdx = state.levelIndex + 1;
    const nextLevel = Levels.getLevel(nextIdx);
    const nextUnlocked = nextLevel && Levels.isUnlocked(nextIdx, (id) => storage.getBest(id));
    $('#btn-next').style.display = nextUnlocked ? 'inline-block' : 'none';
    const hint = $('#result-nexthint');
    if (hint) {
      if (nextLevel && !nextUnlocked) {
        hint.textContent = '🔒 Earn ⭐ (score ' + state.level.stars[0] + '+) to unlock ' + nextLevel.name;
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
    }
  }

  // ---------- Character / Level / Garage screens ----------
  function buildCharacterSelect() {
    const wrap = $('#char-list');
    wrap.innerHTML = '';
    Characters.CHARACTERS.forEach((c) => {
      const card = document.createElement('button');
      card.className = 'card char-card';
      if (state.save.selectedCharacter === c.id) card.classList.add('selected');
      const cv = document.createElement('canvas');
      cv.width = 120;
      cv.height = 120;
      const cx = cv.getContext('2d');
      Render.drawCreature(cx, 60, 100, 34, { body: c.body, belly: c.belly, eye: c.eye, arm: 1 });
      card.appendChild(cv);
      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = c.name;
      card.appendChild(name);
      const blurb = document.createElement('div');
      blurb.className = 'card-blurb';
      blurb.textContent = c.blurb;
      card.appendChild(blurb);
      card.onclick = () => {
        state.save = storage.setSelection({ selectedCharacter: c.id });
        Audio.unlock();
        Audio.play('ui');
        Audio.voice(c.voicePitch, 'happy');
        buildCharacterSelect();
      };
      wrap.appendChild(card);
    });
  }

  function buildGarage() {
    state.save = storage.load();
    const career = state.save.careerScore;
    $('#career-score').textContent = career;

    const ballWrap = $('#ball-list');
    ballWrap.innerHTML = '';
    Unlocks.BALLS.forEach((b) => {
      const unlocked = Unlocks.isUnlocked(b, career);
      const chip = document.createElement('button');
      chip.className = 'chip' + (unlocked ? '' : ' locked') + (state.save.selectedBall === b.id ? ' selected' : '');
      chip.innerHTML = '<b>' + b.name + '</b><span>' + (unlocked ? b.blurb : 'Unlock at ' + b.threshold) + '</span>';
      if (unlocked) {
        chip.onclick = () => {
          state.save = storage.setSelection({ selectedBall: b.id });
          Audio.play('ui');
          buildGarage();
        };
      }
      ballWrap.appendChild(chip);
    });

    const clubWrap = $('#club-list');
    clubWrap.innerHTML = '';
    Unlocks.CLUBS.forEach((c) => {
      const unlocked = Unlocks.isUnlocked(c, career);
      const chip = document.createElement('button');
      chip.className = 'chip' + (unlocked ? '' : ' locked') + (state.save.selectedClub === c.id ? ' selected' : '');
      chip.innerHTML = '<b>' + c.name + '</b><span>' + (unlocked ? c.blurb : 'Unlock at ' + c.threshold) + '</span>';
      if (unlocked) {
        chip.onclick = () => {
          state.save = storage.setSelection({ selectedClub: c.id });
          Audio.play('ui');
          buildGarage();
        };
      }
      clubWrap.appendChild(chip);
    });
  }

  function starString(n) {
    return '★★★☆☆☆'.slice(3 - n, 6 - n);
  }

  function buildLevelSelect() {
    state.save = storage.load();
    const getBest = (id) => state.save.best[id] || 0;
    const wrap = $('#level-list');
    wrap.innerHTML = '';
    Levels.LEVELS.forEach((lvl, idx) => {
      const best = getBest(lvl.id);
      const stars = Levels.levelStars(lvl, best);
      const unlocked = Levels.isUnlocked(idx, getBest);
      const done = state.save.challenges[lvl.id] || {};
      const doneCount = (lvl.challenges || []).filter((c) => done[c.id]).length;
      const total = (lvl.challenges || []).length;
      const btn = document.createElement('button');
      btn.className = 'card level-card' + (unlocked ? '' : ' locked');
      if (unlocked) {
        btn.innerHTML =
          '<div class="card-name">' + lvl.name + ' <span class="lvl-stars">' + starString(stars) + '</span></div>' +
          '<div class="card-blurb">' + lvl.shots + ' shots · best ' + best +
          ' · 🎯 ' + doneCount + '/' + total + '</div>';
        btn.onclick = () => {
          Audio.unlock();
          Audio.play('ui');
          startLevel(idx);
        };
      } else {
        const prev = Levels.getLevel(idx - 1);
        btn.innerHTML =
          '<div class="card-name">🔒 ' + lvl.name + '</div>' +
          '<div class="card-blurb">Earn ⭐ on ' + (prev ? prev.name : 'the previous range') + ' to unlock</div>';
        btn.onclick = () => Audio.play('ui');
      }
      wrap.appendChild(btn);
    });
  }

  function buildLeaderboard() {
    state.save = storage.load();
    const wrap = $('#board-list');
    wrap.innerHTML = '';
    let totalStars = 0;
    Levels.LEVELS.forEach((lvl) => {
      const best = state.save.best[lvl.id] || 0;
      const stars = Levels.levelStars(lvl, best);
      totalStars += stars;
      const li = document.createElement('li');
      li.innerHTML =
        '<span>' + lvl.name + ' <span class="lvl-stars">' + starString(stars) + '</span></span>' +
        '<b>' + best + '</b>';
      wrap.appendChild(li);
    });
    $('#board-career').textContent = state.save.careerScore;
    const ub = Unlocks.unlockedBalls(state.save.careerScore).length;
    const uc = Unlocks.unlockedClubs(state.save.careerScore).length;
    const maxStars = Levels.LEVELS.length * 3;
    $('#board-unlocks').textContent = '⭐ ' + totalStars + '/' + maxStars + ' · ' + ub + ' balls · ' + uc + ' clubs';
  }

  // ---------- Loop ----------
  let lastT = 0;
  function loop(ts) {
    const t = ts / 1000;
    let rdt = lastT ? t - lastT : 0;
    lastT = t;
    rdt = Math.min(rdt, 0.05); // clamp big frame gaps
    updateFx(rdt);
    // Gameplay time: scaled for slow-mo, fully frozen during hit-stop.
    let gdt = rdt * fx.timeScale;
    if (fx.hitstop > 0) {
      fx.hitstop -= rdt;
      gdt = 0;
    }
    if (state.screen === 'play') {
      update(gdt);
      draw(t);
    }
    requestAnimationFrame(loop);
  }

  // ---------- Wire up ----------
  function bindButtons() {
    $('#btn-play').onclick = () => {
      Audio.unlock();
      Audio.play('ui');
      buildCharacterSelect();
      showScreen('charselect');
    };
    $('#btn-char-next').onclick = () => {
      buildGarage();
      showScreen('garage');
    };
    $('#btn-garage-next').onclick = () => {
      buildLevelSelect();
      showScreen('levelselect');
    };
    $('#btn-leaderboard').onclick = () => {
      buildLeaderboard();
      showScreen('leaderboard');
    };
    document.querySelectorAll('[data-back]').forEach((el) => {
      el.onclick = () => showScreen(el.getAttribute('data-back'));
    });
    $('#btn-retry').onclick = () => startLevel(state.levelIndex);
    $('#btn-next').onclick = () => startLevel(state.levelIndex + 1);
    $('#btn-menu').onclick = () => {
      buildLevelSelect();
      showScreen('levelselect');
    };
    $('#btn-quit').onclick = () => {
      buildLevelSelect();
      showScreen('levelselect');
    };
    $('#btn-mute').onclick = () => {
      const m = !Audio.isMuted();
      Audio.setMuted(m);
      $('#btn-mute').textContent = m ? '🔇' : '🔊';
    };
    bindSpin();
    bindFullscreen();
  }

  // ---------- Spin control ----------
  function bindSpin() {
    document.querySelectorAll('.spin-btn').forEach((btn) => {
      btn.onclick = () => {
        state.spin = Number(btn.getAttribute('data-spin'));
        updateSpinButtons();
        Audio.play('ui');
      };
    });
  }

  function updateSpinButtons() {
    document.querySelectorAll('.spin-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.getAttribute('data-spin')) === (state.spin || 0));
    });
  }

  // ---------- Fullscreen ----------
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function fsSupported() {
    const el = document.documentElement;
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      el.requestFullscreen ||
      el.webkitRequestFullscreen
    );
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!fsElement()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const r = req.call(el);
        if (r && r.catch) r.catch(() => {});
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  function refreshFullscreenButtons() {
    const inFs = !!fsElement();
    document.querySelectorAll('.js-fullscreen').forEach((btn) => {
      const isTitleBtn = btn.classList.contains('ghost-btn');
      if (isTitleBtn) {
        btn.textContent = inFs ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
      } else {
        btn.textContent = inFs ? '⤢' : '⛶';
      }
      btn.title = inFs ? 'Exit fullscreen' : 'Toggle fullscreen';
    });
  }

  function bindFullscreen() {
    const buttons = document.querySelectorAll('.js-fullscreen');
    if (!fsSupported()) {
      // iOS iPhone Safari etc. — hide the control (Add to Home Screen covers it).
      buttons.forEach((b) => (b.style.display = 'none'));
      return;
    }
    buttons.forEach((b) => {
      b.onclick = () => {
        Audio.unlock();
        Audio.play('ui');
        toggleFullscreen();
      };
    });
    document.addEventListener('fullscreenchange', refreshFullscreenButtons);
    document.addEventListener('webkitfullscreenchange', refreshFullscreenButtons);
    refreshFullscreenButtons();
  }

  function bindInput() {
    canvas = $('#game');
    canvas.addEventListener('mousedown', onDown);
    global.addEventListener('mousemove', onMove);
    global.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp, { passive: false });
  }

  function init() {
    resize();
    if (global.GS.Images) global.GS.Images.preloadLevels(Levels.LEVELS);
    if (Audio.preloadMusic) Audio.preloadMusic(Levels.LEVELS.map((l) => l.id));
    global.addEventListener('resize', resize);
    bindButtons();
    bindInput();
    showScreen('title');
    requestAnimationFrame(loop);
  }

  // ---------- Programmatic API (used by tests) ----------
  const game = {
    init,
    startLevel,
    fireShot,
    getState() {
      return {
        screen: state.screen,
        score: state.round ? state.round.total : 0,
        shotsLeft: state.shotsLeft,
        phase: state.phase,
        propsHit: state.props.filter((p) => p.hit).length,
        careerScore: state.save.careerScore
      };
    },
    // Aim helper: drag deltas in screen px (down/left = pull back).
    aimAndFire(dragX, dragY) {
      const v = launchVelocity(dragX, dragY);
      return fireShot(v.vx, v.vy);
    },
    resetSave() {
      state.save = storage.reset();
    }
  };

  global.GS.game = game;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
