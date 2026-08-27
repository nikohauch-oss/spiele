/* =========================================================================
 * HYPERCELL — 05_audio.js
 * Procedural audio engine. Every sound in the game is synthesised at
 * runtime from oscillators, noise and filters — there are no audio files,
 * therefore there is nothing that can fail to load.
 *
 * Layered weapon design (brief §32): each shot fires a transient, a body,
 * a sub, a mechanical layer and a reverb tail, all separately tunable.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const Audio = HC.Audio = {
    ctx: null,
    ready: false,
    _voices: 0,
    _buses: null,
    _noise: null,
    _pinkNoise: null,
    _ir: null,
    listener: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0 },
    _lowpassTarget: 1.0,     // ducked when the player is dead / menu open
    _muted: false
  };

  /* ------------------------------------------------------------------ *
   * Setup
   * ------------------------------------------------------------------ */
  Audio.init = function () {
    if (Audio.ctx) {
      if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
      return Audio.ready;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { HC.Log.warn('Audio', 'WebAudio unavailable — running silent.'); return false; }
    try {
      const ctx = Audio.ctx = new AC({ latencyHint: 'interactive' });

      const master = ctx.createGain();
      master.gain.value = CFG.audio.master;

      // Gentle master bus compression keeps explosions from clipping the mix.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 24;
      comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;

      // Global tone filter used for "underwater" ducking on death / pause.
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = 20000; tone.Q.value = 0.4;

      tone.connect(comp); comp.connect(master); master.connect(ctx.destination);

      const mk = (vol) => { const g = ctx.createGain(); g.gain.value = vol; g.connect(tone); return g; };
      const buses = Audio._buses = {
        master, tone, comp,
        sfx: mk(CFG.audio.sfx),
        music: mk(CFG.audio.music),
        ui: mk(CFG.audio.ui),
        voice: mk(CFG.audio.voice)
      };

      // Procedural reverb: exponentially-decaying noise impulse response.
      const conv = ctx.createConvolver();
      conv.buffer = Audio._makeImpulse(CFG.audio.reverbDecay, 2.4);
      const revSend = ctx.createGain(); revSend.gain.value = 1.0;
      const revReturn = ctx.createGain(); revReturn.gain.value = CFG.audio.reverbMix;
      revSend.connect(conv); conv.connect(revReturn); revReturn.connect(buses.sfx);
      buses.reverbSend = revSend;
      buses.reverbReturn = revReturn;

      Audio._noise = Audio._makeNoise(2.0, 'white');
      Audio._pinkNoise = Audio._makeNoise(2.0, 'pink');

      Audio.ready = true;
      HC.Log.info('Audio', 'engine online @' + ctx.sampleRate + 'Hz');
      Music._init();
      return true;
    } catch (e) {
      HC.Log.error('Audio', 'init failed:', e.message);
      return false;
    }
  };

  Audio._makeNoise = function (seconds, kind) {
    const ctx = Audio.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  };

  Audio._makeImpulse = function (decay, seconds) {
    const ctx = Audio.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + exponential tail, slightly decorrelated per channel
        const env = Math.pow(1 - t, decay * 2.6);
        const er = (i < ctx.sampleRate * 0.03) ? 1.6 : 1.0;
        d[i] = (Math.random() * 2 - 1) * env * er * (c ? 0.94 : 1.0);
      }
    }
    return buf;
  };

  /** Soft-clip curve for weapon body saturation. */
  const _shaperCurve = (function () {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.2) * 0.86; }
    return c;
  })();

  /* ------------------------------------------------------------------ *
   * Spatialisation — manual distance gain + stereo pan. Cheaper and far
   * more predictable than PannerNode for a fast-moving third-person cam.
   * ------------------------------------------------------------------ */
  Audio.setListener = function (pos, forward, right) {
    const L = Audio.listener;
    L.x = pos.x; L.y = pos.y; L.z = pos.z;
    L.fx = forward.x; L.fy = forward.y; L.fz = forward.z;
    L.rx = right.x; L.ry = right.y; L.rz = right.z;
  };

  Audio._spatial = function (position) {
    if (!position) return { gain: 1, pan: 0, delay: 0, muffle: 20000 };
    const L = Audio.listener;
    const dx = position.x - L.x, dy = position.y - L.y, dz = position.z - L.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const a = CFG.audio.rolloffStart, b = CFG.audio.rolloffEnd;
    let gain;
    if (dist <= a) gain = 1;
    else if (dist >= b) gain = 0;
    else gain = Math.pow(1 - (dist - a) / (b - a), 1.7);
    const inv = dist > 0.0001 ? 1 / dist : 0;
    const pan = U.clamp((dx * L.rx + dy * L.ry + dz * L.rz) * inv, -1, 1) * 0.92;
    // Air absorption: distant shots lose their top end.
    const muffle = U.lerp(20000, 1450, U.clamp01(dist / b));
    return { gain, pan, delay: Math.min(0.35, dist / 343), muffle };
  };

  /* ------------------------------------------------------------------ *
   * Voice construction helpers
   * ------------------------------------------------------------------ */
  function busFor(name) {
    const b = Audio._buses;
    return b[name] || b.sfx;
  }

  /** Creates the shared output chain for one sound event. */
  function makeVoice(opts) {
    const ctx = Audio.ctx;
    const sp = Audio._spatial(opts.position);
    if (sp.gain <= 0.002) return null;
    if (Audio._voices >= CFG.audio.maxConcurrentSfx && !opts.important) return null;

    const out = ctx.createGain();
    out.gain.value = (opts.volume === undefined ? 1 : opts.volume) * sp.gain;

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = sp.pan; out.connect(pan); }

    let tail = pan || out;
    if (sp.muffle < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = sp.muffle; lp.Q.value = 0.5;
      tail.connect(lp); tail = lp;
    }
    tail.connect(busFor(opts.bus));

    if (opts.reverb && Audio._buses.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb * sp.gain;
      tail.connect(send); send.connect(Audio._buses.reverbSend);
    }

    Audio._voices++;
    const t0 = ctx.currentTime + (opts.spatialDelay === false ? 0 : sp.delay);
    return {
      ctx, out, t0, spatial: sp,
      done(at) {
        const when = Math.max(0, (at - ctx.currentTime) * 1000) + 90;
        setTimeout(() => { Audio._voices = Math.max(0, Audio._voices - 1); try { out.disconnect(); } catch (e) {} }, when);
      }
    };
  }

  /** Noise burst through a band-pass with an amplitude envelope. */
  function noiseBurst(v, o) {
    const ctx = v.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.pink ? Audio._pinkNoise : Audio._noise;
    src.playbackRate.value = o.rate || 1;
    const off = Math.random() * 1.4;

    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq, v.t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.freqEnd), v.t0 + o.dur);
    f.Q.value = o.q === undefined ? 1.0 : o.q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, v.t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), v.t0 + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, v.t0 + o.dur);

    let node = f;
    if (o.drive) {
      const ws = ctx.createWaveShaper(); ws.curve = _shaperCurve; ws.oversample = '2x';
      f.connect(ws); node = ws;
    }
    src.connect(f); node.connect(g); g.connect(v.out);
    src.start(v.t0 + off > 0 ? v.t0 : v.t0, off, o.dur + 0.05);
    src.stop(v.t0 + o.dur + 0.05);
    return v.t0 + o.dur;
  }

  /** Pitched oscillator with a frequency sweep. */
  function tone(v, o) {
    const ctx = v.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, v.t0);
    if (o.f1 !== undefined) {
      if (o.linear) osc.frequency.linearRampToValueAtTime(Math.max(1, o.f1), v.t0 + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), v.t0 + o.dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, v.t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), v.t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, v.t0 + o.dur);

    let node = osc;
    if (o.fm) {
      const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = o.fm.freq;
      const mg = ctx.createGain(); mg.gain.value = o.fm.depth;
      m.connect(mg); mg.connect(osc.frequency); m.start(v.t0); m.stop(v.t0 + o.dur + 0.02);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.filterFreq || 1200; f.Q.value = o.filterQ || 1;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(v.out);
    osc.start(v.t0); osc.stop(v.t0 + o.dur + 0.02);
    return v.t0 + o.dur;
  }

  /* ------------------------------------------------------------------ *
   * Sound bank. Each entry receives (voice, options) and returns the time
   * at which the sound finishes.
   * ------------------------------------------------------------------ */
  const BANK = Audio.BANK = {};
  const S = (id, fn) => { BANK[id] = fn; };

  /* --- weapons ---------------------------------------------------------- */
  function weaponShot(v, p) {
    const pitch = p.pitch || 1;
    let end = v.t0;
    // 1 — transient crack
    end = Math.max(end, tone(v, { type: 'triangle', f0: p.crackF0 * pitch, f1: p.crackF1 * pitch,
      dur: p.crackDur, gain: p.crackGain, attack: 0.001 }));
    // 2 — body (saturated noise)
    end = Math.max(end, noiseBurst(v, { freq: p.bodyF * pitch, freqEnd: p.bodyFEnd * pitch,
      q: p.bodyQ, dur: p.bodyDur, gain: p.bodyGain, drive: true, filter: 'bandpass' }));
    // 3 — sub thump
    if (p.subGain > 0) {
      end = Math.max(end, tone(v, { type: 'sine', f0: p.subF0 * pitch, f1: p.subF1 * pitch,
        dur: p.subDur, gain: p.subGain, attack: 0.002 }));
    }
    // 4 — mechanical action
    if (p.mechGain > 0) {
      noiseBurst(v, { freq: 4200 * pitch, q: 1.6, dur: 0.035, gain: p.mechGain, filter: 'highpass' });
    }
    // 5 — tail (short filtered decay; the reverb send does the room)
    if (p.tailGain > 0) {
      end = Math.max(end, noiseBurst(v, { freq: p.tailF * pitch, freqEnd: p.tailF * 0.35 * pitch,
        q: 0.7, dur: p.tailDur, gain: p.tailGain, filter: 'lowpass', pink: true }));
    }
    return end;
  }

  S('fire_pulse', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 2100, crackF1: 320, crackDur: 0.045, crackGain: 0.42,
    bodyF: 1350, bodyFEnd: 420, bodyQ: 1.1, bodyDur: 0.10, bodyGain: 0.50,
    subF0: 105, subF1: 46, subDur: 0.13, subGain: 0.40, mechGain: 0.10, tailF: 2600, tailDur: 0.20, tailGain: 0.13 }));

  S('fire_smg', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 2700, crackF1: 520, crackDur: 0.030, crackGain: 0.32,
    bodyF: 1850, bodyFEnd: 700, bodyQ: 1.4, bodyDur: 0.065, bodyGain: 0.38,
    subF0: 130, subF1: 62, subDur: 0.075, subGain: 0.24, mechGain: 0.13, tailF: 3200, tailDur: 0.12, tailGain: 0.09 }));

  S('fire_rotary', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 1500, crackF1: 260, crackDur: 0.032, crackGain: 0.30,
    bodyF: 900, bodyFEnd: 300, bodyQ: 0.9, bodyDur: 0.075, bodyGain: 0.44,
    subF0: 85, subF1: 40, subDur: 0.10, subGain: 0.38, mechGain: 0.16, tailF: 1800, tailDur: 0.14, tailGain: 0.10 }));

  S('fire_shotgun', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 1700, crackF1: 180, crackDur: 0.07, crackGain: 0.50,
    bodyF: 720, bodyFEnd: 190, bodyQ: 0.65, bodyDur: 0.24, bodyGain: 0.62,
    subF0: 78, subF1: 32, subDur: 0.30, subGain: 0.55, mechGain: 0.08, tailF: 1400, tailDur: 0.50, tailGain: 0.22 }));

  S('fire_precision', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 3400, crackF1: 260, crackDur: 0.055, crackGain: 0.58,
    bodyF: 1150, bodyFEnd: 250, bodyQ: 0.8, bodyDur: 0.20, bodyGain: 0.58,
    subF0: 95, subF1: 34, subDur: 0.34, subGain: 0.52, mechGain: 0.10, tailF: 1900, tailDur: 0.72, tailGain: 0.26 }));

  S('fire_launcher', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 900, crackF1: 140, crackDur: 0.06, crackGain: 0.40,
    bodyF: 480, bodyFEnd: 150, bodyQ: 0.7, bodyDur: 0.16, bodyGain: 0.48,
    subF0: 70, subF1: 30, subDur: 0.24, subGain: 0.50, mechGain: 0.14, tailF: 1000, tailDur: 0.28, tailGain: 0.14 }));

  S('fire_pistol', (v, o) => weaponShot(v, { pitch: o.pitch, crackF0: 1200, crackF1: 300, crackDur: 0.028, crackGain: 0.22,
    bodyF: 780, bodyFEnd: 260, bodyQ: 1.8, bodyDur: 0.075, bodyGain: 0.30,
    subF0: 110, subF1: 50, subDur: 0.09, subGain: 0.20, mechGain: 0.18, tailF: 1500, tailDur: 0.10, tailGain: 0.06 }));

  S('fire_plasma', (v, o) => {
    const p = o.pitch || 1;
    tone(v, { type: 'sawtooth', f0: 880 * p, f1: 180 * p, dur: 0.16, gain: 0.30,
      filter: 'bandpass', filterFreq: 1400, filterQ: 3.2, fm: { freq: 62, depth: 340 } });
    tone(v, { type: 'sine', f0: 1650 * p, f1: 420 * p, dur: 0.09, gain: 0.20 });
    noiseBurst(v, { freq: 2600 * p, freqEnd: 900 * p, q: 1.4, dur: 0.13, gain: 0.16 });
    return v.t0 + 0.2;
  });

  S('fire_blade', (v, o) => {
    const p = o.pitch || 1;
    noiseBurst(v, { freq: 900 * p, freqEnd: 3200 * p, q: 0.8, dur: 0.20, gain: 0.30, filter: 'bandpass', pink: true });
    tone(v, { type: 'triangle', f0: 2400 * p, f1: 1200 * p, dur: 0.22, gain: 0.14, filter: 'highpass', filterFreq: 900 });
    tone(v, { type: 'sine', f0: 3600 * p, f1: 2900 * p, dur: 0.30, gain: 0.07 });
    return v.t0 + 0.32;
  });

  S('rotary_spin', (v, o) => {
    const p = o.pitch || 1;
    tone(v, { type: 'sawtooth', f0: 60 * p, f1: 240 * p, dur: o.dur || 0.62, gain: 0.20, linear: true,
      filter: 'lowpass', filterFreq: 900, filterQ: 2.0 });
    noiseBurst(v, { freq: 500, freqEnd: 1600, q: 1.0, dur: o.dur || 0.62, gain: 0.10, filter: 'bandpass' });
    return v.t0 + (o.dur || 0.62);
  });

  /* --- reloads ---------------------------------------------------------- */
  function mech(v, at, freq, dur, gain, q) {
    const ctx = v.ctx;
    const src = ctx.createBufferSource(); src.buffer = Audio._noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(v.out);
    src.start(at, Math.random(), dur + 0.03); src.stop(at + dur + 0.03);
  }
  S('reload_rifle', (v) => { const t = v.t0;
    mech(v, t + 0.00, 2600, 0.07, 0.26, 5); mech(v, t + 0.30, 900, 0.10, 0.30, 3);
    mech(v, t + 0.95, 1700, 0.09, 0.32, 4); mech(v, t + 1.42, 3400, 0.06, 0.24, 7);
    tone(v, { type: 'square', f0: 190, f1: 120, dur: 0.09, gain: 0.10 }); return t + 1.6; });
  S('reload_smg', (v) => { const t = v.t0;
    mech(v, t + 0.00, 3000, 0.05, 0.22, 6); mech(v, t + 0.26, 1200, 0.07, 0.26, 4);
    mech(v, t + 0.86, 2400, 0.06, 0.26, 5); return t + 1.1; });
  S('reload_heavy', (v) => { const t = v.t0;
    mech(v, t + 0.00, 1400, 0.11, 0.30, 3); mech(v, t + 0.55, 600, 0.16, 0.34, 2);
    tone(v, { type: 'sine', f0: 90, f1: 50, dur: 0.20, gain: 0.24 });
    mech(v, t + 1.70, 1000, 0.14, 0.32, 3); mech(v, t + 2.60, 2200, 0.08, 0.26, 5); return t + 3.0; });
  S('reload_shell', (v) => { const t = v.t0;
    mech(v, t + 0.00, 2100, 0.05, 0.22, 7); mech(v, t + 0.14, 1300, 0.06, 0.24, 5); return t + 0.28; });
  S('reload_pump', (v) => { const t = v.t0;
    mech(v, t + 0.00, 900, 0.09, 0.30, 3); mech(v, t + 0.13, 1800, 0.07, 0.28, 4); return t + 0.26; });
  S('reload_generic', (v) => { const t = v.t0; mech(v, t, 1800, 0.08, 0.26, 4); mech(v, t + 0.4, 1200, 0.09, 0.26, 4); return t + 0.6; });
  S('empty_click', (v) => { mech(v, v.t0, 3200, 0.04, 0.22, 9); return v.t0 + 0.06; });
  S('weapon_swap', (v) => { const t = v.t0; mech(v, t, 2200, 0.06, 0.20, 6); mech(v, t + 0.16, 1400, 0.07, 0.22, 4); return t + 0.3; });

  /* --- impacts ---------------------------------------------------------- */
  S('impact_concrete', (v, o) => { noiseBurst(v, { freq: 1500, freqEnd: 420, q: 0.9, dur: 0.11, gain: 0.34 * (o.scale || 1) });
    tone(v, { type: 'sine', f0: 190, f1: 80, dur: 0.09, gain: 0.16 * (o.scale || 1) }); return v.t0 + 0.14; });
  S('impact_metal', (v, o) => { const s = o.scale || 1;
    noiseBurst(v, { freq: 3400, freqEnd: 1400, q: 1.6, dur: 0.09, gain: 0.26 * s });
    tone(v, { type: 'triangle', f0: 2400 + Math.random() * 900, f1: 1500, dur: 0.20, gain: 0.14 * s });
    tone(v, { type: 'sine', f0: 5200, f1: 4200, dur: 0.12, gain: 0.07 * s }); return v.t0 + 0.24; });
  S('impact_glass', (v, o) => { const s = o.scale || 1;
    for (let i = 0; i < 4; i++) tone(v, { type: 'sine', f0: 3000 + Math.random() * 3800, f1: 2200, dur: 0.14 + Math.random() * 0.14, gain: 0.075 * s });
    noiseBurst(v, { freq: 6200, freqEnd: 2600, q: 1.1, dur: 0.20, gain: 0.16 * s, filter: 'highpass' }); return v.t0 + 0.34; });
  S('impact_wood', (v, o) => { const s = o.scale || 1;
    noiseBurst(v, { freq: 950, freqEnd: 300, q: 1.2, dur: 0.10, gain: 0.28 * s });
    tone(v, { type: 'triangle', f0: 420, f1: 190, dur: 0.11, gain: 0.14 * s }); return v.t0 + 0.14; });
  S('impact_energy', (v, o) => { const s = o.scale || 1;
    tone(v, { type: 'sine', f0: 1800, f1: 380, dur: 0.16, gain: 0.20 * s, fm: { freq: 90, depth: 260 } });
    noiseBurst(v, { freq: 2800, freqEnd: 900, q: 1.8, dur: 0.13, gain: 0.14 * s }); return v.t0 + 0.2; });
  S('impact_flesh', (v, o) => { const s = o.scale || 1;
    noiseBurst(v, { freq: 620, freqEnd: 180, q: 0.8, dur: 0.09, gain: 0.30 * s, pink: true });
    tone(v, { type: 'sine', f0: 160, f1: 62, dur: 0.10, gain: 0.20 * s }); return v.t0 + 0.13; });
  S('impact_shield', (v, o) => { const s = o.scale || 1;
    tone(v, { type: 'sine', f0: 900, f1: 1600, dur: 0.14, gain: 0.18 * s });
    tone(v, { type: 'sine', f0: 1800, f1: 2600, dur: 0.10, gain: 0.10 * s });
    noiseBurst(v, { freq: 3600, freqEnd: 1800, q: 2.2, dur: 0.10, gain: 0.10 * s }); return v.t0 + 0.18; });

  /* --- explosions ------------------------------------------------------- */
  function boom(v, s, big) {
    noiseBurst(v, { freq: big ? 260 : 420, freqEnd: big ? 60 : 110, q: 0.6, dur: big ? 1.15 : 0.62,
      gain: 0.72 * s, drive: true, pink: true, filter: 'lowpass' });
    tone(v, { type: 'sine', f0: big ? 110 : 150, f1: big ? 22 : 34, dur: big ? 1.0 : 0.55, gain: 0.80 * s });
    tone(v, { type: 'triangle', f0: big ? 1800 : 2400, f1: 300, dur: 0.10, gain: 0.36 * s });
    noiseBurst(v, { freq: 5200, freqEnd: 1200, q: 0.8, dur: big ? 0.9 : 0.45, gain: 0.20 * s, filter: 'highpass' });
    return v.t0 + (big ? 1.3 : 0.7);
  }
  S('explosion_small', (v, o) => boom(v, (o.scale || 1) * 0.72, false));
  S('explosion_large', (v, o) => boom(v, (o.scale || 1) * 1.0, true));
  S('explosion_ultimate', (v, o) => {
    const s = o.scale || 1; boom(v, s * 1.15, true);
    tone(v, { type: 'sawtooth', f0: 70, f1: 24, dur: 2.0, gain: 0.35 * s, filter: 'lowpass', filterFreq: 300 });
    return v.t0 + 2.2;
  });

  /* --- movement --------------------------------------------------------- */
  const FOOT_MAT = {
    concrete: { f: 1400, q: 1.4, g: 0.16, sub: 150 },
    metal:    { f: 2600, q: 2.2, g: 0.15, sub: 210 },
    grate:    { f: 3400, q: 3.0, g: 0.16, sub: 260 },
    grass:    { f: 900,  q: 0.8, g: 0.11, sub: 110 },
    water:    { f: 1800, q: 0.7, g: 0.14, sub: 120 },
    glass:    { f: 4200, q: 2.6, g: 0.12, sub: 240 }
  };
  S('footstep', (v, o) => {
    const m = FOOT_MAT[o.material] || FOOT_MAT.concrete;
    const w = o.weight || 1;
    noiseBurst(v, { freq: m.f * (o.pitch || 1), freqEnd: m.f * 0.35, q: m.q, dur: 0.075, gain: m.g * w, pink: true });
    tone(v, { type: 'sine', f0: m.sub * (o.pitch || 1), f1: m.sub * 0.45, dur: 0.09, gain: 0.10 * w });
    return v.t0 + 0.12;
  });
  S('land_soft', (v, o) => { const w = o.weight || 1;
    noiseBurst(v, { freq: 900, freqEnd: 260, q: 0.9, dur: 0.14, gain: 0.24 * w, pink: true });
    tone(v, { type: 'sine', f0: 130, f1: 52, dur: 0.16, gain: 0.22 * w }); return v.t0 + 0.2; });
  S('land_hard', (v, o) => { const w = o.weight || 1;
    noiseBurst(v, { freq: 700, freqEnd: 160, q: 0.7, dur: 0.30, gain: 0.42 * w, pink: true, drive: true });
    tone(v, { type: 'sine', f0: 105, f1: 32, dur: 0.36, gain: 0.44 * w });
    mech(v, v.t0 + 0.02, 1900, 0.06, 0.14, 4); return v.t0 + 0.42; });
  S('jump', (v, o) => { const w = o.weight || 1;
    noiseBurst(v, { freq: 1600, freqEnd: 600, q: 1.1, dur: 0.10, gain: 0.13 * w, pink: true });
    tone(v, { type: 'sine', f0: 210, f1: 340, dur: 0.11, gain: 0.10 * w }); return v.t0 + 0.14; });
  S('dodge', (v, o) => {
    noiseBurst(v, { freq: 700, freqEnd: 2600, q: 0.7, dur: 0.24, gain: 0.20, pink: true, filter: 'bandpass' });
    tone(v, { type: 'sine', f0: 300, f1: 620, dur: 0.20, gain: 0.10 }); return v.t0 + 0.28; });
  S('slide', (v) => { noiseBurst(v, { freq: 1200, freqEnd: 400, q: 0.6, dur: 0.60, gain: 0.20, pink: true }); return v.t0 + 0.65; });

  /* --- abilities -------------------------------------------------------- */
  S('ability_dash', (v, o) => {
    const p = o.pitch || 1;
    tone(v, { type: 'sawtooth', f0: 180 * p, f1: 900 * p, dur: 0.22, gain: 0.22, filter: 'bandpass', filterFreq: 1200, filterQ: 2.4 });
    noiseBurst(v, { freq: 800 * p, freqEnd: 3400 * p, q: 0.8, dur: 0.26, gain: 0.20 });
    return v.t0 + 0.3; });
  S('ability_shield_up', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 220 * p, f1: 780 * p, dur: 0.35, gain: 0.24 });
    tone(v, { type: 'sine', f0: 440 * p, f1: 1560 * p, dur: 0.35, gain: 0.12 });
    noiseBurst(v, { freq: 1800, freqEnd: 4200, q: 1.4, dur: 0.30, gain: 0.12 }); return v.t0 + 0.4; });
  S('ability_shield_break', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 900 * p, f1: 120 * p, dur: 0.35, gain: 0.26 });
    noiseBurst(v, { freq: 3200, freqEnd: 500, q: 1.0, dur: 0.34, gain: 0.24 }); return v.t0 + 0.4; });
  S('ability_teleport', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 1400 * p, f1: 140 * p, dur: 0.18, gain: 0.24, fm: { freq: 220, depth: 500 } });
    tone(v, { type: 'sine', f0: 200 * p, f1: 1900 * p, dur: 0.22, gain: 0.18 });
    noiseBurst(v, { freq: 2400, freqEnd: 600, q: 1.6, dur: 0.20, gain: 0.14 }); return v.t0 + 0.28; });
  S('ability_cloak', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 1800 * p, f1: 240 * p, dur: 0.55, gain: 0.16, fm: { freq: 30, depth: 180 } });
    noiseBurst(v, { freq: 4200, freqEnd: 700, q: 0.8, dur: 0.55, gain: 0.12, filter: 'lowpass' }); return v.t0 + 0.6; });
  S('ability_uncloak', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 300 * p, f1: 2200 * p, dur: 0.24, gain: 0.18 });
    noiseBurst(v, { freq: 900, freqEnd: 5200, q: 0.9, dur: 0.22, gain: 0.14 }); return v.t0 + 0.3; });
  S('ability_slam', (v, o) => { const s = o.scale || 1;
    tone(v, { type: 'sine', f0: 150, f1: 26, dur: 0.60, gain: 0.62 * s });
    noiseBurst(v, { freq: 420, freqEnd: 90, q: 0.6, dur: 0.55, gain: 0.50 * s, drive: true, pink: true });
    noiseBurst(v, { freq: 3800, freqEnd: 900, q: 1.0, dur: 0.30, gain: 0.16 * s, filter: 'highpass' }); return v.t0 + 0.7; });
  S('ability_deploy', (v, o) => { const p = o.pitch || 1;
    mech(v, v.t0, 1800 * p, 0.07, 0.24, 5); mech(v, v.t0 + 0.12, 1100 * p, 0.09, 0.22, 4);
    tone(v, { type: 'square', f0: 620 * p, f1: 880 * p, dur: 0.10, gain: 0.10, filter: 'lowpass', filterFreq: 2000 });
    return v.t0 + 0.26; });
  S('ability_scan', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 2200 * p, f1: 620 * p, dur: 0.50, gain: 0.18 });
    tone(v, { type: 'sine', f0: 3300 * p, f1: 930 * p, dur: 0.50, gain: 0.08 });
    noiseBurst(v, { freq: 5200, freqEnd: 1200, q: 1.2, dur: 0.45, gain: 0.08 }); return v.t0 + 0.6; });
  S('ability_charge', (v, o) => { const p = o.pitch || 1, d = o.dur || 0.9;
    tone(v, { type: 'sawtooth', f0: 90 * p, f1: 640 * p, dur: d, gain: 0.20, linear: true, filter: 'lowpass', filterFreq: 1400, filterQ: 3 });
    tone(v, { type: 'sine', f0: 180 * p, f1: 1280 * p, dur: d, gain: 0.10, linear: true }); return v.t0 + d; });
  S('ability_hover', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 120 * p, f1: 260 * p, dur: 0.40, gain: 0.16 });
    noiseBurst(v, { freq: 2200, freqEnd: 4200, q: 0.7, dur: 0.45, gain: 0.10, pink: true }); return v.t0 + 0.5; });
  S('ability_beam', (v, o) => { const s = o.scale || 1, d = o.dur || 1.6;
    tone(v, { type: 'sawtooth', f0: 60, f1: 44, dur: d, gain: 0.34 * s, filter: 'lowpass', filterFreq: 420, filterQ: 4 });
    tone(v, { type: 'sine', f0: 220, f1: 180, dur: d, gain: 0.16 * s, fm: { freq: 11, depth: 60 } });
    noiseBurst(v, { freq: 1400, freqEnd: 600, q: 0.5, dur: d, gain: 0.22 * s, pink: true }); return v.t0 + d; });

  /* --- feedback / notifications ---------------------------------------- */
  S('hitmarker', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'square', f0: 1500 * p, f1: 1100 * p, dur: 0.045, gain: 0.14, filter: 'lowpass', filterFreq: 3600 }); return v.t0 + 0.06; });
  S('hitmarker_crit', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'square', f0: 2300 * p, f1: 1750 * p, dur: 0.055, gain: 0.17, filter: 'lowpass', filterFreq: 5200 });
    tone(v, { type: 'sine', f0: 3400 * p, f1: 2600 * p, dur: 0.07, gain: 0.09 }); return v.t0 + 0.09; });
  S('hitmarker_shield', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 1900 * p, f1: 2500 * p, dur: 0.05, gain: 0.11 }); return v.t0 + 0.07; });
  S('kill_confirm', (v) => { const t = v.t0;
    tone(v, { type: 'square', f0: 900, f1: 900, dur: 0.05, gain: 0.14, filter: 'lowpass', filterFreq: 3000 });
    tone(v, { type: 'square', f0: 1350, f1: 1350, dur: 0.07, gain: 0.14, filter: 'lowpass', filterFreq: 3000, attack: 0.055 });
    tone(v, { type: 'sine', f0: 1800, f1: 2400, dur: 0.16, gain: 0.10 }); return t + 0.22; });
  S('elimination', (v) => { const t = v.t0;
    tone(v, { type: 'sine', f0: 440, f1: 660, dur: 0.10, gain: 0.16 });
    tone(v, { type: 'sine', f0: 660, f1: 880, dur: 0.18, gain: 0.14 });
    noiseBurst(v, { freq: 3400, freqEnd: 1200, q: 1.4, dur: 0.16, gain: 0.08 }); return t + 0.26; });
  S('damage_taken', (v, o) => { const s = o.scale || 1;
    tone(v, { type: 'sine', f0: 240, f1: 90, dur: 0.16, gain: 0.24 * s });
    noiseBurst(v, { freq: 1200, freqEnd: 300, q: 0.8, dur: 0.13, gain: 0.16 * s, pink: true }); return v.t0 + 0.2; });
  S('shield_break', (v) => {
    tone(v, { type: 'sine', f0: 1400, f1: 220, dur: 0.30, gain: 0.26 });
    noiseBurst(v, { freq: 4200, freqEnd: 800, q: 1.2, dur: 0.30, gain: 0.20 }); return v.t0 + 0.36; });
  S('low_health', (v) => {
    tone(v, { type: 'sine', f0: 180, f1: 120, dur: 0.55, gain: 0.16 });
    tone(v, { type: 'sine', f0: 90, f1: 62, dur: 0.60, gain: 0.14 }); return v.t0 + 0.65; });
  S('death', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 320 * p, f1: 48 * p, dur: 0.90, gain: 0.30 });
    noiseBurst(v, { freq: 1800, freqEnd: 200, q: 0.7, dur: 0.85, gain: 0.22, pink: true, filter: 'lowpass' }); return v.t0 + 1.0; });
  S('respawn', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sine', f0: 140 * p, f1: 900 * p, dur: 0.55, gain: 0.24 });
    tone(v, { type: 'sine', f0: 280 * p, f1: 1800 * p, dur: 0.55, gain: 0.12 });
    noiseBurst(v, { freq: 600, freqEnd: 5200, q: 0.9, dur: 0.50, gain: 0.14 }); return v.t0 + 0.6; });
  S('ult_ready', (v) => { const t = v.t0;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(v, { type: 'sine', f0: f, f1: f, dur: 0.34, gain: 0.13, attack: 0.02 + i * 0.075 });
    });
    noiseBurst(v, { freq: 5200, freqEnd: 2200, q: 1.2, dur: 0.42, gain: 0.06 }); return t + 0.5; });
  S('ult_cast', (v, o) => { const p = o.pitch || 1;
    tone(v, { type: 'sawtooth', f0: 110 * p, f1: 440 * p, dur: 0.45, gain: 0.28, filter: 'lowpass', filterFreq: 1600, filterQ: 4 });
    tone(v, { type: 'sine', f0: 55 * p, f1: 40 * p, dur: 0.90, gain: 0.30 });
    noiseBurst(v, { freq: 900, freqEnd: 6200, q: 0.8, dur: 0.40, gain: 0.20 }); return v.t0 + 0.95; });
  S('objective_pickup', (v) => { const t = v.t0;
    [392, 523.25, 659.25].forEach((f, i) => tone(v, { type: 'sine', f0: f, f1: f * 1.5, dur: 0.24, gain: 0.15, attack: 0.01 + i * 0.06 }));
    return t + 0.4; });
  S('objective_score', (v) => { const t = v.t0;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(v, { type: 'triangle', f0: f, f1: f, dur: 0.30, gain: 0.14, attack: 0.01 + i * 0.07 }));
    tone(v, { type: 'sine', f0: 65, f1: 44, dur: 0.7, gain: 0.24 }); return t + 0.8; });
  S('objective_drop', (v) => {
    tone(v, { type: 'sine', f0: 660, f1: 220, dur: 0.35, gain: 0.18 });
    noiseBurst(v, { freq: 2200, freqEnd: 500, q: 1.0, dur: 0.30, gain: 0.12 }); return v.t0 + 0.4; });
  S('objective_alert', (v) => {
    tone(v, { type: 'square', f0: 880, f1: 880, dur: 0.10, gain: 0.10, filter: 'lowpass', filterFreq: 2400 });
    tone(v, { type: 'square', f0: 660, f1: 660, dur: 0.14, gain: 0.10, filter: 'lowpass', filterFreq: 2400, attack: 0.13 });
    return v.t0 + 0.3; });

  /* --- UI --------------------------------------------------------------- */
  S('ui_hover', (v) => { tone(v, { type: 'sine', f0: 1250, f1: 1500, dur: 0.055, gain: 0.075 }); return v.t0 + 0.08; });
  S('ui_click', (v) => {
    tone(v, { type: 'sine', f0: 700, f1: 1400, dur: 0.075, gain: 0.13 });
    noiseBurst(v, { freq: 4200, freqEnd: 2400, q: 2.0, dur: 0.05, gain: 0.06 }); return v.t0 + 0.11; });
  S('ui_confirm', (v) => { const t = v.t0;
    tone(v, { type: 'sine', f0: 660, f1: 660, dur: 0.11, gain: 0.13 });
    tone(v, { type: 'sine', f0: 990, f1: 990, dur: 0.20, gain: 0.13, attack: 0.10 }); return t + 0.3; });
  S('ui_back', (v) => { tone(v, { type: 'sine', f0: 900, f1: 420, dur: 0.11, gain: 0.11 }); return v.t0 + 0.14; });
  S('ui_error', (v) => {
    tone(v, { type: 'square', f0: 220, f1: 165, dur: 0.16, gain: 0.11, filter: 'lowpass', filterFreq: 1200 }); return v.t0 + 0.2; });
  S('ui_select_hero', (v) => { const t = v.t0;
    [440, 587.33, 880].forEach((f, i) => tone(v, { type: 'triangle', f0: f, f1: f, dur: 0.30, gain: 0.12, attack: 0.01 + i * 0.05 }));
    noiseBurst(v, { freq: 6200, freqEnd: 2600, q: 1.4, dur: 0.30, gain: 0.05 }); return t + 0.45; });
  S('countdown_tick', (v, o) => {
    tone(v, { type: 'sine', f0: (o.pitch || 1) * 640, f1: (o.pitch || 1) * 640, dur: 0.20, gain: 0.20 });
    tone(v, { type: 'sine', f0: (o.pitch || 1) * 1280, f1: (o.pitch || 1) * 1280, dur: 0.14, gain: 0.08 }); return v.t0 + 0.26; });
  S('countdown_go', (v) => { const t = v.t0;
    tone(v, { type: 'sawtooth', f0: 220, f1: 880, dur: 0.30, gain: 0.26, filter: 'lowpass', filterFreq: 3000, filterQ: 2 });
    tone(v, { type: 'sine', f0: 55, f1: 44, dur: 0.9, gain: 0.30 });
    noiseBurst(v, { freq: 1200, freqEnd: 6200, q: 0.7, dur: 0.40, gain: 0.18 }); return t + 1.0; });
  S('match_victory', (v) => { const t = v.t0;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(v, { type: 'triangle', f0: f, f1: f, dur: 1.0, gain: 0.14, attack: 0.02 + i * 0.11 });
      tone(v, { type: 'sine', f0: f / 2, f1: f / 2, dur: 1.1, gain: 0.10, attack: 0.02 + i * 0.11 });
    });
    tone(v, { type: 'sine', f0: 65.41, f1: 65.41, dur: 1.6, gain: 0.26 }); return t + 1.8; });
  S('match_defeat', (v) => { const t = v.t0;
    [392, 349.23, 293.66, 261.63].forEach((f, i) => {
      tone(v, { type: 'sine', f0: f, f1: f * 0.995, dur: 1.1, gain: 0.13, attack: 0.02 + i * 0.16 });
    });
    tone(v, { type: 'sine', f0: 49, f1: 43, dur: 2.0, gain: 0.22 }); return t + 2.2; });

  /* --- ambience --------------------------------------------------------- */
  S('drone_hum', (v, o) => { const d = o.dur || 3.0;
    tone(v, { type: 'sawtooth', f0: 128, f1: 132, dur: d, gain: 0.05, filter: 'lowpass', filterFreq: 700, filterQ: 3 });
    return v.t0 + d; });
  S('vent_hiss', (v, o) => { const d = o.dur || 2.2;
    noiseBurst(v, { freq: 2600, freqEnd: 1800, q: 0.5, dur: d, gain: 0.05, pink: true, attack: 0.4 }); return v.t0 + d; });
  S('neon_buzz', (v, o) => { const d = o.dur || 1.6;
    tone(v, { type: 'square', f0: 100, f1: 100, dur: d, gain: 0.018, filter: 'bandpass', filterFreq: 1800, filterQ: 6 }); return v.t0 + d; });

  /* ------------------------------------------------------------------ *
   * Public play API
   * ------------------------------------------------------------------ */
  Audio.play = function (id, opts) {
    if (!Audio.ready || Audio._muted) return;
    const fn = BANK[id];
    if (!fn) { HC.Log.warn('Audio', 'unknown sound "' + id + '"'); return; }
    opts = opts || {};
    if (opts.pitch === undefined) opts.pitch = 1;
    // Natural variation — identical repeated samples are the fastest way to
    // make a game sound cheap.
    if (opts.vary !== false) opts.pitch *= 1 + (Math.random() - 0.5) * (opts.varyAmount || 0.06);
    const v = makeVoice(opts);
    if (!v) return;
    try {
      const end = fn(v, opts) || (v.t0 + 0.5);
      v.done(end);
    } catch (e) {
      HC.Log.error('Audio', 'sound "' + id + '" failed:', e.message);
      Audio._voices = Math.max(0, Audio._voices - 1);
    }
  };

  Audio.ui = function (id, opts) {
    Audio.play(id, Object.assign({ bus: 'ui', position: null, important: true }, opts || {}));
  };

  Audio.setVolume = function (bus, value) {
    CFG.audio[bus] = U.clamp01(value);
    if (!Audio.ready) return;
    const node = bus === 'master' ? Audio._buses.master : Audio._buses[bus];
    if (node) node.gain.setTargetAtTime(CFG.audio[bus], Audio.ctx.currentTime, 0.02);
  };

  /** Muffle everything (death cam, pause menu). */
  Audio.setDucking = function (amount) {
    if (!Audio.ready) return;
    const f = U.lerp(20000, 620, U.clamp01(amount));
    Audio._buses.tone.frequency.setTargetAtTime(f, Audio.ctx.currentTime, 0.08);
  };

  Audio.setMuted = function (m) {
    Audio._muted = !!m;
    if (Audio.ready) Audio._buses.master.gain.setTargetAtTime(m ? 0 : CFG.audio.master, Audio.ctx.currentTime, 0.05);
  };

  /* ------------------------------------------------------------------ *
   * Dynamic music (brief §33). A 16th-note scheduler drives independent
   * layers; match state decides which layers are audible and how hard.
   * ------------------------------------------------------------------ */
  const Music = HC.Music = {
    state: 'silent', _bus: null, _timer: 0, _step: 0, _nextTime: 0, _bpm: 96,
    _layerGain: {}, _target: {}, _key: 0
  };

  const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
  const STATES = {
    silent:      { bpm: 90,  layers: {}, root: 0 },
    menu:        { bpm: 104, root: 3,  layers: { pad: 0.62, arp: 0.55, bass: 0.55, kick: 0.42, hat: 0.30, lead: 0.0 } },
    lobby:       { bpm: 100, root: 3,  layers: { pad: 0.70, arp: 0.34, bass: 0.44, kick: 0.24, hat: 0.18, lead: 0.0 } },
    select:      { bpm: 110, root: 5,  layers: { pad: 0.55, arp: 0.62, bass: 0.60, kick: 0.50, hat: 0.40, lead: 0.20 } },
    intro:       { bpm: 118, root: 0,  layers: { pad: 0.80, arp: 0.28, bass: 0.72, kick: 0.62, hat: 0.24, lead: 0.0 } },
    match_calm:  { bpm: 112, root: 0,  layers: { pad: 0.36, arp: 0.14, bass: 0.30, kick: 0.20, hat: 0.14, lead: 0.0 } },
    match_fight: { bpm: 124, root: 0,  layers: { pad: 0.40, arp: 0.40, bass: 0.58, kick: 0.56, hat: 0.44, lead: 0.10 } },
    final:       { bpm: 136, root: 7,  layers: { pad: 0.42, arp: 0.58, bass: 0.72, kick: 0.76, hat: 0.62, lead: 0.34 } },
    victory:     { bpm: 128, root: 8,  layers: { pad: 0.85, arp: 0.60, bass: 0.70, kick: 0.60, hat: 0.40, lead: 0.55 } },
    defeat:      { bpm: 78,  root: 1,  layers: { pad: 0.80, arp: 0.10, bass: 0.42, kick: 0.10, hat: 0.0,  lead: 0.22 } }
  };

  Music._init = function () {
    const ctx = Audio.ctx;
    Music._bus = ctx.createGain();
    Music._bus.gain.value = 1;
    Music._bus.connect(Audio._buses.music);
    ['pad', 'arp', 'bass', 'kick', 'hat', 'lead'].forEach(k => { Music._layerGain[k] = 0; Music._target[k] = 0; });
    Music._nextTime = ctx.currentTime + 0.15;
  };

  Music.setState = function (state) {
    if (!STATES[state]) { HC.Log.warn('Music', 'unknown state "' + state + '"'); return; }
    if (Music.state === state) return;
    Music.state = state;
    const s = STATES[state];
    Music._bpm = s.bpm;
    Music._key = s.root;
    ['pad', 'arp', 'bass', 'kick', 'hat', 'lead'].forEach(k => { Music._target[k] = s.layers[k] || 0; });
  };

  Music.update = function (dt) {
    if (!Audio.ready || !Music._bus) return;
    const rate = 1.6;
    for (const k in Music._target) {
      Music._layerGain[k] = U.damp(Music._layerGain[k], Music._target[k], rate, dt);
    }
    Music._schedule();
  };

  function mnote(semi) { return 220 * Math.pow(2, semi / 12); }

  Music._schedule = function () {
    const ctx = Audio.ctx;
    const stepDur = 60 / Music._bpm / 4;      // 16th notes
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (Music._nextTime < horizon && guard++ < 32) {
      Music._playStep(Music._step, Music._nextTime, stepDur);
      Music._step = (Music._step + 1) % 64;
      Music._nextTime += stepDur;
    }
    if (Music._nextTime < ctx.currentTime) Music._nextTime = ctx.currentTime + 0.05;
  };

  function mtone(at, dur, freq, gain, type, filterFreq) {
    if (gain < 0.004) return;
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.03, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = o;
    if (filterFreq) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = 1.2; o.connect(f); node = f; }
    node.connect(g); g.connect(Music._bus);
    o.start(at); o.stop(at + dur + 0.02);
  }
  function mnoise(at, dur, gain, freq, q, type) {
    if (gain < 0.004) return;
    const ctx = Audio.ctx;
    const s = ctx.createBufferSource(); s.buffer = Audio._noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(Music._bus);
    s.start(at, Math.random(), dur + 0.02); s.stop(at + dur + 0.02);
  }

  const ARP = [0, 2, 4, 6, 4, 2, 4, 7];
  const BASSLINE = [0, 0, 5, 0, 3, 0, 5, 7];

  Music._playStep = function (step, at, stepDur) {
    const L = Music._layerGain;
    const root = Music._key;
    const bar = Math.floor(step / 16) % 4;
    const chordRoot = [0, 5, 3, 7][bar];

    if (L.kick > 0.01 && (step % 4 === 0 || step % 16 === 10)) {
      const o = Audio.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      const g = Audio.ctx.createGain();
      g.gain.setValueAtTime(L.kick * 0.55, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.20);
      o.connect(g); g.connect(Music._bus); o.start(at); o.stop(at + 0.22);
      if (step % 8 === 4) mnoise(at, 0.14, L.kick * 0.20, 1800, 1.0);   // snare-ish
    }
    if (L.hat > 0.01 && step % 2 === 1) mnoise(at, 0.045, L.hat * 0.12, 7200, 1.2);
    if (L.hat > 0.01 && step % 8 === 6) mnoise(at, 0.12, L.hat * 0.09, 4200, 0.8);

    if (L.bass > 0.01 && step % 2 === 0) {
      const semi = root + chordRoot + SCALE_MINOR[BASSLINE[(step / 2) % 8] % 7] - 24;
      mtone(at, stepDur * 1.8, mnote(semi), L.bass * 0.30, 'sawtooth', 420);
      mtone(at, stepDur * 1.6, mnote(semi - 12), L.bass * 0.22, 'sine');
    }
    if (L.arp > 0.01) {
      const semi = root + chordRoot + SCALE_MINOR[ARP[step % 8] % 7] + 12 * (step % 16 >= 8 ? 1 : 0);
      mtone(at, stepDur * 1.4, mnote(semi), L.arp * 0.11, 'square', 2600);
    }
    if (L.pad > 0.01 && step % 16 === 0) {
      [0, 3, 7, 10].forEach((iv, i) => {
        mtone(at, stepDur * 16.5, mnote(root + chordRoot + iv - 12), L.pad * 0.055, 'sawtooth', 900 + i * 120);
      });
    }
    if (L.lead > 0.01 && step % 4 === 2) {
      const semi = root + chordRoot + SCALE_MINOR[(step * 3) % 7] + 12;
      mtone(at, stepDur * 2.2, mnote(semi), L.lead * 0.10, 'triangle', 3200);
    }
  };

})(window.HC);
