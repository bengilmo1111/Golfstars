/**
 * Game — the browser glue: canvas loop, camera, slingshot input, screen state
 * machine, and HUD. Pure rules live in js/core/*; this file orchestrates them.
 * A small programmatic API is exposed on GS.game for the e2e smoke test.
 */
(function (global) {
  'use strict';

  const { Physics, Scoring, Props, Levels, Characters, Unlocks, Storage, Render, Audio } = global.GS;

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

  function updateAimVelocity() {
    const power = state.clubDef.power * 3;
    const v = Physics.launchFromDrag(state.aim.dragX, state.aim.dragY, power, 2600);
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
        }
        continue;
      }

      // Water hazard: getting caught voids the shot.
      if (def.hazard) {
        if (!state.round.voided && Props.hitsProp(ball.x, ball.y, ball.radius, prop)) {
          state.round.voidShot();
          ball.vx = 0;
          ball.vy = 0;
          ball.resting = true;
          prop.hitT = 0;
          Audio.play('splash');
          spawnSplash(ball.x);
          spawnFloater(ball.x, def.height + 20, 'SPLASH!', '#7ad0ff');
        }
        continue;
      }

      if (prop.hit) continue;
      if (Props.hitsProp(ball.x, ball.y, ball.radius, prop)) {
        smashProp(prop);
        // Exploding ball area-smash.
        if (state.ballDef.explodeRadius) {
          Audio.play('explode');
          spawnExplosion(ball.x, ball.y);
          for (const other of state.props) {
            if (other === prop || other.hit || other.type === 'trampoline') continue;
            const d = Math.hypot(other.x - ball.x, Props.getPropType(other.type).height / 2 - ball.y);
            if (d <= state.ballDef.explodeRadius) smashProp(other);
          }
        }
      }
    }
  }

  function smashProp(prop) {
    const def = Props.getPropType(prop.type);
    prop.hit = true;
    prop.hitT = 0;
    const res = state.round.registerHit(prop.type);
    Audio.play(def.sound);
    // Extra sparkle as the live combo builds.
    if (res.combo >= 2) Audio.play('combo');
    if (def.voice && state.character) Audio.voice(state.character.voicePitch + 60, 'hurt');
    const burstY = def.jackpot ? prop.y + def.height * 0.5 : def.height * 0.6;
    spawnBurst(prop.x, burstY, def.jackpot ? 20 : 12);
    if (res.awarded > 0) {
      const label = '+' + res.awarded + (res.multiplier > 1 ? ' x' + res.multiplier.toFixed(1) : '');
      const y = (def.jackpot ? prop.y + def.height : def.height) + 10;
      spawnFloater(prop.x, y, label, def.jackpot ? '#ffd23f' : '#ffe38a');
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
        if (ev === 'bounce') Audio.play('land');
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
    // On-screen depth UI: wind indicator + live combo meter.
    Render.drawWind(ctx, W, H, (state.level && state.level.wind) || 0);
    Render.drawComboMeter(ctx, W, H, state.round);
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
    const { isBest, prevCareer, state: save } = storage.recordRound(state.level.id, score);
    state.save = save;
    const gained = Unlocks.newlyUnlocked(prevCareer, save.careerScore);
    Audio.play('cheer');
    renderResults(score, isBest, gained);
    showScreen('results');
  }

  function renderResults(score, isBest, gained) {
    $('#result-level').textContent = state.level.name;
    $('#result-score').textContent = score;
    $('#result-best').textContent = storage.getBest(state.level.id);
    $('#result-bestflag').style.display = isBest ? 'inline' : 'none';
    const comboEl = $('#result-combo');
    if (comboEl) {
      comboEl.textContent = state.round.bestCombo >= 2 ? '🔥 Best combo: x' + state.round.bestCombo : '';
    }
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
    const nextIdx = state.levelIndex + 1;
    $('#btn-next').style.display = Levels.getLevel(nextIdx) ? 'inline-block' : 'none';
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

  function buildLevelSelect() {
    state.save = storage.load();
    const wrap = $('#level-list');
    wrap.innerHTML = '';
    Levels.LEVELS.forEach((lvl, idx) => {
      const best = state.save.best[lvl.id] || 0;
      const btn = document.createElement('button');
      btn.className = 'card level-card';
      btn.innerHTML =
        '<div class="card-name">' + lvl.name + '</div>' +
        '<div class="card-blurb">' + lvl.shots + ' shots · best ' + best + '</div>';
      btn.onclick = () => {
        Audio.unlock();
        Audio.play('ui');
        startLevel(idx);
      };
      wrap.appendChild(btn);
    });
  }

  function buildLeaderboard() {
    state.save = storage.load();
    const wrap = $('#board-list');
    wrap.innerHTML = '';
    Levels.LEVELS.forEach((lvl) => {
      const li = document.createElement('li');
      li.innerHTML = '<span>' + lvl.name + '</span><b>' + (state.save.best[lvl.id] || 0) + '</b>';
      wrap.appendChild(li);
    });
    $('#board-career').textContent = state.save.careerScore;
    const ub = Unlocks.unlockedBalls(state.save.careerScore).length;
    const uc = Unlocks.unlockedClubs(state.save.careerScore).length;
    $('#board-unlocks').textContent = ub + ' balls · ' + uc + ' clubs';
  }

  // ---------- Loop ----------
  let lastT = 0;
  function loop(ts) {
    const t = ts / 1000;
    let dt = lastT ? t - lastT : 0;
    lastT = t;
    dt = Math.min(dt, 0.05); // clamp big frame gaps
    if (state.screen === 'play') {
      update(dt);
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
      const power = state.clubDef.power * 3;
      const v = Physics.launchFromDrag(dragX, dragY, power, 2600);
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
