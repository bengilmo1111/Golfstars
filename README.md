# ⛳ Golf Stars

A silly, mobile-first driving-range golf game for kids. Flick the ball to smash
the funniest targets on the range — launch creatures, blow open porta-loos,
topple bucket stacks, and bounce off trampolines for combo multipliers.

Built with plain HTML5 Canvas + JavaScript. **No build step, no backend, no
binary assets** — all graphics are drawn procedurally and every sound is
synthesised with the Web Audio API.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.

## Play it

Because the game is just static files, you can open it a few ways:

```bash
# 1. Zero-dependency static server (recommended — some browsers block
#    module/asset loading from file://)
npm run serve
# then open http://localhost:8080

# 2. Or open index.html directly in a browser.
```

Portrait phone/tablet is the target; on desktop the playfield is capped to a
phone-width column.

### How to play
1. Tap **Play**, pick a character (Henry, Casper, or Nina), choose your gear.
2. On the range, **touch-and-drag back from the ball** like a slingshot — the
   dashed arc previews your shot. Release to fire.
3. Smash funny targets for points (multi-hits build a **combo multiplier**),
   distance is a small bonus. Trampolines bounce you for extra combo.
4. You get a set number of shots per range. Beat your best score!
5. Points add to your **career score**, which unlocks new balls (bouncy,
   boomerang, beach ball, exploding) and clubs.

Progress (best scores, career score, unlocks, selections) is saved locally in
the browser — no accounts.

## Project layout

```
index.html            screens + canvas
css/style.css         mobile-first, portrait styling
js/core/*.js          pure, environment-agnostic game logic (unit-tested)
  ├─ characters.js    the selectable cast
  ├─ props.js         funny-target definitions + hit tests
  ├─ levels.js        scene layouts
  ├─ physics.js       ball stepping + trajectory prediction
  ├─ scoring.js       combos + distance bonus
  ├─ unlocks.js       balls/clubs + thresholds
  └─ storage.js       localStorage-backed save (injectable backend)
js/audio.js           Web Audio SFX + gibberish voices (browser only)
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
