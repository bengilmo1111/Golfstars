# Golf Stars — Background Music Generation Brief

A reusable, **prompt-only** brief for a music-generation model. One looping
background track per level. The shared identity and delivery specs are stated
once; each level has its own short prompt, and there's a fill-in template for
future ranges.

> The model only produces audio. **Playback is already wired in the game**: it
> preloads `assets/music-<level-id>.<ext>` (tries `.ogg`, `.mp3`, `.wav`,
> `.m4a`), plays each level's track on a loop, crossfades on level change,
> respects the mute toggle, and **falls back to the built-in procedural loop**
> whenever a track is missing or still loading. So you only need to generate the
> files and drop them in under the §3 filename convention — no code changes.

---

## 1. The Golf Stars sound (applies to every track)
- **Instrumental cartoon / casual-game music.** Playful, silly, wholesome —
  underscores a slapstick kids' golf game where blobby creatures get launched
  off the driving range.
- **Toy / acoustic band palette:** ukulele, marimba, xylophone, glockenspiel,
  tin whistle, light hand percussion (claps, shaker, woodblock), warm bass
  (upright or tuba), with occasional **comedic gag instruments** (slide whistle,
  kazoo, muted trumpet) as spice.
- **Bright and bouncy:** major-leaning, hoppy rhythms, medium tempos
  (roughly 100–132 BPM).
- **Background-appropriate:** supportive, not attention-grabbing. Leave space in
  the high-mids for the game's sound effects and gibberish creature voices —
  avoid dense walls of sound, aggressive drops, or heavy sub-bass.
- **No vocals or lyrics.** Nothing harsh, scary, or sad.
- **Cohesive family:** all tracks should share this palette and production feel
  so switching levels sounds like the same game, just a different mood.

## 2. Delivery specs (apply to every track)
- **Seamless loop.** Composed to loop with no audible gap or click; **no intro
  build-up and no ending fade**. Start and end at matching energy so the last
  moment flows straight back into the first. (If the model has a loop mode, use
  it.)
- **Length:** ~60–90 seconds per loop (long enough not to feel repetitive in a
  1–3 minute round).
- **Fully instrumental**, no vocals.
- **Consistent loudness across all tracks** so changing levels never jumps in
  volume — normalize every track to the same integrated loudness, mixed on the
  gentle side (it's background), with peak headroom (no clipping; true-peak
  ≤ −1 dBTP).
- **Stereo, 44.1 kHz.** Deliver a lossless master (WAV) and/or **OGG** for the
  web. Avoid MP3 for the loop: its encoder padding adds a short gap at the loop
  point — if MP3 is the only option, note it so the loop can be trimmed.
- **Filename convention (keyed to the level id):** `music-<level-id>.<ext>`,
  e.g. `music-sunny-range.ogg`. See the ids in §3.

## 3. Per-level track prompts
Each prompt below is self-contained (paste one in as-is). They all inherit the
identity and delivery specs above.

**`music-sunny-range`** — *Sunny Range* (bright day; the signature/home theme)
> Upbeat, cheerful instrumental cartoon music for a silly kids' golf game.
> Bright, sunny and carefree. Ukulele strums, bouncy marimba and glockenspiel
> melody, light hand-claps and shaker, warm plucked bass, a cheeky whistled
> countermelody. Major key, ~118 BPM, swinging and hoppy — a feel-good day at
> the driving range. Instrumental only, light and non-distracting, seamless
> loop with no intro or fade, kid-friendly.

**`music-sunset-hills`** — *Sunset Hills* (warm golden hour)
> Warm, relaxed instrumental cartoon music, golden-hour mood — mellow and
> content, gently swaying. Soft nylon-string guitar, warm marimba, brushed light
> percussion, a lazy whistled melody, mellow upright bass, a touch of vibraphone
> shimmer. Major key, ~104 BPM, easygoing shuffle. Cozy sunset over the hills.
> Instrumental only, soft and unobtrusive, seamless loop with no fade,
> kid-friendly.

**`music-chaos-carnival`** — *Chaos Carnival* (funfair dusk)
> Playful circus/carnival instrumental for a wacky kids' game — bouncy,
> mischievous, a little comedic chaos. Calliope/pump-organ melody, oompah tuba
> bassline, accordion, snare rolls and cymbal, xylophone runs, an occasional
> slide-whistle gag. Major key with cheeky chromatic turns, ~132 BPM, fast and
> jaunty. Big-top energy — silly, never scary. Instrumental only, kept light
> enough to sit under sound effects, seamless loop with no fade, kid-friendly.

**`music-moonlight-madness`** — *Moonlight Madness* (playful night)
> Nighttime instrumental cartoon music — mischievous and twinkly but never
> scary. Soft pizzicato strings, glockenspiel and celesta twinkles, muted plucky
> bass, brushed rimshots, a tip-toeing groove, an occasional owl-hoot-like
> woodwind. Light minor/mixolydian color, ~100 BPM, sneaky and bouncy — golf
> under the moon. Instrumental only, soft background, seamless loop with no
> fade, kid-friendly (cozy-spooky at most).

**`music-windy-cliffs`** — *Windy Cliffs* (breezy seaside)
> Airy, breezy instrumental cartoon music with a light sense of adventure and
> height. Whistled/flute lead like the wind, plucked acoustic guitar, light
> pizzicato strings, soft hand percussion, a gentle swelling sea-breeze pad,
> buoyant bass. Bright major key, ~112 BPM, lilting and lift-y — windswept
> cliffs, hopeful and fun, cute not epic. Instrumental only, non-distracting,
> seamless loop with no fade, kid-friendly.

**`music-duck-derby`** — *Duck Derby* (ponds and ducks)
> Quirky, watery instrumental cartoon music with a waddling bounce. Comedic
> kazoo and muted-trumpet "duck" motifs, plucky marimba, plip-plop woodblock and
> pizzicato droplets, splashy light percussion, a walking tuba/bass with a
> waddle rhythm, a cheerful whistle. Major key, ~116 BPM, hoppy and silly —
> ponds, splashes and rubber ducks. Instrumental only, background level,
> seamless loop with no fade, kid-friendly and funny.

**`music-title`** — *Title / menu theme* (optional, recommended)
> Inviting, cheerful instrumental main theme for a silly kids' golf game — the
> "front door" tune. A memorable, hummable melody on marimba/glockenspiel and
> ukulele, warm bass, light claps, a whistled hook and a little fanfare lift.
> Bright major key, ~120 BPM. Fun and full of personality but relaxed enough to
> loop on a menu. Instrumental only, seamless loop with no fade, kid-friendly.

## 4. Reusable template (for future levels)
To score a new range, copy this and fill the brackets, keeping the palette and
the loop/loudness rules from §1–2 unchanged — vary only mood, setting,
signature instrument, key and tempo:

> Instrumental cartoon music for a silly kids' golf game — **[MOOD: e.g. bright
> / mellow / mischievous / frantic]**, evoking **[SETTING & PALETTE: e.g. "a
> foggy swamp at dawn, murky greens and mist"]**. Toy-band palette (ukulele,
> marimba, glockenspiel, whistle, light percussion, warm bass) plus **[ONE
> SIGNATURE INSTRUMENT OR GAG that fits this level]**. **[KEY]** key,
> ~**[TEMPO]** BPM, **[RHYTHM/FEEL]**. Instrumental only, light background level,
> seamless loop with no intro or fade, kid-friendly, cohesive with the Golf
> Stars sound.

Name the output `music-<new-level-id>.<ext>` to match the level's id.

## 5. Handoff checklist (for whoever generates the tracks)
- [ ] One track per level id: `sunny-range`, `sunset-hills`, `chaos-carnival`,
      `moonlight-madness`, `windy-cliffs`, `duck-derby` (+ optional `title`).
- [ ] Each is a **seamless ~60–90s loop**, instrumental, no fade.
- [ ] All tracks normalized to the **same loudness**, gentle/background level.
- [ ] Cohesive palette across the set; each mood matches its level.
- [ ] Delivered as OGG (and/or WAV), named `music-<level-id>.<ext>`.

Once the files exist under that convention, wiring them into the game is a
separate, mechanical code step.
