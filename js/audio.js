/**
 * Audio — all sound effects, gibberish creature voices, and a light background
 * music loop are synthesised with the Web Audio API, so the game ships with
 * zero audio files. Browser-only.
 *
 * Unlocking: browsers start the AudioContext "suspended" until a user gesture.
 * We install document-level listeners that unlock on the very first interaction
 * (any tap/click/key), which is far more robust than relying on one button.
 */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let musicGain = null; // procedural-loop bus
  let procGain = null; // procedural fade node
  let trackBusGain = null; // decoded per-level track bus
  let muted = false;
  let musicOn = true;
  const MASTER_VOL = 0.65;

  function ensure() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // master -> compressor (punch) -> destination
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ctx.destination);
    // Separate sub-bus for background music so SFX always sit on top.
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.11;
    musicGain.connect(master);
    procGain = ctx.createGain(); // fades the procedural loop in/out
    procGain.gain.value = 1;
    procGain.connect(musicGain);
    // Decoded per-level tracks sit on a louder bus (real music is normalised).
    trackBusGain = ctx.createGain();
    trackBusGain.gain.value = 0.45;
    trackBusGain.connect(master);
    return ctx;
  }

  // Called from a user gesture (or the auto-unlock listeners) to start audio.
  function unlock() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    // iOS needs a tiny silent buffer played inside the gesture to "wake up".
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) {
      /* ignore */
    }
    decodePreload();
    if (musicOn && !muted) applyMusic();
  }

  function installAutoUnlock() {
    if (typeof document === 'undefined') return;
    const kick = () => {
      unlock();
      if (ctx && ctx.state === 'running') {
        ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) =>
          document.removeEventListener(ev, kick, true)
        );
      }
    };
    ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) =>
      document.addEventListener(ev, kick, true)
    );
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : MASTER_VOL;
    if (m) stopAllMusic();
    else if (musicOn) applyMusic();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // ---- Low-level voices ----
  function tone(freq, dur, type, gain, when, glideTo, dest) {
    if (!ensure() || muted) return;
    const t0 = (when || 0) + now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, when, filterFreq, filterType) {
    if (!ensure() || muted) return;
    const t0 = (when || 0) + now();
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain || 0.3;
    let node = src;
    if (filterFreq) {
      const filt = ctx.createBiquadFilter();
      filt.type = filterType || 'lowpass';
      filt.frequency.value = filterFreq;
      src.connect(filt);
      node = filt;
    }
    node.connect(g);
    g.connect(master);
    src.start(t0);
  }

  // ---- Named effects mapped from prop `sound` metadata ----
  const EFFECTS = {
    swing() {
      // Whoosh: filtered noise sweep + rising body.
      noise(0.22, 0.35, 0, 2400, 'bandpass');
      tone(180, 0.18, 'sine', 0.25, 0, 640);
    },
    boing() {
      tone(150, 0.32, 'square', 0.34, 0, 680);
      tone(300, 0.24, 'sine', 0.18, 0.05, 1000);
      tone(90, 0.12, 'sine', 0.2, 0, 60);
    },
    sproing() {
      tone(200, 0.4, 'triangle', 0.38, 0, 1300);
      tone(400, 0.3, 'sine', 0.2, 0.06, 1700);
      tone(600, 0.2, 'sine', 0.12, 0.12, 2200);
    },
    door() {
      noise(0.14, 0.4, 0, 1400);
      tone(520, 0.14, 'square', 0.24, 0.02, 160);
      tone(80, 0.18, 'sine', 0.25, 0.04, 50);
    },
    whirl() {
      tone(300, 0.45, 'sawtooth', 0.22, 0, 1000);
      tone(450, 0.3, 'sawtooth', 0.12, 0.1, 700);
    },
    clatter() {
      for (let i = 0; i < 6; i++) {
        noise(0.06, 0.26, i * 0.045, 2800, 'highpass');
        tone(300 + Math.random() * 300, 0.05, 'square', 0.12, i * 0.045);
      }
    },
    spray() {
      noise(0.55, 0.22, 0, 6500, 'highpass');
      noise(0.55, 0.1, 0.05, 3000, 'highpass');
    },
    honk() {
      tone(233, 0.2, 'sawtooth', 0.32, 0);
      tone(311, 0.2, 'sawtooth', 0.26, 0);
      tone(233, 0.22, 'sawtooth', 0.32, 0.18);
      tone(311, 0.22, 'sawtooth', 0.26, 0.18);
    },
    gasp() {
      tone(500, 0.2, 'sine', 0.28, 0, 1200);
      tone(760, 0.16, 'sine', 0.16, 0.05, 1500);
    },
    explode() {
      noise(0.6, 0.6, 0, 1100);
      noise(0.3, 0.4, 0, 4000, 'highpass');
      tone(90, 0.55, 'sawtooth', 0.35, 0, 36);
      tone(160, 0.4, 'square', 0.2, 0, 50);
    },
    thwack() {
      // Crisp club-on-ball impact.
      noise(0.05, 0.5, 0, 5000, 'highpass');
      tone(320, 0.09, 'square', 0.32, 0, 120);
      tone(680, 0.05, 'sine', 0.16, 0, 240);
    },
    pop() {
      // Balloon jackpot pop.
      tone(900, 0.07, 'sine', 0.34, 0, 1700);
      noise(0.05, 0.24, 0, 4000, 'highpass');
      [1200, 1600, 2000].forEach((f, i) => tone(f, 0.1, 'triangle', 0.16, 0.04 + i * 0.05));
    },
    splash() {
      noise(0.4, 0.42, 0, 2600);
      noise(0.25, 0.24, 0.05, 1200);
      tone(300, 0.28, 'sine', 0.2, 0, 110);
    },
    quack() {
      tone(320, 0.12, 'sawtooth', 0.28, 0, 420);
      tone(300, 0.1, 'sawtooth', 0.24, 0.12, 380);
    },
    buzz() {
      tone(120, 0.35, 'sawtooth', 0.22, 0, 90);
      tone(180, 0.3, 'square', 0.12, 0.05, 150);
    },
    land() {
      tone(120, 0.12, 'sine', 0.22, 0, 68);
      noise(0.08, 0.14, 0, 900);
    },
    ui() {
      tone(680, 0.09, 'sine', 0.22, 0, 920);
      tone(1360, 0.06, 'sine', 0.08, 0.02);
    },
    combo() {
      // Bright ascending sparkle for multi-target combos.
      [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.24, i * 0.06));
    },
    cheer() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.26, i * 0.09));
      [1047, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, 0.36 + i * 0.06));
    }
  };

  function play(name) {
    const fn = EFFECTS[name];
    if (fn) fn();
  }

  /**
   * Gibberish voice line — a short run of pitched blips around a base pitch.
   * `mood`: 'happy' rises, 'hurt' falls, 'idle' wanders.
   */
  function voice(basePitch, mood) {
    if (!ensure() || muted) return;
    basePitch = basePitch || 260;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      let f = basePitch * (0.8 + Math.random() * 0.6);
      if (mood === 'happy') f *= 1 + i * 0.12;
      if (mood === 'hurt') f *= 1 - i * 0.1;
      tone(f, 0.1, 'square', 0.18, i * 0.09, f * (mood === 'hurt' ? 0.7 : 1.3));
    }
  }

  // ---- Background music ----
  // Per-level tracks live at assets/music-<key>.<ext>. When a track is present
  // it crossfades in; when it's absent (or still loading) a light procedural
  // loop plays instead, so the game always has music and drops the real tracks
  // in seamlessly once they exist.
  const MUSIC_EXTS = ['ogg', 'mp3', 'wav', 'm4a'];
  const XFADE = 0.8; // crossfade seconds
  const trackBuffers = {}; // key -> AudioBuffer
  const trackState = {}; // key -> 'loading' | 'ready' | 'missing'
  let preloadList = ['title'];
  let desiredKey = 'title'; // what we want to hear
  let currentMode = 'none'; // 'track' | 'procedural' | 'none'
  let currentTrackKey = null;
  let trackSrc = null;
  let trackGain = null;

  // --- Procedural fallback loop (a light, upbeat bed) ---
  // 16 eighth-note steps; chord roots change every 4 steps (C - G - Am - F).
  const BASS = [130.81, null, null, null, 98.0, null, null, null, 110.0, null, null, null, 87.31, null, null, null];
  const MELODY = [523.25, null, 659.25, null, 784, null, 659.25, 587.33, 523.25, null, 659.25, 784, 880, null, 784, 659.25];
  const STEP_DUR = 0.19;
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  function musicNote(freq, when, type, gain, dur) {
    if (!procGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(procGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function scheduleMusic() {
    if (!ctx || currentMode !== 'procedural') return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const b = BASS[step];
      if (b) musicNote(b, nextNoteTime, 'triangle', 0.5, STEP_DUR * 3.6);
      const m = MELODY[step];
      if (m) musicNote(m, nextNoteTime, 'sine', 0.32, STEP_DUR * 1.4);
      nextNoteTime += STEP_DUR;
      step = (step + 1) % 16;
    }
  }

  function startScheduler() {
    if (musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 45);
  }
  function stopScheduler() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function rampGain(param, target, dur) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + dur);
  }

  function fadeOutCurrent() {
    if (currentMode === 'procedural') {
      rampGain(procGain.gain, 0, XFADE);
      setTimeout(stopScheduler, XFADE * 1000 + 80);
    } else if (currentMode === 'track' && trackSrc) {
      const s = trackSrc;
      rampGain(trackGain.gain, 0, XFADE);
      try {
        s.stop(ctx.currentTime + XFADE + 0.06);
      } catch (e) {
        /* already stopped */
      }
    }
    trackSrc = null;
    trackGain = null;
    currentMode = 'none';
  }

  function startProceduralMusic() {
    fadeOutCurrent();
    currentMode = 'procedural';
    currentTrackKey = null;
    procGain.gain.cancelScheduledValues(ctx.currentTime);
    procGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    startScheduler();
    rampGain(procGain.gain, 1, XFADE);
  }

  function startTrack(key) {
    fadeOutCurrent();
    const src = ctx.createBufferSource();
    src.buffer = trackBuffers[key];
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(trackBusGain);
    src.start();
    rampGain(g.gain, 1, XFADE);
    trackSrc = src;
    trackGain = g;
    currentMode = 'track';
    currentTrackKey = key;
  }

  function stopAllMusic() {
    stopScheduler();
    if (trackSrc) {
      try {
        trackSrc.stop();
      } catch (e) {
        /* ignore */
      }
    }
    trackSrc = null;
    trackGain = null;
    currentMode = 'none';
  }

  // Pick the right source for the desired level: its track if decoded, else the
  // procedural fallback (and make sure the track is loading for next time).
  function applyMusic() {
    if (!ctx || ctx.state !== 'running' || !musicOn || muted) return;
    const key = desiredKey;
    if (trackState[key] === 'ready' && trackBuffers[key]) {
      if (currentMode === 'track' && currentTrackKey === key) return;
      startTrack(key);
    } else {
      if (currentMode !== 'procedural') startProceduralMusic();
      if (trackState[key] === undefined) loadTrack(key);
    }
  }

  function decodeAudio(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  function loadTrack(key) {
    if (!ctx || trackState[key] === 'loading' || trackState[key] === 'ready') return;
    trackState[key] = 'loading';
    const tryExt = (i) => {
      if (i >= MUSIC_EXTS.length) {
        trackState[key] = 'missing';
        return;
      }
      fetch('assets/music-' + key + '.' + MUSIC_EXTS[i])
        .then((r) => {
          if (!r.ok) throw new Error('not found');
          return r.arrayBuffer();
        })
        .then(decodeAudio)
        .then((buf) => {
          trackBuffers[key] = buf;
          trackState[key] = 'ready';
          if (desiredKey === key && !(currentMode === 'track' && currentTrackKey === key)) {
            applyMusic();
          }
        })
        .catch(() => tryExt(i + 1));
    };
    tryExt(0);
  }

  function decodePreload() {
    if (!ctx) return;
    preloadList.forEach(loadTrack);
  }

  // Public: queue the level tracks to preload, and choose which one plays.
  function preloadMusic(ids) {
    preloadList = ['title'].concat(ids || []);
    decodePreload();
  }
  function playLevel(id) {
    desiredKey = id || 'title';
    applyMusic();
  }

  function setMusic(on) {
    musicOn = on;
    if (on && !muted) applyMusic();
    else stopAllMusic();
  }

  installAutoUnlock();

  const api = {
    unlock,
    setMuted,
    play,
    voice,
    setMusic,
    preloadMusic,
    playLevel,
    isMuted: () => muted,
    isMusicOn: () => musicOn
  };

  global.GS = global.GS || {};
  global.GS.Audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
