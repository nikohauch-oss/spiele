/* =========================================================================
 * HYPERCELL — 12_vfx.js
 * Effects layer: GPU particles, tracers, beams, impacts, explosions,
 * shields, trails, decals and a budgeted dynamic-light pool.
 *
 * Everything is pooled. No allocation happens during a firefight, which is
 * what keeps frame times flat when ten players are shooting at once.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;
  const Mats = HC.Mats;

  const VFX = HC.VFX = {
    scene: null, camera: null,
    _emitters: [], _time: 0, ready: false
  };

  /* ------------------------------------------------------------------ *
   * Particle field — one draw call per blending mode.
   * ------------------------------------------------------------------ */
  const PARTICLE_VS = `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying float vAlpha;
    varying vec3 vColor;
    uniform float uScale;
    void main() {
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      // Fade particles out as they approach the near plane — otherwise a
      // muzzle puff a metre away smears across the whole screen.
      vAlpha = aAlpha * smoothstep(0.30, 1.60, -mv.z);
      // Perspective-correct size, clamped so a particle a metre from the
      // camera cannot swallow the entire screen.
      gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 165.0);
      gl_Position = projectionMatrix * mv;
    }`;

  const PARTICLE_FS = `
    uniform sampler2D uMap;
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vec4 t = texture2D(uMap, gl_PointCoord);
      if (t.a * vAlpha < 0.004) discard;
      gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    }`;

  function ParticleField(capacity, additive, texture) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(capacity * 3);
    const col = new Float32Array(capacity * 3);
    const size = new Float32Array(capacity);
    const alpha = new Float32Array(capacity);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uScale: { value: 460 } },
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = additive ? 12 : 10;

    // Parallel CPU-side particle state.
    const P = {
      x: new Float32Array(capacity), y: new Float32Array(capacity), z: new Float32Array(capacity),
      vx: new Float32Array(capacity), vy: new Float32Array(capacity), vz: new Float32Array(capacity),
      life: new Float32Array(capacity), maxLife: new Float32Array(capacity),
      size0: new Float32Array(capacity), size1: new Float32Array(capacity),
      r0: new Float32Array(capacity), g0: new Float32Array(capacity), b0: new Float32Array(capacity),
      r1: new Float32Array(capacity), g1: new Float32Array(capacity), b1: new Float32Array(capacity),
      alpha0: new Float32Array(capacity), drag: new Float32Array(capacity),
      gravity: new Float32Array(capacity), turbulence: new Float32Array(capacity),
      seed: new Float32Array(capacity)
    };
    let count = 0;

    const cA = new THREE.Color(), cB = new THREE.Color();

    return {
      points, capacity,
      get count() { return count; },
      spawn(o) {
        if (count >= capacity) {
          // Recycle the oldest particle rather than dropping the effect.
          let oldest = 0, best = 1e9;
          for (let i = 0; i < count; i += 7) {
            const rem = P.life[i];
            if (rem < best) { best = rem; oldest = i; }
          }
          count = Math.max(0, count - 1);
          swap(oldest, count);
        }
        const i = count++;
        P.x[i] = o.x; P.y[i] = o.y; P.z[i] = o.z;
        P.vx[i] = o.vx || 0; P.vy[i] = o.vy || 0; P.vz[i] = o.vz || 0;
        P.maxLife[i] = P.life[i] = o.life;
        P.size0[i] = o.size0; P.size1[i] = o.size1 === undefined ? o.size0 * 0.2 : o.size1;
        cA.set(o.color0); cB.set(o.color1 === undefined ? o.color0 : o.color1);
        P.r0[i] = cA.r; P.g0[i] = cA.g; P.b0[i] = cA.b;
        P.r1[i] = cB.r; P.g1[i] = cB.g; P.b1[i] = cB.b;
        P.alpha0[i] = o.alpha === undefined ? 1 : o.alpha;
        P.drag[i] = o.drag === undefined ? 1.4 : o.drag;
        P.gravity[i] = o.gravity === undefined ? 0 : o.gravity;
        P.turbulence[i] = o.turbulence || 0;
        P.seed[i] = Math.random() * 100;
      },
      update(dt, time) {
        let i = 0;
        while (i < count) {
          P.life[i] -= dt;
          if (P.life[i] <= 0) { count--; swap(i, count); continue; }
          const drag = Math.exp(-P.drag[i] * dt);
          P.vx[i] *= drag; P.vz[i] *= drag;
          P.vy[i] = P.vy[i] * drag - P.gravity[i] * dt;
          if (P.turbulence[i] > 0) {
            const s = P.seed[i], t = time * 2.2;
            P.vx[i] += Math.sin(t + s) * P.turbulence[i] * dt;
            P.vy[i] += Math.cos(t * 1.3 + s) * P.turbulence[i] * 0.6 * dt;
            P.vz[i] += Math.sin(t * 0.8 + s * 1.7) * P.turbulence[i] * dt;
          }
          P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
          i++;
        }
        // Write GPU buffers
        for (let j = 0; j < count; j++) {
          const t = 1 - P.life[j] / P.maxLife[j];
          const j3 = j * 3;
          pos[j3] = P.x[j]; pos[j3 + 1] = P.y[j]; pos[j3 + 2] = P.z[j];
          col[j3] = U.lerp(P.r0[j], P.r1[j], t);
          col[j3 + 1] = U.lerp(P.g0[j], P.g1[j], t);
          col[j3 + 2] = U.lerp(P.b0[j], P.b1[j], t);
          size[j] = U.lerp(P.size0[j], P.size1[j], t);
          // Fast attack, long tail — reads as a spark rather than a blob.
          alpha[j] = P.alpha0[j] * (t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.6));
        }
        geo.setDrawRange(0, count);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
      },
      clear() { count = 0; geo.setDrawRange(0, 0); },
      dispose() { geo.dispose(); mat.dispose(); }
    };

    function swap(a, b) {
      if (a === b) return;
      const keys = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'maxLife', 'size0', 'size1',
        'r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'alpha0', 'drag', 'gravity', 'turbulence', 'seed'];
      for (let k = 0; k < keys.length; k++) {
        const arr = P[keys[k]];
        const tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Quad pools: tracers, shockwaves, flashes, decals.
   * ------------------------------------------------------------------ */
  function QuadPool(scene, geometry, makeMaterial, capacity, renderOrder) {
    const items = [];
    for (let i = 0; i < capacity; i++) {
      const mesh = new THREE.Mesh(geometry, makeMaterial());
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder || 11;
      scene.add(mesh);
      items.push({ mesh, active: false, life: 0, maxLife: 1, data: {} });
    }
    return {
      items,
      acquire() {
        for (let i = 0; i < items.length; i++) if (!items[i].active) { items[i].active = true; items[i].mesh.visible = true; return items[i]; }
        // Steal the shortest-lived one.
        let best = 0, bl = 1e9;
        for (let i = 0; i < items.length; i++) if (items[i].life < bl) { bl = items[i].life; best = i; }
        return items[best];
      },
      release(it) { it.active = false; it.mesh.visible = false; },
      dispose() { items.forEach(it => { it.mesh.material.dispose(); scene.remove(it.mesh); }); }
    };
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */
  VFX.init = function (scene, camera) {
    VFX.dispose();
    VFX.scene = scene; VFX.camera = camera;

    const budget = CFG.gfx.particleBudget;
    VFX.sparks = ParticleField(Math.floor(budget * 0.55), true, Mats.particleTexture());
    VFX.smoke = ParticleField(Math.floor(budget * 0.45), false, Mats.particleTexture());
    scene.add(VFX.sparks.points);
    scene.add(VFX.smoke.points);

    const quad = new THREE.PlaneGeometry(1, 1);
    VFX._quadGeo = quad;
    VFX.tracers = QuadPool(scene, quad, () => Mats.additive(0xffffff, 1).clone(), 72, 13);
    VFX.flashes = QuadPool(scene, quad, () => Mats.additive(0xffffff, 1).clone(), 36, 14);

    const ring = new THREE.RingGeometry(0.55, 1.0, 40);
    VFX._ringGeo = ring;
    VFX.shockwaves = QuadPool(scene, ring, () => Mats.additive(0xffffff, 1).clone(), 22, 12);

    const decalGeo = new THREE.PlaneGeometry(1, 1);
    VFX._decalGeo = decalGeo;
    VFX.decals = QuadPool(scene, decalGeo, () => new THREE.MeshBasicMaterial({
      color: 0x0a0a0a, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false
    }), CFG.gfx.decalBudget, 9);

    const sphere = new THREE.SphereGeometry(1, 20, 14);
    VFX._sphereGeo = sphere;
    VFX.blasts = QuadPool(scene, sphere, () => Mats.additive(0xffffff, 1).clone(), 14, 13);

    // Physical debris: ejected casings and dropped magazines. Small, but
    // it is the difference between a weapon that fires and one that works.
    VFX._debris = [];
    const shellGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.052, 6);
    const magGeo = new THREE.BoxGeometry(0.07, 0.17, 0.035);
    VFX._debrisGeo = [shellGeo, magGeo];
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc9a24a, roughness: 0.32, metalness: 0.95
    });
    const magMat = new THREE.MeshStandardMaterial({
      color: 0x2b303a, roughness: 0.55, metalness: 0.6
    });
    VFX._debrisMat = [brassMat, magMat];
    for (let i = 0; i < 44; i++) {
      const isShell = i < 34;
      const mesh = new THREE.Mesh(isShell ? shellGeo : magGeo, isShell ? brassMat : magMat);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      VFX._debris.push({ mesh, kind: isShell ? 'shell' : 'mag', active: false, life: 0,
        vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, groundY: 0, bounces: 0 });
    }

    // Dynamic light pool — muzzle flashes, explosions, ability casts.
    VFX.lights = [];
    for (let i = 0; i < CFG.gfx.maxDynamicLights; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 18, 2);
      l.visible = false;
      scene.add(l);
      VFX.lights.push({ light: l, life: 0, maxLife: 1, intensity: 0 });
    }

    VFX._emitters.length = 0;
    VFX._time = 0;
    VFX._viewportHeight = window.innerHeight;
    VFX.ready = true;
  };

  VFX.setViewportHeight = function (h) { VFX._viewportHeight = h; };

  /**
   * Spawns a piece of debris.
   * @param kind 'shell' | 'mag'
   */
  VFX.debris = function (kind, position, direction, groundY, speed) {
    if (!VFX.ready) return;
    let slot = null, oldest = null;
    for (let i = 0; i < VFX._debris.length; i++) {
      const d = VFX._debris[i];
      if (d.kind !== kind) continue;
      if (!d.active) { slot = d; break; }
      if (!oldest || d.life < oldest.life) oldest = d;
    }
    slot = slot || oldest;
    if (!slot) return;

    const sp = speed === undefined ? (kind === 'shell' ? 2.6 : 0.9) : speed;
    slot.active = true;
    slot.mesh.visible = true;
    slot.mesh.position.copy(position);
    slot.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    slot.vx = direction.x * sp + jitter(0.7);
    slot.vy = direction.y * sp + 1.1 + Math.random() * 0.6;
    slot.vz = direction.z * sp + jitter(0.7);
    slot.rx = jitter(16); slot.ry = jitter(16); slot.rz = jitter(16);
    slot.groundY = groundY;
    slot.bounces = kind === 'shell' ? 2 : 1;
    slot.life = kind === 'shell' ? 2.4 : 4.0;
    slot.maxLife = slot.life;
  };

  VFX.dispose = function () {
    if (!VFX.ready) return;
    [VFX.sparks, VFX.smoke].forEach(f => { if (f) { VFX.scene.remove(f.points); f.dispose(); } });
    [VFX.tracers, VFX.flashes, VFX.shockwaves, VFX.decals, VFX.blasts].forEach(p => p && p.dispose());
    (VFX._debris || []).forEach(d => VFX.scene.remove(d.mesh));
    (VFX._debrisGeo || []).forEach(g => g.dispose());
    (VFX._debrisMat || []).forEach(m => m.dispose());
    (VFX.lights || []).forEach(l => VFX.scene.remove(l.light));
    [VFX._quadGeo, VFX._ringGeo, VFX._decalGeo, VFX._sphereGeo].forEach(g => g && g.dispose());
    VFX._emitters.length = 0;
    VFX.ready = false;
  };

  /* ------------------------------------------------------------------ *
   * Emission API
   * ------------------------------------------------------------------ */
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  function jitter(amount) { return (Math.random() - 0.5) * 2 * amount; }

  VFX.light = function (pos, color, intensity, distance, life) {
    if (!VFX.ready) return;
    let slot = null, worst = 1e9;
    for (let i = 0; i < VFX.lights.length; i++) {
      const L = VFX.lights[i];
      if (L.life <= 0) { slot = L; break; }
      if (L.life < worst) { worst = L.life; slot = L; }
    }
    if (!slot) return;
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.visible = true;
    slot.intensity = intensity;
    slot.life = slot.maxLife = life;
  };

  /** Muzzle flash: light + flare quad + sparks + smoke wisp. */
  VFX.muzzleFlash = function (pos, dir, color, scale) {
    if (!VFX.ready) return;
    scale = scale === undefined ? 1 : scale;
    if (scale <= 0.001) return;
    VFX.light(pos, color, 5.5 * scale, 11 * scale, 0.075);

    const f = VFX.flashes.acquire();
    f.mesh.position.copy(pos);
    f.mesh.quaternion.copy(VFX.camera.quaternion);
    const s = (0.42 + Math.random() * 0.18) * scale;
    f.mesh.scale.set(s * 1.8, s, 1);
    f.mesh.rotateZ(Math.random() * U.TAU);
    f.mesh.material.color.set(color);
    f.mesh.material.opacity = 1;
    f.life = f.maxLife = 0.055;
    f.data.kind = 'flash';

    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      VFX.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * (7 + Math.random() * 12) + jitter(3.2),
        vy: dir.y * (7 + Math.random() * 12) + jitter(3.2),
        vz: dir.z * (7 + Math.random() * 12) + jitter(3.2),
        life: 0.07 + Math.random() * 0.13,
        size0: 0.10 * scale, size1: 0.01,
        color0: 0xffffff, color1: color, alpha: 0.95, drag: 7.5, gravity: 2
      });
    }
    VFX.smoke.spawn({
      x: pos.x + dir.x * 0.25, y: pos.y + dir.y * 0.25, z: pos.z + dir.z * 0.25,
      vx: dir.x * 2.4 + jitter(0.5), vy: 0.55 + jitter(0.3), vz: dir.z * 2.4 + jitter(0.5),
      life: 0.34, size0: 0.06 * scale, size1: 0.20 * scale,
      color0: 0x9aa3ad, color1: 0x30343c, alpha: 0.16, drag: 3.4, gravity: -0.4, turbulence: 0.5
    });
  };

  /** Tracer: a stretched additive quad that fades along its flight. */
  VFX.tracer = function (from, to, color, width, speed) {
    if (!VFX.ready) return;
    const t = VFX.tracers.acquire();
    const dist = from.distanceTo(to);
    if (dist < 0.05) { VFX.tracers.release(t); return; }
    t.data.from = t.data.from || new THREE.Vector3();
    t.data.to = t.data.to || new THREE.Vector3();
    t.data.from.copy(from); t.data.to.copy(to);
    t.data.kind = 'tracer';
    t.data.width = width || 0.03;
    t.data.length = Math.min(dist, 7.5);
    t.data.speed = speed || 190;
    t.data.travel = 0;
    t.data.dist = dist;
    t.mesh.material.color.set(color);
    t.mesh.material.opacity = 0.95;
    t.life = t.maxLife = dist / t.data.speed + 0.05;
  };

  /** Continuous beam between two points (orbital strike, laser sights). */
  VFX.beam = function (from, to, color, width, life) {
    if (!VFX.ready) return null;
    const t = VFX.tracers.acquire();
    t.data.kind = 'beam';
    t.data.from = t.data.from || new THREE.Vector3();
    t.data.to = t.data.to || new THREE.Vector3();
    t.data.from.copy(from); t.data.to.copy(to);
    t.data.width = width || 0.3;
    t.mesh.material.color.set(color);
    t.mesh.material.opacity = 0.9;
    t.life = t.maxLife = life || 0.1;
    return t;
  };

  const SURFACE_PARAMS = {
    concrete: { color0: 0xd8d2c6, color1: 0x6a655c, sparks: 3, dust: 5, sound: 'impact_concrete' },
    metal:    { color0: 0xffe6a8, color1: 0xff8a2a, sparks: 12, dust: 2, sound: 'impact_metal' },
    glass:    { color0: 0xd8f4ff, color1: 0x88b8d8, sparks: 10, dust: 2, sound: 'impact_glass' },
    wood:     { color0: 0xc79a5e, color1: 0x5a3f22, sparks: 4, dust: 4, sound: 'impact_wood' },
    energy:   { color0: 0xa8f0ff, color1: 0x2e88ff, sparks: 10, dust: 0, sound: 'impact_energy' },
    flesh:    { color0: 0xff5a6a, color1: 0x8a1020, sparks: 8, dust: 0, sound: 'impact_flesh' },
    shield:   { color0: 0xbfe8ff, color1: 0x3f9fff, sparks: 10, dust: 0, sound: 'impact_shield' },
    grass:    { color0: 0x9ac86a, color1: 0x3f5a2a, sparks: 2, dust: 5, sound: 'impact_wood' }
  };

  VFX.impact = function (pos, normal, surface, scale, tint) {
    if (!VFX.ready) return;
    const S = SURFACE_PARAMS[surface] || SURFACE_PARAMS.concrete;
    scale = scale || 1;

    const nSparks = Math.round(S.sparks * scale);
    for (let i = 0; i < nSparks; i++) {
      const sp = 4 + Math.random() * 11 * scale;
      VFX.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (normal.x + jitter(0.85)) * sp,
        vy: (normal.y + jitter(0.85)) * sp + 1.4,
        vz: (normal.z + jitter(0.85)) * sp,
        life: 0.16 + Math.random() * 0.34,
        size0: 0.075 * scale, size1: 0.006,
        color0: tint === undefined ? S.color0 : tint, color1: S.color1,
        alpha: 1, drag: 2.2, gravity: 14
      });
    }
    for (let i = 0; i < Math.round(S.dust * scale); i++) {
      VFX.smoke.spawn({
        x: pos.x + jitter(0.08), y: pos.y + jitter(0.08), z: pos.z + jitter(0.08),
        vx: normal.x * 1.6 + jitter(0.9), vy: normal.y * 1.6 + jitter(0.9) + 0.5, vz: normal.z * 1.6 + jitter(0.9),
        life: 0.40 + Math.random() * 0.35,
        size0: 0.05 * scale, size1: 0.26 * scale,
        color0: 0xb8b2a6, color1: 0x4a463f, alpha: 0.24, drag: 2.8, gravity: -0.5, turbulence: 0.6
      });
    }

    const flash = VFX.flashes.acquire();
    flash.mesh.position.copy(pos).addScaledVector(normal, 0.02);
    flash.mesh.quaternion.copy(VFX.camera.quaternion);
    flash.mesh.scale.setScalar(0.24 * scale);
    flash.mesh.material.color.set(tint === undefined ? S.color0 : tint);
    flash.mesh.material.opacity = 0.9;
    flash.life = flash.maxLife = 0.075;
    flash.data.kind = 'flash';

    if (surface === 'metal' || surface === 'energy' || surface === 'shield') {
      VFX.light(pos, S.color0, 1.7 * scale, 5, 0.09);
    }
    // Bullet mark on hard surfaces only.
    if (surface === 'concrete' || surface === 'metal' || surface === 'wood') VFX.decal(pos, normal, 0.14 * scale);
  };

  VFX.decal = function (pos, normal, size) {
    if (!VFX.ready || CFG.gfx.decalBudget <= 0) return;
    const d = VFX.decals.acquire();
    d.mesh.position.copy(pos).addScaledVector(normal, 0.012);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    d.mesh.quaternion.copy(_q);
    d.mesh.rotateZ(Math.random() * U.TAU);
    d.mesh.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    d.mesh.material.opacity = 0.8;
    d.life = d.maxLife = 14;
    d.data.kind = 'decal';
  };

  VFX.explosion = function (pos, radius, color, options) {
    if (!VFX.ready) return;
    options = options || {};
    const scale = radius / 4;
    const big = radius > 5;

    // Core flash sphere
    const b = VFX.blasts.acquire();
    b.mesh.position.copy(pos);
    b.mesh.scale.setScalar(radius * 0.28);
    b.mesh.material.color.set(options.coreColor === undefined ? 0xfff3c8 : options.coreColor);
    b.mesh.material.opacity = 0.95;
    b.life = b.maxLife = 0.30;
    b.data.kind = 'blast';
    b.data.startScale = radius * 0.28;
    b.data.endScale = radius * 0.95;

    // Ground shockwave
    const sw = VFX.shockwaves.acquire();
    sw.mesh.position.set(pos.x, (options.groundY === undefined ? pos.y - radius * 0.25 : options.groundY) + 0.06, pos.z);
    sw.mesh.rotation.set(-Math.PI / 2, 0, 0);
    sw.mesh.scale.setScalar(radius * 0.30);
    sw.mesh.material.color.set(color);
    sw.mesh.material.opacity = 0.85;
    sw.life = sw.maxLife = 0.55;
    sw.data.kind = 'shockwave';
    sw.data.startScale = radius * 0.30;
    sw.data.endScale = radius * 1.7;

    VFX.light(pos, color, big ? 16 : 9, radius * 5, big ? 0.55 : 0.32);

    const nS = Math.round(28 * scale * (options.sparkScale || 1));
    for (let i = 0; i < nS; i++) {
      const dir = _v.set(jitter(1), Math.random() * 0.9 + 0.1, jitter(1)).normalize();
      const sp = (8 + Math.random() * 26) * scale;
      VFX.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
        life: 0.32 + Math.random() * 0.8,
        size0: 0.16 * scale, size1: 0.012,
        color0: 0xfff0b8, color1: color, alpha: 1, drag: 1.5, gravity: 16
      });
    }
    const nSm = Math.round(16 * scale);
    for (let i = 0; i < nSm; i++) {
      const dir = _v.set(jitter(1), Math.random() * 0.7, jitter(1)).normalize();
      VFX.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * 5 * scale, vy: dir.y * 5 * scale + 1.5, vz: dir.z * 5 * scale,
        life: 0.9 + Math.random() * 1.1,
        size0: 0.55 * scale, size1: 2.6 * scale,
        color0: options.smokeColor === undefined ? 0x6a6258 : options.smokeColor,
        color1: 0x1a1a1c, alpha: 0.55, drag: 1.5, gravity: -0.9, turbulence: 1.1
      });
    }
  };

  /** Burst used for dashes, teleports, spawns, ability casts. */
  VFX.burst = function (pos, color, count, speed, options) {
    if (!VFX.ready) return;
    options = options || {};
    for (let i = 0; i < count; i++) {
      const dir = _v.set(jitter(1), options.upBias === undefined ? jitter(1) : Math.random() * options.upBias, jitter(1)).normalize();
      const sp = speed * (0.4 + Math.random() * 0.8);
      VFX.sparks.spawn({
        x: pos.x + jitter(options.spread || 0.12),
        y: pos.y + jitter(options.spread || 0.12),
        z: pos.z + jitter(options.spread || 0.12),
        vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
        life: (options.life || 0.4) * (0.6 + Math.random() * 0.7),
        size0: options.size || 0.14, size1: 0.01,
        color0: options.color0 === undefined ? 0xffffff : options.color0, color1: color,
        alpha: 1, drag: options.drag === undefined ? 3.2 : options.drag,
        gravity: options.gravity === undefined ? 2 : options.gravity,
        turbulence: options.turbulence || 0
      });
    }
    if (options.light !== false) VFX.light(pos, color, 3.2, 9, 0.16);
  };

  /** Ground dust puff (landings, slides, slams). */
  VFX.dust = function (pos, amount, radius, color) {
    if (!VFX.ready) return;
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * U.TAU, r = Math.random() * radius;
      VFX.smoke.spawn({
        x: pos.x + Math.cos(a) * r, y: pos.y + 0.06, z: pos.z + Math.sin(a) * r,
        vx: Math.cos(a) * (1.4 + Math.random() * 2.6), vy: 0.5 + Math.random() * 1.0,
        vz: Math.sin(a) * (1.4 + Math.random() * 2.6),
        life: 0.55 + Math.random() * 0.6,
        size0: 0.12, size1: 0.62,
        color0: color === undefined ? 0xb0a89a : color, color1: 0x3f3c36,
        alpha: 0.38, drag: 2.2, gravity: -0.4, turbulence: 0.7
      });
    }
  };

  /** Continuous emitter attached to a moving object (ability trails). */
  VFX.attachTrail = function (object3D, options) {
    const e = {
      object: object3D, options: Object.assign({
        rate: 55, color0: 0xffffff, color1: 0x36c7ff, size0: 0.16, size1: 0.02,
        life: 0.34, spread: 0.10, drag: 3.0, gravity: 0, additive: true, offsetY: 0
      }, options || {}),
      accumulator: 0, alive: true,
      stop() { this.alive = false; }
    };
    VFX._emitters.push(e);
    return e;
  };

  /* ------------------------------------------------------------------ *
   * Frame update
   * ------------------------------------------------------------------ */
  const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _mid = new THREE.Vector3();

  VFX.update = function (dt) {
    if (!VFX.ready) return;
    VFX._time += dt;

    // Point size must track the viewport and FOV or particles change size
    // when the window resizes or the player aims down sights.
    const h = VFX._viewportHeight || 720;
    const scale = h / (2 * Math.tan(VFX.camera.fov * 0.5 * U.DEG));
    VFX.sparks.points.material.uniforms.uScale.value = scale;
    VFX.smoke.points.material.uniforms.uScale.value = scale;

    // Trail emitters
    for (let i = VFX._emitters.length - 1; i >= 0; i--) {
      const e = VFX._emitters[i];
      if (!e.alive || !e.object.parent) { VFX._emitters.splice(i, 1); continue; }
      e.object.getWorldPosition(_v);
      _v.y += e.options.offsetY;
      e.accumulator += e.options.rate * dt;
      const n = Math.floor(e.accumulator);
      e.accumulator -= n;
      const field = e.options.additive ? VFX.sparks : VFX.smoke;
      for (let k = 0; k < n; k++) {
        field.spawn({
          x: _v.x + jitter(e.options.spread), y: _v.y + jitter(e.options.spread), z: _v.z + jitter(e.options.spread),
          vx: jitter(0.6), vy: jitter(0.6) + (e.options.rise || 0), vz: jitter(0.6),
          life: e.options.life * (0.7 + Math.random() * 0.6),
          size0: e.options.size0, size1: e.options.size1,
          color0: e.options.color0, color1: e.options.color1,
          alpha: e.options.alpha === undefined ? 0.9 : e.options.alpha,
          drag: e.options.drag, gravity: e.options.gravity, turbulence: e.options.turbulence || 0
        });
      }
    }

    VFX.sparks.update(dt, VFX._time);
    VFX.smoke.update(dt, VFX._time);

    // Tracers / beams
    const camQ = VFX.camera.quaternion;
    for (let i = 0; i < VFX.tracers.items.length; i++) {
      const t = VFX.tracers.items[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { VFX.tracers.release(t); continue; }
      const d = t.data;
      if (d.kind === 'tracer') {
        d.travel += d.speed * dt;
        const head = Math.min(d.dist, d.travel);
        const tail = Math.max(0, head - d.length);
        _from.copy(d.from).lerp(d.to, tail / Math.max(0.001, d.dist));
        _to.copy(d.from).lerp(d.to, head / Math.max(0.001, d.dist));
        placeBillboardSegment(t.mesh, _from, _to, d.width, camQ);
        t.mesh.material.opacity = 0.95 * U.clamp01(t.life / t.maxLife * 3);
      } else {
        placeBillboardSegment(t.mesh, d.from, d.to, d.width, camQ);
        t.mesh.material.opacity = 0.9 * U.clamp01(t.life / t.maxLife);
      }
    }

    // Flashes
    for (let i = 0; i < VFX.flashes.items.length; i++) {
      const f = VFX.flashes.items[i];
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) { VFX.flashes.release(f); continue; }
      f.mesh.quaternion.copy(camQ);
      f.mesh.material.opacity = U.clamp01(f.life / f.maxLife);
    }

    // Shockwaves
    for (let i = 0; i < VFX.shockwaves.items.length; i++) {
      const s = VFX.shockwaves.items[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { VFX.shockwaves.release(s); continue; }
      const k = 1 - s.life / s.maxLife;
      s.mesh.scale.setScalar(U.lerp(s.data.startScale, s.data.endScale, U.easeOutQuint(k)));
      s.mesh.material.opacity = 0.85 * (1 - U.easeInCubic(k));
    }

    // Blast spheres
    for (let i = 0; i < VFX.blasts.items.length; i++) {
      const b = VFX.blasts.items[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { VFX.blasts.release(b); continue; }
      const k = 1 - b.life / b.maxLife;
      b.mesh.scale.setScalar(U.lerp(b.data.startScale, b.data.endScale, U.easeOutCubic(k)));
      b.mesh.material.opacity = 0.95 * (1 - U.easeInCubic(k));
    }

    // Decals fade out at the end of their life
    for (let i = 0; i < VFX.decals.items.length; i++) {
      const d = VFX.decals.items[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { VFX.decals.release(d); continue; }
      if (d.life < 2) d.mesh.material.opacity = 0.8 * (d.life / 2);
    }

    // Debris
    for (let i = 0; i < VFX._debris.length; i++) {
      const d = VFX._debris[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; d.mesh.visible = false; continue; }
      d.vy -= CFG.sim.gravity * 0.55 * dt;
      const p = d.mesh.position;
      p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      if (p.y <= d.groundY + 0.02) {
        p.y = d.groundY + 0.02;
        if (d.bounces > 0 && d.vy < -0.6) {
          d.bounces--;
          d.vy = -d.vy * 0.35;
          d.vx *= 0.55; d.vz *= 0.55;
          d.rx *= 0.4; d.ry *= 0.4; d.rz *= 0.4;
          if (d.kind === 'shell') {
            HC.Audio.play('impact_metal', { position: p, scale: 0.16, volume: 0.28, varyAmount: 0.25 });
          }
        } else {
          d.vy = 0; d.vx *= 0.72; d.vz *= 0.72;
          d.rx = d.ry = d.rz = 0;
        }
      }
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;
    }

    // Dynamic lights
    for (let i = 0; i < VFX.lights.length; i++) {
      const L = VFX.lights[i];
      if (L.life <= 0) continue;
      L.life -= dt;
      if (L.life <= 0) { L.light.visible = false; L.light.intensity = 0; continue; }
      const k = L.life / L.maxLife;
      L.light.intensity = L.intensity * k * k;
    }
  };

  /** Orients a unit quad as a camera-facing segment between two points. */
  function placeBillboardSegment(mesh, a, b, width, camQ) {
    _mid.copy(a).add(b).multiplyScalar(0.5);
    mesh.position.copy(_mid);
    const len = a.distanceTo(b);
    _v.copy(b).sub(a);
    if (len < 0.0001) { mesh.scale.set(0, 0, 1); return; }
    _v.multiplyScalar(1 / len);
    // Face the camera, then roll so the quad's local X follows the segment.
    mesh.quaternion.copy(camQ);
    _v2.copy(_v).applyQuaternion(_q.copy(camQ).invert());
    mesh.rotateZ(Math.atan2(_v2.y, _v2.x));
    mesh.scale.set(len, width, 1);
  }

  VFX.clear = function () {
    if (!VFX.ready) return;
    VFX.sparks.clear(); VFX.smoke.clear();
    [VFX.tracers, VFX.flashes, VFX.shockwaves, VFX.decals, VFX.blasts].forEach(p => {
      p.items.forEach(it => p.release(it));
    });
    VFX.lights.forEach(l => { l.life = 0; l.light.visible = false; l.light.intensity = 0; });
    VFX._debris.forEach(d => { d.active = false; d.mesh.visible = false; });
    VFX._emitters.length = 0;
  };

  /* ------------------------------------------------------------------ *
   * Persistent effect objects (shields, barriers, auras) — these live in
   * the scene graph and are owned by whatever ability created them.
   * ------------------------------------------------------------------ */
  VFX.makeShieldDome = function (radius, color) {
    const geo = new THREE.SphereGeometry(radius, 26, 16, 0, U.TAU, 0, Math.PI * 0.55);
    const tex = Mats.colorTexture('circuit', 4242, color, color);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), map: tex, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { geometries: [geo], materials: [mat], baseOpacity: 0.30, phase: 0 };
    mesh.renderOrder = 11;
    return mesh;
  };

  VFX.makeBarrier = function (width, height, color) {
    const geo = new THREE.PlaneGeometry(width, height, 1, 1);
    const tex = Mats.colorTexture('circuit', 1717, color, color);
    tex.repeat.set(Math.max(1, width / 2), Math.max(1, height / 2));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), map: tex, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Solid outline frame makes the barrier readable as cover, not decoration.
    const frameGeo = new THREE.BoxGeometry(width, height, 0.06);
    const frameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    mesh.add(frame);
    mesh.userData = { geometries: [geo, frameGeo], materials: [mat, frameMat], baseOpacity: 0.34 };
    mesh.renderOrder = 11;
    return mesh;
  };

  VFX.disposeObject = function (obj) {
    if (!obj || !obj.userData) return;
    (obj.userData.geometries || []).forEach(g => { try { g.dispose(); } catch (e) {} });
    (obj.userData.materials || []).forEach(m => { try { m.dispose(); } catch (e) {} });
  };

})(window.HC, window.THREE);
