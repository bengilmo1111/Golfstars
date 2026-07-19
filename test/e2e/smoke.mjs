/**
 * End-to-end smoke test.
 * Boots the static server, loads the game in a real headless Chromium, then
 * drives a full round through the game's programmatic API (GS.game) and asserts
 * that shots fly, targets get smashed, the score updates, and the round ends on
 * the results screen with the score persisted. Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer } = require('../../scripts/serve.js');

// The bundled Chromium in this environment; fall back to Playwright's default.
const BUNDLED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXECUTABLE = process.env.PW_CHROMIUM || (existsSync(BUNDLED_CHROMIUM) ? BUNDLED_CHROMIUM : undefined);

function startServer() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function poll(page, predicate, timeoutMs = 8000, everyMs = 80) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => window.GS.game.getState());
    if (predicate(state)) return state;
    await page.waitForTimeout(everyMs);
  }
  const last = await page.evaluate(() => window.GS.game.getState());
  throw new Error('poll timed out; last state = ' + JSON.stringify(last));
}

async function main() {
  const { server, port } = await startServer();
  const launchOptions = EXECUTABLE ? { headless: true, executablePath: EXECUTABLE } : { headless: true };
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const expectedMissingBg = process.env.EXPECT_MISSING_BG || null;
  const expectedMissingMg = process.env.EXPECT_MISSING_MG || null;
  try {
    // Landscape-first: the range is designed to show more of the course wide.
    const page = await browser.newPage({ viewport: { width: 880, height: 460 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !/favicon|assets\//i.test(text + ' ' + m.location().url)) errors.push('console: ' + text);
    });

    await page.goto('http://localhost:' + port + '/');

    const ART_LEVELS = [
      'sunny-range', 'sunset-hills', 'chaos-carnival',
      'moonlight-madness', 'windy-cliffs', 'duck-derby'
    ];

    // 1. The game boots and exposes its API on the title screen.
    await page.waitForFunction(() => window.GS && window.GS.game && window.GS.game.getState);
    await page.waitForFunction(
      (data) =>
        data.art.every((id) => {
          const bg = window.GS.Images.status['bg-' + id];
          const mg = window.GS.Images.status['mg-' + id];
          const bgDone = id === data.missingBg ? bg === 'error' : bg === 'ready';
          const mgDone = id === data.missingMg ? mg === 'error' : mg === 'ready';
          return bgDone && mgDone;
        }),
      { art: ART_LEVELS, missingBg: expectedMissingBg, missingMg: expectedMissingMg }
    );

    const art = await page.evaluate(async ({ missingBg, missingMg }) => {
      const sample = (ctx, width, height) => {
        const data = ctx.getImageData(0, 0, width, height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 97) {
          hash ^= data[i];
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };
      const canvas = document.createElement('canvas');
      canvas.width = 440;
      canvas.height = 230;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const levels = window.GS.Levels.LEVELS.map((level) => {
        const bg = window.GS.Images.get('bg-' + level.id);
        const mg = window.GS.Images.get('mg-' + level.id);
        const view = { camX: 0, groundScreenY: 184, toScreen: () => ({ x: -100, y: 184 }) };
        window.GS.Render.drawBackground(ctx, 440, 230, view, level, 0);
        const atRest = sample(ctx, 440, 230);
        view.camX = 500;
        window.GS.Render.drawBackground(ctx, 440, 230, view, level, 0);
        const afterPan = sample(ctx, 440, 230);
        window.GS.Render.drawGround(ctx, 440, 230, view, level);
        const groundPixel = Array.from(ctx.getImageData(4, 220, 1, 1).data);

        const draws = [];
        const noop = () => {};
        const probe = {
          createLinearGradient: () => ({ addColorStop: noop }),
          fillRect: noop,
          beginPath: noop,
          moveTo: noop,
          lineTo: noop,
          closePath: noop,
          fill: noop,
          arc: noop,
          drawImage: (image, x) => draws.push({ src: image.src, x })
        };
        window.GS.Render.drawBackground(
          probe,
          440,
          230,
          { camX: 500, groundScreenY: 184 },
          level,
          0
        );
        const farDraw = draws.find((draw) => draw.src.includes('/bg-' + level.id + '.webp'));
        const nearDraw = draws.find((draw) => draw.src.includes('/mg-' + level.id + '.webp'));
        return {
          id: level.id,
          bgStatus: window.GS.Images.status['bg-' + level.id],
          mgStatus: window.GS.Images.status['mg-' + level.id],
          bgSize: bg ? [bg.naturalWidth, bg.naturalHeight] : [0, 0],
          mgSize: mg ? [mg.naturalWidth, mg.naturalHeight] : [0, 0],
          parallaxChanged: atRest !== afterPan,
          nearMovesFaster: farDraw && nearDraw ? Math.abs(nearDraw.x) > Math.abs(farDraw.x) : null,
          groundOpaque: groundPixel[3] === 255
        };
      });
      const title = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = 'assets/title-bg.webp';
      });
      return {
        levels,
        title,
        titleBackground: getComputedStyle(document.querySelector('#screen-title')).backgroundImage
      };
    }, { missingBg: expectedMissingBg, missingMg: expectedMissingMg });

    assert.match(art.titleBackground, /title-bg\.webp/i, 'title screen should reference its illustrated background');
    assert.deepStrictEqual([art.title.width, art.title.height], [1920, 1080], 'title background dimensions');
    for (const level of art.levels) {
      assert.strictEqual(level.groundOpaque, true, level.id + ' ground should draw over the background');
      if (level.id === expectedMissingBg) {
        assert.strictEqual(level.bgStatus, 'error', level.id + ' should exercise the far-layer fallback');
      } else {
        assert.strictEqual(level.bgStatus, 'ready', level.id + ' far background should load');
        assert.deepStrictEqual(level.bgSize, [1920, 1080], level.id + ' far dimensions');
      }
      if (level.id === expectedMissingMg) {
        assert.strictEqual(level.mgStatus, 'error', level.id + ' should exercise the single-layer fallback');
      } else {
        assert.strictEqual(level.mgStatus, 'ready', level.id + ' midground should load');
        assert.deepStrictEqual(level.mgSize, [1920, 1080], level.id + ' midground dimensions');
      }
      if (level.id !== expectedMissingBg && level.id !== expectedMissingMg) {
        assert.strictEqual(level.nearMovesFaster, true, level.id + ' midground should move faster than its far layer');
      }
      assert.strictEqual(level.parallaxChanged, true, level.id + ' background should parallax with camX');
    }

    let st = await page.evaluate(() => window.GS.game.getState());
    assert.strictEqual(st.screen, 'title', 'should boot to the title screen');

    // 2. Navigate the menus by clicking, proving screen transitions work.
    await page.evaluate(() => window.GS.game.resetSave());
    await page.click('#btn-play');
    await poll(page, (s) => s.screen === 'charselect', 3000);
    assert.ok(await page.isVisible('#btn-char-next'), 'character select should be visible');
    await page.click('#btn-char-next');
    await poll(page, (s) => s.screen === 'garage', 3000);
    assert.ok(await page.isVisible('#btn-garage-next'), 'garage should be visible');
    await page.click('#btn-garage-next');
    await poll(page, (s) => s.screen === 'levelselect', 3000);

    // Start a clean level 0.
    await page.evaluate(() => window.GS.game.startLevel(0));
    st = await poll(page, (s) => s.screen === 'play');
    assert.strictEqual(st.shotsLeft, 5, 'level 0 should start with 5 shots');
    assert.strictEqual(st.score, 0, 'score starts at 0');

    // 3. Fire an arcing shot that lands among the first cluster of props.
    const fired = await page.evaluate(() => window.GS.game.aimAndFire(-170, 60));
    assert.strictEqual(fired, true, 'the shot should fire');

    // 4. The ball leaves the tee (enters flight) and then settles.
    await poll(page, (s) => s.phase !== 'ready', 4000);
    st = await poll(page, (s) => s.phase === 'settling' || s.shotsLeft < 5, 8000);
    assert.ok(st.propsHit > 0, 'the shot should smash at least one target, hit=' + st.propsHit);
    assert.ok(st.score > 0, 'smashing targets should score points, score=' + st.score);

    // 5. The HUD reflects the score.
    const hud = await page.textContent('#hud-score');
    assert.ok(Number(hud) > 0, 'HUD score should update, got ' + hud);

    // 6. Play out the rest of the round; it should end on the results screen.
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      st = await page.evaluate(() => window.GS.game.getState());
      if (st.screen === 'results') break;
      if (st.phase === 'ready' && st.shotsLeft > 0) {
        await page.evaluate(() => window.GS.game.aimAndFire(-170, 80));
      }
      await page.waitForTimeout(150);
    }
    assert.strictEqual(st.screen, 'results', 'the round should end on the results screen');

    // 7. The round score is shown and career score is persisted (drives unlocks).
    const resultScore = Number(await page.textContent('#result-score'));
    assert.ok(resultScore > 0, 'results should show a positive score');
    st = await page.evaluate(() => window.GS.game.getState());
    assert.ok(st.careerScore > 0, 'career score should be persisted');

    assert.strictEqual(errors.length, 0, 'no page errors expected, got: ' + errors.join(' | '));

    console.log('✓ e2e smoke passed — round score ' + resultScore + ', career ' + st.careerScore);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error('✗ e2e smoke FAILED:', e.message);
  process.exit(1);
});
