# Golf Stars — Illustrated Backgrounds: art + integration brief

A self-contained brief for an agent (e.g. OpenAI Codex) that can both generate
images and make code changes. It assumes access to this repo
(`bengilmo1111/golfstars`, default branch `main`) and the ability to run `npm`.

## 0. Context you need
- Golf Stars is a mobile-first HTML5 **Canvas** game. All graphics today are
  **procedural** (vector shapes drawn in `js/render.js`); there is **no build
  step** and **no binary assets**. It deploys on Vercel from `main`; tests are
  `npm test` (node:test) and `npm run test:e2e` (Playwright).
- The camera scrolls **horizontally** as the ball flies; `view.camX` is the
  world-space camera x. The playfield ground is drawn by the game as a solid
  strip over the bottom of the screen (`drawGround`), and can slide down when
  the ball flies high (so the background can briefly fill the whole screen).
- **Scope of this task:** add illustrated **level backgrounds** (4) and a
  **title screen background** (1). Do **NOT** replace or touch the characters,
  targets/props, ball, particles, HUD, combo meter, or any animated/reactive
  element — those must stay procedural (they animate via canvas transforms and
  must stay consistent). Everything you add must **degrade gracefully** to the
  current procedural look if an image is missing.

## 1. Art direction (applies to all images)
- **Style:** flat **vector storybook illustration** — chunky simple shapes,
  soft gradients, gentle shading, **no hard outlines**, no photorealism, no
  painterly texture. It must sit cohesively behind flat cartoon foreground art.
- **Cohesive set:** the four level backgrounds should read as one family (same
  rendering style, cloud shapes, hill language), differing by time-of-day /
  palette.
- **Content:** sky + **distant** scenery only (far hills, faint trees, clouds,
  moon/stars). **No** foreground grass ledge, **no** characters, **no** golf
  balls/clubs/flags, **no** UI, **no** text or watermark.
- **Composition (critical for the engine):**
  - Sky fills the **top ~70%**; distant scenery sits in the **lower third** and
    **fades to soft distant hills** — do **not** paint a hard grass horizon line
    (the game draws the playable ground on top, and the image sometimes fills
    the full screen).
  - Keep the **outer ~8% of the left and right edges uniform sky** (no
    clouds/landmarks crossing the edges) so the image can **tile horizontally
    with an invisible seam**.
  - Composition should still look good if the image is the entire screen (ball
    flying high) — i.e. it's fundamentally a nice sky.
- **Format & size:** **1920×1080**, **WebP** (quality ~80), **sRGB, opaque**,
  target **< 200 KB** each.

## 2. Assets to produce
Place all in a new `assets/` directory. Exact filenames (they're keyed off level
ids in code):

| File | Level | Dims | Prompt (append the shared style line below) |
|---|---|---|---|
| `assets/bg-sunny-range.webp` | Sunny Range (bright day) | 1920×1080 | bright cheerful midday sky, soft blue gradient (#8fd6ff→#d7f2ff), a few rounded fluffy white clouds, gentle rolling green distant hills fading to the horizon |
| `assets/bg-sunset-hills.webp` | Sunset Hills (golden hour) | 1920×1080 | warm sunset sky, orange-to-cream gradient (#ffb36b→#ffe0a3), low sun glow, silhouetted rolling hills, wispy warm clouds |
| `assets/bg-chaos-carnival.webp` | Chaos Carnival (playful dusk) | 1920×1080 | playful purple-pink dusk sky (#b48cff→#ffd0f0), a few colourful bunting/pennant garlands strung high in the distance, soft carnival glow on the horizon, distant hills |
| `assets/bg-moonlight-madness.webp` | Moonlight Madness (night) | 1920×1080 | deep blue starry night sky (#2b3a6b→#5b6bb0), a big friendly round moon, scattered stars, dark rolling distant hills |
| `assets/bg-windy-cliffs.webp` | Windy Cliffs (breezy day) | 1920×1080 | breezy blue sky (#7fb0d9→#cfe6f2), wind-streaked wispy clouds, distant seaside cliffs/headlands, a few gulls far off |
| `assets/bg-duck-derby.webp` | Duck Derby (fresh mint day) | 1920×1080 | bright mint-teal sky (#8fe0d0→#e0fff7), soft fluffy clouds, distant wetland/reeds and gentle green hills |
| `assets/title-bg.webp` | Title splash | 1920×1080 | dreamy pastel golf-range sky at dawn, soft rolling hills, big open empty sky in the centre-top for a logo, no text |

> The four original ranges already ship art; **Windy Cliffs** and **Duck Derby** currently fall back to the procedural gradient — add their two backgrounds to bring them up to the same look. The loader keys off the level id, so the filenames above are all that's needed.

**Shared style line to append to every prompt:** "flat vector storybook
illustration, chunky simple shapes, soft gradients, no outlines, cheerful
children's game background, distant scenery only, uniform plain sky at far left
and right edges, no characters, no text, no watermark, 16:9."

## 3. Code changes

### 3a. New file `js/assets.js` (image loader, browser-only)
```js
(function (global) {
  'use strict';
  const cache = {};
  const status = {}; // key -> 'loading' | 'ready' | 'error'

  function load(key, url) {
    if (status[key] === 'loading' || status[key] === 'ready') return;
    status[key] = 'loading';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function () { status[key] = 'ready'; };
    img.onerror = function () { status[key] = 'error'; }; // silent: game falls back
    img.src = url;
    cache[key] = img;
  }
  function get(key) { return status[key] === 'ready' ? cache[key] : null; }
  function preloadLevels(levels) {
    levels.forEach(function (lvl) { load('bg-' + lvl.id, 'assets/bg-' + lvl.id + '.webp'); });
  }

  const api = { load, get, preloadLevels, status };
  global.GS = global.GS || {};
  global.GS.Images = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

### 3b. `index.html` — load the new script
Add it with the other browser-glue scripts, **before** `js/render.js`:
```html
<script src="js/audio.js"></script>
<script src="js/assets.js"></script>   <!-- add this line -->
<script src="js/render.js"></script>
<script src="js/game.js"></script>
```

### 3c. `js/render.js` — use the image in `drawBackground`, keep the gradient as fallback
Replace the existing `drawBackground` function with the version below, and add
the `drawParallaxImage` helper next to it. Keep the existing procedural
hills/clouds code as the fallback branch (do not delete it).
```js
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

  // ---- Procedural fallback (the EXISTING hills + clouds code stays here) ----
  const camX = view.camX;
  /* ...keep the current parallax-hills loop and cloud loop exactly as-is... */
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
```
Note: `drawGround` is unchanged — the solid playable ground still draws over the
bottom.

### 3d. `js/game.js` — preload at startup
In `init()` (runs on DOMContentLoaded), after `resize()`, add:
```js
if (global.GS.Images) global.GS.Images.preloadLevels(Levels.LEVELS);
```

### 3e. `css/style.css` — title background (with a dark overlay for panel contrast)
```css
#screen-title {
  background-image:
    linear-gradient(rgba(20,40,60,0.35), rgba(20,40,60,0.45)),
    url('assets/title-bg.webp');
  background-size: cover;
  background-position: center;
}
```
(If `title-bg.webp` is absent, the gradient still renders — panel stays
readable.)

### 3f. `test/e2e/smoke.mjs` — don't fail on asset load noise
The smoke test asserts "no console errors". Update the console filter so image
requests can't trip it:
```js
// was: if (m.type() === 'error' && !/favicon/i.test(text)) ...
if (m.type() === 'error' && !/favicon|assets\//i.test(text)) errors.push('console: ' + text);
```

### 3g. Docs
Add one line to `README.md` and `docs/PRD.md` noting the game now ships a few
illustrated **background images** (the only binary assets) with a **procedural
gradient fallback**; everything else remains procedural.

## 4. Verification (must pass)
1. `npm test` — unchanged, still green (no core logic touched).
2. `npm run test:e2e` — green.
3. Manual/headless: start each of the 4 levels and confirm the background
   renders and parallax-drifts as the ball flies; confirm the ground strip still
   sits correctly over the bottom.
4. **Fallback check:** temporarily rename one `bg-*.webp`, reload that level,
   confirm it falls back to the gradient with **no console error and no crash**;
   restore the file.
5. Confirm each WebP is < 200 KB and the title screen shows the new backdrop
   with the logo/buttons still legible.

## 5. Acceptance criteria
- 5 images added under `assets/`, matching the filenames, dims, style, and
  edge-tiling rules above.
- Backgrounds show in-game with gentle parallax; title screen uses
  `title-bg.webp`.
- Characters, props, ball, particles, HUD, combo meter **unchanged**.
- Missing image ⇒ automatic gradient fallback, no errors.
- `npm test` and `npm run test:e2e` both pass.

## 6. Git
Work on a feature branch off `main`, commit the images + code together, open a PR
into `main` (Vercel will redeploy). Keep the PR description factual about what
changed.

---

## 7. Enhancement: a second (midground) parallax layer

The single background above gives each range a look; adding a **nearer
midground layer** that scrolls **faster** than the far sky gives real depth and
a stronger sense of speed as the camera pans down-range. This is purely
additive and **degrades gracefully**: if a midground image is missing, the range
just shows the single-layer look from §1–3 (no change, no error).

### 7a. Midground art direction
- One transparent overlay **per range**: `assets/mg-<level-id>.webp`.
- **Same canvas as the far layer: 1920×1080**, but a **transparent WebP/PNG
  (alpha channel)** — paint scenery only in the **lower ~45%** and leave
  everything above it fully transparent so the far sky/hills show through.
- Content = **nearer, bolder scenery** that sits just beyond the fairway:
  chunkier foreground hills, clusters of trees/bushes, and a level-flavoured
  element or two. Use **aerial perspective** — this layer is a touch **larger,
  darker and more saturated** than the far background so it reads as closer.
- The scenery's **top edge must be an irregular silhouette** (hill/tree line)
  fading to transparent — **no hard horizontal cut**.
- **Do NOT paint the playable ground.** Keep the very bottom simple/low — the
  game draws the ground strip over it, and the ball plays in front of this
  layer.
- Same **flat vector storybook style**, cohesive with the far layer. Keep the
  **outer ~8% of the left/right edges empty/transparent** so it tiles
  horizontally with an invisible seam (it's drawn with the same tiling as the
  far layer, just faster).
- Per-range flavour suggestions: Sunny Range — leafy green hills + a tree
  cluster; Sunset Hills — silhouetted hills + a windmill; Chaos Carnival —
  striped tent tops + bunting; Moonlight Madness — spooky bare trees + fence;
  Windy Cliffs — rocky headland + wind-bent shrubs; Duck Derby — cattail reeds
  + a little jetty.
- **WebP with alpha, < ~180 KB each, sRGB.**

### 7b. Midground assets
| File | Range |
|---|---|
| `assets/mg-sunny-range.webp` | Sunny Range |
| `assets/mg-sunset-hills.webp` | Sunset Hills |
| `assets/mg-chaos-carnival.webp` | Chaos Carnival |
| `assets/mg-moonlight-madness.webp` | Moonlight Madness |
| `assets/mg-windy-cliffs.webp` | Windy Cliffs |
| `assets/mg-duck-derby.webp` | Duck Derby |

Append the shared style line from §1 to every prompt, and add: *"transparent
background (PNG alpha), scenery only in the lower portion, irregular silhouette
top edge fading to transparent, no ground, no characters."*

### 7c. Code changes (incremental — build on §3)

**`js/assets.js` — also preload the midground layer** (in `preloadLevels`):
```js
function preloadLevels(levels) {
  levels.forEach(function (lvl) {
    load('bg-' + lvl.id, 'assets/bg-' + lvl.id + '.webp');
    load('mg-' + lvl.id, 'assets/mg-' + lvl.id + '.webp'); // add this line
  });
}
```

**`js/render.js` — parametrise the parallax and draw both layers.** Give
`drawParallaxImage` a `parallax` argument, then in `drawBackground` draw the far
layer slower and the midground faster (each independently optional):
```js
function drawParallaxImage(ctx, W, H, camX, img, parallax) {
  const scale = H / img.height;
  const dw = img.width * scale;
  let offset = -((camX * parallax) % dw);
  if (offset > 0) offset -= dw;
  for (let x = offset; x < W; x += dw) ctx.drawImage(img, x, 0, dw, H);
}

function drawBackground(ctx, W, H, view, level, t) {
  // Base gradient — always drawn (fallback).
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, level.sky[0]);
  g.addColorStop(1, level.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const Images = global.GS.Images;
  const bg = Images ? Images.get('bg-' + level.id) : null;
  const mg = Images ? Images.get('mg-' + level.id) : null;
  if (bg) {
    drawParallaxImage(ctx, W, H, view.camX, bg, 0.2);   // far: slow
  } else {
    /* ...existing procedural hills + clouds fallback... */
  }
  if (mg) {
    drawParallaxImage(ctx, W, H, view.camX, mg, 0.55);  // near: faster = depth
  }
}
```
Notes: the far layer's parallax drops from `0.25` to `0.2` so the two layers
separate more; the midground is a transparent overlay so it composes over
either the far image **or** the procedural fallback. Missing `mg` ⇒ nothing
drawn (current look).

### 7d. Verification / acceptance (in addition to §4–5)
- With midground images present: as the camera pans, the near scenery visibly
  slides **faster** than the far sky (parallax depth), and its transparent top
  lets the far layer show through — no hard seam.
- Rename one `mg-*.webp`: that range falls back to the single-layer look with
  **no error/crash**; restore it.
- `npm test` and `npm run test:e2e` still pass. If the e2e asserts on the
  midground, only require it for ranges that ship one (mirror the existing
  art-level allowlist).
