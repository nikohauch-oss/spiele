/* =========================================================================
 * HYPERCELL — 10_weapon_model.js
 * Procedural weapon geometry, one builder per archetype. Weapons carry
 * named sockets (muzzle, eject, magazine, grip, foregrip) that the
 * animation, VFX and audio systems read — nothing is positioned by guess.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const Mats = HC.Mats;
  const SH = HC.CharacterModel.shapes;
  const { plate, capsule, sphere, box, cone, torus, lathe, mergeGeometries, SEG } = SH;

  const WM = HC.WeaponModel = {};

  function partSet(pal, skinMat, glowColor) {
    const s = (pal.primary ^ 0x5a5a) & 0xffff;
    // Weapons are small objects seen close up: texture repeats above ~1 tile
    // shatter into noise, and matte metal reads as grey plastic. Low repeat,
    // low roughness, high metalness, and real environment reflections.
    return {
      body: Mats.make({ unique: true, kind: 'plate', color: 0x2c313b, seed: s + 1,
        roughness: 0.36, metalness: 0.85, repeat: 0.35, normalScale: 0.45,
        rim: { color: 0xa8c8ff, strength: 0.26, power: 3.2 } }),
      metal: Mats.make({ unique: true, kind: 'metal', color: 0x9aa4b2, seed: s + 2,
        roughness: 0.22, metalness: 1.0, repeat: 0.5, normalScale: 0.35,
        rim: { color: 0xffffff, strength: 0.26, power: 3.2 } }),
      grip: Mats.make({ unique: true, kind: 'rubber', color: 0x14161c, seed: s + 3,
        roughness: 0.88, metalness: 0.1, repeat: 1.2, normalScale: 0.5,
        rim: { color: 0x7f98b8, strength: 0.16, power: 3.4 } }),
      accent: Mats.make({ unique: true, kind: 'plate', color: pal.accent, seed: s + 4,
        roughness: 0.30, metalness: 0.75, repeat: 0.3, normalScale: 0.4,
        emissive: glowColor, emissiveIntensity: 0.32,
        rim: { color: glowColor, strength: 0.4, power: 2.6 } }),
      glow: Mats.make({ unique: true, kind: 'energy', color: glowColor, emissive: glowColor,
        emissiveIntensity: 2.6, opacity: 0.95, depthWrite: true, rim: false }),
      trim: Mats.make({ unique: true, kind: 'metal', color: pal.trim, seed: s + 5,
        roughness: skinMat.goldTrim ? 0.16 : 0.30, metalness: skinMat.goldTrim ? 1.0 : 0.9,
        repeat: 0.4, normalScale: 0.35, rim: { color: 0xffffff, strength: 0.3, power: 3.0 } })
    };
  }

  /** Collects geometry per material and merges — one draw call per material. */
  function Builder(M) {
    const groups = new Map();
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
          v = new THREE.Vector3(), sc = new THREE.Vector3();
    return {
      add(geo, material, t) {
        t = t || {};
        const p = t.pos || [0, 0, 0], r = t.rot || [0, 0, 0];
        let s = t.scale === undefined ? 1 : t.scale;
        if (typeof s === 'number') s = [s, s, s];
        v.set(p[0], p[1], p[2]); e.set(r[0], r[1], r[2]); q.setFromEuler(e); sc.set(s[0], s[1], s[2]);
        mat4.compose(v, q, sc);
        geo.applyMatrix4(mat4);
        if (!groups.has(material)) groups.set(material, []);
        groups.get(material).push(geo);
        return this;
      },
      finish(root, out) {
        for (const [material, geos] of groups) {
          const merged = mergeGeometries(geos);
          const mesh = new THREE.Mesh(merged, material);
          mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
          root.add(mesh);
          out.meshes.push(mesh); out.geometries.push(merged);
        }
      }
    };
  }

  function socket(root, name, pos, rot) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(pos[0], pos[1], pos[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    root.add(o);
    return o;
  }

  /* ------------------------------------------------------------------ *
   * Archetype builders. Local axes: +Z forward (muzzle), +Y up.
   * `L` is the overall weapon length used to scale every part.
   * ------------------------------------------------------------------ */
  const ARCH = {};

  ARCH.assault_rifle = function (B, M, L, out, root) {
    const w = L * 0.085, h = L * 0.125;

    /* Receiver — the spine of the weapon. Everything else hangs off it. */
    B.add(plate(w * 1.0, h, L * 0.40, w * 0.22, 0.12), M.body, { pos: [0, 0, -L * 0.02] });
    B.add(plate(w * 0.72, h * 0.34, L * 0.42, w * 0.14, 0), M.metal, { pos: [0, h * 0.44, -L * 0.02] });

    /* Handguard — slimmer than the receiver, with vent slots so it does not
     * read as one continuous slab. */
    B.add(plate(w * 0.82, h * 0.66, L * 0.30, w * 0.20, 0.25), M.body, { pos: [0, h * 0.02, L * 0.34] });
    for (let i = 0; i < 4; i++) {
      [-1, 1].forEach(sg => B.add(plate(w * 0.10, h * 0.30, L * 0.045, w * 0.03, 0), M.grip,
        { pos: [sg * w * 0.42, h * 0.02, L * (0.24 + i * 0.055)] }));
    }

    /* Barrel + muzzle device. */
    B.add(new THREE.CylinderGeometry(w * 0.13, w * 0.13, L * 0.30, 14), M.metal,
      { pos: [0, h * 0.04, L * 0.60], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.22, w * 0.19, L * 0.10, 14), M.body,
      { pos: [0, h * 0.04, L * 0.74], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) {
      B.add(torus(w * 0.23, w * 0.035, 14), M.metal, { pos: [0, h * 0.04, L * (0.71 + i * 0.028)] });
    }

    /* Stock — a distinct shape with a visible gap, not a continuation. */
    B.add(plate(w * 0.34, h * 0.42, L * 0.16, w * 0.10, 0), M.metal, { pos: [0, h * 0.06, -L * 0.28] });
    B.add(plate(w * 0.78, h * 0.86, L * 0.14, w * 0.22, 0.2), M.body, { pos: [0, -h * 0.04, -L * 0.42] });
    B.add(plate(w * 0.80, h * 1.00, L * 0.05, w * 0.20, 0.2), M.grip, { pos: [0, -h * 0.04, -L * 0.50] });
    B.add(plate(w * 0.60, h * 0.26, L * 0.20, w * 0.08, 0), M.grip, { pos: [0, h * 0.44, -L * 0.34] });

    /* Pistol grip, trigger guard, magazine — angled, clearly separate. */
    B.add(plate(w * 0.60, h * 0.92, L * 0.10, w * 0.18, 0.25), M.grip,
      { pos: [0, -h * 0.66, -L * 0.14], rot: [0.30, 0, 0] });
    B.add(torus(w * 0.30, w * 0.055, 12), M.metal, { pos: [0, -h * 0.34, -L * 0.04], rot: [0, Math.PI / 2, 0] });
    B.add(plate(w * 0.62, h * 1.05, L * 0.085, w * 0.14, 0.1), M.body,
      { pos: [0, -h * 0.74, L * 0.08], rot: [-0.16, 0, 0] });
    B.add(plate(w * 0.50, h * 0.22, L * 0.07, w * 0.06, 0), M.accent,
      { pos: [0, -h * 1.18, L * 0.10], rot: [-0.16, 0, 0] });

    /* Optic on the rail. */
    B.add(plate(w * 0.46, h * 0.24, L * 0.10, w * 0.10, 0), M.metal, { pos: [0, h * 0.60, L * 0.10] });
    B.add(new THREE.CylinderGeometry(w * 0.24, w * 0.24, L * 0.14, 16), M.body,
      { pos: [0, h * 0.84, L * 0.10], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.20, w * 0.20, L * 0.012, 16), M.glow,
      { pos: [0, h * 0.84, L * 0.175], rot: [Math.PI / 2, 0, 0] });

    /* Energy cell + seam lighting — the hero read at a glance. */
    [-1, 1].forEach(sg => B.add(plate(w * 0.16, h * 0.34, L * 0.18, w * 0.05, 0), M.glow,
      { pos: [sg * w * 0.52, -h * 0.06, -L * 0.06] }));
    B.add(plate(w * 0.26, h * 0.08, L * 0.26, w * 0.03, 0), M.accent, { pos: [0, -h * 0.36, L * 0.34] });

    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.04, L * 0.82]);
    out.sockets.eject = socket(root, 'eject', [w * 0.55, h * 0.10, L * 0.06]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.92, L * 0.08]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.30, L * 0.36]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.48, -L * 0.12]);
  };

  ARCH.smg = function (B, M, L, out, root) {
    const w = L * 0.125, h = L * 0.165;

    /* Receiver: a squat, wide body with a raised deck the rail sits on. */
    B.add(plate(w, h * 0.94, L * 0.46, w * 0.26, 0.18), M.body, { pos: [0, 0, L * 0.02] });
    B.add(plate(w * 0.74, h * 0.30, L * 0.50, w * 0.14, 0), M.metal, { pos: [0, h * 0.52, L * 0.02] });
    // Ejection port, cut as a recessed dark panel.
    B.add(plate(w * 0.10, h * 0.34, L * 0.14, w * 0.03, 0), M.grip, { pos: [w * 0.50, h * 0.18, L * 0.06] });
    // Charging handle.
    B.add(new THREE.CylinderGeometry(w * 0.07, w * 0.07, L * 0.10, 8), M.metal,
      { pos: [w * 0.52, h * 0.36, -L * 0.10], rot: [0, 0, Math.PI / 2] });

    /* Handguard with cooling slots, then the suppressed barrel. */
    B.add(plate(w * 0.80, h * 0.56, L * 0.24, w * 0.18, 0.22), M.body, { pos: [0, h * 0.04, L * 0.34] });
    for (let i = 0; i < 3; i++) {
      [-1, 1].forEach(sg => B.add(plate(w * 0.09, h * 0.24, L * 0.04, w * 0.03, 0), M.grip,
        { pos: [sg * w * 0.41, h * 0.04, L * (0.27 + i * 0.06)] }));
    }
    B.add(new THREE.CylinderGeometry(w * 0.14, w * 0.14, L * 0.16, 12), M.metal,
      { pos: [0, h * 0.08, L * 0.50], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.25, w * 0.23, L * 0.20, 14), M.body,
      { pos: [0, h * 0.08, L * 0.62], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) {
      B.add(torus(w * 0.26, w * 0.028, 14), M.metal, { pos: [0, h * 0.08, L * (0.56 + i * 0.035)] });
    }

    /* Folding stock stub and sling loop — reads as a compact PDW. */
    B.add(plate(w * 0.30, h * 0.36, L * 0.14, w * 0.08, 0), M.metal, { pos: [0, h * 0.10, -L * 0.28] });
    B.add(plate(w * 0.66, h * 0.62, L * 0.06, w * 0.14, 0.2), M.grip, { pos: [0, h * 0.02, -L * 0.36] });
    B.add(torus(w * 0.16, w * 0.035, 10), M.metal, { pos: [-w * 0.44, -h * 0.24, -L * 0.24], rot: [0, Math.PI / 2, 0] });

    /* Grip, trigger guard, angled magazine. */
    B.add(plate(w * 0.56, h * 0.88, L * 0.10, w * 0.16, 0.24), M.grip,
      { pos: [0, -h * 0.66, -L * 0.08], rot: [0.26, 0, 0] });
    B.add(torus(w * 0.28, w * 0.05, 12), M.metal, { pos: [0, -h * 0.32, L * 0.02], rot: [0, Math.PI / 2, 0] });
    B.add(plate(w * 0.58, h * 1.00, L * 0.085, w * 0.13, 0.12), M.body,
      { pos: [0, -h * 0.76, L * 0.12], rot: [-0.14, 0, 0] });
    B.add(plate(w * 0.48, h * 0.20, L * 0.07, w * 0.05, 0), M.accent,
      { pos: [0, -h * 1.16, L * 0.14], rot: [-0.14, 0, 0] });

    /* Compact reflex sight. */
    B.add(plate(w * 0.42, h * 0.20, L * 0.09, w * 0.08, 0), M.metal, { pos: [0, h * 0.66, L * 0.08] });
    B.add(plate(w * 0.40, h * 0.42, L * 0.03, w * 0.06, 0), M.metal, { pos: [0, h * 0.90, L * 0.04] });
    B.add(plate(w * 0.34, h * 0.34, L * 0.012, w * 0.04, 0), M.glow, { pos: [0, h * 0.90, L * 0.055] });

    /* Charge cells down both flanks — the family read shared with the rifle. */
    [-1, 1].forEach(sg => {
      B.add(plate(w * 0.14, h * 0.30, L * 0.20, w * 0.05, 0), M.glow, { pos: [sg * w * 0.52, -h * 0.10, -L * 0.02] });
      B.add(plate(w * 0.16, h * 0.10, L * 0.24, w * 0.04, 0), M.accent, { pos: [sg * w * 0.50, h * 0.30, L * 0.32] });
    });

    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.08, L * 0.72]);
    out.sockets.eject = socket(root, 'eject', [w * 0.55, h * 0.18, L * 0.06]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.95, L * 0.13]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.26, L * 0.34]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.46, -L * 0.06]);
  };

  ARCH.minigun = function (B, M, L, out, root) {
    const w = L * 0.20, h = L * 0.22;
    // barrel cluster on a rotating hub
    const hub = new THREE.Object3D(); hub.name = 'barrelHub';
    hub.position.set(0, h * 0.05, L * 0.30);
    root.add(hub);
    const hubB = Builder(M);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      hubB.add(new THREE.CylinderGeometry(w * 0.11, w * 0.11, L * 0.56, 8), M.metal,
        { pos: [Math.cos(a) * w * 0.30, Math.sin(a) * w * 0.30, 0], rot: [Math.PI / 2, 0, 0] });
    }
    hubB.add(new THREE.CylinderGeometry(w * 0.22, w * 0.22, L * 0.10, 12), M.body, { pos: [0, 0, -L * 0.22], rot: [Math.PI / 2, 0, 0] });
    hubB.finish(hub, out);
    out.animated = out.animated || {};
    out.animated.barrelHub = hub;

    B.add(plate(w, h, L * 0.46, w * 0.26, 0.2), M.body, { pos: [0, 0, -L * 0.10] });
    B.add(torus(w * 0.46, w * 0.09, 14), M.body, { pos: [0, h * 0.05, L * 0.06], rot: [0, 0, 0] });
    B.add(plate(w * 1.1, h * 0.7, L * 0.24, w * 0.2, 0.3), M.body, { pos: [0, -h * 0.42, -L * 0.24] });
    B.add(plate(w * 0.55, h * 1.0, L * 0.12, w * 0.16, 0.2), M.grip, { pos: [0, -h * 0.85, -L * 0.20], rot: [0.2, 0, 0] });
    // ammo drum + feed
    B.add(new THREE.CylinderGeometry(w * 0.62, w * 0.62, L * 0.20, 14), M.body,
      { pos: [-w * 0.72, -h * 0.30, -L * 0.26], rot: [0, 0, Math.PI / 2] });
    B.add(torus(w * 0.44, w * 0.07, 14), M.accent, { pos: [-w * 0.83, -h * 0.30, -L * 0.26], rot: [0, Math.PI / 2, 0] });
    B.add(plate(w * 0.5, h * 0.24, L * 0.30, w * 0.08, 0), M.glow, { pos: [-w * 0.32, h * 0.10, -L * 0.14] });
    B.add(plate(w * 0.5, h * 0.24, L * 0.30, w * 0.08, 0), M.glow, { pos: [w * 0.32, h * 0.10, -L * 0.14] });
    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.05, L * 0.60]);
    out.sockets.eject = socket(root, 'eject', [w * 0.5, -h * 0.1, -L * 0.10]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.55, -L * 0.18]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.55, L * 0.10]);
  };

  ARCH.shotgun = function (B, M, L, out, root) {
    const w = L * 0.12, h = L * 0.16;
    B.add(plate(w, h * 0.9, L * 0.50, w * 0.24, 0.2), M.body, { pos: [0, 0, L * 0.06] });
    B.add(new THREE.CylinderGeometry(w * 0.26, w * 0.26, L * 0.52, 12), M.metal,
      { pos: [0, h * 0.14, L * 0.44], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.20, w * 0.20, L * 0.42, 10), M.body,
      { pos: [0, -h * 0.16, L * 0.38], rot: [Math.PI / 2, 0, 0] });
    // pump — animated during reload
    const pump = new THREE.Object3D(); pump.name = 'pump'; pump.position.set(0, -h * 0.16, L * 0.36);
    root.add(pump);
    const pB = Builder(M);
    pB.add(new THREE.CylinderGeometry(w * 0.30, w * 0.30, L * 0.14, 10), M.grip, { rot: [Math.PI / 2, 0, 0] });
    pB.finish(pump, out);
    out.animated = out.animated || {}; out.animated.pump = pump;

    B.add(plate(w * 0.9, h * 1.05, L * 0.24, w * 0.2, 0.25), M.grip, { pos: [0, -h * 0.30, -L * 0.34], rot: [0.16, 0, 0] });
    B.add(plate(w * 0.62, h * 0.95, L * 0.11, w * 0.16, 0.2), M.grip, { pos: [0, -h * 0.68, -L * 0.06], rot: [0.26, 0, 0] });
    B.add(plate(w * 0.4, h * 0.16, L * 0.10, w * 0.05, 0), M.accent, { pos: [0, h * 0.46, L * 0.18] });
    for (let i = 0; i < 4; i++) {
      B.add(plate(w * 0.2, h * 0.2, L * 0.05, w * 0.05, 0), M.trim, { pos: [w * 0.55, -h * 0.42, -L * (0.10 + i * 0.08)] });
    }
    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.14, L * 0.70]);
    out.sockets.eject = socket(root, 'eject', [w * 0.55, 0, L * 0.06]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.35, L * 0.12]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.45, L * 0.34]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.45, -L * 0.05]);
  };

  ARCH.precision_rifle = function (B, M, L, out, root) {
    const w = L * 0.09, h = L * 0.13;
    B.add(plate(w, h, L * 0.70, w * 0.26, 0.2), M.body, { pos: [0, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.17, w * 0.19, L * 0.64, 10), M.metal,
      { pos: [0, h * 0.06, L * 0.62], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.30, w * 0.26, L * 0.14, 10), M.body,
      { pos: [0, h * 0.06, L * 0.90], rot: [Math.PI / 2, 0, 0] });
    // scope
    B.add(new THREE.CylinderGeometry(w * 0.30, w * 0.30, L * 0.34, 14), M.body,
      { pos: [0, h * 0.86, L * 0.10], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.34, w * 0.34, L * 0.05, 14), M.metal,
      { pos: [0, h * 0.86, L * 0.28], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.26, w * 0.26, L * 0.02, 14), M.glow,
      { pos: [0, h * 0.86, L * 0.30], rot: [Math.PI / 2, 0, 0] });
    [-1, 1].forEach(s => B.add(plate(w * 0.24, h * 0.55, L * 0.06, w * 0.06, 0), M.metal,
      { pos: [0, h * 0.48, L * (s > 0 ? 0.22 : -0.02)] }));
    // stock + cheek rest + bipod
    B.add(plate(w * 0.8, h * 1.0, L * 0.30, w * 0.2, 0.2), M.body, { pos: [0, -h * 0.06, -L * 0.48] });
    B.add(plate(w * 0.7, h * 0.34, L * 0.22, w * 0.12, 0.2), M.grip, { pos: [0, h * 0.42, -L * 0.40] });
    B.add(plate(w * 0.6, h * 0.95, L * 0.10, w * 0.14, 0.2), M.grip, { pos: [0, -h * 0.72, -L * 0.14], rot: [0.26, 0, 0] });
    [-1, 1].forEach(s => B.add(new THREE.CylinderGeometry(w * 0.07, w * 0.07, L * 0.24, 6), M.metal,
      { pos: [s * w * 0.30, -h * 0.62, L * 0.52], rot: [0.2, 0, s * 0.34] }));
    B.add(plate(w * 0.34, h * 0.20, L * 0.28, w * 0.06, 0), M.glow, { pos: [0, -h * 0.30, L * 0.20] });
    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.06, L * 1.0]);
    out.sockets.eject = socket(root, 'eject', [w * 0.55, h * 0.12, L * 0.02]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.85, L * 0.02]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.40, L * 0.46]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.48, -L * 0.12]);
  };

  ARCH.grenade_launcher = function (B, M, L, out, root) {
    const w = L * 0.16, h = L * 0.19;
    B.add(plate(w, h, L * 0.40, w * 0.3, 0.2), M.body, { pos: [0, 0, -L * 0.04] });
    B.add(new THREE.CylinderGeometry(w * 0.36, w * 0.38, L * 0.52, 12), M.metal,
      { pos: [0, h * 0.10, L * 0.36], rot: [Math.PI / 2, 0, 0] });
    B.add(torus(w * 0.44, w * 0.08, 12), M.accent, { pos: [0, h * 0.10, L * 0.56] });
    // rotary drum — spins on fire
    const drum = new THREE.Object3D(); drum.name = 'drum'; drum.position.set(0, h * 0.02, L * 0.02);
    root.add(drum);
    const dB = Builder(M);
    dB.add(new THREE.CylinderGeometry(w * 0.52, w * 0.52, L * 0.18, 14), M.body, { rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      dB.add(new THREE.CylinderGeometry(w * 0.14, w * 0.14, L * 0.20, 8), M.glow,
        { pos: [Math.cos(a) * w * 0.34, Math.sin(a) * w * 0.34, 0], rot: [Math.PI / 2, 0, 0] });
    }
    dB.finish(drum, out);
    out.animated = out.animated || {}; out.animated.drum = drum;

    B.add(plate(w * 0.62, h * 0.95, L * 0.12, w * 0.16, 0.2), M.grip, { pos: [0, -h * 0.72, -L * 0.20], rot: [0.24, 0, 0] });
    B.add(plate(w * 0.55, h * 0.7, L * 0.12, w * 0.14, 0.2), M.grip, { pos: [0, -h * 0.55, L * 0.28], rot: [-0.2, 0, 0] });
    B.add(plate(w * 0.7, h * 0.30, L * 0.22, w * 0.08, 0), M.trim, { pos: [0, h * 0.56, -L * 0.06] });
    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.10, L * 0.64]);
    out.sockets.eject = socket(root, 'eject', [w * 0.6, 0, L * 0.02]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.2, L * 0.02]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.40, L * 0.28]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.5, -L * 0.18]);
  };

  ARCH.energy_rifle = function (B, M, L, out, root) {
    const w = L * 0.12, h = L * 0.16;
    B.add(lathe([[w * 0.10, -L * 0.30], [w * 0.52, -L * 0.10], [w * 0.58, L * 0.18], [w * 0.30, L * 0.36], [w * 0.10, L * 0.42]], 14),
      M.body, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, L * 0.04] });
    // emitter prongs
    [-1, 1].forEach(s => {
      B.add(plate(w * 0.20, h * 0.30, L * 0.30, w * 0.06, 0), M.metal, { pos: [s * w * 0.36, h * 0.10, L * 0.44] });
      B.add(cone(w * 0.13, L * 0.16, 8), M.trim, { pos: [s * w * 0.36, h * 0.10, L * 0.62], rot: [Math.PI / 2, 0, 0] });
    });
    B.add(sphere(w * 0.26, 14), M.glow, { pos: [0, h * 0.10, L * 0.48] });
    B.add(torus(w * 0.42, w * 0.07, 16), M.glow, { pos: [0, h * 0.10, L * 0.40], rot: [0, 0, 0] });
    B.add(plate(w * 0.60, h * 0.95, L * 0.11, w * 0.16, 0.2), M.grip, { pos: [0, -h * 0.72, -L * 0.06], rot: [0.26, 0, 0] });
    B.add(plate(w * 0.8, h * 0.5, L * 0.20, w * 0.16, 0.3), M.accent, { pos: [0, h * 0.50, -L * 0.06] });
    B.add(plate(w * 0.36, h * 0.24, L * 0.26, w * 0.06, 0), M.glow, { pos: [0, -h * 0.34, -L * 0.02] });
    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.10, L * 0.70]);
    out.sockets.eject = socket(root, 'eject', [w * 0.5, h * 0.1, 0]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.7, 0]);
    out.sockets.foregrip = socket(root, 'foregrip', [0, -h * 0.35, L * 0.34]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.45, -L * 0.05]);
  };

  ARCH.pistol = function (B, M, L, out, root) {
    const w = L * 0.16, h = L * 0.26;

    /* Slide over frame: two clearly separate masses with a visible rail gap,
     * which is what makes a handgun read as a handgun. */
    B.add(plate(w * 0.94, h * 0.34, L * 0.58, w * 0.20, 0.12), M.metal, { pos: [0, h * 0.26, L * 0.08] });
    B.add(plate(w, h * 0.30, L * 0.54, w * 0.22, 0.18), M.body, { pos: [0, h * 0.02, L * 0.06] });
    // Slide serrations.
    for (let i = 0; i < 5; i++) {
      [-1, 1].forEach(sg => B.add(plate(w * 0.06, h * 0.22, L * 0.02, w * 0.02, 0), M.grip,
        { pos: [sg * w * 0.48, h * 0.26, L * (-0.10 - i * 0.035)] }));
    }
    // Ejection port.
    B.add(plate(w * 0.08, h * 0.18, L * 0.12, w * 0.02, 0), M.grip, { pos: [w * 0.47, h * 0.30, L * 0.14] });

    /* Barrel and screw-on suppressor. */
    B.add(new THREE.CylinderGeometry(w * 0.15, w * 0.15, L * 0.14, 10), M.metal,
      { pos: [0, h * 0.24, L * 0.40], rot: [Math.PI / 2, 0, 0] });
    B.add(new THREE.CylinderGeometry(w * 0.29, w * 0.27, L * 0.30, 14), M.body,
      { pos: [0, h * 0.24, L * 0.58], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 5; i++) {
      B.add(torus(w * 0.30, w * 0.030, 14), M.metal, { pos: [0, h * 0.24, L * (0.48 + i * 0.045)] });
    }

    /* Grip with checkering, trigger guard, magazine base plate. */
    B.add(plate(w * 0.62, h * 0.86, L * 0.13, w * 0.15, 0.22), M.grip,
      { pos: [0, -h * 0.46, -L * 0.10], rot: [0.30, 0, 0] });
    for (let i = 0; i < 4; i++) {
      B.add(plate(w * 0.48, h * 0.05, L * 0.10, w * 0.02, 0), M.body,
        { pos: [0, -h * (0.22 + i * 0.16), -L * (0.06 + i * 0.036)], rot: [0.30, 0, 0] });
    }
    B.add(torus(w * 0.26, w * 0.045, 12), M.metal, { pos: [0, -h * 0.20, L * 0.02], rot: [0, Math.PI / 2, 0] });
    B.add(plate(w * 0.58, h * 0.08, L * 0.14, w * 0.04, 0), M.accent, { pos: [0, -h * 0.86, -L * 0.20], rot: [0.30, 0, 0] });

    /* Sights and a charge window along the frame. */
    B.add(plate(w * 0.16, h * 0.12, L * 0.04, w * 0.03, 0), M.metal, { pos: [0, h * 0.46, L * 0.30] });
    B.add(plate(w * 0.30, h * 0.12, L * 0.04, w * 0.03, 0), M.metal, { pos: [0, h * 0.46, -L * 0.16] });
    B.add(plate(w * 0.26, h * 0.09, L * 0.22, w * 0.04, 0), M.glow, { pos: [0, h * 0.06, L * 0.04] });

    out.sockets.muzzle = socket(root, 'muzzle', [0, h * 0.24, L * 0.76]);
    out.sockets.eject = socket(root, 'eject', [w * 0.5, h * 0.32, L * 0.14]);
    out.sockets.magazine = socket(root, 'magazine', [0, -h * 0.8, -L * 0.16]);
    out.sockets.grip = socket(root, 'grip', [0, -h * 0.28, -L * 0.08]);
  };

  ARCH.melee = function (B, M, L, out, root) {
    // Hard-light blade: a solid emitter hilt with an energy edge.
    const w = L * 0.11;
    B.add(plate(w, w * 1.5, L * 0.24, w * 0.3, 0.3), M.body, { pos: [0, 0, -L * 0.05] });
    B.add(plate(w * 0.66, w * 0.9, L * 0.10, w * 0.2, 0.2), M.grip, { pos: [0, -w * 0.30, -L * 0.16], rot: [0.2, 0, 0] });
    B.add(torus(w * 0.5, w * 0.10, 12), M.trim, { pos: [0, 0, L * 0.06], rot: [0, 0, 0] });
    // blade — flattened, tapered, additive
    const blade = new THREE.Object3D(); blade.name = 'blade'; blade.position.set(0, 0, L * 0.08);
    root.add(blade);
    const bB = Builder(M);
    bB.add(plate(w * 0.55, w * 0.14, L * 0.86, w * 0.06, 0), M.glow, { pos: [0, 0, L * 0.42] });
    bB.add(cone(w * 0.28, L * 0.20, 6), M.glow, { pos: [0, 0, L * 0.92], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.35] });
    bB.finish(blade, out);
    out.animated = out.animated || {}; out.animated.blade = blade;
    out.sockets.muzzle = socket(root, 'muzzle', [0, 0, L * 0.60]);
    out.sockets.grip = socket(root, 'grip', [0, -w * 0.2, -L * 0.12]);
    out.sockets.bladeTip = socket(root, 'bladeTip', [0, 0, L * 1.0]);
  };

  ARCH.rifle = ARCH.assault_rifle;   // alias for the fallback weapon

  /* ------------------------------------------------------------------ *
   * Public build
   * ------------------------------------------------------------------ */
  /**
   * @param {object} opts { weaponId, palette, skinMaterials, glowColor, scale }
   */
  WM.build = function (opts) {
    opts = opts || {};
    const wdef = HC.Weapons.get(opts.weaponId || 'pulse_rifle');
    const pal = opts.palette || HC.Characters._defaultPalette();
    const skinMat = opts.skinMaterials || {};
    const glow = opts.glowColor === undefined ? (wdef.vfx && wdef.vfx.flashColor) || pal.emissive : opts.glowColor;

    const root = new THREE.Object3D();
    root.name = 'weapon:' + wdef.id;

    const out = {
      root, sockets: {}, meshes: [], geometries: [], animated: {},
      weaponId: wdef.id, archetype: wdef.archetype, akimbo: !!wdef.akimbo, melee: !!wdef.melee
    };

    const M = partSet(pal, skinMat, glow);
    out.materials = M;

    const L = (opts.scale || 1) * ({
      assault_rifle: 0.92, smg: 0.56, minigun: 1.05, shotgun: 0.90,
      precision_rifle: 0.78, grenade_launcher: 0.78, energy_rifle: 0.86,
      pistol: 0.34, melee: 0.62, rifle: 0.92
    }[wdef.archetype] || 0.8);

    const builder = ARCH[wdef.archetype] || ARCH.assault_rifle;
    const B = Builder(M);
    builder(B, M, L, out, root);
    B.finish(root, out);

    // Guarantee a muzzle socket exists even if an archetype forgot one.
    if (!out.sockets.muzzle) {
      HC.Log.warn('WeaponModel', wdef.id + ' has no muzzle socket — inserting default.');
      out.sockets.muzzle = socket(root, 'muzzle', [0, 0, L * 0.6]);
    }
    out.length = L;

    out.setOpacity = function (a) {
      Object.keys(M).forEach(k => {
        const mat = M[k];
        if (mat.userData.baseOpacity === undefined) mat.userData.baseOpacity = mat.transparent ? mat.opacity : 1;
        mat.opacity = mat.userData.baseOpacity * a;
        mat.transparent = a < 0.999 || mat.userData.baseOpacity < 0.999;
        mat.depthWrite = mat.opacity > 0.72;
      });
    };
    out.dispose = function () {
      out.geometries.forEach(g => { try { g.dispose(); } catch (e) {} });
      Object.keys(M).forEach(k => { try { M[k].dispose(); } catch (e) {} });
    };

    return out;
  };

  /* ------------------------------------------------------------------ *
   * Projectiles and world props built from the same vocabulary.
   * ------------------------------------------------------------------ */
  WM.buildProjectile = function (kind, color) {
    const root = new THREE.Object3D();
    const geos = [];
    if (kind === 'grenade') {
      const g = capsule(0.075, 0.10, 10);
      const m = Mats.make({ unique: true, kind: 'metal', color: 0x3a3f48, roughness: 0.5, metalness: 0.8 });
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; root.add(mesh); geos.push(g);
      const ring = torus(0.07, 0.018, 10);
      const rm = Mats.make({ unique: true, kind: 'energy', color, emissive: color, emissiveIntensity: 2.6, rim: false });
      const rmesh = new THREE.Mesh(ring, rm); rmesh.rotation.x = Math.PI / 2; root.add(rmesh); geos.push(ring);
      root.userData.materials = [m, rm];
    } else {
      const g = sphere(0.13, 12);
      const m = Mats.make({ unique: true, kind: 'energy', color, emissive: color, emissiveIntensity: 3.0, opacity: 0.9, rim: false });
      const mesh = new THREE.Mesh(g, m); root.add(mesh); geos.push(g);
      const halo = sphere(0.22, 10);
      const hm = Mats.additive(color, 0.35);
      const hmesh = new THREE.Mesh(halo, hm); root.add(hmesh); geos.push(halo);
      root.userData.materials = [m];
    }
    root.userData.geometries = geos;
    return root;
  };

  /** The Power Core objective object. */
  WM.buildPowerCore = function (color) {
    const root = new THREE.Object3D();
    const geos = [];
    const shell = Mats.make({ unique: true, kind: 'metal', color: 0xc9d4e2, roughness: 0.22, metalness: 0.95,
      rim: { color: 0xffffff, strength: 0.4, power: 2.4 } });
    const core = Mats.make({ unique: true, kind: 'energy', color, emissive: color, emissiveIntensity: 3.2, opacity: 0.92, rim: false });

    const inner = new THREE.IcosahedronGeometry(0.30, 1);
    const innerMesh = new THREE.Mesh(inner, core); root.add(innerMesh); geos.push(inner);

    const cage = new THREE.Object3D();
    for (let i = 0; i < 3; i++) {
      const t = torus(0.46, 0.028, 24);
      const mesh = new THREE.Mesh(t, shell);
      mesh.rotation.set(i * 1.05, i * 0.7, i * 0.4);
      mesh.castShadow = true;
      cage.add(mesh); geos.push(t);
    }
    root.add(cage);

    const glowGeo = sphere(0.62, 14);
    const glowMesh = new THREE.Mesh(glowGeo, Mats.additive(color, 0.22));
    root.add(glowMesh); geos.push(glowGeo);

    root.userData = { cage, innerMesh, glowMesh, geometries: geos, materials: [shell, core] };
    return root;
  };

  WM.disposeObject = function (obj) {
    if (!obj || !obj.userData) return;
    (obj.userData.geometries || []).forEach(g => { try { g.dispose(); } catch (e) {} });
    (obj.userData.materials || []).forEach(m => { try { m.dispose(); } catch (e) {} });
  };

})(window.HC, window.THREE);
