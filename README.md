# ⛳ Golf Stars

A silly, mobile-first driving-range golf game for kids. Flick the ball to smash
the funniest targets on the range — launch creatures, blow open porta-loos,
topple bucket stacks, and bounce off trampolines for combo multipliers.

Built with plain HTML5 Canvas + JavaScript. **No build step and no backend**; the game ships a small set of illustrated WebP background images with procedural gradient fallbacks, while characters, props, HUD, effects, and sounds remain procedural or synthesised at runtime.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.

## Play it

Because the game is just static files, you can open it a few ways. Illustrated backgrounds are bundled in `assets/`; missing files automatically fall back to procedural backgrounds.

```bash
# 1. Zero-dependency static server (recommended — some browsers block
#    module/asset loading from file://)
npm run serve
# then open http://localhost:8080

# 2. Or open index.html directly in a browser.
```

Landscape phone/tablet is the target — the range fills the viewport so you can
see more of the course down-range. It still plays in portrait (with a nudge to
rotate). All sound is synthesised at runtime: punchy SFX, gibberish creature
voices, and a light background music loop. Audio unlocks on your first tap/click
(browsers require a gesture); the 🔊 button mutes everything.

### How to play
1. Tap **Play**, pick a character (Henry, Casper, or Nina), choose your gear.
2. On the range, **touch-and-drag back from the ball** like a slingshot — the
   dashed arc previews your shot. Release to fire.
3. Smash funny targets for points. Chain hits before the **combo meter**
   timer drains — the multiplier climbs with the chain and every hit scores
   at the live multiplier. Trampolines keep the chain alive; distance is a
   small bonus.
4. Watch the **wind** arrow on breezy ranges, and use the **spin** control
   (Back / None / Top) — backspin checks the ball up short of the **water
   hazard**, topspin rolls it out for distance. Loft a shot to pop the
   high-floating **jackpot balloon**, and time your swing for the **runaway
   creature** that patrols back and forth.
5. You get a set number of shots per range. Beat your best score to earn up
   to **3 stars**, and tick off each range's **challenges** ("chain a 3-hit
   combo", "pop a jackpot balloon", "no splashes", …). Earning a star unlocks
   the **next range**.
6. Points add to your **career score**, which unlocks new balls (bouncy,
   boomerang, beach ball, exploding) and clubs.

Progress (best scores, career score, unlocks, selections) is saved locally in
the browser — no accounts.

## Project layout

```
index.html            screens + canvas
css/style.css         mobile-first, landscape styling
js/core/*.js          pure, environment-agnostic game logic (unit-tested)
  ├─ characters.js    the selectable cast
  ├─ props.js         funny-target definitions + hit tests
  ├─ levels.js        scene layouts
  ├─ physics.js       ball stepping + trajectory prediction
  ├─ scoring.js       combos + distance bonus
  ├─ unlocks.js       balls/clubs + thresholds
  └─ storage.js       localStorage-backed save (injectable backend)
js/audio.js           Web Audio SFX + gibberish voices + music (browser only)
js/render.js          procedural canvas drawing (browser only)
js/game.js            loop, camera, slingshot input, screen state machine
test/unit/*.test.js   node:test unit tests over js/core
test/e2e/smoke.mjs    Playwright smoke test that drives a full round
docs/PRD.md           product requirements
```

The `js/core/*` modules use a small UMD shim so they load in the browser via
`<script>` **and** via `require()` in Node tests — same code, no bundler.

## Tests

```bash
npm test         # unit tests (node:test) — fast, no browser
npm run test:e2e # Playwright smoke test — boots the app, plays a full round
npm run test:all # both
```

- **Unit** tests cover physics stepping/rest/bounce, scoring & combos, unlock
  thresholds, level-data integrity, characters, and storage (with a stubbed
  `localStorage`).
- **Smoke** test launches headless Chromium, clicks through the menus, fires
  shots via the game's small programmatic API (`window.GS.game`), and asserts
  targets get smashed, the score updates, and the round ends with the score
  persisted.

> The e2e test expects a Chromium executable. It defaults to the one bundled in
> this environment; override with `PW_CHROMIUM=/path/to/chrome`. If Playwright's
> browsers are installed normally, run `npx playwright install chromium` and
> remove the `executablePath` override.

## License
MIT
