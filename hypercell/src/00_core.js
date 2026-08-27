/* =========================================================================
 * HYPERCELL — 00_core.js
 * Namespace, deterministic RNG, math/easing helpers, tiny event bus,
 * object pooling and a defensive asset/definition lookup layer.
 * ========================================================================= */
(function (global) {
  'use strict';

  const HC = global.HC = global.HC || {};
  HC.VERSION = '1.0.0';
  HC.TITLE = 'HYPERCELL';

  /* ------------------------------------------------------------------ *
   * Logging — every subsystem logs through here so missing content is
   * always visible instead of silently crashing the frame loop.
   * ------------------------------------------------------------------ */
  const Log = HC.Log = {
    history: [],
    _push(level, tag, args) {
      const line = { t: performance.now(), level, tag, msg: args.map(String).join(' ') };
      Log.history.push(line);
      if (Log.history.length > 400) Log.history.shift();
      return line;
    },
    info(tag, ...a) { Log._push('info', tag, a); console.log('%c[' + tag + ']', 'color:#5cf', ...a); },
    warn(tag, ...a) { Log._push('warn', tag, a); console.warn('[' + tag + ']', ...a); },
    error(tag, ...a) { Log._push('error', tag, a); console.error('[' + tag + ']', ...a); }
  };

  /* ------------------------------------------------------------------ *
   * Math / util
   * ------------------------------------------------------------------ */
  const U = HC.Util = {
    TAU: Math.PI * 2,
    DEG: Math.PI / 180,

    clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    inverseLerp(a, b, v) { return a === b ? 0 : U.clamp01((v - a) / (b - a)); },
    remap(v, a, b, c, d) { return U.lerp(c, d, U.inverseLerp(a, b, v)); },

    /** Framerate-independent exponential smoothing.
     *  `rate` = how many e-folds per second (higher = snappier). */
    damp(current, target, rate, dt) {
      return U.lerp(current, target, 1 - Math.exp(-rate * dt));
    },
    /** Same, but for angles — takes the short way around. */
    dampAngle(current, target, rate, dt) {
      return current + U.shortAngle(current, target) * (1 - Math.exp(-rate * dt));
    },
    shortAngle(from, to) {
      let d = (to - from) % U.TAU;
      if (d > Math.PI) d -= U.TAU;
      if (d < -Math.PI) d += U.TAU;
      return d;
    },
    /** Move `current` toward `target` by at most `maxDelta`. */
    approach(current, target, maxDelta) {
      const d = target - current;
      if (Math.abs(d) <= maxDelta) return target;
      return current + Math.sign(d) * maxDelta;
    },

    smoothstep(t) { t = U.clamp01(t); return t * t * (3 - 2 * t); },
    easeOutCubic(t) { t = U.clamp01(t); const i = 1 - t; return 1 - i * i * i; },
    easeInCubic(t) { t = U.clamp01(t); return t * t * t; },
    easeOutQuint(t) { t = U.clamp01(t); const i = 1 - t; return 1 - i * i * i * i * i; },
    easeOutBack(t) { t = U.clamp01(t); const c = 1.70158, i = t - 1; return 1 + (c + 1) * i * i * i + c * i * i; },
    easeInOutSine(t) { return -(Math.cos(Math.PI * U.clamp01(t)) - 1) / 2; },
    /** 0 -> 1 -> 0 bump, peaks at `peak`. */
    pulse(t, peak) {
      t = U.clamp01(t); peak = peak === undefined ? 0.35 : peak;
      return t < peak ? U.smoothstep(t / peak) : U.smoothstep(1 - (t - peak) / (1 - peak));
    },

    /** Deterministic RNG (mulberry32) so map dressing is stable per seed. */
    rng(seed) {
      let a = (seed >>> 0) || 1;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    randRange(rnd, a, b) { return a + (b - a) * rnd(); },
    randInt(rnd, a, b) { return Math.floor(a + (b - a + 1) * rnd()) | 0; },
    pick(rnd, arr) { return arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))]; },
    /** Box-Muller-ish cheap gaussian in [-1,1] used for recoil scatter. */
    gauss(rnd) { return (rnd() + rnd() + rnd() - 1.5) / 1.5; },

    formatTime(seconds) {
      seconds = Math.max(0, Math.floor(seconds));
      const m = Math.floor(seconds / 60), s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    formatNumber(n) { return Math.round(n).toLocaleString('en-US'); },

    /** Stable id generator for actors / effects. */
    uid: (function () { let n = 0; return function (prefix) { return (prefix || 'id') + '_' + (++n); }; })()
  };

  /* ------------------------------------------------------------------ *
   * Event bus — decouples systems (combat -> hud -> audio) so no system
   * needs a hard reference to any other.
   * ------------------------------------------------------------------ */
  HC.Events = function makeBus(name) {
    const map = new Map();
    return {
      name: name || 'bus',
      on(evt, fn) {
        if (typeof fn !== 'function') { Log.warn('Events', 'on(' + evt + ') without handler'); return function () {}; }
        if (!map.has(evt)) map.set(evt, new Set());
        map.get(evt).add(fn);
        return function off() { const s = map.get(evt); if (s) s.delete(fn); };
      },
      off(evt, fn) { const s = map.get(evt); if (s) s.delete(fn); },
      emit(evt, payload) {
        const s = map.get(evt);
        if (!s) return;
        for (const fn of Array.from(s)) {
          try { fn(payload); }
          catch (e) { Log.error('Events', 'handler for "' + evt + '" threw:', e && e.message, e && e.stack); }
        }
      },
      clear() { map.clear(); }
    };
  };

  /* ------------------------------------------------------------------ *
   * Object pool — used for particles, tracers, damage numbers, bullets.
   * Allocation during combat is the main GC-hitch source; everything hot
   * goes through here.
   * ------------------------------------------------------------------ */
  HC.Pool = function Pool(factory, reset, initial) {
    const free = [];
    const live = [];
    for (let i = 0; i < (initial || 0); i++) free.push(factory());
    return {
      get live() { return live; },
      get freeCount() { return free.length; },
      acquire() {
        const o = free.length ? free.pop() : factory();
        live.push(o);
        return o;
      },
      release(o) {
        const i = live.indexOf(o);
        if (i >= 0) live.splice(i, 1);
        if (reset) reset(o);
        free.push(o);
      },
      releaseAt(index) {
        const o = live[index];
        live[index] = live[live.length - 1];
        live.pop();
        if (reset) reset(o);
        free.push(o);
        return o;
      },
      releaseAll() { while (live.length) this.releaseAt(live.length - 1); }
    };
  };

  /* ------------------------------------------------------------------ *
   * Defensive registry — every data table (characters, weapons, skins,
   * abilities) is looked up through here. A missing entry logs loudly and
   * returns a safe fallback rather than throwing mid-match.
   * ------------------------------------------------------------------ */
  HC.Registry = function Registry(label, fallback) {
    const items = new Map();
    return {
      label,
      define(id, def) {
        if (!id) { Log.error('Registry', label + ': define() without id'); return null; }
        if (items.has(id)) Log.warn('Registry', label + ': overwriting "' + id + '"');
        def.id = id;
        items.set(id, def);
        return def;
      },
      has(id) { return items.has(id); },
      get(id) {
        if (items.has(id)) return items.get(id);
        Log.error('Registry', label + ': unknown id "' + id + '" — using fallback.');
        return typeof fallback === 'function' ? fallback(id) : fallback;
      },
      /** Non-logging variant for optional content (e.g. optional skins). */
      tryGet(id) { return items.get(id) || null; },
      all() { return Array.from(items.values()); },
      ids() { return Array.from(items.keys()); },
      get size() { return items.size; }
    };
  };

  /* ------------------------------------------------------------------ *
   * Fixed-step accumulator. Gameplay runs at a fixed tick so movement,
   * recoil and hit detection are frame-rate independent; rendering
   * interpolates on top of it.
   * ------------------------------------------------------------------ */
  HC.StepClock = function StepClock(step, maxSubSteps) {
    let acc = 0;
    return {
      step,
      alpha: 0,
      advance(dt, fn) {
        acc += dt;
        let n = 0;
        const max = maxSubSteps || 5;
        while (acc >= step && n < max) { fn(step); acc -= step; n++; }
        if (n >= max) acc = 0; // long stall (tab hidden): drop the backlog
        this.alpha = acc / step;
        return n;
      },
      reset() { acc = 0; this.alpha = 0; }
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
