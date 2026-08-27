/* =========================================================================
 * HYPERCELL — 15_map_nova_district.js
 * NOVA DISTRICT — the launch arena.
 *
 * Layout intent (brief §28): a mirrored 5v5 arena with three lanes.
 *   • Centre plaza  — the Power Core spawns here; open, high-risk, ringed
 *                     by hard cover and overlooked by two roof positions.
 *   • Side streets  — mid-range lanes with staggered cover and shop fronts.
 *   • Service tunnels — flank routes that bypass the plaza entirely and
 *                     surface behind the enemy's forward cover.
 *   • Rooftops      — high ground reachable from both sides, deliberately
 *                     exposed from the opposite roof so it is contestable.
 *
 * All static geometry is merged per material at build time, so the whole
 * environment costs a couple of dozen draw calls.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const Mats = HC.Mats;
  const CFG = HC.CFG;
  const SH = HC.CharacterModel.shapes;

  const MapReg = HC.Maps = HC.Registry('Maps', null);

  MapReg.define('nova_district', {
    name: 'NOVA DISTRICT',
    subtitle: 'Sector 7 · Night Cycle',
    description: 'A rain-slick commercial block under permanent neon. Three lanes, ' +
                 'two contestable roofs, and a plaza nobody survives standing still in.',
    recommendedMode: 'power_core',
    bounds: { minX: -58, maxX: 58, minZ: -62, maxZ: 62 },
    build: buildNovaDistrict
  });

  /* ===================================================================== */
  function buildNovaDistrict(scene, world, options) {
    options = options || {};
    const rnd = U.rng(20260826);
    const groups = new Map();      // material -> [geometry]
    const disposables = [];
    const lights = [];
    const animated = [];

    /* ---- material palette -------------------------------------------- */
    const M = {
      asphalt: Mats.make({ kind: 'asphalt', color: 0x3d434e, roughness: 0.90, metalness: 0.04,
        repeat: 26, seed: 3, rim: { color: 0x2a3a52, strength: 0.10, power: 4.0 } }),
      sidewalk: Mats.make({ kind: 'concrete', color: 0x5f6675, roughness: 0.86, repeat: 14, seed: 5,
        rim: { color: 0x33506e, strength: 0.12, power: 4.0 } }),
      plaza: Mats.make({ kind: 'concrete', color: 0x6d7688, roughness: 0.68, repeat: 12, seed: 9,
        rim: { color: 0x3a6a94, strength: 0.14, power: 3.6 } }),
      wallLight: Mats.make({ kind: 'concrete', color: 0x97a1b2, roughness: 0.78, repeat: 5, seed: 11,
        rim: { color: 0x4a7ba8, strength: 0.16, power: 3.4 } }),
      wallDark: Mats.make({ kind: 'concrete', color: 0x4c5568, roughness: 0.84, repeat: 5, seed: 13,
        rim: { color: 0x3f6a92, strength: 0.16, power: 3.4 } }),
      wallWarm: Mats.make({ kind: 'concrete', color: 0x8a6f60, roughness: 0.80, repeat: 5, seed: 17,
        rim: { color: 0x8a6a4a, strength: 0.14, power: 3.4 } }),
      panel: Mats.make({ kind: 'plate', color: 0x5b6577, roughness: 0.46, metalness: 0.62, repeat: 3, seed: 19,
        rim: { color: 0x6ab0e0, strength: 0.22, power: 3.0 } }),
      steel: Mats.make({ kind: 'metal', color: 0x7d8695, roughness: 0.38, metalness: 0.92, repeat: 4, seed: 23,
        rim: { color: 0xa8d4ff, strength: 0.22, power: 3.2 } }),
      darkSteel: Mats.make({ kind: 'metal', color: 0x565f6d, roughness: 0.42, metalness: 0.88, repeat: 4, seed: 29,
        rim: { color: 0x5f9ad0, strength: 0.20, power: 3.2 } }),
      rust: Mats.make({ kind: 'metal', color: 0x8d5e42, roughness: 0.74, metalness: 0.55, repeat: 3, seed: 31,
        rim: { color: 0x9a6a4a, strength: 0.16, power: 3.4 } }),
      glass: Mats.make({ kind: 'glass', color: 0x8fc4e8, opacity: 0.22, roughness: 0.05, metalness: 0.2 }),
      windowLit: Mats.make({ kind: 'plate', color: 0x1a2230, emissive: 0xffca7a, emissiveIntensity: 1.35,
        roughness: 0.4, metalness: 0.2, repeat: 1, seed: 37, rim: false }),
      windowCool: Mats.make({ kind: 'plate', color: 0x121a26, emissive: 0x62d6ff, emissiveIntensity: 1.15,
        roughness: 0.4, metalness: 0.2, repeat: 1, seed: 41, rim: false }),
      neonA: Mats.additive(0x36c7ff, 0.95),
      neonB: Mats.additive(0xff5a3c, 0.95),
      neonC: Mats.additive(0xb46bff, 0.95),
      neonD: Mats.additive(0x3fe0a0, 0.95),
      neonE: Mats.additive(0xffb02e, 0.95),
      grass: Mats.make({ kind: 'fabric', color: 0x4e7444, roughness: 0.94, repeat: 8, seed: 43,
        rim: { color: 0x5a8a4a, strength: 0.14, power: 3.6 } }),
      foliage: Mats.make({ kind: 'fabric', color: 0x46864b, roughness: 0.90, repeat: 3, seed: 47, flatShading: true,
        rim: { color: 0x6ab06a, strength: 0.22, power: 2.8 } }),
      wood: Mats.make({ kind: 'leather', color: 0x936a44, roughness: 0.84, repeat: 3, seed: 53,
        rim: { color: 0x9a7a4a, strength: 0.14, power: 3.4 } }),
      paintA: Mats.make({ kind: 'plate', color: 0x2f7fb8, roughness: 0.44, metalness: 0.3, repeat: 2, seed: 59,
        rim: { color: 0x6ab0e0, strength: 0.20, power: 3.0 } }),
      paintB: Mats.make({ kind: 'plate', color: 0xb8443c, roughness: 0.44, metalness: 0.3, repeat: 2, seed: 61,
        rim: { color: 0xe08a6a, strength: 0.20, power: 3.0 } }),
      paintC: Mats.make({ kind: 'plate', color: 0xc7b24a, roughness: 0.50, metalness: 0.25, repeat: 2, seed: 67,
        rim: { color: 0xf0e0a0, strength: 0.20, power: 3.0 } }),
      rubberMat: Mats.make({ kind: 'rubber', color: 0x24272d, roughness: 0.94, repeat: 4, seed: 71, rim: false }),
      teamA: Mats.make({ kind: 'plate', color: HC.PALETTE.teamA, emissive: HC.PALETTE.teamA,
        emissiveIntensity: 0.85, roughness: 0.45, metalness: 0.4, repeat: 2, seed: 73, rim: false }),
      teamB: Mats.make({ kind: 'plate', color: HC.PALETTE.teamB, emissive: HC.PALETTE.teamB,
        emissiveIntensity: 0.85, roughness: 0.45, metalness: 0.4, repeat: 2, seed: 79, rim: false })
    };

    /* ---- geometry accumulation --------------------------------------- */
    const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
          _v = new THREE.Vector3(), _s = new THREE.Vector3();

    function push(geo, mat, pos, rot, scale) {
      pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0];
      let sc = scale === undefined ? 1 : scale;
      if (typeof sc === 'number') sc = [sc, sc, sc];
      _v.set(pos[0], pos[1], pos[2]); _e.set(rot[0], rot[1], rot[2]);
      _q.setFromEuler(_e); _s.set(sc[0], sc[1], sc[2]);
      _m4.compose(_v, _q, _s);
      geo.applyMatrix4(_m4);
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(geo);
    }

    /** Solid box: visual geometry + collision. */
    function solid(cx, cy, cz, w, h, d, mat, surface, opts) {
      opts = opts || {};
      if (mat) push(new THREE.BoxGeometry(w, h, d), mat, [cx, cy, cz], opts.rot);
      if (opts.collide !== false) {
        world.addBox(
          { x: cx - w / 2, y: cy - h / 2, z: cz - d / 2 },
          { x: cx + w / 2, y: cy + h / 2, z: cz + d / 2 },
          surface || 'concrete', opts);
      }
    }

    /** Visual-only geometry (no collision) — trim, signage, cables. */
    function deco(geo, mat, pos, rot, scale) { push(geo, mat, pos, rot, scale); }

    function ramp(cx, cy0, cz, w, d, rise, axis, ascending, mat, surface) {
      // Visual: a wedge built from a stretched box rotated to the slope angle.
      const run = axis === 'x' ? w : d;
      const angle = Math.atan2(rise, run);
      const len = Math.hypot(run, rise);
      const thickness = 0.5;
      const g = new THREE.BoxGeometry(axis === 'x' ? len : w, thickness, axis === 'x' ? d : len);
      const rot = axis === 'x' ? [0, 0, (ascending ? -1 : 1) * angle] : [(ascending ? 1 : -1) * angle, 0, 0];
      push(g, mat, [cx, cy0 + rise / 2 - thickness * 0.35, cz], rot);
      world.addRamp(
        { x: cx - w / 2, y: cy0, z: cz - d / 2 },
        { x: cx + w / 2, y: cy0 + rise, z: cz + d / 2 },
        axis, ascending, surface || 'concrete');
      // Side walls so players cannot fall off the edge unpredictably.
      if (axis === 'z') {
        [-1, 1].forEach(s => solid(cx + s * (w / 2 + 0.12), cy0 + rise / 2 + 0.3, cz, 0.24, rise + 0.6, d, M.darkSteel, 'metal'));
      } else {
        [-1, 1].forEach(s => solid(cx, cy0 + rise / 2 + 0.3, cz + s * (d / 2 + 0.12), w, rise + 0.6, 0.24, M.darkSteel, 'metal'));
      }
    }

    /**
     * Stairs as stacked boxes. Ramps rely on slope maths and can be walked
     * into at any angle; steps use the same auto-step path as a kerb, which
     * makes vertical access completely predictable.
     * @param axis 'x' or 'z' — the direction of travel
     * @param dir  +1 climbs toward increasing axis, -1 toward decreasing
     */
    function stairs(cx, cz, fromY, toY, width, run, axis, dir, mat, surface) {
      const rise = toY - fromY;
      const steps = Math.max(2, Math.ceil(rise / (CFG.body.stepHeight * 0.82)));
      const stepRise = rise / steps;
      const tread = run / steps;
      for (let i = 0; i < steps; i++) {
        const y = fromY + stepRise * (i + 1);
        const offset = (i + 0.5 - steps / 2) * tread * dir;
        const sx = axis === 'x' ? cx + offset : cx;
        const sz = axis === 'z' ? cz + offset : cz;
        const w = axis === 'x' ? tread : width;
        const d = axis === 'z' ? tread : width;
        // Each tread is a solid block from the ground up to its own height.
        solid(sx, (fromY + y) / 2, sz, w + 0.02, y - fromY, d, mat, surface || 'metal');
      }
      // Side rails so nobody walks off the edge by accident.
      const railW = axis === 'x' ? run : 0.22;
      const railD = axis === 'z' ? run : 0.22;
      [-1, 1].forEach(sgn => {
        const rx = axis === 'x' ? cx : cx + sgn * (width / 2 + 0.11);
        const rz = axis === 'z' ? cz : cz + sgn * (width / 2 + 0.11);
        const rx2 = axis === 'z' ? cx + sgn * (width / 2 + 0.11) : rx;
        const rz2 = axis === 'x' ? cz + sgn * (width / 2 + 0.11) : rz;
        deco(new THREE.BoxGeometry(railW, rise + 1.0, railD), M.steel,
          [rx2, fromY + rise / 2 + 0.5, rz2], axis === 'x' ? [Math.atan2(rise, run), 0, 0] : [0, 0, 0]);
      });
      result.minimap.walls.push({ x: cx, z: cz, w: axis === 'x' ? run : width,
        d: axis === 'z' ? run : width, h: rise });
    }

    /* ---- named results ------------------------------------------------ */
    const result = {
      id: 'nova_district',
      name: 'NOVA DISTRICT',
      root: new THREE.Group(),
      lights, animated, disposables,
      spawns: { A: [], B: [], ffa: [] },
      deliveryZones: {}, coreSpawn: new THREE.Vector3(0, 1.6, 0),
      controlZones: [], crystalSpawns: [], ambientEmitters: [],
      bounds: { minX: -58, maxX: 58, minZ: -62, maxZ: 62 },
      minimap: { walls: [], zones: [] },
      skyColor: 0x0a1220
    };
    result.root.name = 'NovaDistrict';

    /* ================================================================== *
     * 1. GROUND
     * ================================================================== */
    const GW = 124, GD = 136;
    solid(0, -0.5, 0, GW, 1, GD, M.asphalt, 'concrete');

    // Plaza floor inlay + team-tinted approach strips
    deco(new THREE.BoxGeometry(30, 0.06, 30), M.plaza, [0, 0.03, 0]);
    deco(new THREE.RingGeometry(6.4, 7.2, 48), Mats.additive(0x9b6bff, 0.55), [0, 0.05, 0], [-Math.PI / 2, 0, 0]);
    deco(new THREE.RingGeometry(10.2, 10.6, 56), Mats.additive(0x9b6bff, 0.28), [0, 0.05, 0], [-Math.PI / 2, 0, 0]);

    // Sidewalks along the main street
    [-1, 1].forEach(sx => {
      solid(sx * 20, 0.09, 0, 8, 0.18, 110, M.sidewalk, 'concrete');
      solid(sx * 44, 0.09, 0, 8, 0.18, 100, M.sidewalk, 'concrete');
    });
    [-1, 1].forEach(sz => solid(0, 0.09, sz * 30, 96, 0.18, 8, M.sidewalk, 'concrete'));

    // Road markings
    for (let z = -52; z <= 52; z += 6) {
      deco(new THREE.BoxGeometry(0.35, 0.02, 3.0), M.paintC, [0, 0.12, z]);
    }
    [-32, 32].forEach(x => {
      for (let z = -50; z <= 50; z += 7) deco(new THREE.BoxGeometry(0.28, 0.02, 3.4), M.paintC, [x, 0.12, z]);
    });

    /* ================================================================== *
     * 2. PERIMETER — the arena is sealed by a service wall, not an
     *    invisible barrier, so the boundary always reads visually.
     * ================================================================== */
    const BX = 56, BZ = 60, BH = 22;
    solid(0, BH / 2, -BZ - 1.5, GW, BH, 3, M.wallDark, 'concrete');
    solid(0, BH / 2, BZ + 1.5, GW, BH, 3, M.wallDark, 'concrete');
    solid(-BX - 1.5, BH / 2, 0, 3, BH, GD, M.wallDark, 'concrete');
    solid(BX + 1.5, BH / 2, 0, 3, BH, GD, M.wallDark, 'concrete');
    // Invisible ceiling stops rocket-jumping out of the arena.
    solid(0, 30, 0, GW, 1, GD, null, 'metal', { blocksProjectiles: false, blocksSight: false });

    /* ================================================================== *
     * 3. BUILDINGS
     * ================================================================== */
    /**
     * A building block with a lit facade, roof lip, roof access and
     * optional walk-through interior.
     */
    function building(cx, cz, w, d, h, opts) {
      opts = opts || {};
      const wallMat = opts.wall || M.wallLight;
      const litMat = opts.cool ? M.windowCool : M.windowLit;

      if (opts.interior) {
        const t = 0.55;   // wall thickness
        const doorW = opts.doorWidth || 4.2;
        // North / south walls with a doorway gap
        [-1, 1].forEach(sz => {
          const zc = cz + sz * (d / 2 - t / 2);
          if (opts.doors === 'ns' || opts.doors === 'all') {
            const side = (w - doorW) / 2;
            solid(cx - (doorW / 2 + side / 2), h / 2, zc, side, h, t, wallMat, 'concrete');
            solid(cx + (doorW / 2 + side / 2), h / 2, zc, side, h, t, wallMat, 'concrete');
            solid(cx, h - 1.2, zc, doorW, 2.4, t, wallMat, 'concrete');
          } else {
            solid(cx, h / 2, zc, w, h, t, wallMat, 'concrete');
          }
        });
        // East / west walls
        [-1, 1].forEach(sx => {
          const xc = cx + sx * (w / 2 - t / 2);
          if (opts.doors === 'ew' || opts.doors === 'all') {
            const side = (d - doorW) / 2;
            solid(xc, h / 2, cz - (doorW / 2 + side / 2), t, h, side, wallMat, 'concrete');
            solid(xc, h / 2, cz + (doorW / 2 + side / 2), t, h, side, wallMat, 'concrete');
            solid(xc, h - 1.2, cz, t, 2.4, doorW, wallMat, 'concrete');
          } else {
            solid(xc, h / 2, cz, t, h, d, wallMat, 'concrete');
          }
        });
        // Floor slab + roof slab (the roof is walkable high ground)
        solid(cx, 0.14, cz, w - t * 2, 0.28, d - t * 2, M.sidewalk, 'concrete');
        solid(cx, h + 0.3, cz, w, 0.6, d, M.panel, 'metal');
        // Interior lighting strip
        deco(new THREE.BoxGeometry(w * 0.6, 0.12, 0.5), litMat, [cx, h - 0.5, cz]);
        lights.push(makePointLight(cx, h - 0.9, cz, 0xffd9a0, 0.85, 16));
      } else {
        solid(cx, h / 2, cz, w, h, d, wallMat, 'concrete');
      }

      // Roof lip — cover for whoever holds the high ground.
      const lip = 0.9;
      [-1, 1].forEach(sx => solid(cx + sx * (w / 2 - 0.3), h + 0.6 + lip / 2, cz, 0.6, lip, d, M.darkSteel, 'metal'));
      [-1, 1].forEach(sz => solid(cx, h + 0.6 + lip / 2, cz + sz * (d / 2 - 0.3), w, lip, 0.6, M.darkSteel, 'metal'));

      // Facade detailing: window bands, pipes, AC units, ledges
      const floors = Math.max(1, Math.floor(h / 3.2));
      for (let f = 0; f < floors; f++) {
        const y = 2.0 + f * 3.2;
        if (y > h - 1.2) break;
        [-1, 1].forEach(sz => {
          const zc = cz + sz * (d / 2 + 0.06);
          const cols = Math.max(1, Math.floor(w / 3.0));
          for (let c = 0; c < cols; c++) {
            const x = cx - w / 2 + (c + 0.5) * (w / cols);
            const lit = rnd() > 0.42;
            deco(new THREE.BoxGeometry(w / cols * 0.62, 1.5, 0.12),
              lit ? (rnd() > 0.55 ? M.windowCool : M.windowLit) : M.glass, [x, y, zc]);
            deco(new THREE.BoxGeometry(w / cols * 0.70, 0.16, 0.22), M.darkSteel, [x, y - 0.86, zc]);
          }
          deco(new THREE.BoxGeometry(w, 0.26, 0.28), M.panel, [cx, y + 1.05, zc]);
        });
        [-1, 1].forEach(sx => {
          const xc = cx + sx * (w / 2 + 0.06);
          const cols = Math.max(1, Math.floor(d / 3.0));
          for (let c = 0; c < cols; c++) {
            const z = cz - d / 2 + (c + 0.5) * (d / cols);
            const lit = rnd() > 0.5;
            deco(new THREE.BoxGeometry(0.12, 1.5, d / cols * 0.62),
              lit ? (rnd() > 0.5 ? M.windowCool : M.windowLit) : M.glass, [xc, y, z]);
          }
          deco(new THREE.BoxGeometry(0.28, 0.26, d), M.panel, [xc, y + 1.05, cz]);
        });
      }

      // Rooftop clutter: AC units, vents, water tank, aerials
      const clutter = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < clutter; i++) {
        const ox = (rnd() - 0.5) * (w - 4), oz = (rnd() - 0.5) * (d - 4);
        const cw = 1.6 + rnd() * 1.6, cd = 1.4 + rnd() * 1.4, ch = 1.0 + rnd() * 0.9;
        solid(cx + ox, h + 0.6 + ch / 2, cz + oz, cw, ch, cd, M.steel, 'metal');
        deco(new THREE.TorusGeometry(Math.min(cw, cd) * 0.28, 0.08, 6, 14), M.darkSteel,
          [cx + ox, h + 0.62 + ch, cz + oz], [Math.PI / 2, 0, 0]);
      }
      if (rnd() > 0.4) {
        solid(cx + (rnd() - 0.5) * (w - 5), h + 2.4, cz + (rnd() - 0.5) * (d - 5), 2.6, 3.0, 2.6, M.rust, 'metal');
      }
      for (let i = 0; i < 2; i++) {
        const ax = cx + (rnd() - 0.5) * (w - 2), az = cz + (rnd() - 0.5) * (d - 2);
        deco(new THREE.CylinderGeometry(0.05, 0.05, 3.2 + rnd() * 2, 5), M.darkSteel, [ax, h + 2.4, az]);
      }
      // Exterior pipework
      [-1, 1].forEach(sx => {
        const xc = cx + sx * (w / 2 + 0.18);
        deco(new THREE.CylinderGeometry(0.12, 0.12, h, 7), M.rust, [xc, h / 2, cz + (rnd() - 0.5) * d * 0.6]);
      });

      result.minimap.walls.push({ x: cx, z: cz, w, d, h });
      return { cx, cz, w, d, h, roofY: h + 0.6 };
    }

    // three uses inverse-square falloff (decay 2), so intensity is closer to
    // candela than to a 0..1 dimmer. A value of 1 is invisible past a metre —
    // everything here is scaled into a range that actually lights the street.
    const LIGHT_SCALE = 26;
    function makePointLight(x, y, z, color, intensity, distance) {
      const l = new THREE.PointLight(color, intensity * LIGHT_SCALE, distance, 2);
      l.position.set(x, y, z);
      result.root.add(l);
      return l;
    }

    /* --- west block (mirrored on both halves) --- */
    const B = [];
    B.push(building(-30, -22, 16, 14, 7.0, { interior: true, doors: 'all', wall: M.wallLight }));
    B.push(building(-30, 22, 16, 14, 7.0, { interior: true, doors: 'all', wall: M.wallLight, cool: true }));
    B.push(building(30, -22, 16, 14, 7.0, { interior: true, doors: 'all', wall: M.wallWarm }));
    B.push(building(30, 22, 16, 14, 7.0, { interior: true, doors: 'all', wall: M.wallWarm, cool: true }));

    B.push(building(-44, 0, 14, 22, 11.0, { wall: M.wallDark }));
    B.push(building(44, 0, 14, 22, 11.0, { wall: M.wallDark, cool: true }));

    B.push(building(-30, -46, 18, 12, 9.0, { wall: M.wallDark }));
    B.push(building(30, -46, 18, 12, 9.0, { wall: M.wallDark, cool: true }));
    B.push(building(-30, 46, 18, 12, 9.0, { wall: M.wallDark, cool: true }));
    B.push(building(30, 46, 18, 12, 9.0, { wall: M.wallDark }));

    B.push(building(-48, -36, 12, 16, 15.0, { wall: M.wallLight }));
    B.push(building(48, -36, 12, 16, 15.0, { wall: M.wallLight, cool: true }));
    B.push(building(-48, 36, 12, 16, 15.0, { wall: M.wallLight, cool: true }));
    B.push(building(48, 36, 12, 16, 15.0, { wall: M.wallLight }));

    /* --- rooftop access ---
     * Stairs along the side streets, climbing north-to-south into the shop
     * roofs. Both sides are mirrored so neither team owns the high ground. */
    [-1, 1].forEach(sx => {
      stairs(sx * 39.5, -30.5, 0.18, 7.0, 5.0, 13, 'z', 1, M.panel, 'metal');
      stairs(sx * 39.5, 30.5, 0.18, 7.0, 5.0, 13, 'z', -1, M.panel, 'metal');
      // Landing that meets the roof lip.
      solid(sx * 39.5, 6.85, -23.6, 5.0, 0.4, 3.0, M.panel, 'metal');
      solid(sx * 39.5, 6.85, 23.6, 5.0, 0.4, 3.0, M.panel, 'metal');
      solid(sx * 34.5, 6.85, -22, 5.5, 0.4, 4.0, M.panel, 'metal');
      solid(sx * 34.5, 6.85, 22, 5.5, 0.4, 4.0, M.panel, 'metal');
    });
    // Catwalks joining the shop roofs across the side streets
    [-1, 1].forEach(sx => {
      solid(sx * 30, 7.5, 0, 4.0, 0.35, 30, M.darkSteel, 'grate');
      [-1, 1].forEach(sz => solid(sx * 30 + sz * 2.05, 8.1, 0, 0.14, 1.3, 30, M.steel, 'metal', { blocksProjectiles: false }));
      for (let z = -14; z <= 14; z += 4) {
        deco(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), M.steel, [sx * 30 - 2.05, 8.1, z]);
        deco(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), M.steel, [sx * 30 + 2.05, 8.1, z]);
      }
    });
    // Plaza-facing balconies overlooking the core
    [-1, 1].forEach(sx => {
      solid(sx * 21.5, 7.5, 0, 5, 0.4, 12, M.panel, 'metal');
      solid(sx * 19.2, 8.2, 0, 0.4, 1.2, 12, M.darkSteel, 'metal', { blocksProjectiles: false });
      stairs(sx * 25.8, -8.5, 0.18, 7.5, 4.4, 12, 'z', 1, M.panel, 'metal');
      solid(sx * 25.8, 7.35, -1.6, 4.4, 0.4, 3.0, M.panel, 'metal');
    });

    /* ================================================================== *
     * 4. SERVICE TUNNELS — the flank routes
     * ================================================================== */
    /**
     * Service corridor: a covered flank route at street level. It used to be
     * a sunken trench, but the map's ground slab spans the whole arena, so
     * the trench floor sat *below* solid ground and could never be entered.
     * At street level it is reachable, readable and does the same job.
     */
    function corridor(sx) {
      const x = sx * 30;
      const H = 3.2;
      // Side walls with a gap at each end so the route stays open.
      [-1, 1].forEach(sz => {
        solid(x - 3.4, H / 2, sz * 8.5, 0.8, H, 13, M.wallDark, 'concrete');
        solid(x + 3.4, H / 2, sz * 8.5, 0.8, H, 13, M.wallDark, 'concrete');
      });
      // Roof over the middle so it reads as a tunnel from outside.
      solid(x, H + 0.3, 0, 7.6, 0.6, 30, M.wallDark, 'concrete');
      // Lit ceiling strip + pipes.
      for (let z = -12; z <= 12; z += 3) {
        deco(new THREE.BoxGeometry(5.0, 0.10, 0.35), M.windowCool, [x, H - 0.12, z]);
        lights.push(makePointLight(x, H - 0.5, z, 0x62d6ff, 0.85, 13));
      }
      [-1, 1].forEach(s2 => {
        deco(new THREE.CylinderGeometry(0.20, 0.20, 29, 8), M.rust, [x + s2 * 2.7, H - 0.55, 0], [Math.PI / 2, 0, 0]);
        deco(new THREE.CylinderGeometry(0.14, 0.14, 29, 8), M.darkSteel, [x + s2 * 2.7, H - 1.05, 0], [Math.PI / 2, 0, 0]);
      });
      // Waist-high cover inside so the corridor is not a pure shooting gallery.
      [-5, 5].forEach(z => {
        solid(x + (z > 0 ? 1.4 : -1.4), 0.6, z, 1.6, 1.2, 0.6, M.panel, 'concrete');
        result.minimap.walls.push({ x: x + (z > 0 ? 1.4 : -1.4), z, w: 1.6, d: 0.6, h: 1.2 });
      });
      result.ambientEmitters.push({ pos: new THREE.Vector3(x, 1.6, 0), sound: 'vent_hiss', interval: 6.5 });
      result.minimap.walls.push({ x: x - 3.4, z: 0, w: 0.8, d: 30, h: H });
      result.minimap.walls.push({ x: x + 3.4, z: 0, w: 0.8, d: 30, h: H });
    }
    corridor(-1);
    corridor(1);

    /* ================================================================== *
     * 5. PLAZA COVER + OBJECTIVE
     * ================================================================== */
    // Core dais, with a gentle ramp on each side so reaching the objective
    // is a movement decision, not a jump you can fail.
    solid(0, 0.35, 0, 7.0, 0.7, 7.0, M.panel, 'metal');
    ramp(0, 0.06, -4.6, 5.0, 2.4, 0.64, 'z', false, M.panel, 'metal');
    ramp(0, 0.06, 4.6, 5.0, 2.4, 0.64, 'z', true, M.panel, 'metal');
    ramp(-4.6, 0.06, 0, 2.4, 5.0, 0.64, 'x', true, M.panel, 'metal');
    ramp(4.6, 0.06, 0, 2.4, 5.0, 0.64, 'x', false, M.panel, 'metal');
    solid(0, 0.85, 0, 5.2, 0.35, 5.2, M.steel, 'metal');
    deco(new THREE.TorusGeometry(2.9, 0.10, 8, 40), Mats.additive(0x9b6bff, 0.9), [0, 1.06, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      solid(Math.cos(a) * 3.4, 1.6, Math.sin(a) * 3.4, 0.5, 2.6, 0.5, M.darkSteel, 'metal');
      deco(new THREE.BoxGeometry(0.24, 0.9, 0.24), Mats.additive(0x9b6bff, 0.8), [Math.cos(a) * 3.4, 2.6, Math.sin(a) * 3.4]);
    }
    lights.push(makePointLight(0, 3.2, 0, 0x9b6bff, 1.6, 26));
    result.coreSpawn.set(0, 2.0, 0);

    // Hard cover ring — the plaza must never be a flat killing field.
    const coverRing = [
      [-9, -7, 4.0, 1.2, 1.3], [9, -7, 4.0, 1.2, 1.3], [-9, 7, 4.0, 1.2, 1.3], [9, 7, 4.0, 1.2, 1.3],
      [0, -11.5, 6.5, 1.4, 1.5], [0, 11.5, 6.5, 1.4, 1.5],
      [-13, 0, 1.4, 6.5, 1.5], [13, 0, 1.4, 6.5, 1.5],
      [-6, -13.5, 2.4, 2.4, 2.2], [6, 13.5, 2.4, 2.4, 2.2],
      [6, -13.5, 2.4, 2.4, 2.2], [-6, 13.5, 2.4, 2.4, 2.2]
    ];
    coverRing.forEach((c, i) => {
      const mat = i % 3 === 0 ? M.panel : (i % 3 === 1 ? M.darkSteel : M.wallLight);
      solid(c[0], c[4] / 2 + 0.06, c[1], c[2], c[4], c[3], mat, 'concrete');
      deco(new THREE.BoxGeometry(c[2] + 0.12, 0.10, c[3] + 0.12), M.steel, [c[0], c[4] + 0.11, c[1]]);
      if (i % 2 === 0) deco(new THREE.BoxGeometry(c[2] * 0.5, 0.06, 0.08), Mats.additive(0x36c7ff, 0.7),
        [c[0], c[4] * 0.7, c[1] + c[3] / 2 + 0.05]);
      result.minimap.walls.push({ x: c[0], z: c[1], w: c[2], d: c[3], h: c[4] });
    });

    // Planters and a small park strip — soft cover + colour relief
    [[-16, -16], [16, -16], [-16, 16], [16, 16]].forEach(p => {
      solid(p[0], 0.55, p[1], 6.4, 1.1, 6.4, M.wallWarm, 'concrete');
      deco(new THREE.BoxGeometry(5.8, 0.3, 5.8), M.grass, [p[0], 1.16, p[1]]);
      for (let i = 0; i < 4; i++) {
        const tx = p[0] + (rnd() - 0.5) * 4, tz = p[1] + (rnd() - 0.5) * 4;
        deco(new THREE.CylinderGeometry(0.14, 0.20, 2.6, 6), M.wood, [tx, 2.5, tz]);
        deco(new THREE.IcosahedronGeometry(1.15, 0), M.foliage, [tx, 4.2, tz], [rnd(), rnd(), rnd()], [1, 0.82, 1]);
        deco(new THREE.IcosahedronGeometry(0.8, 0), M.foliage, [tx + 0.4, 3.5, tz - 0.3], [rnd(), rnd(), rnd()]);
      }
      result.minimap.walls.push({ x: p[0], z: p[1], w: 6.4, d: 6.4, h: 1.1 });
    });

    /* ================================================================== *
     * 6. TEAM BASES + DELIVERY ZONES
     * ================================================================== */
    function base(team, sz) {
      const z = sz * 46;
      const mat = team === 'A' ? M.teamA : M.teamB;
      const color = team === 'A' ? HC.PALETTE.teamA : HC.PALETTE.teamB;

      // Delivery pad
      solid(0, 0.20, z, 13, 0.40, 13, M.panel, 'metal');
      deco(new THREE.RingGeometry(4.6, 6.0, 48), Mats.additive(color, 0.55), [0, 0.42, z], [-Math.PI / 2, 0, 0]);
      deco(new THREE.RingGeometry(2.2, 2.9, 40), Mats.additive(color, 0.75), [0, 0.42, z], [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * U.TAU;
        solid(Math.cos(a) * 6.6, 1.8, z + Math.sin(a) * 6.6, 0.55, 3.2, 0.55, M.darkSteel, 'metal');
        deco(new THREE.BoxGeometry(0.30, 1.6, 0.30), mat, [Math.cos(a) * 6.6, 2.8, z + Math.sin(a) * 6.6]);
      }
      lights.push(makePointLight(0, 4.5, z, color, 2.0, 30));

      // Spawn structure behind the pad
      const sz2 = z + sz * 8.5;
      solid(0, 3.0, sz2, 22, 0.5, 0.8, M.panel, 'metal');
      [-1, 1].forEach(s => solid(s * 10.6, 1.6, sz2, 0.8, 3.2, 0.8, M.darkSteel, 'metal'));
      deco(new THREE.BoxGeometry(21, 0.30, 0.3), mat, [0, 3.35, sz2]);

      // Forward cover in the base approach
      [[-7.5, z - sz * 11, 3.4, 1.2, 1.4], [7.5, z - sz * 11, 3.4, 1.2, 1.4],
       [0, z - sz * 15, 5.0, 1.3, 1.6], [-14, z - sz * 6, 1.3, 5.0, 1.5], [14, z - sz * 6, 1.3, 5.0, 1.5]]
        .forEach(c => {
          solid(c[0], c[4] / 2 + 0.06, c[1], c[2], c[4], c[3], M.panel, 'concrete');
          deco(new THREE.BoxGeometry(c[2] * 0.6, 0.08, 0.1), mat, [c[0], c[4] * 0.72, c[1] - sz * (c[3] / 2 + 0.06)]);
          result.minimap.walls.push({ x: c[0], z: c[1], w: c[2], d: c[3], h: c[4] });
        });

      result.deliveryZones[team] = { position: new THREE.Vector3(0, 0.4, z), radius: 5.4, team };

      // Spawn points fanned behind the structure, all facing the plaza
      const yaw = sz > 0 ? Math.PI : 0;
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 3.4;
        result.spawns[team].push({
          position: new THREE.Vector3(x, 0.2, z + sz * (11 + (i % 2) * 2.2)),
          yaw
        });
      }
      return z;
    }
    base('A', -1);
    base('B', 1);

    /* ================================================================== *
     * 7. STREET FURNITURE + PROPS (brief §29)
     * ================================================================== */
    function streetLight(x, z, flip) {
      const s = flip ? -1 : 1;
      deco(new THREE.CylinderGeometry(0.14, 0.20, 7.2, 8), M.darkSteel, [x, 3.6, z]);
      deco(new THREE.BoxGeometry(0.22, 0.22, 2.6), M.darkSteel, [x + s * 1.2, 7.1, z], [0, Math.PI / 2, 0]);
      deco(new THREE.BoxGeometry(1.5, 0.22, 0.55), M.steel, [x + s * 2.3, 7.0, z]);
      deco(new THREE.BoxGeometry(1.25, 0.10, 0.42), Mats.additive(0xfff0d0, 0.85), [x + s * 2.3, 6.86, z]);
      world.addBox({ x: x - 0.22, y: 0, z: z - 0.22 }, { x: x + 0.22, y: 7.2, z: z + 0.22 }, 'metal');
      lights.push(makePointLight(x + s * 2.3, 6.6, z, 0xffe3b0, 0.75, 17));
    }
    for (let z = -48; z <= 48; z += 16) {
      streetLight(-17.5, z, false);
      streetLight(17.5, z, true);
    }

    function holoBoard(x, y, z, w, h, ry, colorA, colorB, seed) {
      const tex = Mats.colorTexture('hologram', seed, colorA, colorB);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      disposables.push(mat);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z); mesh.rotation.y = ry;
      mesh.renderOrder = 6;
      result.root.add(mesh);
      animated.push({ kind: 'holo', mesh, mat, phase: rnd() * 10 });
      deco(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.35), M.darkSteel, [x, y, z], [0, ry, 0]);
      lights.push(makePointLight(x + Math.sin(ry) * -1.5, y, z + Math.cos(ry) * -1.5, colorA, 1.1, 20));
    }
    holoBoard(-21.8, 11.5, -14, 9, 6, Math.PI / 2, 0x36c7ff, 0xb46bff, 101);
    holoBoard(21.8, 11.5, 14, 9, 6, -Math.PI / 2, 0xff5a3c, 0xffb02e, 103);
    holoBoard(-21.8, 11.5, 18, 8, 5.5, Math.PI / 2, 0x3fe0a0, 0x36c7ff, 107);
    holoBoard(21.8, 11.5, -18, 8, 5.5, -Math.PI / 2, 0xb46bff, 0xff5a3c, 109);
    holoBoard(0, 13.5, -37.5, 14, 7, 0, 0x36c7ff, 0x3fe0a0, 113);
    holoBoard(0, 13.5, 37.5, 14, 7, Math.PI, 0xff5a3c, 0xffb02e, 127);

    function neonSign(x, y, z, w, h, ry, color, seed) {
      const tex = Mats.colorTexture('neon', seed, color, color);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      disposables.push(mat);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z); mesh.rotation.y = ry;
      mesh.renderOrder = 6;
      result.root.add(mesh);
      animated.push({ kind: 'neon', mesh, mat, phase: rnd() * 10, flicker: rnd() > 0.7 });
      lights.push(makePointLight(x + Math.sin(ry) * -1.2, y, z + Math.cos(ry) * -1.2, color, 0.9, 15));
      result.ambientEmitters.push({ pos: new THREE.Vector3(x, y, z), sound: 'neon_buzz', interval: 9 + rnd() * 6 });
    }
    const neonColors = [0x36c7ff, 0xff5a3c, 0xb46bff, 0x3fe0a0, 0xffb02e, 0xff6ee0];
    [[-22.2, 4.6, -22, Math.PI / 2], [-22.2, 4.6, 22, Math.PI / 2],
     [22.2, 4.6, -22, -Math.PI / 2], [22.2, 4.6, 22, -Math.PI / 2],
     [-30, 4.6, -29.2, Math.PI], [30, 4.6, 29.2, 0],
     [-30, 4.6, 29.2, 0], [30, 4.6, -29.2, Math.PI]].forEach((p, i) => {
      neonSign(p[0], p[1], p[2], 5.5, 2.6, p[3], neonColors[i % neonColors.length], 200 + i * 13);
    });

    function shopFront(x, z, w, ry, seed) {
      // Awning + display glass + counter + screen
      const cos = Math.cos(ry), sin = Math.sin(ry);
      const push2 = (dx, dz) => [x + dx * cos - dz * sin, z + dx * sin + dz * cos];
      let p = push2(0, 0.9);
      deco(new THREE.BoxGeometry(w, 0.16, 2.0), M.paintB, [p[0], 3.4, p[1]], [0.22, ry, 0]);
      for (let i = 0; i < Math.floor(w / 1.2); i++) {
        const q = push2(-w / 2 + 0.6 + i * 1.2, 1.75);
        deco(new THREE.BoxGeometry(0.9, 0.14, 0.14), i % 2 ? M.paintC : M.paintA, [q[0], 3.05, q[1]], [0, ry, 0]);
      }
      p = push2(0, 0.32);
      deco(new THREE.BoxGeometry(w - 1.2, 2.4, 0.1), M.glass, [p[0], 1.7, p[1]], [0, ry, 0]);
      const scr = Mats.colorTexture('screen', seed, 0x62d6ff);
      const smat = new THREE.MeshBasicMaterial({ map: scr, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      disposables.push(smat);
      p = push2(w * 0.28, 0.42);
      const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), smat);
      scrMesh.position.set(p[0], 2.1, p[1]); scrMesh.rotation.y = ry;
      scrMesh.renderOrder = 6;
      result.root.add(scrMesh);
      animated.push({ kind: 'screen', mesh: scrMesh, mat: smat, phase: rnd() * 10 });
      lights.push(makePointLight(p[0], 2.0, p[1], 0x62d6ff, 0.55, 9));
    }
    shopFront(-22.2, -22, 12, Math.PI / 2, 301);
    shopFront(-22.2, 22, 12, Math.PI / 2, 307);
    shopFront(22.2, -22, 12, -Math.PI / 2, 311);
    shopFront(22.2, 22, 12, -Math.PI / 2, 313);

    function vendingMachine(x, z, ry, color) {
      solid(x, 1.05, z, 1.2, 2.1, 0.85, M.paintA, 'metal', { rot: [0, ry, 0] });
      deco(new THREE.BoxGeometry(0.9, 1.4, 0.06), Mats.additive(color, 0.75),
        [x + Math.sin(ry + Math.PI / 2) * 0.44, 1.25, z + Math.cos(ry + Math.PI / 2) * 0.44], [0, ry, 0]);
      lights.push(makePointLight(x, 1.3, z, color, 0.35, 6));
    }
    vendingMachine(-19.5, -8, 0, 0x3fe0a0);
    vendingMachine(19.5, 8, Math.PI, 0xff6ee0);
    vendingMachine(-19.5, 30, 0, 0xffb02e);
    vendingMachine(19.5, -30, Math.PI, 0x36c7ff);

    function dumpster(x, z, ry, mat) {
      solid(x, 0.72, z, 2.6, 1.44, 1.5, mat || M.paintB, 'metal', { rot: [0, ry, 0] });
      deco(new THREE.BoxGeometry(2.7, 0.16, 1.6), M.darkSteel, [x, 1.50, z], [0.06, ry, 0]);
      [-1, 1].forEach(s => deco(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 8),
        M.rubberMat, [x + s * 1.1, 0.16, z + 0.6], [Math.PI / 2, 0, 0]));
      result.minimap.walls.push({ x, z, w: 2.6, d: 1.5, h: 1.44 });
    }
    dumpster(-25, -30, 0.2, M.paintB); dumpster(-27.5, -31, -0.3, M.rust);
    dumpster(25, 30, 3.3, M.paintA); dumpster(27.5, 31, 2.9, M.rust);
    dumpster(-25, 34, 1.4, M.rust); dumpster(25, -34, 1.9, M.paintB);

    function bench(x, z, ry) {
      solid(x, 0.48, z, 2.2, 0.14, 0.62, M.wood, 'concrete', { rot: [0, ry, 0] });
      deco(new THREE.BoxGeometry(2.2, 0.5, 0.12), M.wood, [x - Math.sin(ry) * 0.28, 0.75, z - Math.cos(ry) * 0.28], [-0.2, ry, 0]);
      [-1, 1].forEach(s => deco(new THREE.BoxGeometry(0.12, 0.46, 0.55),
        M.darkSteel, [x + Math.cos(ry) * s * 0.9, 0.23, z - Math.sin(ry) * s * 0.9], [0, ry, 0]));
    }
    [[-16, -21, 0], [16, 21, Math.PI], [-16, 21, 0], [16, -21, Math.PI],
     [-19, 4, Math.PI / 2], [19, -4, -Math.PI / 2]].forEach(b => bench(b[0], b[1], b[2]));

    function vehicle(x, z, ry, bodyMat) {
      // Stylised civilian hover-car: chassis, canopy, thruster pods.
      const c = Math.cos(ry), s = Math.sin(ry);
      solid(x, 0.85, z, 4.6, 0.95, 2.1, bodyMat, 'metal', { rot: [0, ry, 0] });
      deco(new THREE.BoxGeometry(2.6, 0.85, 1.85), M.glass, [x, 1.62, z], [0, ry, 0]);
      deco(new THREE.BoxGeometry(4.7, 0.22, 2.2), M.darkSteel, [x, 0.36, z], [0, ry, 0]);
      [-1, 1].forEach(fx => [-1, 1].forEach(fz => {
        const px = x + (fx * 1.7 * c - fz * 0.95 * s);
        const pz = z + (fx * 1.7 * s + fz * 0.95 * c);
        deco(new THREE.CylinderGeometry(0.42, 0.5, 0.34, 12), M.darkSteel, [px, 0.30, pz]);
        deco(new THREE.CylinderGeometry(0.30, 0.30, 0.08, 12), Mats.additive(0x62d6ff, 0.6), [px, 0.14, pz]);
      }));
      deco(new THREE.BoxGeometry(1.6, 0.16, 0.10), Mats.additive(0xff5a3c, 0.8), [x - 2.3 * c, 1.05, z - 2.3 * s], [0, ry, 0]);
      deco(new THREE.BoxGeometry(1.6, 0.16, 0.10), Mats.additive(0xfff0d0, 0.8), [x + 2.3 * c, 1.05, z + 2.3 * s], [0, ry, 0]);
      result.minimap.walls.push({ x, z, w: 4.6, d: 2.6, h: 1.9 });
    }
    vehicle(-11, -34, 0.08, M.paintA);
    vehicle(11, 34, Math.PI + 0.1, M.paintB);
    vehicle(-11, 34, -0.06, M.paintC);
    vehicle(11, -34, Math.PI - 0.12, M.paintA);
    vehicle(-38, 12, Math.PI / 2, M.paintB);
    vehicle(38, -12, -Math.PI / 2, M.paintC);

    function crate(x, y, z, size, mat) {
      solid(x, y + size / 2, z, size, size, size, mat, 'wood');
      deco(new THREE.BoxGeometry(size + 0.04, 0.09, size + 0.04), M.darkSteel, [x, y + size * 0.22, z]);
      deco(new THREE.BoxGeometry(size + 0.04, 0.09, size + 0.04), M.darkSteel, [x, y + size * 0.78, z]);
      result.minimap.walls.push({ x, z, w: size, d: size, h: size });
    }
    [[-36, -14, 1.5], [-36, -12.4, 1.3], [-34.4, -14, 1.4],
     [36, 14, 1.5], [36, 12.4, 1.3], [34.4, 14, 1.4],
     [-36, 27, 1.4], [36, -27, 1.4], [-13, -26, 1.6], [13, 26, 1.6]]
      .forEach(c => crate(c[0], 0.18, c[1], c[2], rnd() > 0.5 ? M.wood : M.rust));
    crate(-36, 1.68, -14, 1.2, M.rust);
    crate(36, 1.68, 14, 1.2, M.rust);

    function barrier(x, z, ry, team) {
      solid(x, 0.55, z, 2.4, 1.1, 0.45, M.paintC, 'metal', { rot: [0, ry, 0] });
      deco(new THREE.BoxGeometry(2.5, 0.16, 0.5), team ? (team === 'A' ? M.teamA : M.teamB) : M.paintB,
        [x, 1.14, z], [0, ry, 0]);
      result.minimap.walls.push({ x, z, w: 2.4, d: 1.0, h: 1.1 });
    }
    [[-8, -27, 0], [8, -27, 0], [-8, 27, 0], [8, 27, 0],
     [-24, -3, Math.PI / 2], [24, 3, Math.PI / 2]].forEach(b => barrier(b[0], b[1], b[2]));

    // Cable runs between buildings — depth without cost.
    function cable(ax, ay, az, bx, by, bz, sag) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector3(
          U.lerp(ax, bx, t),
          U.lerp(ay, by, t) - Math.sin(t * Math.PI) * sag,
          U.lerp(az, bz, t)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 14, 0.05, 5, false);
      push(geo, M.darkSteel, [0, 0, 0]);
    }
    for (let i = 0; i < 8; i++) {
      const z = -40 + i * 11;
      cable(-22, 8.6 + (i % 2), z, 22, 8.4 + ((i + 1) % 2), z + 3, 1.6 + rnd());
    }
    cable(-44, 12, -12, -30, 8.2, -22, 1.2);
    cable(44, 12, 12, 30, 8.2, 22, 1.2);

    // Ventilation stacks and steam sources
    [[-19.5, -12], [19.5, 12], [-19.5, 38], [19.5, -38]].forEach(v => {
      solid(v[0], 0.9, v[1], 1.6, 1.8, 1.6, M.darkSteel, 'metal');
      deco(new THREE.TorusGeometry(0.55, 0.10, 6, 16), M.steel, [v[0], 1.82, v[1]], [Math.PI / 2, 0, 0]);
      result.ambientEmitters.push({ pos: new THREE.Vector3(v[0], 1.9, v[1]), sound: 'vent_hiss', interval: 7 + rnd() * 5 });
      animated.push({ kind: 'steam', pos: new THREE.Vector3(v[0], 1.9, v[1]), timer: rnd() * 3, interval: 2.2 + rnd() });
    });

    // Distant skyline — silhouettes only, no collision, big depth payoff.
    const skyMat = Mats.make({ kind: 'plate', color: 0x1b273c, roughness: 0.9, metalness: 0.1, rim: false });
    const skyWin = Mats.make({ kind: 'plate', color: 0x142032, emissive: 0x74a8e8, emissiveIntensity: 1.4, rim: false });
    for (let i = 0; i < 68; i++) {
      const a = (i / 68) * U.TAU + rnd() * 0.05;
      const dist = 96 + rnd() * 74;
      const w = 8 + rnd() * 16, h = 22 + rnd() * 74;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      push(new THREE.BoxGeometry(w, h, w * (0.6 + rnd() * 0.8)), skyMat, [x, h / 2 - 3, z], [0, a, 0]);
      for (let k = 0; k < 5; k++) {
        push(new THREE.BoxGeometry(w * 0.82, 0.9, 0.4), skyWin,
          [x, 8 + k * (h / 6), z + Math.cos(a) * (w * 0.4)], [0, a, 0]);
      }
    }

    /* ================================================================== *
     * 8. MODE-SPECIFIC MARKERS
     * ================================================================== */
    result.controlZones = [
      { id: 'alpha', position: new THREE.Vector3(-30, 0.2, 0), radius: 6.5, name: 'WEST DOCK' },
      { id: 'centre', position: new THREE.Vector3(0, 0.9, 0), radius: 7.0, name: 'PLAZA' },
      { id: 'bravo', position: new THREE.Vector3(30, 0.2, 0), radius: 6.5, name: 'EAST DOCK' }
    ];
    result.crystalSpawns = [
      new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(-12, 0.4, -10), new THREE.Vector3(12, 0.4, 10),
      new THREE.Vector3(-12, 0.4, 10), new THREE.Vector3(12, 0.4, -10),
      new THREE.Vector3(-30, 0.4, -14), new THREE.Vector3(30, 0.4, 14),
      new THREE.Vector3(0, 0.4, -24), new THREE.Vector3(0, 0.4, 24)
    ];
    // Free-for-all spawns: everything spread wide, no team clumping.
    [[-40, -40], [40, -40], [-40, 40], [40, 40], [0, -34], [0, 34],
     [-30, 8], [30, -8], [-16, -16], [16, 16], [-46, 0], [46, 0]].forEach(p => {
      result.spawns.ffa.push({ position: new THREE.Vector3(p[0], 0.2, p[1]), yaw: Math.atan2(-p[0], -p[1]) });
    });

    /* ================================================================== *
     * 9. MERGE + LIGHTING
     * ================================================================== */
    let drawCalls = 0;
    for (const [mat, geos] of groups) {
      const merged = SH.mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      result.root.add(mesh);
      disposables.push(merged);
      drawCalls++;
    }
    HC.Log.info('Map', 'NOVA DISTRICT built: ' + drawCalls + ' static draw calls, ' +
      world.shapeCount + ' collision shapes, ' + lights.length + ' point lights');

    /* --- key lighting --- */
    const hemi = new THREE.HemisphereLight(0x4a7ab8, 0x2a2f38, 1.15);
    result.root.add(hemi);

    const sun = new THREE.DirectionalLight(0xcfe0ff, 2.35);
    sun.position.set(-42, 58, -28);
    sun.target.position.set(0, 0, 6);
    sun.castShadow = CFG.gfx.shadows;
    if (sun.shadow) {
      const S = CFG.gfx.shadowDistance;
      sun.shadow.mapSize.width = sun.shadow.mapSize.height = CFG.gfx.shadowMapSize;
      sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
      sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 190;
      sun.shadow.bias = -0.0009;
      sun.shadow.normalBias = 0.035;
    }
    result.root.add(sun);
    result.root.add(sun.target);
    result.sun = sun;
    result.hemi = hemi;

    // Warm fill from the opposite side keeps characters readable in shadow.
    const fill = new THREE.DirectionalLight(0xff9a6a, 0.85);
    fill.position.set(48, 26, 40);
    result.root.add(fill);

    // Ambient bounce so nothing ever goes fully black.
    const amb = new THREE.AmbientLight(0x4d6288, 0.85);
    result.root.add(amb);

    /* --- sky dome + fog --- */
    const skyGeo = new THREE.SphereGeometry(340, 28, 18);
    const skyMatDome = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x0d1830) },
        uMid: { value: new THREE.Color(0x27467c) },
        uBottom: { value: new THREE.Color(0x6b4468) }
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; varying vec3 vPos;' +
        'void main(){ float h = normalize(vPos).y;' +
        ' vec3 c = mix(uBottom, uMid, smoothstep(-0.22, 0.16, h));' +
        ' c = mix(c, uTop, smoothstep(0.10, 0.72, h));' +
        ' gl_FragColor = vec4(c, 1.0); }'
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMatDome);
    skyMesh.frustumCulled = false;
    result.root.add(skyMesh);
    disposables.push(skyGeo, skyMatDome);

    scene.fog = CFG.gfx.fogEnabled
      ? new THREE.Fog(0x24365c, CFG.gfx.fogNear, CFG.gfx.fogFar * CFG.gfx.viewDistance) : null;
    scene.background = null;

    scene.add(result.root);

    /* --- animation of map elements --- */
    let animTime = 0;
    result.update = function (dt) {
      animTime += dt;
      for (let i = 0; i < animated.length; i++) {
        const a = animated[i];
        if (a.kind === 'holo') {
          a.mat.opacity = 0.78 + Math.sin(animTime * 1.6 + a.phase) * 0.14;
          if (a.mat.map) a.mat.map.offset.y = (animTime * 0.06 + a.phase) % 1;
        } else if (a.kind === 'neon') {
          const base = 0.82 + Math.sin(animTime * 2.4 + a.phase) * 0.10;
          a.mat.opacity = a.flicker && Math.sin(animTime * 21 + a.phase) > 0.93 ? base * 0.25 : base;
        } else if (a.kind === 'screen') {
          if (a.mat.map) a.mat.map.offset.x = Math.floor((animTime * 3 + a.phase) % 4) * 0.25;
          a.mat.opacity = 0.72 + Math.sin(animTime * 5 + a.phase) * 0.10;
        } else if (a.kind === 'steam') {
          a.timer -= dt;
          if (a.timer <= 0) {
            a.timer = a.interval;
            if (HC.VFX.ready) {
              for (let k = 0; k < 6; k++) {
                HC.VFX.smoke.spawn({
                  x: a.pos.x + (Math.random() - 0.5) * 0.5, y: a.pos.y, z: a.pos.z + (Math.random() - 0.5) * 0.5,
                  vx: (Math.random() - 0.5) * 0.5, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 0.5,
                  life: 1.6 + Math.random(), size0: 0.35, size1: 2.2,
                  color0: 0xd8dde4, color1: 0x6a7078, alpha: 0.22, drag: 0.9, gravity: -0.8, turbulence: 0.5
                });
              }
            }
          }
        }
      }
    };

    result.dispose = function () {
      scene.remove(result.root);
      disposables.forEach(d => { try { d.dispose(); } catch (e) {} });
      disposables.length = 0;
      animated.length = 0;
      lights.length = 0;
    };

    return result;
  }

})(window.HC, window.THREE);
