/**
 * Audio — all sound effects and gibberish creature voices are synthesised with
 * the Web Audio API, so the game ships with zero audio files.
 * Browser-only. Safe to call before the AudioContext is unlocked (no-ops).
 */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  // Must be called from a user gesture to satisfy autoplay policies.
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function tone(freq, dur, type, gain, when, glideTo) {
    if (!ensure() || muted) return;
    const t0 = (when || 0) + now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, when, filterFreq) {
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
      filt.type = 'lowpass';
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
      noise(0.18, 0.25, 0, 1800);
      tone(180, 0.15, 'sine', 0.2, 0, 520);
    },
    boing() {
      tone(160, 0.28, 'square', 0.28, 0, 620);
      tone(320, 0.2, 'sine', 0.15, 0.05, 900);
    },
    sproing() {
      tone(220, 0.35, 'triangle', 0.3, 0, 1200);
      tone(440, 0.25, 'sine', 0.18, 0.06, 1500);
    },
    door() {
      noise(0.12, 0.35, 0, 1200);
      tone(520, 0.12, 'square', 0.2, 0.02, 180);
    },
    whirl() {
      tone(300, 0.4, 'sawtooth', 0.18, 0, 900);
    },
    clatter() {
      for (let i = 0; i < 5; i++) noise(0.06, 0.22, i * 0.05, 2600);
    },
    spray() {
      noise(0.5, 0.2, 0, 6000);
    },
    honk() {
      tone(240, 0.18, 'square', 0.3, 0);
      tone(200, 0.2, 'square', 0.3, 0.16);
    },
    gasp() {
      tone(500, 0.18, 'sine', 0.25, 0, 1100);
    },
    explode() {
      noise(0.5, 0.5, 0, 900);
      tone(90, 0.5, 'sawtooth', 0.3, 0, 40);
    },
    land() {
      tone(120, 0.1, 'sine', 0.18, 0, 70);
    },
    ui() {
      tone(660, 0.08, 'sine', 0.2, 0, 880);
    },
    cheer() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, i * 0.08));
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
      tone(f, 0.09, 'square', 0.16, i * 0.09, f * (mood === 'hurt' ? 0.7 : 1.3));
    }
  }

  const api = { unlock, setMuted, play, voice, isMuted: () => muted };

  global.GS = global.GS || {};
  global.GS.Audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
