# PRD: Golf Stars

## 1. Overview
A mobile-first, web-based, driving-range-style golf game for kids (~10 years old). Players tee off to hit balls far AND smash funny targets scattered across the range. Tone is silly, slapstick, and chaotic — think physical comedy, not golf simulation. Features an original cast of small blobby chaos-creatures who react to every shot, get launched by mishits, and heckle the player.

## 2. Goals
- Fun, replayable arcade session (60 seconds–a few minutes per round)
- Simple enough for a 10-year-old to pick up in under 30 seconds
- Funny enough that kids want to show friends ("did you see that?!")
- Mobile-first controls (thumb-friendly, works one-handed or two)

## 3. Non-Goals (for v1)
- Realistic golf physics / simulation depth
- Multiplayer / real-time competitive play
- Full 18-hole course

## 4. Core Loop
1. Player takes a shot (swipe/drag power + angle mechanic)
2. Ball flies down the range
3. Distance is scored + any funny targets hit are scored/reacted to
4. Comedic reaction plays (creature gets launched, prop explodes, etc.)
5. Player takes next shot / round ends after N balls

## 5. Target Audience
- **Primary:** ~10 year olds, mobile web (phone/tablet)
- **Secondary:** parents/older siblings playing alongside

## 6. Key Features
- **Shot mechanic:** Swipe/flick (Angry Birds-style) — pull-back slingshot; flick direction + speed determines launch angle and power
- **Session structure:** Level-based — distinct range/scenes, each with its own layout of funny targets and a set number of shots
- **Reward loop:** Unlock new clubs and balls with funny effects (exploding ball, boomerang ball, giant club) as level rewards
- **Scoring:** Funny target hits are the primary score; distance is a secondary/bonus stat
- **Reactions:** Big cartoon ragdoll physics — creatures/props get launched, fly off screen, tumble
- **Style:** Silly sound effects and squash-and-stretch animation
- **Game feel / juice:** screen shake, a brief hit-stop freeze and camera punch on contact, slow-motion on big combos (and a bigger one on the exploding ball), full-screen flashes, a popping combo meter, and dust puffs on landing — tuned so hits feel weighty without being nauseating

### 6a. V1 Scope
- 4 levels/scenes for launch, each with its own layout and funny-target set
- Simple local leaderboard (best score per device, no accounts/backend)
- Voiced creatures — gibberish/character voice lines reacting to hits/misses
- Landscape-first (fills the viewport to show more of the course down-range); still playable in portrait with a nudge to rotate

### 6b. Progression
- **Star ratings:** each level has three score thresholds worth 1/2/3 stars, shown on the results screen (earned stars pop in) and the level list.
- **Per-level challenges:** each range offers ~3 optional missions (e.g. "chain a 3-hit combo", "pop a jackpot balloon", "finish with no splashes", "drive it 1300m in one shot", "bag a runaway creature"). Completion is tracked and persisted per device; newly-completed ones are highlighted on the results screen.
- **Sequential unlocking:** a range unlocks once the previous one has earned at least one star, giving a clear path to climb. Total stars are shown on the leaderboard.

## 7. Tone & Humour
- Slapstick, exaggerated reactions, no meanness/gore
- Visual comedy over text-based jokes (works across reading levels)
- Short, punchy comedic beats (kids' attention span)

## 8. Platform
- Web-based, mobile-first responsive design
- HTML5 / JS Canvas, no build step, no backend
- Self-contained: bundled illustrated WebP background images with procedural gradient fallbacks; all characters, props, HUD, effects, and Web Audio SFX remain procedural

### 8a. Character Concepts (original — round/blobby direction)
Keeping clear water between this and existing IP: different silhouette, colour, and feature set, distinct name/lore. The cast is one species/design family with distinct colours and personalities.

**Selectable characters (v1):** Henry, Casper, and Nina — three named, selectable creatures. Player picks one at the start. Purely cosmetic — identical gameplay stats, different look/voice only. Each is drawn full-body (round body + big eye, arms, legs, little feet) and holds a golf club that winds up as you drag to aim and swings through the ball on release, connecting at the moment of impact.

### 8b. Funny Target / Prop List (implemented in v1)
- Creature standing next to a golf cart (launches with a "boing" and cartwheels off)
- Porta-loo (door flies open, comic reaction, creature falls out)
- Scarecrow that spins and loses its hat
- Stack of buckets that topples like bowling pins
- Sprinkler that goes haywire
- Golf cart
- Picnic table with a napping creature — flips them awake
- Trampoline prop that bounces the ball for a bonus multiplier
- **Runaway creature** — a target that patrols left/right (a timing challenge)
- **Jackpot balloon** — a high-floating, high-value target you must loft a shot to reach
- **Water hazard** — landing in it voids the shot with a comedic splash (risk/reward)

## 9. Controls
- **Aim & power:** Touch/click and drag back from the ball (slingshot). The drag vector sets angle and power. Release to fire.
- A dashed trajectory preview shows the predicted arc while dragging (and reflects wind + spin).
- **Spin:** a Back / None / Top control — backspin checks the ball up (stop it short of a hazard), topspin rolls it out for distance.
- **Wind:** some levels have a steady wind (shown by an on-screen arrow) that pushes the airborne ball, so the same angle+power isn't always the same shot.

## 10. Scoring Model
- Each funny target has a point value. Hitting it awards points and triggers a reaction.
- Distance awards a small bonus (1 point per ~40 units) — secondary to target hits.
- **Live combo:** each target (or trampoline) hit bumps a combo counter and refreshes a short timer shown by an on-screen meter; the multiplier grows with the chain and every hit scores at the live multiplier. Let the timer lapse — or splash into water — and the chain resets. Chains can even carry across shots if you keep hitting.
- Round score = sum of all shots. Best score and best combo per level are stored locally.

## 11. Rewards / Unlocks
Unlocked by reaching cumulative-score milestones, persisted locally:
- **Balls:** Standard, Bouncy (extra bounces), Boomerang (curves back), Exploding (area smash), Beach Ball (giant, floaty)
- **Clubs:** Starter, Big Bertha (more power)

## 12. Success Metrics (draft)
- Session length, replay rate, shots per session (instrumentable later; not tracked in v1)

## 13. Architecture (v1)
- `index.html` — screens (title, character select, level select, play, results, leaderboard)
- `css/style.css` — mobile-first, landscape styling
- `js/core/*.js` — environment-agnostic pure logic (physics, scoring, storage, levels, characters, props, unlocks). Loadable in the browser via `<script>` and in Node via `require` for tests.
- `js/audio.js`, `js/render.js`, `js/game.js` — browser-only glue (Web Audio, canvas rendering, input + game loop)
- `test/` — `node --test` unit tests over the core logic + a Playwright smoke test

## 14. Testing
- **Unit:** deterministic tests for physics stepping, scoring/combos, unlock thresholds, level data integrity, and storage (with a stubbed `localStorage`).
- **Smoke:** Playwright loads the page, picks a character, starts a level, fires a shot, and asserts the game advances and score UI updates.
- Run with `npm test` (unit) and `npm run test:e2e` (smoke).
