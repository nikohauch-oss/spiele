/* =========================================================================
 * HYPERCELL — 08_materials.js
 * Procedural texture + material library.
 *
 * Every surface property demanded by the brief (§3) is generated here at
 * runtime: weave for fabric, anisotropic brushing for metal, pitting for
 * concrete, seams, scratches, edge wear. Normal maps are derived from the
 * generated height fields with a Sobel filter, so materials react to light
 * instead of just being flat colours.
 *
 * All character/prop materials also get a stylised rim term injected into
 * the standard shader — this is what keeps silhouettes readable in a
 * chaotic fight (§67) without resorting to a cartoon outline pass.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const Mats = HC.Mats = {
    _tex: new Map(),
    _mats: new Map(),
    anisotropy: 4,
    disposables: []
  };

  function texSize() { return [128, 256, 512][U.clamp(CFG.gfx.textureQuality, 0, 2)]; }

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  /** Height fields are read back pixel-by-pixel, so hint the browser. */
  function readCtx(canvas) {
    return canvas.getContext('2d', { willReadFrequently: true });
  }

  function finishTexture(canvas, repeat, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat || 1, repeat || 1);
    t.anisotropy = Mats.anisotropy;
    if (opts.srgb !== false && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    Mats.disposables.push(t);
    return t;
  }

  /** Sobel-derive a tangent-space normal map from a greyscale height canvas. */
  function normalFromHeight(heightCanvas, strength) {
    const s = heightCanvas.width;
    const src = readCtx(heightCanvas).getImageData(0, 0, s, s).data;
    const out = makeCanvas(s);
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(s, s);
    const h = (x, y) => {
      x = (x + s) % s; y = (y + s) % s;
      return src[(y * s + x) * 4] / 255;
    };
    const k = strength === undefined ? 2.2 : strength;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1)) -
                   (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1));
        const dy = (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1)) -
                   (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1));
        let nx = dx * k, ny = dy * k, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (y * s + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  /**
   * Derives an albedo (base-colour) map from a height field.
   *
   * Until now every surface in the game was a single flat colour lit by a
   * normal map, which is exactly what makes untextured 3D read as cheap: real
   * materials vary in *colour*, not only in relief. This builds that variation
   * procedurally — cavity darkening from the height field, a low-frequency
   * blotch field for large-scale tonal breakup, fine grain, and optional rain
   * streaks or wear highlights. The result sits near white so it multiplies
   * into the material colour without dimming it.
   */
  function albedoFromHeight(heightCanvas, o) {
    o = o || {};
    const size = heightCanvas.width;
    const src = readCtx(heightCanvas).getImageData(0, 0, size, size).data;
    const out = makeCanvas(size);
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rnd = U.rng(o.seed || 5);

    // Normalise the height field so every generator gets the same treatment.
    let lo = 1, hi = 0;
    for (let i = 0; i < src.length; i += 4) {
      const v = src[i] / 255;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = Math.max(1e-3, hi - lo);

    // Two octaves of value noise: the large one is the blotching you read as
    // "this wall has history", the small one keeps it from looking like a
    // gradient.
    function noiseField(n) {
      const grid = new Float32Array(n * n);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      return { n, grid };
    }
    const big = noiseField(4), small = noiseField(10);
    function sample(F, x, y) {
      const fx = x / size * F.n, fy = y / size * F.n;
      const x0 = Math.floor(fx) % F.n, y0 = Math.floor(fy) % F.n;
      const x1 = (x0 + 1) % F.n, y1 = (y0 + 1) % F.n;
      const tx = U.smoothstep(fx - Math.floor(fx)), ty = U.smoothstep(fy - Math.floor(fy));
      const a = U.lerp(F.grid[y0 * F.n + x0], F.grid[y0 * F.n + x1], tx);
      const b = U.lerp(F.grid[y1 * F.n + x0], F.grid[y1 * F.n + x1], tx);
      return U.lerp(a, b, ty);
    }

    const base = o.base === undefined ? 0.94 : o.base;
    const cavity = o.cavity === undefined ? 0.42 : o.cavity;
    const mottle = o.mottle === undefined ? 0.20 : o.mottle;
    const grain = o.grain === undefined ? 0.045 : o.grain;
    const wear = o.wear === undefined ? 0 : o.wear;
    const tint = o.tint || [1, 1, 1];
    const hue = o.hueJitter === undefined ? 0.03 : o.hueJitter;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const h = ((src[i] / 255) - lo) / span;

        let v = base;
        v *= 1 - cavity * (1 - h);                       // crevices go dark
        v *= U.lerp(1 - mottle, 1 + mottle * 0.35, sample(big, x, y));
        v *= U.lerp(1 - mottle * 0.45, 1 + mottle * 0.25, sample(small, x, y));
        if (wear) v += wear * Math.pow(h, 3) * 0.35;     // polished high points
        v += (rnd() - 0.5) * grain;
        v = U.clamp01(v);

        // A touch of per-pixel hue drift keeps large flats from banding.
        const j = (sample(small, x + 31, y + 17) - 0.5) * hue;
        img.data[i]     = U.clamp01(v * tint[0] * (1 + j)) * 255;
        img.data[i + 1] = U.clamp01(v * tint[1]) * 255;
        img.data[i + 2] = U.clamp01(v * tint[2] * (1 - j)) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Rain streaks: vertical grime running down from ledges. Only vertical
    // surfaces ask for these, and they are the single most recognisable
    // "outdoor concrete" cue there is.
    if (o.streaks) {
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = '#4a4438';
      for (let i = 0; i < o.streaks; i++) {
        const x = rnd() * size;
        const w = 1 + rnd() * (size / 42);
        const y0 = rnd() * size * 0.6;
        ctx.fillRect(x, y0, w, size - y0);
      }
      ctx.globalAlpha = 1;
    }
    // Scuffs: short bright abrasions, for metal and plate.
    if (o.scuffs) {
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < o.scuffs; i++) {
        ctx.strokeStyle = rnd() > 0.5 ? '#ffffff' : '#2c2c30';
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        const x = rnd() * size, y = rnd() * size, a = rnd() * U.TAU, l = size * (0.03 + rnd() * 0.12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Height-field generators (greyscale canvases)
   * ------------------------------------------------------------------ */
  const HEIGHT = {
    /** Woven cloth: two interleaved thread directions plus fibre noise. */
    weave(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      const img = g.createImageData(size, size);
      // A coarse weave. The old fine period tiled into a moire screen at
      // character scale, which read as cheap plastic mesh rather than cloth.
      const period = Math.max(6, size / 14);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x % period) / period, v = (y % period) / period;
          const over = ((Math.floor(x / period) + Math.floor(y / period)) % 2) === 0;
          const warp = Math.sin(u * Math.PI), weft = Math.sin(v * Math.PI);
          let h = over ? warp * 0.72 + weft * 0.24 : weft * 0.72 + warp * 0.24;
          h = h * 0.30 + 0.55 + (rnd() - 0.5) * 0.07;
          const i = (y * size + x) * 4, val = U.clamp01(h) * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = val; img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    },

    /** Brushed metal: strong horizontal anisotropy plus micro scratches. */
    brushed(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, size, size);
      g.globalAlpha = 0.16;
      for (let i = 0; i < size * 5; i++) {
        const y = rnd() * size;
        const w = 0.4 + rnd() * 1.6;
        const shade = rnd() > 0.5 ? 255 : 0;
        g.strokeStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
        g.lineWidth = w;
        g.beginPath(); g.moveTo(0, y); g.lineTo(size, y + (rnd() - 0.5) * 3); g.stroke();
      }
      // deeper scratches
      g.globalAlpha = 0.42;
      for (let i = 0; i < size / 8; i++) {
        const y = rnd() * size, len = size * (0.2 + rnd() * 0.7), x = rnd() * size;
        g.strokeStyle = rnd() > 0.6 ? '#ffffff' : '#2a2a2a';
        g.lineWidth = 0.6 + rnd();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 6); g.stroke();
      }
      g.globalAlpha = 1;
      return c;
    },

    /** Concrete / asphalt: layered value noise with pits and aggregate. */
    concrete(size, seed, coarse) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      const img = g.createImageData(size, size);
      // Value-noise octaves
      const layers = [];
      for (let o = 0; o < 4; o++) {
        const n = Math.max(2, Math.floor(size / (32 >> o)));
        const grid = new Float32Array(n * n);
        for (let i = 0; i < grid.length; i++) grid[i] = rnd();
        layers.push({ n, grid, amp: Math.pow(0.55, o) });
      }
      const sample = (L, x, y) => {
        const fx = x / size * L.n, fy = y / size * L.n;
        const x0 = Math.floor(fx) % L.n, y0 = Math.floor(fy) % L.n;
        const x1 = (x0 + 1) % L.n, y1 = (y0 + 1) % L.n;
        const tx = U.smoothstep(fx - Math.floor(fx)), ty = U.smoothstep(fy - Math.floor(fy));
        const a = U.lerp(L.grid[y0 * L.n + x0], L.grid[y0 * L.n + x1], tx);
        const b = U.lerp(L.grid[y1 * L.n + x0], L.grid[y1 * L.n + x1], tx);
        return U.lerp(a, b, ty);
      };
      let norm = 0; layers.forEach(l => norm += l.amp);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let v = 0;
          for (const L of layers) v += sample(L, x, y) * L.amp;
          v /= norm;
          if (coarse) v = v * 0.75 + (rnd() < 0.02 ? 0.6 : 0) * 0.25;   // aggregate specks
          const i = (y * size + x) * 4, val = U.clamp01(v * 0.7 + 0.28) * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = val; img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      // pits
      g.globalAlpha = 0.5;
      for (let i = 0; i < size / 3; i++) {
        const r = 0.6 + rnd() * 2.4;
        g.fillStyle = rnd() > 0.5 ? '#3a3a3a' : '#c8c8c8';
        g.beginPath(); g.arc(rnd() * size, rnd() * size, r, 0, U.TAU); g.fill();
      }
      g.globalAlpha = 1;
      return c;
    },

    /** Armour plate: panel seams, bevelled edges, rivets. */
    panel(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, size, size);
      const cells = 2;
      const cs = size / cells;
      for (let cy = 0; cy < cells; cy++) {
        for (let cx = 0; cx < cells; cx++) {
          const inset = cs * (0.06 + rnd() * 0.05);
          const x = cx * cs + inset, y = cy * cs + inset, w = cs - inset * 2, h = cs - inset * 2;
          // bevel: light top-left, dark bottom-right
          g.fillStyle = '#b4b4b4'; g.fillRect(x, y, w, h);
          g.fillStyle = '#d2d2d2'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
          g.fillStyle = '#5c5c5c'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
          // rivets
          if (rnd() > 0.35) {
            const n = 2 + Math.floor(rnd() * 2);
            for (let i = 0; i < n; i++) {
              const rx = x + 4 + rnd() * (w - 8), ry = y + 4 + rnd() * (h - 8);
              g.fillStyle = '#e2e2e2'; g.beginPath(); g.arc(rx, ry, cs * 0.035, 0, U.TAU); g.fill();
              g.fillStyle = '#4a4a4a'; g.beginPath(); g.arc(rx + 0.6, ry + 0.6, cs * 0.02, 0, U.TAU); g.fill();
            }
          }
        }
      }
      // seam grime
      g.globalAlpha = 0.30;
      for (let i = 0; i < size / 4; i++) {
        g.fillStyle = '#333';
        g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3);
      }
      g.globalAlpha = 1;
      return c;
    },

    /** Leather / hide: cracked cell pattern. */
    leather(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, size, size);
      const pts = [];
      const n = Math.floor(size / 9);
      for (let i = 0; i < n; i++) pts.push([rnd() * size, rnd() * size]);
      const img = g.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let d1 = 1e9, d2 = 1e9;
          for (let i = 0; i < pts.length; i++) {
            let dx = Math.abs(pts[i][0] - x), dy = Math.abs(pts[i][1] - y);
            if (dx > size / 2) dx = size - dx;
            if (dy > size / 2) dy = size - dy;
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          const edge = U.clamp01((Math.sqrt(d2) - Math.sqrt(d1)) / (size / 26));
          const i = (y * size + x) * 4;
          const v = (0.42 + edge * 0.5 + (rnd() - 0.5) * 0.07) * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    },

    /** Rubber / grip: dot matrix tread. */
    grip(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      g.fillStyle = '#606060'; g.fillRect(0, 0, size, size);
      const step = Math.max(4, size / 26);
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const ox = (Math.floor(y / step) % 2) * step * 0.5;
          g.fillStyle = '#d0d0d0';
          g.beginPath(); g.arc(x + ox, y, step * 0.28, 0, U.TAU); g.fill();
        }
      }
      return c;
    },

    /** Hair strands: vertical anisotropic filaments. */
    hair(size, seed) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#787878'; g.fillRect(0, 0, size, size);
      for (let i = 0; i < size * 2.5; i++) {
        const x = rnd() * size;
        const shade = 90 + rnd() * 150;
        g.strokeStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
        g.lineWidth = 0.5 + rnd() * 1.4;
        g.globalAlpha = 0.5;
        g.beginPath(); g.moveTo(x, 0);
        g.bezierCurveTo(x + (rnd() - 0.5) * 12, size * 0.35, x + (rnd() - 0.5) * 16, size * 0.7, x + (rnd() - 0.5) * 10, size);
        g.stroke();
      }
      g.globalAlpha = 1;
      return c;
    }
  };

  /* ------------------------------------------------------------------ *
   * Colour maps: emissive / decorative canvases used directly as maps
   * ------------------------------------------------------------------ */
  const COLORMAP = {
    /** Holographic advert board with scanlines and drifting bands. */
    hologram(size, seed, hexA, hexB) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      const A = new THREE.Color(hexA), B = new THREE.Color(hexB);
      const grad = g.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#' + A.getHexString());
      grad.addColorStop(0.55, '#' + B.getHexString());
      grad.addColorStop(1, '#' + A.getHexString());
      g.fillStyle = grad; g.fillRect(0, 0, size, size);
      // glyph blocks
      g.globalAlpha = 0.55;
      for (let i = 0; i < 26; i++) {
        g.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
        const w = size * (0.05 + rnd() * 0.4), h = size * (0.015 + rnd() * 0.05);
        g.fillRect(rnd() * (size - w), rnd() * (size - h), w, h);
      }
      // scanlines
      g.globalAlpha = 0.30; g.fillStyle = '#000';
      for (let y = 0; y < size; y += 3) g.fillRect(0, y, size, 1);
      g.globalAlpha = 1;
      return c;
    },

    /** Screen static / data readout. */
    screen(size, seed, hex) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#05080f'; g.fillRect(0, 0, size, size);
      const col = new THREE.Color(hex);
      g.fillStyle = '#' + col.getHexString();
      const rows = 14, rh = size / rows;
      for (let r = 0; r < rows; r++) {
        let x = size * 0.06;
        while (x < size * 0.94) {
          const w = size * (0.03 + rnd() * 0.16);
          if (rnd() > 0.28) { g.globalAlpha = 0.35 + rnd() * 0.6; g.fillRect(x, r * rh + rh * 0.24, w, rh * 0.42); }
          x += w + size * 0.02;
        }
      }
      g.globalAlpha = 0.18; g.fillStyle = '#000';
      for (let y = 0; y < size; y += 2) g.fillRect(0, y, size, 1);
      g.globalAlpha = 1;
      return c;
    },

    /** Neon sign glyphs — abstract shapes, no real-world lettering. */
    neonSign(size, seed, hex) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#04060a'; g.fillRect(0, 0, size, size);
      const col = new THREE.Color(hex);
      g.strokeStyle = '#' + col.getHexString();
      g.shadowColor = '#' + col.getHexString();
      g.shadowBlur = size * 0.08;
      g.lineCap = 'round'; g.lineJoin = 'round';
      const strokes = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < strokes; i++) {
        g.lineWidth = size * (0.03 + rnd() * 0.035);
        g.beginPath();
        let x = size * (0.15 + rnd() * 0.2), y = size * (0.2 + rnd() * 0.6);
        g.moveTo(x, y);
        const segs = 2 + Math.floor(rnd() * 3);
        for (let s = 0; s < segs; s++) {
          x += size * (0.1 + rnd() * 0.22) * (rnd() > 0.25 ? 1 : -1);
          y += size * (rnd() - 0.5) * 0.4;
          g.lineTo(U.clamp(x, size * 0.08, size * 0.92), U.clamp(y, size * 0.12, size * 0.88));
        }
        g.stroke();
      }
      g.shadowBlur = 0;
      return c;
    },

    /** Circuitry / energy lattice used on tech gear and barriers. */
    circuit(size, seed, hex) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = '#000000'; g.fillRect(0, 0, size, size);
      const col = new THREE.Color(hex);
      g.strokeStyle = '#' + col.getHexString();
      g.fillStyle = '#' + col.getHexString();
      g.lineWidth = Math.max(1, size / 160);
      const grid = 12, cs = size / grid;
      for (let i = 0; i < grid * 3; i++) {
        let x = Math.floor(rnd() * grid) * cs, y = Math.floor(rnd() * grid) * cs;
        g.beginPath(); g.moveTo(x, y);
        const steps = 2 + Math.floor(rnd() * 4);
        for (let s = 0; s < steps; s++) {
          if (rnd() > 0.5) x += (rnd() > 0.5 ? cs : -cs) * (1 + Math.floor(rnd() * 2));
          else y += (rnd() > 0.5 ? cs : -cs) * (1 + Math.floor(rnd() * 2));
          g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath(); g.arc(x, y, cs * 0.13, 0, U.TAU); g.fill();
      }
      return c;
    },

    /** Camouflage / pattern break-up for gear. */
    camo(size, seed, colors) {
      const c = makeCanvas(size), g = c.getContext('2d');
      const rnd = U.rng(seed);
      g.fillStyle = colors[0]; g.fillRect(0, 0, size, size);
      for (let layer = 1; layer < colors.length; layer++) {
        g.fillStyle = colors[layer];
        for (let i = 0; i < 14; i++) {
          const x = rnd() * size, y = rnd() * size, r = size * (0.05 + rnd() * 0.13);
          g.beginPath();
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * U.TAU, rr = r * (0.6 + rnd() * 0.7);
            const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
            if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.closePath(); g.fill();
        }
      }
      return c;
    }
  };

  Mats.HEIGHT = HEIGHT;
  Mats.COLORMAP = COLORMAP;

  /* ------------------------------------------------------------------ *
   * Cached texture accessors
   * ------------------------------------------------------------------ */
  function cachedPair(key, gen, normalStrength, albedoOpts) {
    if (Mats._tex.has(key)) return Mats._tex.get(key);
    const s = texSize();
    const height = gen(s);
    const rough = finishTexture(height, 1, { srgb: false });
    const normal = finishTexture(normalFromHeight(height, normalStrength), 1, { srgb: false });
    const albedo = finishTexture(albedoFromHeight(height, albedoOpts || {}), 1);
    const pair = { rough, normal, albedo };
    Mats._tex.set(key, pair);
    return pair;
  }

  /* Per-surface albedo character. These numbers are the difference between
   * "a blue shape" and "a worn blue jacket". */
  const ALBEDO = {
    fabric:   { base: 0.95, cavity: 0.38, mottle: 0.16, grain: 0.030, hueJitter: 0.02 },
    metal:    { base: 0.93, cavity: 0.30, mottle: 0.14, grain: 0.035, wear: 0.30, scuffs: 26, hueJitter: 0.015 },
    plate:    { base: 0.94, cavity: 0.46, mottle: 0.15, grain: 0.030, wear: 0.24, scuffs: 18 },
    concrete: { base: 0.93, cavity: 0.42, mottle: 0.19, grain: 0.038, streaks: 30, tint: [1.0, 0.985, 0.955] },
    asphalt:  { base: 0.90, cavity: 0.34, mottle: 0.15, grain: 0.030, tint: [0.98, 0.985, 1.0] },
    leather:  { base: 0.94, cavity: 0.32, mottle: 0.13, grain: 0.030, wear: 0.18, tint: [1.0, 0.98, 0.96] },
    rubber:   { base: 0.91, cavity: 0.30, mottle: 0.10, grain: 0.026 },
    hair:     { base: 0.96, cavity: 0.34, mottle: 0.14, grain: 0.022 }
  };

  Mats.surface = function (kind, seed) {
    const key = kind + ':' + (seed || 0) + ':' + CFG.gfx.textureQuality;
    const A = (k, extra) => Object.assign({ seed: (seed || 1) * 7 + 3 }, ALBEDO[k] || {}, extra || {});
    switch (kind) {
      case 'fabric':   return cachedPair(key, s => HEIGHT.weave(s, seed || 11), 1.6, A('fabric'));
      case 'metal':    return cachedPair(key, s => HEIGHT.brushed(s, seed || 22), 1.0, A('metal'));
      case 'plate':    return cachedPair(key, s => HEIGHT.panel(s, seed || 33), 2.6, A('plate'));
      case 'concrete': return cachedPair(key, s => HEIGHT.concrete(s, seed || 44, true), 2.0, A('concrete'));
      case 'asphalt':  return cachedPair(key, s => HEIGHT.concrete(s, seed || 55, true), 2.6, A('asphalt'));
      case 'leather':  return cachedPair(key, s => HEIGHT.leather(s, seed || 66), 2.2, A('leather'));
      case 'rubber':   return cachedPair(key, s => HEIGHT.grip(s, seed || 77), 2.4, A('rubber'));
      case 'hair':     return cachedPair(key, s => HEIGHT.hair(s, seed || 88), 1.2, A('hair'));
      default:         return cachedPair(key, s => HEIGHT.concrete(s, seed || 99, false), 1.4, A('concrete', { streaks: 0 }));
    }
  };

  Mats.colorTexture = function (kind, seed, a, b) {
    const key = 'c:' + kind + ':' + seed + ':' + a + ':' + b + ':' + CFG.gfx.textureQuality;
    if (Mats._tex.has(key)) return Mats._tex.get(key);
    const s = texSize();
    let canvas;
    switch (kind) {
      case 'hologram': canvas = COLORMAP.hologram(s, seed, a, b); break;
      case 'screen':   canvas = COLORMAP.screen(s, seed, a); break;
      case 'neon':     canvas = COLORMAP.neonSign(s, seed, a); break;
      case 'circuit':  canvas = COLORMAP.circuit(s, seed, a); break;
      default:         canvas = COLORMAP.screen(s, seed, a); break;
    }
    const t = finishTexture(canvas, 1);
    Mats._tex.set(key, t);
    return t;
  };

  /* ------------------------------------------------------------------ *
   * Stylised rim light — injected into MeshStandardMaterial.
   * This is the core of the art direction: a controllable back-light term
   * that separates characters from the environment at any camera angle.
   * ------------------------------------------------------------------ */
  Mats.applyRim = function (material, opts) {
    opts = opts || {};
    const uniforms = {
      uRimColor: { value: new THREE.Color(opts.color === undefined ? 0x8fd8ff : opts.color) },
      uRimPower: { value: opts.power === undefined ? 2.6 : opts.power },
      uRimStrength: { value: opts.strength === undefined ? 0.55 : opts.strength },
      uFresnelBias: { value: opts.bias === undefined ? 0.04 : opts.bias }
    };
    material.userData.rim = uniforms;
    material.onBeforeCompile = function (shader) {
      shader.uniforms.uRimColor = uniforms.uRimColor;
      shader.uniforms.uRimPower = uniforms.uRimPower;
      shader.uniforms.uRimStrength = uniforms.uRimStrength;
      shader.uniforms.uFresnelBias = uniforms.uFresnelBias;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\n' +
          'uniform vec3 uRimColor;\nuniform float uRimPower;\n' +
          'uniform float uRimStrength;\nuniform float uFresnelBias;')
        .replace('#include <dithering_fragment>',
          '#include <dithering_fragment>\n' +
          '{\n' +
          '  vec3 rimN = normalize(normal);\n' +
          '  vec3 rimV = normalize(vViewPosition);\n' +
          '  float rimDot = 1.0 - saturate(dot(rimN, rimV));\n' +
          '  float rim = uFresnelBias + pow(rimDot, uRimPower) * uRimStrength;\n' +
          '  gl_FragColor.rgb += uRimColor * rim * gl_FragColor.a;\n' +
          '}');
    };
    // Rim materials compile a different program from plain ones; the key keeps
    // three from handing us a cached program built without these uniforms.
    material.customProgramCacheKey = function () { return 'hc-rim'; };
    return material;
  };

  /* ------------------------------------------------------------------ *
   * Material factory
   * ------------------------------------------------------------------ */
  const registerMat = (m) => { Mats.disposables.push(m); return m; };

  /**
   * @param {object} o
   *  color, kind ('fabric'|'metal'|'plate'|'leather'|'rubber'|'skin'|'hair'|
   *               'glass'|'energy'|'plastic'|'concrete'|'asphalt'),
   *  roughness, metalness, emissive, emissiveIntensity, wear, repeat,
   *  rim {color,strength,power}, transparent, opacity, seed
   */
  Mats.make = function (o) {
    o = o || {};
    const kind = o.kind || 'plastic';
    const key = JSON.stringify([kind, o.color, o.roughness, o.metalness, o.emissive,
      o.emissiveIntensity, o.wear, o.repeat, o.opacity, o.seed, o.rim && o.rim.color,
      o.rim && o.rim.strength, o.flatShading, o.albedo, CFG.gfx.textureQuality]);
    if (!o.unique && Mats._mats.has(key)) return Mats._mats.get(key);

    const params = {
      color: new THREE.Color(o.color === undefined ? 0xffffff : o.color),
      roughness: o.roughness === undefined ? 0.75 : o.roughness,
      metalness: o.metalness === undefined ? 0.0 : o.metalness,
      flatShading: !!o.flatShading
    };

    if (o.emissive !== undefined) {
      params.emissive = new THREE.Color(o.emissive);
      params.emissiveIntensity = o.emissiveIntensity === undefined ? 1.0 : o.emissiveIntensity;
    }
    if (o.transparent || (o.opacity !== undefined && o.opacity < 1)) {
      params.transparent = true;
      params.opacity = o.opacity === undefined ? 0.6 : o.opacity;
      params.depthWrite = o.depthWrite !== undefined ? o.depthWrite : (params.opacity > 0.85);
    }
    if (o.side) params.side = o.side;

    let mat;
    const rep = o.repeat || 1;

    switch (kind) {
      case 'skin':
        params.roughness = o.roughness === undefined ? 0.62 : o.roughness;
        params.metalness = 0;
        mat = new THREE.MeshStandardMaterial(params);
        break;
      case 'glass':
        params.roughness = o.roughness === undefined ? 0.08 : o.roughness;
        params.metalness = o.metalness === undefined ? 0.1 : o.metalness;
        params.transparent = true;
        params.opacity = o.opacity === undefined ? 0.28 : o.opacity;
        params.depthWrite = false;
        mat = new THREE.MeshStandardMaterial(params);
        break;
      case 'energy':
        params.roughness = 0.30; params.metalness = 0;
        params.emissive = new THREE.Color(o.emissive === undefined ? o.color : o.emissive);
        params.emissiveIntensity = o.emissiveIntensity === undefined ? 2.2 : o.emissiveIntensity;
        params.transparent = true;
        params.opacity = o.opacity === undefined ? 0.72 : o.opacity;
        params.depthWrite = o.depthWrite !== undefined ? o.depthWrite : false;
        mat = new THREE.MeshStandardMaterial(params);
        break;
      default: {
        const surfKind = ({ fabric: 'fabric', metal: 'metal', plate: 'plate', leather: 'leather',
          rubber: 'rubber', hair: 'hair', concrete: 'concrete', asphalt: 'asphalt' })[kind];
        if (surfKind) {
          const pair = Mats.surface(surfKind, o.seed || 7);
          const rough = pair.rough.clone(); rough.repeat.set(rep, rep); rough.needsUpdate = true;
          const norm = pair.normal.clone(); norm.repeat.set(rep, rep); norm.needsUpdate = true;
          Mats.disposables.push(rough, norm);
          params.roughnessMap = rough;
          params.normalMap = norm;
          if (o.albedo !== false && pair.albedo) {
            const alb = pair.albedo.clone();
            alb.repeat.set(rep, rep);
            if ('colorSpace' in alb) alb.colorSpace = THREE.SRGBColorSpace;
            alb.needsUpdate = true;
            Mats.disposables.push(alb);
            params.map = alb;
          }
          params.normalScale = new THREE.Vector2(o.normalScale || 0.85, o.normalScale || 0.85);
          if (o.wear) {
            // Wear roughens the surface. (No aoMap: our procedural geometry
            // carries a single UV set, and three's aoMap wants a second one.)
            params.roughness = U.clamp01(params.roughness + o.wear * 0.16);
          }
        }
        mat = new THREE.MeshStandardMaterial(params);
        break;
      }
    }

    if (o.rim !== false) {
      const r = o.rim || {};
      Mats.applyRim(mat, {
        color: r.color === undefined ? 0x88c8ff : r.color,
        strength: r.strength === undefined ? (kind === 'skin' ? 0.22 : 0.32) : r.strength,
        power: r.power === undefined ? 3.0 : r.power,
        bias: r.bias === undefined ? 0.02 : r.bias
      });
    }

    registerMat(mat);
    if (!o.unique) Mats._mats.set(key, mat);
    return mat;
  };

  /** Unlit additive material for VFX quads / beams. */
  Mats.additive = function (color, opacity) {
    const key = 'add:' + color + ':' + opacity;
    if (Mats._mats.has(key)) return Mats._mats.get(key);
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true,
      opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false
    });
    registerMat(m); Mats._mats.set(key, m);
    return m;
  };

  /** Soft radial sprite used by every particle system. */
  Mats.particleTexture = function () {
    if (Mats._tex.has('particle')) return Mats._tex.get('particle');
    const s = 64, c = makeCanvas(s), g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0.00, 'rgba(255,255,255,1)');
    grad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.24)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    Mats._tex.set('particle', t); Mats.disposables.push(t);
    return t;
  };

  /** Sharper spark sprite (streaks read better than dots for impacts). */
  Mats.sparkTexture = function () {
    if (Mats._tex.has('spark')) return Mats._tex.get('spark');
    const s = 64, c = makeCanvas(s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    const grad = g.createLinearGradient(0, s / 2, s, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, s * 0.42, s, s * 0.16);
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    Mats._tex.set('spark', t); Mats.disposables.push(t);
    return t;
  };

  /* ------------------------------------------------------------------ *
   * Image-based lighting.
   *
   * This is the single most important material fix in the renderer: a
   * MeshStandardMaterial with metalness near 1 and nothing to reflect
   * renders BLACK. Every metal surface in the game — armour plating,
   * weapons, railings, street furniture — was matte and lifeless purely
   * because the scene had no environment to sample.
   *
   * We build a small equirectangular sky by hand (gradient + horizon glow +
   * a few bright emitters for specular to catch), run it through PMREM so
   * every roughness level gets a correctly pre-filtered mip, and hand it to
   * the scene. three then uses it as the default envMap for all PBR
   * materials automatically.
   * ------------------------------------------------------------------ */
  Mats.buildEnvironment = function (renderer, opts) {
    opts = opts || {};
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const zenith = opts.zenith || '#0e1c3a';
    const horizon = opts.horizon || '#3d5f96';
    const ground = opts.ground || '#241f2c';

    // Vertical gradient: sky above the horizon line, ground below.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, zenith);
    grad.addColorStop(0.42, horizon);
    grad.addColorStop(0.52, opts.horizonGlow || '#7a6a8e');
    grad.addColorStop(0.62, ground);
    grad.addColorStop(1.00, opts.groundDark || '#14121a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Soft emitters. Metals need distinct bright spots or they read as flat
    // paint; these become the specular highlights that sell "polished".
    const blobs = opts.lights || [
      { x: 0.18, y: 0.22, r: 0.30, color: 'rgba(200,225,255,0.95)' },
      { x: 0.70, y: 0.34, r: 0.22, color: 'rgba(255,168,120,0.75)' },
      { x: 0.44, y: 0.48, r: 0.30, color: 'rgba(110,190,255,0.45)' },
      { x: 0.88, y: 0.46, r: 0.18, color: 'rgba(255,110,190,0.35)' }
    ];
    blobs.forEach(b => {
      const rg = g.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * H);
      rg.addColorStop(0, b.color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    });

    // A hint of city glow along the horizon band so reflections have structure.
    const rnd = U.rng(9317);
    g.globalAlpha = 0.5;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W;
      const h = 2 + rnd() * 9;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,214,150,0.7)' : 'rgba(140,205,255,0.6)';
      g.fillRect(x, H * 0.52 - h, 1 + rnd() * 2, h);
    }
    g.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    let envTexture = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const rt = pmrem.fromEquirectangular(tex);
      envTexture = rt.texture;
      Mats._envRT = rt;
      pmrem.dispose();
      tex.dispose();
    } catch (e) {
      // Without PMREM the raw equirect still lights the scene, just less
      // accurately at high roughness — better than a black metal world.
      HC.Log.warn('Mats', 'PMREM unavailable (' + e.message + ') — using raw environment.');
      envTexture = tex;
      Mats.disposables.push(tex);
    }
    Mats.environment = envTexture;
    return envTexture;
  };

  Mats.applyEnvironment = function (scene, intensity) {
    if (!Mats.environment) return;
    scene.environment = Mats.environment;
    if (intensity !== undefined && 'environmentIntensity' in scene) {
      scene.environmentIntensity = intensity;
    }
  };

  /** Team-tinted variant of a base colour, honouring colour-blind settings. */
  Mats.teamColor = function (team) {
    const cb = HC.CB_PALETTE[CFG.access.colorBlindMode];
    if (cb) return team === 'A' ? cb.teamA : cb.teamB;
    return team === 'A' ? HC.PALETTE.teamA : HC.PALETTE.teamB;
  };

  Mats.disposeAll = function () {
    Mats.disposables.forEach(d => { try { d.dispose(); } catch (e) {} });
    Mats.disposables.length = 0;
    Mats._tex.clear(); Mats._mats.clear();
  };

})(window.HC, window.THREE);
