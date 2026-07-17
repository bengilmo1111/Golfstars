/**
 * Render — all drawing is procedural on a 2D canvas (no image assets).
 * The game loop builds a `view` transform (world -> screen) and hands the world
 * state to these helpers. Style: chunky shapes, squash-and-stretch, cartoon.
 * Browser-only.
 */
(function (global) {
  'use strict';

  const Props = global.GS.Props;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // ---------- Background ----------
  function drawBackground(ctx, W, H, view, level, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, level.sky[0]);
    g.addColorStop(1, level.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Parallax hills.
    const camX = view.camX;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let layer = 0; layer < 2; layer++) {
      const p = 0.2 + layer * 0.25;
      const baseY = view.groundScreenY - 40 - layer * 30;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = -100; x <= W + 100; x += 40) {
        const wx = (x + camX * p) * 0.5;
        const y = baseY + Math.sin(wx * 0.01 + layer) * 26;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    // Clouds (or moon glow on dark levels).
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 260 - camX * 0.15) % (W + 200) + W + 200) % (W + 200) - 100;
      const cy = 60 + (i % 3) * 40;
      cloud(ctx, cx, cy, 26 + (i % 2) * 8);
    }
  }

  function cloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 6, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 8, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround(ctx, W, H, view, level) {
    const gy = view.groundScreenY;
    ctx.fillStyle = level.ground;
    ctx.fillRect(0, gy, W, H - gy);
    // Darker strip.
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, gy, W, 6);
    // Distance markers every 500 world units.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = 500; d <= level.length + 500; d += 500) {
      const s = view.toScreen(view.teeX + d, 0);
      if (s.x > -30 && s.x < W + 30) {
        ctx.fillRect(s.x - 1, gy, 2, 14);
        ctx.fillText(d + 'm', s.x, gy + 30);
      }
    }
  }

  // ---------- Creature (shared by character + creature props) ----------
  // opts: { body, belly, eye, squash (0..1 wide), rot, scale, blink }
  function drawCreature(ctx, sx, sy, r, opts) {
    opts = opts || {};
    const body = opts.body || '#39d3c0';
    const belly = opts.belly || '#bff6ee';
    const eye = opts.eye || '#20303a';
    const squashX = 1 + (opts.squash || 0);
    const squashY = 1 - (opts.squash || 0) * 0.6;
    ctx.save();
    ctx.translate(sx, sy);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.scale((opts.scale || 1) * squashX, (opts.scale || 1) * squashY);

    // Shadow-ish feet.
    ctx.fillStyle = body;
    // Body (egg).
    ctx.beginPath();
    ctx.ellipse(0, -r, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly.
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.85, r * 0.6, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stubby arms.
    ctx.strokeStyle = body;
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = 'round';
    const armWave = opts.arm || 0;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r);
    ctx.lineTo(-r * 1.25, -r + Math.sin(armWave) * r * 0.4);
    ctx.moveTo(r * 0.8, -r);
    ctx.lineTo(r * 1.25, -r + Math.cos(armWave) * r * 0.4);
    ctx.stroke();
    // Eye (one big central eye).
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -r * 1.15, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    if (!opts.blink) {
      ctx.fillStyle = eye;
      const lookX = (opts.look || 0) * r * 0.15;
      ctx.beginPath();
      ctx.arc(lookX, -r * 1.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = eye;
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 1.15);
      ctx.lineTo(r * 0.2, -r * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Props ----------
  function drawProp(ctx, view, prop, t) {
    const type = prop.type;
    const def = Props.getPropType(type);
    if (!def) return;
    const base = view.toScreen(prop.x, 0);
    const s = view.scale;
    const w = def.width * s;
    const h = def.height * s;
    // Animation progress since hit (seconds); undefined if not hit.
    const a = prop.hitT != null ? prop.hitT : -1;

    ctx.save();
    ctx.translate(base.x, base.y);

    switch (type) {
      case 'cartcreature':
        drawCartCreature(ctx, w, h, a, prop);
        break;
      case 'portaloo':
        drawPortaloo(ctx, w, h, a);
        break;
      case 'scarecrow':
        drawScarecrow(ctx, w, h, a);
        break;
      case 'buckets':
        drawBuckets(ctx, w, h, a);
        break;
      case 'sprinkler':
        drawSprinkler(ctx, w, h, a, t);
        break;
      case 'golfcart':
        drawGolfcart(ctx, w, h, a);
        break;
      case 'picnic':
        drawPicnic(ctx, w, h, a, prop);
        break;
      case 'trampoline':
        drawTrampoline(ctx, w, h, a);
        break;
    }
    ctx.restore();
  }

  function drawCartCreature(ctx, w, h, a, prop) {
    const r = h * 0.28;
    if (a < 0) {
      drawCreature(ctx, 0, 0, r, { body: '#ff8a3d', belly: '#ffd9b8', arm: performance.now() / 200 });
    } else {
      // Launched: cartwheel up and to the right, fade.
      const p = Math.min(1, a / 1.2);
      const x = p * 120;
      const y = -Math.sin(p * Math.PI) * 200 - p * 40;
      ctx.globalAlpha = 1 - p * 0.7;
      drawCreature(ctx, x, y, r, { body: '#ff8a3d', belly: '#ffd9b8', rot: a * 12, squash: 0.2 });
      ctx.globalAlpha = 1;
    }
  }

  function drawPortaloo(ctx, w, h, a) {
    ctx.fillStyle = '#2f9e6a';
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = '#26855a';
    ctx.fillRect(-w / 2, -h, w, 10);
    // Door.
    const doorSwing = a < 0 ? 0 : Math.min(1, a * 4) * 1.4;
    ctx.save();
    ctx.translate(-w / 2 + 6, -h + 6);
    ctx.rotate(-doorSwing);
    ctx.fillStyle = '#37b57c';
    ctx.fillRect(0, 0, w - 16, h - 12);
    ctx.fillStyle = '#1c5c3f';
    ctx.beginPath();
    ctx.arc(w - 24, (h - 12) / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (a >= 0) {
      const p = Math.min(1, a / 1.2);
      const y = -h * 0.5 - Math.sin(p * Math.PI) * 120;
      ctx.globalAlpha = 1 - p * 0.6;
      drawCreature(ctx, p * 60, y, h * 0.16, { body: '#b46cff', belly: '#e9d4ff', rot: a * 9 });
      ctx.globalAlpha = 1;
    }
  }

  function drawScarecrow(ctx, w, h, a) {
    const spin = a < 0 ? 0 : a * 14;
    ctx.save();
    ctx.rotate(Math.sin(spin) * 0.2 + (a < 0 ? 0 : spin * 0.05));
    // Post.
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = w * 0.16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.moveTo(-w * 0.5, -h * 0.7);
    ctx.lineTo(w * 0.5, -h * 0.7);
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#e6c86a';
    ctx.beginPath();
    ctx.arc(0, -h + 4, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a10';
    ctx.beginPath();
    ctx.arc(-w * 0.1, -h + 2, 2.4, 0, Math.PI * 2);
    ctx.arc(w * 0.1, -h + 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Hat flies off when hit.
    ctx.fillStyle = '#7a4a20';
    if (a < 0) {
      ctx.beginPath();
      ctx.ellipse(0, -h - w * 0.18, w * 0.34, w * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const p = Math.min(1, a / 1.2);
      ctx.save();
      ctx.translate(p * 70, -h - Math.sin(p * Math.PI) * 90);
      ctx.rotate(a * 10);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.34, w * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBuckets(ctx, w, h, a) {
    const bw = w * 0.7;
    const bh = h / 3.4;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      let dx = 0;
      let dy = -i * bh * 1.05;
      let rot = 0;
      if (a >= 0) {
        const p = Math.min(1, a * 2.2);
        dx = (i - 1) * p * 40 + p * 20;
        dy += -Math.sin(p * Math.PI) * 30 * (i + 1);
        rot = p * (i + 1) * 0.9;
      }
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      ctx.fillStyle = i % 2 ? '#ff5d5d' : '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-bw / 2, 0);
      ctx.lineTo(bw / 2, 0);
      ctx.lineTo(bw / 2.4, -bh);
      ctx.lineTo(-bw / 2.4, -bh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSprinkler(ctx, w, h, a, t) {
    ctx.fillStyle = '#4a4a55';
    ctx.fillRect(-w * 0.14, -h * 0.5, w * 0.28, h * 0.5);
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    const haywire = a >= 0;
    const n = haywire ? 14 : 6;
    ctx.strokeStyle = 'rgba(140,210,255,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n - 0.5) * (haywire ? 3.2 : 1.2) + Math.sin(t * 6 + i) * (haywire ? 0.6 : 0.1);
      const len = (haywire ? 40 : 22) + Math.sin(t * 8 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(Math.cos(ang) * len, -h * 0.5 + Math.sin(ang) * len);
      ctx.stroke();
    }
  }

  function drawGolfcart(ctx, w, h, a) {
    ctx.save();
    if (a >= 0) {
      const p = Math.min(1, a / 1.0);
      ctx.translate(0, -Math.sin(p * Math.PI) * 60);
      ctx.rotate(p * 2.6);
    }
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(-w / 2, -h * 0.6, w, h * 0.45);
    // Roof.
    ctx.fillRect(-w * 0.4, -h, w * 0.7, 8);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, -h);
    ctx.lineTo(-w * 0.34, -h * 0.6);
    ctx.moveTo(w * 0.28, -h);
    ctx.lineTo(w * 0.3, -h * 0.6);
    ctx.stroke();
    // Wheels.
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-w * 0.28, -h * 0.1, h * 0.14, 0, Math.PI * 2);
    ctx.arc(w * 0.28, -h * 0.1, h * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPicnic(ctx, w, h, a, prop) {
    // Table.
    ctx.fillStyle = '#a9713e';
    ctx.fillRect(-w / 2, -h * 0.5, w, h * 0.18);
    ctx.fillRect(-w * 0.4, -h * 0.5, 8, h * 0.5);
    ctx.fillRect(w * 0.32, -h * 0.5, 8, h * 0.5);
    // Napping creature on top (or flung awake).
    const r = h * 0.28;
    if (a < 0) {
      drawCreature(ctx, 0, -h * 0.5, r, { body: '#39d3c0', belly: '#bff6ee', blink: true, squash: 0.35 });
    } else {
      const p = Math.min(1, a / 1.2);
      const y = -h * 0.5 - Math.sin(p * Math.PI) * 150;
      ctx.globalAlpha = 1 - p * 0.6;
      drawCreature(ctx, p * 50, y, r, { body: '#39d3c0', belly: '#bff6ee', rot: a * 11 });
      ctx.globalAlpha = 1;
    }
  }

  function drawTrampoline(ctx, w, h, a) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w * 0.4, -h);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w * 0.4, -h);
    ctx.stroke();
    // Bouncy mat, dips when recently hit.
    const dip = a >= 0 && a < 0.25 ? Math.sin(a * 12) * 10 : 0;
    ctx.strokeStyle = '#ff4d9d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h);
    ctx.quadraticCurveTo(0, -h + dip + 14, w * 0.4, -h);
    ctx.stroke();
  }

  // ---------- Ball ----------
  function drawBall(ctx, view, ball, ballDef, trail) {
    const s = view.scale;
    // Trail.
    if (trail && trail.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const p = view.toScreen(trail[i].x, trail[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    const p = view.toScreen(ball.x, ball.y);
    const r = (ballDef.radius || 16) * s;
    // Squash-and-stretch along velocity.
    const spd = Math.hypot(ball.vx, ball.vy);
    const stretch = Math.min(0.5, spd / 3000);
    const ang = Math.atan2(-ball.vy, ball.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.scale(1 + stretch, 1 - stretch * 0.6);
    ctx.fillStyle = ballDef.color || '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Dimple hint.
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(r * 0.3, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Aim ----------
  function drawAim(ctx, view, ballScreen, dragX, dragY, trajectory) {
    // Slingshot band from ball to (ball - drag).
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ballScreen.x, ballScreen.y);
    ctx.lineTo(ballScreen.x - dragX, ballScreen.y - dragY);
    ctx.stroke();
    // Dashed predicted arc.
    if (trajectory && trajectory.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 1; i < trajectory.length; i += 2) {
        const s = view.toScreen(trajectory[i].x, trajectory[i].y);
        const rad = Math.max(1.5, 4 - i * 0.08);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- Particles & floating score text ----------
  function drawParticles(ctx, view, particles) {
    for (const p of particles) {
      const s = view.toScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * view.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(ctx, view, floaters) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px system-ui, sans-serif';
    for (const f of floaters) {
      const s = view.toScreen(f.x, f.y);
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color || '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, s.x, s.y - (1 - f.life / f.maxLife) * 40);
      ctx.fillText(f.text, s.x, s.y - (1 - f.life / f.maxLife) * 40);
    }
    ctx.globalAlpha = 1;
  }

  function drawTee(ctx, view, character, swingT) {
    const base = view.toScreen(view.teeX, 0);
    // Tee peg.
    ctx.fillStyle = '#eee';
    ctx.fillRect(base.x - 2, base.y - 14 * view.scale, 4, 14 * view.scale);
    // Character beside the tee doing a squash on swing.
    const squash = swingT > 0 ? Math.sin(swingT * 12) * 0.25 : 0;
    drawCreature(ctx, base.x - 34 * view.scale, base.y, 20 * view.scale, {
      body: character.body,
      belly: character.belly,
      eye: character.eye,
      squash: Math.max(0, squash),
      arm: performance.now() / 160,
      look: 1
    });
  }

  const api = {
    drawBackground,
    drawGround,
    drawCreature,
    drawProp,
    drawBall,
    drawAim,
    drawParticles,
    drawFloaters,
    drawTee,
    lerp
  };

  global.GS = global.GS || {};
  global.GS.Render = api;
})(typeof window !== 'undefined' ? window : globalThis);
