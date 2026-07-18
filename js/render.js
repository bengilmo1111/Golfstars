/**
 * Render — gameplay drawing is procedural on a 2D canvas, over optional
 * illustrated level backgrounds.
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
    // Base gradient — always drawn, so a missing/loading image degrades gracefully.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, level.sky[0]);
    g.addColorStop(1, level.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const Images = global.GS.Images;
    const bg = Images ? Images.get('bg-' + level.id) : null;
    if (bg) {
      drawParallaxImage(ctx, W, H, view.camX, bg);
      return; // the illustration already includes sky, clouds and distant scenery
    }

    // ---- Procedural fallback (the existing hills + clouds code stays here) ----
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

  // Cover-scale to height and tile horizontally with slow parallax (invisible seam
  // requires uniform sky at the image's left/right edges).
  function drawParallaxImage(ctx, W, H, camX, img) {
    const scale = H / img.height;
    const dw = img.width * scale;
    const parallax = 0.25; // 0 = static, 1 = moves with camera
    let offset = -((camX * parallax) % dw);
    if (offset > 0) offset -= dw;
    for (let x = offset; x < W; x += dw) ctx.drawImage(img, x, 0, dw, H);
  }

  function cloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 6, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 8, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mix a hex colour toward black (amt<0) or white (amt>0); amt in [-1, 1].
  function shade(hex, amt) {
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const n = parseInt(full, 16);
    const target = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const mix = (ch) => Math.round(ch + (target - ch) * p);
    const r = mix((n >> 16) & 255);
    const g = mix((n >> 8) & 255);
    const b = mix(n & 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawGround(ctx, W, H, view, level) {
    const gy = view.groundScreenY;
    // Flat playable ground.
    ctx.fillStyle = level.ground;
    ctx.fillRect(0, gy, W, H - gy);
    // Grassy bank: a darker lip at the horizon fading into the ground, so the
    // illustrated background meets the flat ground as an intentional edge
    // instead of a hard seam.
    const bank = 26;
    const grad = ctx.createLinearGradient(0, gy, 0, gy + bank);
    grad.addColorStop(0, shade(level.ground, -0.24));
    grad.addColorStop(1, level.ground);
    ctx.fillStyle = grad;
    ctx.fillRect(0, gy, W, bank);
    // A soft lit rim right on the horizon line to catch the light.
    ctx.fillStyle = shade(level.ground, 0.16);
    ctx.fillRect(0, gy, W, 2);
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
  // opts: { body, belly, eye, squash, rot, scale, blink, look, arm,
  //         noLegs, club (shaft angle in radians — draws a held golf club) }
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

    const legH = opts.noLegs ? 0 : r * 0.55;

    // Legs + feet (feet planted at y = 0, the ground).
    if (legH) {
      const wob = Math.sin((opts.arm || 0) * 1.3) * r * 0.06;
      ctx.strokeStyle = body;
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -legH);
      ctx.lineTo(-r * 0.36, -r * 0.05);
      ctx.moveTo(r * 0.32, -legH);
      ctx.lineTo(r * 0.36 + wob, -r * 0.05);
      ctx.stroke();
      ctx.fillStyle = eye; // little dark shoes
      ctx.beginPath();
      ctx.ellipse(-r * 0.44, 0, r * 0.28, r * 0.14, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.44 + wob, 0, r * 0.28, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lift the body so it sits on top of the legs.
    ctx.translate(0, -legH);

    // Body (egg) with a soft top-light for roundness.
    const bodyGrad = ctx.createRadialGradient(-r * 0.4, -r * 1.5, r * 0.15, 0, -r, r * 1.5);
    bodyGrad.addColorStop(0, shade(body, 0.22));
    bodyGrad.addColorStop(1, body);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -r, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rim light along the top edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.ellipse(0, -r, r * 0.94, r * 1.08, 0, Math.PI * 1.15, Math.PI * 1.9);
    ctx.stroke();
    // Belly.
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.85, r * 0.6, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms — either gripping a golf club, or idle stubby arms.
    ctx.strokeStyle = body;
    ctx.lineWidth = r * 0.26;
    ctx.lineCap = 'round';
    if (opts.club != null) {
      const grip = { x: r * 0.55, y: -r * 0.95 };
      // Both arms reach to the shared grip.
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 1.0);
      ctx.lineTo(grip.x, grip.y);
      ctx.moveTo(r * 0.55, -r * 1.05);
      ctx.lineTo(grip.x, grip.y);
      ctx.stroke();
      // Shaft.
      const ang = opts.club;
      const L = r * 2.4;
      const hx = grip.x + Math.cos(ang) * L;
      const hy = grip.y + Math.sin(ang) * L;
      ctx.strokeStyle = '#cfd6dc';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(grip.x, grip.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      // Club head.
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.fillStyle = '#9aa3ab';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.36, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const armWave = opts.arm || 0;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r);
      ctx.lineTo(-r * 1.2, -r + Math.sin(armWave) * r * 0.4);
      ctx.moveTo(r * 0.8, -r);
      ctx.lineTo(r * 1.2, -r + Math.cos(armWave) * r * 0.4);
      ctx.stroke();
    }

    // Cheek blush.
    ctx.fillStyle = 'rgba(255,120,150,0.22)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.52, -r * 0.98, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.52, -r * 0.98, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye (one big central eye) with a glossy highlight.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -r * 1.15, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = r * 0.035;
    ctx.stroke();
    if (!opts.blink) {
      const lookX = (opts.look || 0) * r * 0.15;
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(lookX, -r * 1.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Glossy glint.
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(lookX - r * 0.08, -r * 1.19, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Peaceful closed eye (gentle downward curve).
      ctx.strokeStyle = eye;
      ctx.lineWidth = r * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 1.16);
      ctx.quadraticCurveTo(0, -r * 1.08, r * 0.2, -r * 1.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Props ----------
  function drawProp(ctx, view, prop, t) {
    const type = prop.type;
    const def = Props.getPropType(type);
    if (!def) return;
    const s = view.scale;
    const w = def.width * s;
    const h = def.height * s;
    // Animation progress since hit (seconds); undefined if not hit.
    const a = prop.hitT != null ? prop.hitT : -1;

    // Balloons float, so they carry their own transform down to the ground.
    if (type === 'balloon') {
      drawBalloon(ctx, view, prop, w, h, a);
      return;
    }

    const base = view.toScreen(prop.x, 0);
    ctx.save();
    ctx.translate(base.x, base.y);

    // Soft contact shadow to anchor the prop (fades as it gets knocked away).
    if (type !== 'water') {
      const shA = a < 0 ? 0.16 : Math.max(0, 0.16 * (1 - a * 1.6));
      if (shA > 0.01) {
        ctx.fillStyle = 'rgba(20,45,30,' + shA + ')';
        ctx.beginPath();
        ctx.ellipse(0, 3, w * 0.52, w * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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
      case 'movingcreature':
        drawMovingCreature(ctx, w, h, a);
        break;
      case 'water':
        drawWater(ctx, w, h, t);
        break;
      case 'tnt':
        drawTNT(ctx, w, h, a);
        break;
      case 'beehive':
        drawBeehive(ctx, w, h, a, t);
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
    // Body with side shading.
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#3bb079');
    g.addColorStop(1, '#26855a');
    ctx.fillStyle = g;
    roundedRect(ctx, -w / 2, -h, w, h, w * 0.07);
    ctx.fill();
    // Roof cap.
    ctx.fillStyle = '#1f6f4a';
    roundedRect(ctx, -w / 2 - 3, -h, w + 6, h * 0.08, 4);
    ctx.fill();
    // Vent slats.
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const vy = -h + h * 0.15 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, vy);
      ctx.lineTo(w * 0.08, vy);
      ctx.stroke();
    }
    // Door.
    const doorW = w - 14;
    const doorH = h - 12;
    const doorSwing = a < 0 ? 0 : Math.min(1, a * 4) * 1.5;
    ctx.save();
    ctx.translate(-w / 2 + 7, -h + 7);
    ctx.rotate(-doorSwing);
    const dg = ctx.createLinearGradient(0, 0, doorW, 0);
    dg.addColorStop(0, '#45c288');
    dg.addColorStop(1, '#34ad76');
    ctx.fillStyle = dg;
    roundedRect(ctx, 0, 0, doorW, doorH, 4);
    ctx.fill();
    // Crescent-moon vent.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.arc(doorW * 0.5, doorH * 0.16, doorW * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a < 0 ? '#34ad76' : '#45c288';
    ctx.beginPath();
    ctx.arc(doorW * 0.56, doorH * 0.16, doorW * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Occupied / vacant slider.
    ctx.fillStyle = a < 0 ? '#ff5d5d' : '#8affc1';
    roundedRect(ctx, doorW * 0.3, doorH * 0.44, doorW * 0.4, doorH * 0.07, 2);
    ctx.fill();
    // Handle.
    ctx.fillStyle = '#134a33';
    ctx.beginPath();
    ctx.arc(doorW - 7, doorH / 2, 3.2, 0, Math.PI * 2);
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
    // Cross post.
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = w * 0.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.moveTo(-w * 0.5, -h * 0.68);
    ctx.lineTo(w * 0.5, -h * 0.68);
    ctx.stroke();
    // Straw poking from the sleeve ends.
    ctx.strokeStyle = '#e6c86a';
    ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(sx * w * 0.5, -h * 0.68);
        ctx.lineTo(sx * (w * 0.5 + 8), -h * 0.68 + k * 5 - 3);
        ctx.stroke();
      }
    }
    // Burlap shirt over the crossbar.
    ctx.fillStyle = '#b23b3b';
    roundedRect(ctx, -w * 0.42, -h * 0.74, w * 0.84, h * 0.32, w * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    roundedRect(ctx, -w * 0.42, -h * 0.5, w * 0.84, h * 0.08, w * 0.08);
    ctx.fill();
    // Buttons.
    ctx.fillStyle = '#ffd23f';
    for (let b = 0; b < 2; b++) {
      ctx.beginPath();
      ctx.arc(0, -h * 0.64 + b * 9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Burlap sack head.
    ctx.fillStyle = '#e6c86a';
    ctx.beginPath();
    ctx.arc(0, -h + 4, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade('#e6c86a', -0.12);
    ctx.beginPath();
    ctx.ellipse(0, -h + w * 0.2, w * 0.28, w * 0.09, 0, 0, Math.PI);
    ctx.fill();
    // Straw tuft on top.
    ctx.strokeStyle = '#d9b74f';
    ctx.lineWidth = 2;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 3, -h - w * 0.22);
      ctx.lineTo(k * 4, -h - w * 0.4);
      ctx.stroke();
    }
    // Stitched X eyes + smile.
    ctx.strokeStyle = '#3a2a10';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const ey = -h + 2;
    for (const ex of [-w * 0.11, w * 0.11]) {
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 3);
      ctx.lineTo(ex + 3, ey + 3);
      ctx.moveTo(ex + 3, ey - 3);
      ctx.lineTo(ex - 3, ey + 3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, -h + 6, w * 0.1, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
    // Hat flies off when hit.
    drawScarecrowHat(ctx, w, h, a);
  }

  function drawScarecrowHat(ctx, w, h, a) {
    ctx.save();
    if (a < 0) {
      ctx.translate(0, -h - w * 0.18);
    } else {
      const p = Math.min(1, a / 1.2);
      ctx.translate(p * 70, -h - Math.sin(p * Math.PI) * 90);
      ctx.rotate(a * 10);
    }
    // Brim.
    ctx.fillStyle = '#7a4a20';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.36, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cone.
    ctx.fillStyle = '#8a5527';
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, 0);
    ctx.lineTo(w * 0.22, 0);
    ctx.lineTo(w * 0.03, -w * 0.36);
    ctx.closePath();
    ctx.fill();
    // Band + patch.
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-w * 0.19, -w * 0.02);
    ctx.lineTo(w * 0.19, -w * 0.02);
    ctx.lineTo(w * 0.13, -w * 0.1);
    ctx.lineTo(-w * 0.15, -w * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBuckets(ctx, w, h, a) {
    const bw = w * 0.74;
    const bh = h / 3.4;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      let dx = 0;
      let dy = -i * bh * 1.02;
      let rot = 0;
      if (a >= 0) {
        const p = Math.min(1, a * 2.2);
        dx = (i - 1) * p * 40 + p * 20;
        dy += -Math.sin(p * Math.PI) * 30 * (i + 1);
        rot = p * (i + 1) * 0.9;
      }
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      const col = i % 2 ? '#ff5d5d' : '#ffd23f';
      const topW = bw;
      const botW = bw * 0.78;
      // Tapered pail body with left-lit side shading.
      const g = ctx.createLinearGradient(-topW / 2, 0, topW / 2, 0);
      g.addColorStop(0, shade(col, 0.14));
      g.addColorStop(0.55, col);
      g.addColorStop(1, shade(col, -0.18));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-botW / 2, 0);
      ctx.lineTo(botW / 2, 0);
      ctx.lineTo(topW / 2, -bh);
      ctx.lineTo(-topW / 2, -bh);
      ctx.closePath();
      ctx.fill();
      // Moulded band across the middle.
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = Math.max(1, bh * 0.07);
      ctx.beginPath();
      ctx.moveTo(-topW * 0.42, -bh * 0.58);
      ctx.lineTo(topW * 0.42, -bh * 0.58);
      ctx.stroke();
      // Rim opening (dark inside + lip).
      ctx.fillStyle = shade(col, -0.26);
      ctx.beginPath();
      ctx.ellipse(0, -bh, topW / 2, bh * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(col, -0.4);
      ctx.beginPath();
      ctx.ellipse(0, -bh, (topW / 2) * 0.8, bh * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(1, bh * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, -bh, topW / 2, bh * 0.16, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSprinkler(ctx, w, h, a, t) {
    const headY = -h * 0.55;
    // Base plate + post.
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath();
    ctx.ellipse(0, -2, w * 0.3, w * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a5a66';
    ctx.fillRect(-w * 0.09, headY, w * 0.18, -headY);
    // Rotating head.
    const haywire = a >= 0;
    ctx.save();
    ctx.translate(0, headY);
    ctx.rotate(haywire ? t * 6 : Math.sin(t * 2) * 0.12);
    ctx.fillStyle = '#6b6b78';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4a55';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a3a44';
    ctx.lineWidth = 3;
    for (const na of [-0.6, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(-Math.PI / 2 + na) * w * 0.28, Math.sin(-Math.PI / 2 + na) * w * 0.28);
      ctx.stroke();
    }
    ctx.restore();
    // Arcing water jets with droplets at the tips.
    const n = haywire ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n - 0.5) * (haywire ? 3.0 : 1.1) + Math.sin(t * 6 + i) * (haywire ? 0.5 : 0.08);
      const len = (haywire ? 42 : 24) + Math.sin(t * 8 + i) * 6;
      const ex = Math.cos(ang) * len;
      const ey = headY + Math.sin(ang) * len;
      const mx = Math.cos(ang) * len * 0.6;
      const my = headY + Math.sin(ang) * len * 0.6 - 7;
      ctx.strokeStyle = 'rgba(140,210,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, headY);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      ctx.fillStyle = 'rgba(180,225,255,0.9)';
      ctx.beginPath();
      ctx.arc(ex, ey, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGolfcart(ctx, w, h, a) {
    ctx.save();
    if (a >= 0) {
      const p = Math.min(1, a / 1.0);
      ctx.translate(0, -Math.sin(p * Math.PI) * 60);
      ctx.rotate(p * 2.6);
    }
    const bodyTop = -h * 0.62;
    const bodyH = h * 0.42;
    // Wheels (with hubcaps).
    for (const wx of [-w * 0.28, w * 0.28]) {
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(wx, -h * 0.1, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfd6dc';
      ctx.beginPath();
      ctx.arc(wx, -h * 0.1, h * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    // Canopy posts + roof.
    ctx.strokeStyle = '#c2cace';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.34, -h);
    ctx.lineTo(-w * 0.32, bodyTop);
    ctx.moveTo(w * 0.34, -h);
    ctx.lineTo(w * 0.32, bodyTop);
    ctx.stroke();
    ctx.fillStyle = '#eef2f4';
    roundedRect(ctx, -w * 0.44, -h, w * 0.88, h * 0.1, 5);
    ctx.fill();
    // Seat back.
    ctx.fillStyle = '#39d3c0';
    roundedRect(ctx, -w * 0.02, bodyTop - h * 0.16, w * 0.22, h * 0.18, 4);
    ctx.fill();
    // Body with soft shading.
    const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#dbe3e8');
    ctx.fillStyle = g;
    roundedRect(ctx, -w / 2, bodyTop, w, bodyH, 8);
    ctx.fill();
    // Rear cargo bed lip.
    ctx.fillStyle = '#c9d1d6';
    roundedRect(ctx, -w / 2, bodyTop, w * 0.32, bodyH * 0.55, 6);
    ctx.fill();
    // Teal side stripe + headlight.
    ctx.fillStyle = '#39d3c0';
    ctx.fillRect(-w / 2, bodyTop + bodyH * 0.66, w, 3);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(w * 0.45, bodyTop + bodyH * 0.42, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPicnic(ctx, w, h, a, prop) {
    const topY = -h * 0.5;
    const topH = h * 0.16;
    // A-frame legs.
    ctx.strokeStyle = '#8a5e34';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, topY + topH);
    ctx.lineTo(-w * 0.44, 0);
    ctx.moveTo(-w * 0.32, topY + topH);
    ctx.lineTo(-w * 0.16, 0);
    ctx.moveTo(w * 0.32, topY + topH);
    ctx.lineTo(w * 0.44, 0);
    ctx.moveTo(w * 0.32, topY + topH);
    ctx.lineTo(w * 0.16, 0);
    ctx.stroke();
    // Bench rail.
    ctx.fillStyle = '#a9713e';
    roundedRect(ctx, -w * 0.5, -h * 0.16, w, h * 0.08, 2);
    ctx.fill();
    // Plank tabletop.
    ctx.fillStyle = '#b57d45';
    roundedRect(ctx, -w / 2, topY, w, topH, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (const px of [-w * 0.16, w * 0.16]) {
      ctx.beginPath();
      ctx.moveTo(px, topY);
      ctx.lineTo(px, topY + topH);
      ctx.stroke();
    }
    // Napping creature (or flung awake).
    const r = h * 0.26;
    if (a < 0) {
      drawCreature(ctx, 0, topY, r, { body: '#39d3c0', belly: '#bff6ee', blink: true, squash: 0.3, noLegs: true });
      // Sleepy "z z".
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(r * 0.5) + 'px system-ui, sans-serif';
      ctx.fillText('z', r * 0.8, topY - r * 1.5);
      ctx.font = 'bold ' + Math.round(r * 0.34) + 'px system-ui, sans-serif';
      ctx.fillText('z', r * 1.2, topY - r * 1.9);
    } else {
      const p = Math.min(1, a / 1.2);
      const y = topY - Math.sin(p * Math.PI) * 150;
      ctx.globalAlpha = 1 - p * 0.6;
      drawCreature(ctx, p * 50, y, r, { body: '#39d3c0', belly: '#bff6ee', rot: a * 11 });
      ctx.globalAlpha = 1;
    }
  }

  function drawTrampoline(ctx, w, h, a) {
    const rx = w * 0.42;
    const ry = h * 0.22;
    // Legs.
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-rx, -h + ry);
    ctx.lineTo(-w * 0.34, 0);
    ctx.moveTo(rx, -h + ry);
    ctx.lineTo(w * 0.34, 0);
    ctx.moveTo(-w * 0.16, -h + ry);
    ctx.lineTo(-w * 0.1, 0);
    ctx.moveTo(w * 0.16, -h + ry);
    ctx.lineTo(w * 0.1, 0);
    ctx.stroke();
    // Frame ring.
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, -h, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Spring ticks around the top rim.
    ctx.strokeStyle = '#9aa3ab';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const ang = Math.PI + (i / 10) * Math.PI;
      const ox = Math.cos(ang) * rx;
      const oy = -h + Math.sin(ang) * ry;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox * 0.82, oy + 3);
      ctx.stroke();
    }
    // Bouncy mat (dips when recently hit).
    const dip = a >= 0 && a < 0.25 ? Math.sin(a * 12) * 10 : 0;
    const mg = ctx.createLinearGradient(0, -h - ry, 0, -h + ry);
    mg.addColorStop(0, '#ff6aae');
    mg.addColorStop(1, '#d63a86');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.92, -h);
    ctx.quadraticCurveTo(0, -h + dip + ry * 0.9, rx * 0.92, -h);
    ctx.quadraticCurveTo(0, -h - ry * 0.7, -rx * 0.92, -h);
    ctx.closePath();
    ctx.fill();
    // Mat sheen.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.55, -h - ry * 0.2);
    ctx.quadraticCurveTo(0, -h - ry * 0.5, rx * 0.55, -h - ry * 0.2);
    ctx.stroke();
  }

  function drawMovingCreature(ctx, w, h, a) {
    const r = h * 0.3;
    if (a < 0) {
      // Little dust puffs under a scurrying creature.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.5, -2, w * 0.22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      drawCreature(ctx, 0, 0, r, { body: '#ff5d8f', belly: '#ffd0e6', arm: performance.now() / 90 });
    } else {
      const p = Math.min(1, a / 1.2);
      const x = p * 130;
      const y = -Math.sin(p * Math.PI) * 210 - p * 40;
      ctx.globalAlpha = 1 - p * 0.7;
      drawCreature(ctx, x, y, r, { body: '#ff5d8f', belly: '#ffd0e6', rot: a * 13, squash: 0.2 });
      ctx.globalAlpha = 1;
    }
  }

  function drawWater(ctx, w, h, t) {
    // Cattail reeds behind the water at the near-left edge.
    ctx.strokeStyle = '#3f8f4a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const rx of [-w * 0.46, -w * 0.4]) {
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx - 2, -h * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#7a4a20';
      ctx.beginPath();
      ctx.ellipse(rx - 2, -h * 1.8, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pool with a depth gradient + wavy surface.
    const g = ctx.createLinearGradient(0, -h, 0, 2);
    g.addColorStop(0, '#5fb4ec');
    g.addColorStop(1, '#2f7fc4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 2);
    for (let x = -w / 2; x <= w / 2; x += 8) {
      ctx.lineTo(x, -h + Math.sin(x * 0.06 + t * 3) * 3);
    }
    ctx.lineTo(w / 2, 2);
    ctx.closePath();
    ctx.fill();
    // Expanding ripple rings.
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const rr = ((t * 26 + i * 42) % (w * 0.5)) + 4;
      ctx.beginPath();
      ctx.ellipse(-w * 0.12, -h * 0.45, rr, rr * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Sparkle highlights.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const hx = -w * 0.3 + i * w * 0.2;
      ctx.beginPath();
      ctx.moveTo(hx, -h * 0.5);
      ctx.lineTo(hx + 8, -h * 0.5);
      ctx.stroke();
    }
    // Bobbing rubber duck.
    const dy = Math.sin(t * 2) * 2;
    ctx.save();
    ctx.translate(w * 0.28, -h * 0.5 + dy);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(9, -5.5);
    ctx.lineTo(14, -4.5);
    ctx.lineTo(9, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#20303a';
    ctx.beginPath();
    ctx.arc(7, -6, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTNT(ctx, w, h, a) {
    if (a >= 0) return; // detonated — the explosion particles take over
    // Wooden crate.
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, '#a9713e');
    g.addColorStop(1, '#875427');
    ctx.fillStyle = g;
    roundedRect(ctx, -w / 2, -h, w, h, 4);
    ctx.fill();
    // Plank braces.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 + 2, -h + 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h);
    ctx.lineTo(w / 2, 0);
    ctx.moveTo(w / 2, -h);
    ctx.lineTo(-w / 2, 0);
    ctx.stroke();
    // Dynamite bundle on top.
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#c0392b';
      roundedRect(ctx, i * w * 0.18 - w * 0.06, -h - h * 0.34, w * 0.12, h * 0.34, 3);
      ctx.fill();
      ctx.fillStyle = '#f0c040';
      ctx.fillRect(i * w * 0.18 - w * 0.06, -h - h * 0.22, w * 0.12, 3);
    }
    // Fuse + spark.
    ctx.strokeStyle = '#5a4a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h - h * 0.34);
    ctx.quadraticCurveTo(w * 0.16, -h - h * 0.52, w * 0.1, -h - h * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath();
    ctx.arc(w * 0.1, -h - h * 0.6, 3, 0, Math.PI * 2);
    ctx.fill();
    // Label.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(h * 0.26) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 0, -h * 0.44);
    ctx.textBaseline = 'alphabetic';
  }

  function drawBeehive(ctx, w, h, a, t) {
    if (a >= 0) return; // knocked away — bees handled by particles
    // Branch stub it hangs from.
    ctx.strokeStyle = '#6a4a24';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h);
    ctx.lineTo(w * 0.12, -h);
    ctx.stroke();
    // Skep body — stacked rounded tiers, wider toward the bottom.
    const tiers = 4;
    const th = h / (tiers + 1);
    for (let i = 0; i < tiers; i++) {
      const ty = -h + th * 0.6 + i * th;
      const tw = w * (0.52 + i * 0.11);
      ctx.fillStyle = i % 2 ? '#e0a83a' : '#f0c257';
      roundedRect(ctx, -tw / 2, ty, tw, th * 1.15, th * 0.55);
      ctx.fill();
    }
    // Entrance hole.
    ctx.fillStyle = '#3a2a10';
    ctx.beginPath();
    ctx.ellipse(0, -th * 1.1, w * 0.12, th * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // A couple of bees circling.
    ctx.fillStyle = '#2a2a2a';
    for (let i = 0; i < 2; i++) {
      const ang = t * 3 + i * Math.PI;
      const bx = Math.cos(ang) * w * 0.5;
      const by = -h * 0.5 + Math.sin(ang) * h * 0.2;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Balloons manage their own transform: string down to the ground + bobbing.
  function drawBalloon(ctx, view, prop, w, h, a) {
    const bottom = view.toScreen(prop.x, prop.y);
    const ground = view.toScreen(prop.x, 0);
    if (a >= 0) return; // popped — the game spawns the burst particles
    ctx.save();
    ctx.translate(bottom.x, bottom.y);
    // String to the ground.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, ground.y - bottom.y);
    ctx.stroke();
    // Bobbing balloon body.
    const bob = Math.sin(performance.now() / 400 + prop.phase) * 4;
    ctx.translate(0, -h * 0.5 + bob);
    ctx.fillStyle = '#ffcf33';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.08, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shine + knot + a little "$" cue for jackpot.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.16, -h * 0.22, w * 0.1, h * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf33';
    ctx.beginPath();
    ctx.moveTo(-4, h * 0.4);
    ctx.lineTo(4, h * 0.4);
    ctx.lineTo(0, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c98a00';
    ctx.font = 'bold ' + Math.round(h * 0.4) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, -h * 0.05);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
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

  function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  // Golf-swing club angle (radians, screen space; the clubhead sits at
  // grip + (cos, sin) * length, with +x right and +y down). The ball launches
  // to the RIGHT, so the club must sweep down through the ball moving rightward:
  // wind up over the shoulder (up-left), swing down to the ball (near straight
  // down, decreasing angle so the head moves right at contact), then follow
  // through up to the front-right.
  // Timeline after release: backswing -> impact (IMPACT_T) -> follow-through.
  const SWING = { IDLE: 1.2, WINDUP: 3.9, IMPACT: 1.55, FOLLOW: -0.6, IMPACT_T: 0.12, DUR: 0.5 };
  function swingClubAngle(swingT, aiming, power) {
    const S = SWING;
    if (aiming) {
      // Wind the club back as the player drags (a good bit even at low power).
      return lerp(S.IDLE, S.WINDUP, 0.4 + 0.6 * Math.min(1, power));
    }
    if (swingT > 0 && swingT < S.DUR) {
      if (swingT < S.IMPACT_T) return lerp(S.WINDUP, S.IMPACT, smoothstep(swingT / S.IMPACT_T));
      return lerp(S.IMPACT, S.FOLLOW, smoothstep((swingT - S.IMPACT_T) / (S.DUR - S.IMPACT_T)));
    }
    if (swingT >= S.DUR && swingT < S.DUR + 0.3) {
      return lerp(S.FOLLOW, S.IDLE, (swingT - S.DUR) / 0.3);
    }
    return S.IDLE;
  }

  // opts: { swingT, aiming, power }
  function drawTee(ctx, view, character, opts) {
    opts = opts || {};
    const s = view.scale;
    const base = view.toScreen(view.teeX, 0);
    // Tee peg.
    ctx.fillStyle = '#eee';
    ctx.fillRect(base.x - 2, base.y - 14 * s, 4, 14 * s);
    const st = opts.swingT || 0;
    const clubAngle = swingClubAngle(st, opts.aiming, opts.power || 0);
    // A little squash-bounce right at impact.
    const impact = st > 0.06 && st < 0.22 ? Math.sin(((st - 0.06) / 0.16) * Math.PI) * 0.14 : 0;
    drawCreature(ctx, base.x - 30 * s, base.y, 20 * s, {
      body: character.body,
      belly: character.belly,
      eye: character.eye,
      look: 1,
      arm: performance.now() / 220,
      club: clubAngle,
      squash: impact
    });
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Wind indicator under the HUD (arrow length/direction show strength).
  function drawWind(ctx, W, H, wind) {
    if (!wind) return;
    const cx = 54;
    const y = 116;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.strokeText('WIND', cx, y - 12);
    ctx.fillText('WIND', cx, y - 12);
    const dir = wind > 0 ? 1 : -1;
    const strength = Math.min(1, Math.abs(wind) / 300);
    const len = 22 + strength * 26;
    ctx.strokeStyle = wind > 0 ? '#8affc1' : '#ffb3b3';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const x0 = cx - (dir * len) / 2;
    const x1 = cx + (dir * len) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.lineTo(x1 - dir * 9, y - 7);
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 - dir * 9, y + 7);
    ctx.stroke();
    ctx.restore();
  }

  // Live combo meter (top-centre) with a draining timer bar. `pulse` (0..1)
  // pops the meter when the combo just increased.
  function drawComboMeter(ctx, W, H, round, pulse) {
    if (!round || round.combo < 2) return;
    const mult = round.currentMultiplier();
    const frac = round.comboFraction();
    const w = 168;
    const h = 50;
    const cx = W / 2;
    const cy = 66 + h / 2;
    ctx.save();
    // Pop scale about the meter centre.
    const scale = 1 + (pulse || 0) * 0.22;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    const x = W / 2 - w / 2;
    const y = 66;
    roundedRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(20,30,40,0.55)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('COMBO ×' + mult.toFixed(1), W / 2, y + 24);
    // Timer bar.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 14, y + 33, w - 28, 8);
    ctx.fillStyle = '#ff5d8f';
    ctx.fillRect(x + 14, y + 33, (w - 28) * frac, 8);
    ctx.restore();
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
    drawWind,
    drawComboMeter,
    lerp
  };

  global.GS = global.GS || {};
  global.GS.Render = api;
})(typeof window !== 'undefined' ? window : globalThis);
