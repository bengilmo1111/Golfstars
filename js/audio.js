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
  let musicGain = null;
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
    if (musicOn && !muted) startMusic();
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
    if (m) stopMusic();
    else if (musicOn) startMusic();
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

  // ---- Background music: a light, upbeat looping bed ----
  // 16 eighth-note steps; chord roots change every 4 steps (C - G - Am - F).
  const BASS = [130.81, null, null, null, 98.0, null, null, null, 110.0, null, null, null, 87.31, null, null, null];
  const MELODY = [523.25, null, 659.25, null, 784, null, 659.25, 587.33, 523.25, null, 659.25, 784, 880, null, 784, 659.25];
  const STEP_DUR = 0.19; // seconds per eighth note (~ upbeat tempo)
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  function musicNote(freq, when, type, gain, dur) {
    if (!musicGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function scheduleMusic() {
    if (!ctx || muted || !musicOn) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const b = BASS[step];
      if (b) musicNote(b, nextNoteTime, 'triangle', 0.5, STEP_DUR * 3.6);
      const m = MELODY[step];
      if (m) musicNote(m, nextNoteTime, 'sine', 0.32, STEP_DUR * 1.4);
      nextNoteTime += STEP_DUR;
      step = (step + 1) % 16;
    }
  }

  function startMusic() {
    if (!ensure() || musicTimer || muted || !musicOn) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 45);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function setMusic(on) {
    musicOn = on;
    if (on && !muted) startMusic();
    else stopMusic();
  }

  installAutoUnlock();

  const api = {
    unlock,
    setMuted,
    play,
    voice,
    setMusic,
    isMuted: () => muted,
    isMusicOn: () => musicOn
  };

  global.GS = global.GS || {};
  global.GS.Audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
