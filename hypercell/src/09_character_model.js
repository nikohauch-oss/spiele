/* =========================================================================
 * HYPERCELL — 09_character_model.js
 * Procedural stylised character construction.
 *
 * Builds a proper bone hierarchy (hips → spine → chest → neck/head, arms,
 * legs) and hangs shaped geometry off each bone. Proportions, gear and
 * palette come entirely from the hero + skin definitions, so no two heroes
 * share a silhouette and a legendary skin can restructure the body.
 *
 * Geometry inside one bone is merged per material, which keeps a full
 * ten-player match at a sane draw-call count.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const Mats = HC.Mats;

  const CM = HC.CharacterModel = {};

  /* ------------------------------------------------------------------ *
   * Geometry merge (positions / normals / uvs) — a compact local
   * implementation so we do not depend on the examples bundle.
   * ------------------------------------------------------------------ */
  function mergeGeometries(list) {
    if (list.length === 1) return list[0];
    let total = 0;
    const prepared = list.map(g => {
      const ng = g.index ? g.toNonIndexed() : g;
      total += ng.attributes.position.count;
      return ng;
    });
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let po = 0, uo = 0;
    for (const g of prepared) {
      const p = g.attributes.position.array;
      pos.set(p, po);
      const n = g.attributes.normal ? g.attributes.normal.array : null;
      if (n) nor.set(n, po); else nor.fill(0, po, po + p.length);
      const t = g.attributes.uv ? g.attributes.uv.array : null;
      const count = g.attributes.position.count;
      if (t) uv.set(t, uo); else uv.fill(0, uo, uo + count * 2);
      po += p.length; uo += count * 2;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    prepared.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
    list.forEach(g => g.dispose());
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Shape helpers — the stylised vocabulary of the game.
   * ------------------------------------------------------------------ */
  const SEG = { low: 8, mid: 12, high: 16 };

  function capsule(radius, length, seg) {
    return new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 4, seg || SEG.mid);
  }

  /** Tapered limb segment: wider at the top, narrower at the wrist/ankle. */
  function limb(rTop, rBottom, length, seg) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, seg || SEG.mid, 1, false);
    return g;
  }

  /** Bevelled plate — armour, pads, panels. Reads as "manufactured". */
  function plate(w, h, d, bevel, curve) {
    bevel = bevel === undefined ? Math.min(w, h) * 0.18 : bevel;
    bevel = Math.min(bevel, Math.min(w, h) * 0.42);
    const shape = new THREE.Shape();
    const hw = w / 2 - bevel, hh = h / 2 - bevel;
    shape.moveTo(-hw, -h / 2);
    shape.lineTo(hw, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
    shape.lineTo(w / 2, hh);
    shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
    shape.lineTo(-hw, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
    shape.lineTo(-w / 2, -hh);
    shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: d, bevelEnabled: true, bevelThickness: d * 0.24,
      bevelSize: Math.min(bevel * 0.5, d * 0.5), bevelSegments: 2, curveSegments: 4
    });
    g.translate(0, 0, -d / 2);
    if (curve) {
      // Bend the plate around the body so pads wrap instead of floating.
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const a = (x / (w / 2)) * curve;
        pos.setX(i, Math.sin(a) * (w / 2) / Math.max(0.0001, curve));
        pos.setZ(i, z - (1 - Math.cos(a)) * (w / 2) / Math.max(0.0001, curve) * 0.9);
      }
      g.computeVertexNormals();
    }
    return g;
  }

  /** Lathe profile builder for torsos, helmets, hair shells. */
  function lathe(points, seg, phiLength) {
    const v = points.map(p => new THREE.Vector2(Math.max(0.0001, p[0]), p[1]));
    return new THREE.LatheGeometry(v, seg || SEG.mid, 0, phiLength === undefined ? U.TAU : phiLength);
  }

  function sphere(r, seg) { return new THREE.SphereGeometry(r, seg || SEG.mid, Math.max(6, (seg || SEG.mid) / 2)); }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  function cone(r, h, seg) { return new THREE.ConeGeometry(r, h, seg || SEG.mid); }
  function torus(r, tube, seg) { return new THREE.TorusGeometry(r, tube, 6, seg || SEG.mid); }

  /* ------------------------------------------------------------------ *
   * Part collector — accumulates geometry per bone, merges by material.
   * ------------------------------------------------------------------ */
  function Collector() {
    const byBone = new Map();
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();
    const V = new THREE.Vector3();
    const S = new THREE.Vector3();

    return {
      /**
       * @param bone   target bone name
       * @param geo    BufferGeometry (consumed)
       * @param mat    material instance
       * @param t      { pos:[x,y,z], rot:[x,y,z], scale:[x,y,z]|number }
       */
      add(bone, geo, mat, t) {
        t = t || {};
        const p = t.pos || [0, 0, 0];
        const r = t.rot || [0, 0, 0];
        let s = t.scale === undefined ? 1 : t.scale;
        if (typeof s === 'number') s = [s, s, s];
        V.set(p[0], p[1], p[2]);
        E.set(r[0], r[1], r[2]);
        Q.setFromEuler(E);
        S.set(s[0], s[1], s[2]);
        M.compose(V, Q, S);
        geo.applyMatrix4(M);
        if (!byBone.has(bone)) byBone.set(bone, []);
        byBone.get(bone).push({ geo, mat });
        return this;
      },
      commit(bones, out) {
        for (const [boneName, entries] of byBone) {
          const bone = bones[boneName];
          if (!bone) { HC.Log.warn('CharacterModel', 'unknown bone "' + boneName + '" — geometry dropped'); continue; }
          const groups = new Map();
          entries.forEach(e => {
            if (!groups.has(e.mat)) groups.set(e.mat, []);
            groups.get(e.mat).push(e.geo);
          });
          for (const [mat, geos] of groups) {
            const merged = mergeGeometries(geos);
            const mesh = new THREE.Mesh(merged, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;   // bones move; parent handles culling
            bone.add(mesh);
            out.meshes.push(mesh);
            out.geometries.push(merged);
          }
        }
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Skeleton
   * ------------------------------------------------------------------ */
  function buildSkeleton(m) {
    const bones = {};
    const mk = (name, parent, y, z) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(0, y || 0, z || 0);
      (parent || null) && parent.add(o);
      bones[name] = o;
      return o;
    };

    const root = new THREE.Object3D(); root.name = 'root';
    bones.root = root;

    const hips = mk('hips', root, m.hipHeight);
    const spine = mk('spine', hips, m.spineLen * 0.42);
    const chest = mk('chest', spine, m.spineLen * 0.58);
    const neck = mk('neck', chest, m.chestTop);
    const head = mk('head', neck, m.neckLen);

    // Arms — shoulder pivots sit at the outer top of the chest.
    ['L', 'R'].forEach((side) => {
      const sgn = side === 'L' ? 1 : -1;
      const sh = new THREE.Object3D();
      sh.name = 'shoulder' + side;
      sh.position.set(sgn * m.shoulderX, m.shoulderY, 0);
      chest.add(sh); bones['shoulder' + side] = sh;

      const up = new THREE.Object3D();
      up.name = 'armUpper' + side;
      up.position.set(0, 0, 0);
      sh.add(up); bones['armUpper' + side] = up;

      const lo = new THREE.Object3D();
      lo.name = 'armLower' + side;
      lo.position.set(0, -m.upperArmLen, 0);
      up.add(lo); bones['armLower' + side] = lo;

      const hand = new THREE.Object3D();
      hand.name = 'hand' + side;
      hand.position.set(0, -m.lowerArmLen, 0);
      lo.add(hand); bones['hand' + side] = hand;
    });

    // Legs
    ['L', 'R'].forEach((side) => {
      const sgn = side === 'L' ? 1 : -1;
      const th = new THREE.Object3D();
      th.name = 'thigh' + side;
      th.position.set(sgn * m.hipX, 0, 0);
      hips.add(th); bones['thigh' + side] = th;

      const sh = new THREE.Object3D();
      sh.name = 'shin' + side;
      sh.position.set(0, -m.thighLen, 0);
      th.add(sh); bones['shin' + side] = sh;

      const ft = new THREE.Object3D();
      ft.name = 'foot' + side;
      ft.position.set(0, -m.shinLen, 0);
      sh.add(ft); bones['foot' + side] = ft;
    });

    // Attachment sockets
    const wSocket = new THREE.Object3D(); wSocket.name = 'weaponSocket';
    wSocket.position.set(0, -m.handLen * 0.5, 0);
    bones.handR.add(wSocket); bones.weaponSocket = wSocket;

    const offSocket = new THREE.Object3D(); offSocket.name = 'offhandSocket';
    offSocket.position.set(0, -m.handLen * 0.5, 0);
    bones.handL.add(offSocket); bones.offhandSocket = offSocket;

    const backSocket = new THREE.Object3D(); backSocket.name = 'backSocket';
    backSocket.position.set(0, m.chestTop * 0.45, -m.chestDepth * 0.62);
    bones.chest.add(backSocket); bones.backSocket = backSocket;

    const headTop = new THREE.Object3D(); headTop.name = 'headTop';
    headTop.position.set(0, m.headR * 1.15, 0);
    bones.head.add(headTop); bones.headTop = headTop;

    return { root, bones };
  }

  /** Derives all body measurements from the hero build block. */
  function measure(build, bodyHeight) {
    const b = build;
    const H = bodyHeight * b.heightScale;
    const legLen = H * 0.472 * b.legLength;
    const thighLen = legLen * 0.505;
    const shinLen = legLen * 0.435;
    const footH = legLen * 0.06;
    const hipHeight = footH + shinLen + thighLen;
    const headR = H * 0.078 * b.headScale;
    const neckLen = H * 0.045 * b.neckLength;
    // The chest bone sits at `spineLen` above the hips and the neck a further
    // `spineLen * 0.36` above that, so solve the chain for a head crown that
    // lands exactly on H — otherwise the model overshoots its own capsule.
    const spineLen = (H - hipHeight - neckLen - headR * 1.15) / 1.36;
    const chestW = H * 0.115 * b.shoulderWidth;
    const chestDepth = H * 0.070 * b.chestDepth;
    const upperArmLen = H * 0.163 * b.armLength;
    const lowerArmLen = H * 0.150 * b.armLength;
    return {
      height: H, legLen, thighLen, shinLen, footH, hipHeight,
      headR, neckLen, spineLen,
      chestTop: spineLen * 0.36,
      chestW, chestDepth,
      hipW: H * 0.062 * b.hipWidth,
      hipX: H * 0.052 * b.hipWidth,
      shoulderX: chestW,
      shoulderY: spineLen * 0.30,
      upperArmLen, lowerArmLen,
      handLen: H * 0.058 * b.handScale,
      handW: H * 0.036 * b.handScale,
      footLen: H * 0.088 * b.footScale,
      footW: H * 0.042 * b.footScale,
      limbR: H * 0.030 * b.bulk,
      armR: H * 0.026 * b.bulk,
      bulk: b.bulk,
      taper: b.torsoTaper,
      posture: b.posture
    };
  }

  /* ------------------------------------------------------------------ *
   * Material set for one character instance (unique so tinting, cloaking
   * and damage flashes never leak between players).
   * ------------------------------------------------------------------ */
  function buildMaterials(pal, skinMat, teamColor) {
    const wear = skinMat.wear === undefined ? 0.3 : skinMat.wear;
    const rimTeam = { color: teamColor, strength: 0.42, power: 2.7 };
    const seed = (pal.primary ^ pal.accent) & 0xffff;

    const set = {
      cloth: Mats.make({ unique: true, kind: 'fabric', color: pal.cloth, seed: seed + 1,
        roughness: skinMat.fabricRough === undefined ? 0.88 : skinMat.fabricRough,
        repeat: 3, wear, rim: rimTeam }),
      primary: Mats.make({ unique: true, kind: 'plate', color: pal.primary, seed: seed + 2,
        roughness: skinMat.metalRough === undefined ? 0.52 : skinMat.metalRough,
        metalness: 0.45, repeat: 1.4, wear, rim: rimTeam }),
      secondary: Mats.make({ unique: true, kind: 'fabric', color: pal.secondary, seed: seed + 3,
        roughness: 0.82, repeat: 2.4, wear, rim: rimTeam }),
      metal: Mats.make({ unique: true, kind: 'metal', color: pal.metal, seed: seed + 4,
        roughness: skinMat.metalRough === undefined ? 0.38 : skinMat.metalRough * 0.8,
        metalness: 0.92, repeat: 2, rim: { color: 0xffffff, strength: 0.24, power: 3.4 } }),
      darkMetal: Mats.make({ unique: true, kind: 'metal', color: pal.darkMetal, seed: seed + 5,
        roughness: 0.58, metalness: 0.85, repeat: 2.2, rim: rimTeam }),
      skin: Mats.make({ unique: true, kind: 'skin', color: pal.skin, roughness: 0.60,
        rim: { color: 0xffd9c0, strength: 0.20, power: 3.6 } }),
      hair: Mats.make({ unique: true, kind: 'hair', color: pal.hair, seed: seed + 6,
        roughness: 0.66, metalness: 0.05, repeat: 1.6, rim: { color: 0xffffff, strength: 0.30, power: 2.4 } }),
      leather: Mats.make({ unique: true, kind: 'leather', color: pal.leather, seed: seed + 7,
        roughness: 0.72, repeat: 2.6, wear, rim: rimTeam }),
      rubber: Mats.make({ unique: true, kind: 'rubber', color: pal.rubber, seed: seed + 8,
        roughness: 0.94, repeat: 3.2, rim: { color: 0x88a0c0, strength: 0.18, power: 3.2 } }),
      trim: Mats.make({ unique: true, kind: 'metal', color: pal.trim, seed: seed + 9,
        roughness: skinMat.goldTrim ? 0.26 : 0.42, metalness: skinMat.goldTrim ? 0.95 : 0.6,
        repeat: 1.6, rim: { color: 0xffffff, strength: 0.30, power: 3.0 } }),
      visor: Mats.make({ unique: true, kind: 'glass', color: pal.visor, roughness: 0.07,
        metalness: 0.35, opacity: 0.55, emissive: pal.emissive, emissiveIntensity: 0.28,
        rim: { color: pal.emissive, strength: 0.6, power: 2.0 } }),
      glow: Mats.make({ unique: true, kind: 'energy', color: pal.emissive, emissive: pal.emissive,
        emissiveIntensity: skinMat.glowSeams ? 2.6 : 1.8, opacity: 0.92, depthWrite: true, rim: false }),
      accent: Mats.make({ unique: true, kind: 'plate', color: pal.accent, seed: seed + 10,
        roughness: 0.44, metalness: 0.5, repeat: 1.2, emissive: pal.emissive,
        emissiveIntensity: skinMat.glowSeams ? 0.55 : 0.22, rim: rimTeam }),
      team: Mats.make({ unique: true, kind: 'plate', color: teamColor, seed: seed + 11,
        roughness: 0.40, metalness: 0.4, repeat: 1.2, emissive: teamColor,
        emissiveIntensity: 0.55, rim: { color: teamColor, strength: 0.7, power: 2.2 } })
    };

    if (skinMat.iridescent) {
      set.primary.metalness = 0.85; set.primary.roughness = 0.16;
      set.trim.metalness = 1.0; set.trim.roughness = 0.10;
    }
    if (skinMat.voidShimmer) {
      set.primary.emissive = new THREE.Color(pal.emissive);
      set.primary.emissiveIntensity = 0.16;
      set.cloth.emissive = new THREE.Color(pal.emissive);
      set.cloth.emissiveIntensity = 0.10;
    }
    if (skinMat.emberEmissive) {
      set.secondary.emissive = new THREE.Color(pal.emissive);
      set.secondary.emissiveIntensity = skinMat.emberEmissive * 0.8;
    }
    if (skinMat.frost) {
      set.primary.roughness = Math.min(0.95, set.primary.roughness + 0.3);
      set.cloth.roughness = 0.96;
    }
    return set;
  }

  /* ------------------------------------------------------------------ *
   * Body construction
   * ------------------------------------------------------------------ */
  function buildBody(C, m, M, gear, pal, skinMat) {
    const t = m.taper;

    /* --- hips / pelvis --- */
    C.add('hips', lathe([
      [m.hipW * 0.86, -m.hipW * 0.55], [m.hipW * 1.05, -m.hipW * 0.15],
      [m.hipW * 1.02, m.hipW * 0.35], [m.hipW * 0.80, m.hipW * 0.75]
    ], SEG.mid), M.cloth, { pos: [0, m.hipW * 0.1, 0], scale: [1, 1, 0.82] });

    /* --- torso: stacked lathe rings give a shaped, non-tubular chest --- */
    const cw = m.chestW, cd = m.chestDepth;
    C.add('spine', lathe([
      [cw * 0.62, 0], [cw * 0.70, m.spineLen * 0.18], [cw * 0.76, m.spineLen * 0.36]
    ], SEG.mid), M.cloth, { scale: [1, 1, cd / (cw * 0.7) * 0.92] });

    C.add('chest', lathe([
      [cw * 0.78, -m.spineLen * 0.06], [cw * 0.92 * t, m.spineLen * 0.14],
      [cw * 0.96 * t, m.spineLen * 0.28], [cw * 0.72, m.chestTop * 1.02]
    ], SEG.mid), M.primary, { scale: [1, 1, cd / (cw * 0.9) * 1.0] });

    // Chest centre plate — a readable focal point on every hero.
    C.add('chest', plate(cw * 0.86, m.spineLen * 0.40, cd * 0.20, cw * 0.22, 0.55),
      M.accent, { pos: [0, m.spineLen * 0.14, cd * 0.86] });
    C.add('chest', plate(cw * 0.34, m.spineLen * 0.16, cd * 0.16, cw * 0.10, 0.3),
      M.team, { pos: [0, m.spineLen * 0.26, cd * 0.96] });

    // Back plate + spine ridge
    C.add('chest', plate(cw * 0.94, m.spineLen * 0.46, cd * 0.18, cw * 0.24, 0.6),
      M.secondary, { pos: [0, m.spineLen * 0.12, -cd * 0.84], rot: [0, Math.PI, 0] });

    /* --- neck --- */
    C.add('neck', limb(m.headR * 0.40, m.headR * 0.46, m.neckLen * 1.25, SEG.low),
      M.skin, { pos: [0, m.neckLen * 0.42, 0] });
    if (gear.collar) {
      C.add('chest', lathe([
        [m.headR * 0.52, 0], [m.headR * 0.72, m.neckLen * 0.5], [m.headR * 0.62, m.neckLen * 0.85]
      ], SEG.mid), M.primary, { pos: [0, m.chestTop * 0.92, 0] });
    }

    /* --- arms --- */
    ['L', 'R'].forEach(side => {
      const sgn = side === 'L' ? 1 : -1;
      const ar = m.armR;
      C.add('armUpper' + side, limb(ar * 1.12, ar * 0.94, m.upperArmLen, SEG.mid),
        M.cloth, { pos: [0, -m.upperArmLen * 0.5, 0] });
      C.add('armUpper' + side, sphere(ar * 1.14, SEG.low), M.cloth, { pos: [0, 0, 0] });
      C.add('armLower' + side, limb(ar * 0.96, ar * 0.76, m.lowerArmLen, SEG.mid),
        M.cloth, { pos: [0, -m.lowerArmLen * 0.5, 0] });
      C.add('armLower' + side, sphere(ar * 0.98, SEG.low), M.cloth, {});

      // Forearm guard
      const guardMat = gear.gloves === 'gauntlet' || gear.gloves === 'armored' ? M.metal : M.darkMetal;
      C.add('armLower' + side, plate(ar * 2.0, m.lowerArmLen * 0.62, ar * 0.5, ar * 0.5, 0.8),
        guardMat, { pos: [0, -m.lowerArmLen * 0.46, ar * 0.55] });

      // Hand
      const hw = m.handW, hl = m.handLen;
      const handMat = (gear.gloves && gear.gloves !== 'none') ? M.leather : M.skin;
      C.add('hand' + side, plate(hw * 1.7, hl * 0.95, hw * 0.95, hw * 0.42, 0.4),
        handMat, { pos: [0, -hl * 0.42, 0] });
      // thumb + finger block for a readable grip silhouette
      C.add('hand' + side, capsule(hw * 0.30, hl * 0.34, SEG.low), handMat,
        { pos: [sgn * hw * 0.72, -hl * 0.30, hw * 0.12], rot: [0, 0, sgn * 0.7] });
      C.add('hand' + side, capsule(hw * 0.26, hl * 0.46, SEG.low), handMat,
        { pos: [0, -hl * 0.86, hw * 0.10], rot: [0.35, 0, 0] });
      if (gear.gloves === 'blade_gauntlet') {
        C.add('hand' + side, plate(hw * 1.2, hl * 0.5, hw * 0.4, hw * 0.2, 0),
          M.glow, { pos: [0, -hl * 0.2, hw * 0.7] });
      }
    });

    /* --- legs --- */
    ['L', 'R'].forEach(side => {
      const lr = m.limbR;
      C.add('thigh' + side, limb(lr * 1.30, lr * 1.02, m.thighLen, SEG.mid),
        M.cloth, { pos: [0, -m.thighLen * 0.5, 0] });
      C.add('thigh' + side, sphere(lr * 1.30, SEG.low), M.cloth, {});
      C.add('shin' + side, limb(lr * 1.04, lr * 0.72, m.shinLen, SEG.mid),
        M.cloth, { pos: [0, -m.shinLen * 0.5, 0] });
      C.add('shin' + side, sphere(lr * 1.05, SEG.low), M.cloth, {});

      if (gear.kneePads) {
        C.add('shin' + side, plate(lr * 2.2, lr * 2.1, lr * 0.7, lr * 0.8, 1.0),
          M.darkMetal, { pos: [0, -lr * 0.18, lr * 0.85] });
      }
      if (gear.legWrap) {
        for (let i = 0; i < 3; i++) {
          C.add('shin' + side, torus(lr * (0.95 - i * 0.06), lr * 0.13, SEG.low),
            M.leather, { pos: [0, -m.shinLen * (0.30 + i * 0.16), 0], rot: [Math.PI / 2, 0, 0] });
        }
      }

      // Boot: sole + upper, sized by the hero's foot scale.
      const fl = m.footLen, fw = m.footW;
      C.add('foot' + side, plate(fw * 1.05, fl * 0.92, m.footH * 1.5, fw * 0.28, 0.25),
        M.rubber, { pos: [0, m.footH * 0.42, fl * 0.16], rot: [Math.PI / 2, 0, 0] });
      C.add('foot' + side, plate(fw * 0.98, fl * 0.72, m.footH * 2.4, fw * 0.30, 0.3),
        M.leather, { pos: [0, m.footH * 1.35, fl * 0.10], rot: [Math.PI / 2, 0, 0] });
      C.add('foot' + side, plate(fw * 0.90, fw * 1.35, m.footH * 1.5, fw * 0.30, 0.4),
        M.leather, { pos: [0, m.footH * 2.0, -fl * 0.16] });
      if (gear.boots === 'stomper' || gear.boots === 'armored') {
        C.add('foot' + side, plate(fw * 1.15, fl * 0.42, m.footH * 1.2, fw * 0.2, 0.2),
          M.metal, { pos: [0, m.footH * 1.1, fl * 0.34], rot: [Math.PI / 2, 0, 0] });
      }
      if (gear.boots === 'levitator') {
        C.add('foot' + side, torus(fw * 0.5, fw * 0.13, SEG.low), M.glow,
          { pos: [0, m.footH * 0.32, fl * 0.05], rot: [Math.PI / 2, 0, 0] });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Head + face
   * ------------------------------------------------------------------ */
  function buildHead(C, m, M, gear, pal) {
    const r = m.headR;
    const sealed = gear.helmet === 'full_sealed' || gear.helmet === 'sovereign_crown' ||
                   gear.helmet === 'titan_forge' || gear.helmet === 'warlord_mask' ||
                   gear.helmet === 'doomsday_rig' || gear.helmet === 'beast_skull';

    // Cranium — slightly egg-shaped, stylised proportions.
    C.add('head', sphere(r, SEG.high), sealed ? M.primary : M.skin,
      { pos: [0, r * 0.10, 0], scale: [1.0, 1.10, 1.02] });
    // Jaw / chin wedge
    C.add('head', plate(r * 1.28, r * 0.86, r * 1.30, r * 0.42, 0.7),
      sealed ? M.primary : M.skin, { pos: [0, -r * 0.42, r * 0.10] });
    // Ears
    if (!sealed) {
      [-1, 1].forEach(s => C.add('head', sphere(r * 0.20, SEG.low), M.skin,
        { pos: [s * r * 0.94, r * 0.02, -r * 0.06], scale: [0.42, 1.0, 0.72] }));
    }

    if (!sealed) {
      // Brow ridge
      C.add('head', plate(r * 1.10, r * 0.20, r * 0.24, r * 0.09, 0.7), M.skin,
        { pos: [0, r * 0.28, r * 0.86] });
      // Eyes: socket, sclera, iris, pupil — enough for a readable gaze.
      [-1, 1].forEach(s => {
        C.add('head', sphere(r * 0.19, SEG.low), M.darkMetal,
          { pos: [s * r * 0.36, r * 0.10, r * 0.80], scale: [1.05, 0.72, 0.5] });
        C.add('head', sphere(r * 0.145, SEG.low), M.trim,
          { pos: [s * r * 0.36, r * 0.10, r * 0.84], scale: [1.0, 0.78, 0.45] });
        C.add('head', sphere(r * 0.075, SEG.low), M.visor,
          { pos: [s * r * 0.36, r * 0.09, r * 0.90], scale: [1, 1, 0.5] });
        // Brow hair
        C.add('head', plate(r * 0.34, r * 0.07, r * 0.08, r * 0.03, 0.4), M.hair,
          { pos: [s * r * 0.36, r * 0.29, r * 0.88], rot: [0, 0, s * 0.16] });
      });
      // Nose + mouth line
      C.add('head', cone(r * 0.14, r * 0.34, 6), M.skin,
        { pos: [0, -r * 0.04, r * 0.94], rot: [Math.PI * 0.52, 0, 0], scale: [1, 1, 0.7] });
      C.add('head', plate(r * 0.42, r * 0.08, r * 0.06, r * 0.03, 0.5), M.leather,
        { pos: [0, -r * 0.44, r * 0.86] });
    }

    /* --- headgear --- */
    const G = gear.helmet;
    const glowVisor = (yy, ww, hh) => C.add('head', plate(ww, hh, r * 0.22, hh * 0.42, 0.9),
      M.visor, { pos: [0, yy, r * 0.82] });

    if (G === 'visor_light') {
      C.add('head', plate(r * 1.9, r * 0.34, r * 0.24, r * 0.15, 1.0), M.darkMetal,
        { pos: [0, r * 0.22, r * 0.62] });
      glowVisor(r * 0.22, r * 1.5, r * 0.22);
    } else if (G === 'goggles' || G === 'blast_hood') {
      [-1, 1].forEach(s => {
        C.add('head', new THREE.CylinderGeometry(r * 0.30, r * 0.34, r * 0.26, SEG.mid), M.metal,
          { pos: [s * r * 0.38, r * 0.22, r * 0.78], rot: [Math.PI / 2, 0, 0] });
        C.add('head', new THREE.CylinderGeometry(r * 0.23, r * 0.23, r * 0.10, SEG.mid), M.visor,
          { pos: [s * r * 0.38, r * 0.22, r * 0.92], rot: [Math.PI / 2, 0, 0] });
      });
      C.add('head', torus(r * 1.02, r * 0.09, SEG.mid), M.leather, { pos: [0, r * 0.22, 0], rot: [0, 0, 0] });
    } else if (G === 'half_mask') {
      C.add('head', plate(r * 1.30, r * 0.78, r * 1.10, r * 0.36, 0.85), M.darkMetal,
        { pos: [0, -r * 0.40, r * 0.24] });
      C.add('head', plate(r * 0.40, r * 0.18, r * 0.14, r * 0.07, 0.4), M.glow,
        { pos: [0, -r * 0.44, r * 0.86] });
    } else if (G === 'mask_full' || G === 'empress_crown' || G === 'warlord_mask') {
      C.add('head', plate(r * 1.42, r * 1.62, r * 1.26, r * 0.46, 0.9), M.primary,
        { pos: [0, -r * 0.02, r * 0.18] });
      C.add('head', plate(r * 1.05, r * 0.20, r * 0.16, r * 0.09, 0.9), M.glow,
        { pos: [0, r * 0.16, r * 0.86] });
      [-1, 1].forEach(s => C.add('head', plate(r * 0.14, r * 0.5, r * 0.12, r * 0.05, 0.3), M.trim,
        { pos: [s * r * 0.52, -r * 0.36, r * 0.84] }));
      if (G === 'empress_crown') {
        for (let i = -2; i <= 2; i++) {
          C.add('head', cone(r * 0.11, r * (0.55 + Math.abs(i) * -0.10), 5), M.trim,
            { pos: [i * r * 0.34, r * 1.02, -r * 0.10], rot: [-0.2, 0, i * 0.16] });
        }
      }
      if (G === 'warlord_mask') {
        [-1, 1].forEach(s => C.add('head', cone(r * 0.16, r * 0.95, 6), M.trim,
          { pos: [s * r * 0.78, r * 0.72, -r * 0.10], rot: [-0.35, 0, s * 0.42] }));
      }
    } else if (sealed) {
      C.add('head', lathe([
        [r * 0.30, -r * 0.95], [r * 0.94, -r * 0.55], [r * 1.10, r * 0.10],
        [r * 0.92, r * 0.78], [r * 0.42, r * 1.10], [0.001, r * 1.16]
      ], SEG.high), M.primary, { pos: [0, 0, 0], scale: [1, 1, 1.06] });
      C.add('head', plate(r * 1.30, r * 0.42, r * 0.22, r * 0.18, 1.0), M.visor,
        { pos: [0, r * 0.12, r * 0.86] });
      C.add('head', plate(r * 0.9, r * 0.16, r * 0.14, r * 0.07, 0.8), M.glow,
        { pos: [0, r * 0.12, r * 0.94] });
      if (G === 'sovereign_crown' || G === 'titan_forge') {
        C.add('head', torus(r * 1.05, r * 0.10, SEG.high), M.trim, { pos: [0, r * 0.70, 0], rot: [Math.PI / 2, 0, 0] });
        C.add('head', cone(r * 0.14, r * 0.62, 6), M.trim, { pos: [0, r * 1.30, 0] });
      }
      if (G === 'beast_skull') {
        [-1, 1].forEach(s => C.add('head', cone(r * 0.20, r * 1.10, 6), M.trim,
          { pos: [s * r * 0.82, r * 0.62, r * 0.10], rot: [0.2, 0, s * 0.85] }));
      }
      if (G === 'doomsday_rig') {
        [-1, 1].forEach(s => C.add('head', new THREE.CylinderGeometry(r * 0.13, r * 0.16, r * 0.9, 8), M.metal,
          { pos: [s * r * 0.80, r * 0.60, -r * 0.35], rot: [0.3, 0, s * 0.3] }));
      }
    } else if (G === 'hood' || G === 'crown' || G === 'hardhat' || G === 'scrap_crown' ||
               G === 'singularity_crown' || G === 'prism_crest') {
      if (G === 'hood') {
        C.add('head', lathe([
          [r * 0.86, -r * 0.85], [r * 1.22, -r * 0.20], [r * 1.24, r * 0.55],
          [r * 0.80, r * 1.05], [0.001, r * 1.20]
        ], SEG.mid), M.cloth, { pos: [0, 0, -r * 0.10], scale: [1, 1, 1.12] });
        C.add('head', plate(r * 1.6, r * 0.9, r * 0.3, r * 0.4, 1.1), M.cloth,
          { pos: [0, r * 0.42, r * 0.66], rot: [-0.35, 0, 0] });
      } else if (G === 'hardhat') {
        C.add('head', lathe([[r * 1.15, -r * 0.05], [r * 1.10, r * 0.35], [r * 0.75, r * 0.86], [0.001, r * 1.0]], SEG.mid),
          M.accent, { pos: [0, r * 0.20, 0] });
        C.add('head', plate(r * 1.5, r * 0.7, r * 0.10, r * 0.25, 0.9), M.accent,
          { pos: [0, r * 0.22, r * 0.80], rot: [-0.15, 0, 0] });
      } else {
        // Crown-family: radiating spokes + ring
        C.add('head', torus(r * 1.02, r * 0.075, SEG.high), M.trim, { pos: [0, r * 0.66, 0], rot: [Math.PI / 2, 0, 0] });
        const spokes = G === 'scrap_crown' ? 5 : 7;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI - Math.PI / 2;
          C.add('head', cone(r * 0.09, r * (0.42 + Math.cos(a) * 0.34), 5),
            G === 'scrap_crown' ? M.metal : M.glow,
            { pos: [Math.sin(a) * r * 0.94, r * 0.94, Math.cos(a) * r * 0.5], rot: [0, 0, Math.sin(a) * 0.5] });
        }
      }
    }

    /* --- hair --- */
    const hairStyle = gear.hair;
    if (hairStyle && hairStyle !== 'none' && !sealed) {
      switch (hairStyle) {
        case 'buzz':
          C.add('head', lathe([[r * 0.98, r * 0.05], [r * 0.92, r * 0.55], [r * 0.50, r * 1.02], [0.001, r * 1.10]], SEG.mid),
            M.hair, { pos: [0, r * 0.10, 0], scale: [1.02, 1, 1.04] });
          break;
        case 'short_fade':
          C.add('head', lathe([[r * 1.02, -r * 0.10], [r * 1.05, r * 0.42], [r * 0.72, r * 0.95], [0.001, r * 1.14]], SEG.high),
            M.hair, { pos: [0, r * 0.10, -r * 0.02], scale: [1.02, 1, 1.05] });
          C.add('head', plate(r * 1.0, r * 0.26, r * 0.28, r * 0.12, 0.9), M.hair,
            { pos: [0, r * 0.72, r * 0.66], rot: [-0.3, 0, 0] });
          break;
        case 'messy':
          C.add('head', lathe([[r * 1.06, -r * 0.05], [r * 1.10, r * 0.45], [r * 0.70, r * 1.0], [0.001, r * 1.16]], SEG.mid),
            M.hair, { pos: [0, r * 0.10, 0], scale: [1.04, 1, 1.06] });
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * U.TAU;
            C.add('head', cone(r * 0.16, r * 0.44, 5), M.hair,
              { pos: [Math.cos(a) * r * 0.62, r * 1.02, Math.sin(a) * r * 0.62], rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
          }
          break;
        case 'high_ponytail':
          C.add('head', lathe([[r * 1.02, -r * 0.05], [r * 1.06, r * 0.45], [r * 0.66, r * 1.02], [0.001, r * 1.12]], SEG.high),
            M.hair, { pos: [0, r * 0.10, 0], scale: [1.02, 1, 1.05] });
          C.add('headTop', capsule(r * 0.24, r * 1.5, SEG.low), M.hair,
            { pos: [0, r * 0.05, -r * 0.95], rot: [1.15, 0, 0] });
          C.add('headTop', capsule(r * 0.15, r * 0.9, SEG.low), M.hair,
            { pos: [r * 0.16, -r * 0.35, -r * 1.5], rot: [1.45, 0, 0.2] });
          break;
        case 'undercut_long':
          C.add('head', lathe([[r * 1.0, r * 0.0], [r * 1.08, r * 0.5], [r * 0.62, r * 1.04], [0.001, r * 1.12]], SEG.high),
            M.hair, { pos: [0, r * 0.10, 0], scale: [1.02, 1, 1.05] });
          [-1, 1].forEach(s => C.add('head', plate(r * 0.34, r * 1.5, r * 0.26, r * 0.14, 0.5), M.hair,
            { pos: [s * r * 0.86, -r * 0.30, r * 0.12], rot: [0, 0, s * 0.10] }));
          break;
        case 'braids':
          C.add('head', lathe([[r * 1.02, -r * 0.02], [r * 1.06, r * 0.48], [r * 0.66, r * 1.02], [0.001, r * 1.12]], SEG.mid),
            M.hair, { pos: [0, r * 0.10, 0] });
          [-1, 1].forEach(s => {
            for (let i = 0; i < 4; i++) {
              C.add('head', sphere(r * 0.16, SEG.low), M.hair,
                { pos: [s * r * 0.72, -r * (0.15 + i * 0.34), -r * (0.2 + i * 0.12)], scale: [0.9, 0.8, 1.1] });
            }
          });
          break;
        case 'long_flow': case 'void_flow': case 'void_veil': case 'mane': case 'prism_crest':
          C.add('head', lathe([[r * 1.03, -r * 0.05], [r * 1.10, r * 0.5], [r * 0.66, r * 1.05], [0.001, r * 1.14]], SEG.high),
            M.hair, { pos: [0, r * 0.10, 0], scale: [1.03, 1, 1.06] });
          for (let i = 0; i < 7; i++) {
            const a = -Math.PI * 0.5 + (i / 6) * Math.PI;
            C.add('head', capsule(r * 0.17, r * (1.4 + (i % 2) * 0.5), SEG.low), M.hair,
              { pos: [Math.cos(a) * r * 0.80, -r * 0.55, -r * 0.55 + Math.sin(a) * r * 0.30],
                rot: [0.12, 0, Math.cos(a) * 0.22] });
          }
          break;
        default:
          C.add('head', lathe([[r * 1.02, 0], [r * 1.04, r * 0.5], [r * 0.66, r * 1.02], [0.001, r * 1.12]], SEG.mid),
            M.hair, { pos: [0, r * 0.10, 0] });
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Gear layers (shoulder pads, coats, packs, capes …)
   * ------------------------------------------------------------------ */
  function buildGear(C, m, M, gear, pal, skinMat) {
    const cw = m.chestW, cd = m.chestDepth, r = m.headR;

    /* shoulder pads */
    const padStyle = gear.shoulderPads || 'none';
    const padSpec = {
      none: null,
      light: { w: 1.15, h: 0.95, d: 0.55, sides: 'both' },
      heavy: { w: 1.75, h: 1.45, d: 0.85, sides: 'both' },
      asym: { w: 1.55, h: 1.25, d: 0.75, sides: 'left' },
      warlord: { w: 1.85, h: 1.55, d: 0.95, sides: 'both', spikes: 3 },
      titan: { w: 2.05, h: 1.70, d: 1.05, sides: 'both', spikes: 2 },
      sovereign: { w: 1.80, h: 1.50, d: 0.90, sides: 'both', trim: true },
      beast: { w: 1.65, h: 1.35, d: 0.85, sides: 'both', spikes: 4 },
      doomsday: { w: 1.75, h: 1.40, d: 0.90, sides: 'both', spikes: 2 }
    }[padStyle];

    if (padSpec) {
      ['L', 'R'].forEach(side => {
        if (padSpec.sides === 'left' && side !== 'L') return;
        const sgn = side === 'L' ? 1 : -1;
        const pw = m.armR * 2 * padSpec.w, ph = m.armR * 2 * padSpec.h, pd = m.armR * 2 * padSpec.d;
        C.add('shoulder' + side, plate(pw, ph, pd, pw * 0.30, 1.15),
          padStyle === 'sovereign' || padStyle === 'warlord' ? M.trim : M.primary,
          { pos: [sgn * m.armR * 0.34, m.armR * 0.24, 0], rot: [0, 0, sgn * -0.22] });
        if (padSpec.spikes) {
          for (let i = 0; i < padSpec.spikes; i++) {
            C.add('shoulder' + side, cone(m.armR * 0.24, m.armR * (0.9 - i * 0.14), 6), M.metal,
              { pos: [sgn * m.armR * (0.9 + i * 0.30), m.armR * (0.5 - i * 0.16), 0],
                rot: [0, 0, sgn * (-0.9 - i * 0.15)] });
          }
        }
        // Team stripe on the pad — instant friend/foe read from behind.
        C.add('shoulder' + side, plate(pw * 0.34, ph * 0.5, pd * 0.22, pw * 0.08, 0.6), M.team,
          { pos: [sgn * m.armR * 0.30, m.armR * 0.24, pd * 0.52], rot: [0, 0, sgn * -0.22] });
      });
    }

    /* jacket / coat / armour suit */
    const jacket = gear.jacket || 'none';
    if (jacket === 'bomber' || jacket === 'cropped' || jacket === 'workwear' || jacket === 'wrap' ||
        jacket === 'parka' || jacket === 'pelt_tech' || jacket === 'beast_hide') {
      const len = jacket === 'cropped' ? 0.30 : (jacket === 'parka' ? 0.95 : 0.62);
      C.add('chest', lathe([
        [cw * 1.02, -m.spineLen * 0.10], [cw * 1.06, m.spineLen * 0.16], [cw * 0.86, m.chestTop]
      ], SEG.mid), M.cloth, { scale: [1, 1, (cd * 1.15) / (cw * 1.0)] });
      C.add('spine', lathe([
        [cw * 0.92, -m.spineLen * len * 0.5], [cw * 1.0, 0], [cw * 1.04, m.spineLen * 0.3]
      ], SEG.mid), M.cloth, { scale: [1, 1, (cd * 1.2) / (cw * 1.0)] });
      // Open front panels
      [-1, 1].forEach(s => C.add('chest', plate(cw * 0.5, m.spineLen * 0.7, cd * 0.14, cw * 0.14, 0.7),
        M.secondary, { pos: [s * cw * 0.56, m.spineLen * 0.06, cd * 0.90], rot: [0, s * -0.28, 0] }));
      if (jacket === 'pelt_tech' || jacket === 'beast_hide') {
        for (let i = 0; i < 5; i++) {
          C.add('chest', plate(cw * 0.30, m.spineLen * 0.34, cd * 0.10, cw * 0.10, 0.4), M.leather,
            { pos: [(i - 2) * cw * 0.34, m.spineLen * 0.02, cd * 0.98], rot: [0, 0, (i - 2) * 0.10] });
        }
      }
    } else if (jacket !== 'none') {
      // Plated / armoured torso variants
      C.add('chest', lathe([
        [cw * 1.05, -m.spineLen * 0.08], [cw * 1.12, m.spineLen * 0.18], [cw * 0.84, m.chestTop * 1.05]
      ], SEG.high), M.primary, { scale: [1, 1, (cd * 1.18) / (cw * 1.05)] });
      C.add('chest', plate(cw * 1.5, m.spineLen * 0.22, cd * 0.16, cw * 0.2, 0.9), M.trim,
        { pos: [0, m.spineLen * 0.32, cd * 0.88] });
    }

    if (gear.chestRig) {
      [-1, 1].forEach(s => C.add('chest', plate(cw * 0.34, m.spineLen * 0.62, cd * 0.10, cw * 0.10, 0.5),
        M.leather, { pos: [s * cw * 0.34, m.spineLen * 0.10, cd * 1.00], rot: [0, 0, s * 0.16] }));
      for (let i = 0; i < 3; i++) {
        C.add('chest', plate(cw * 0.26, m.spineLen * 0.16, cd * 0.20, cw * 0.06, 0.3), M.darkMetal,
          { pos: [(i - 1) * cw * 0.34, -m.spineLen * 0.02, cd * 1.06] });
      }
    }

    if (gear.hipPlates) {
      [-1, 1].forEach(s => C.add('hips', plate(m.hipW * 0.9, m.hipW * 1.4, m.hipW * 0.34, m.hipW * 0.25, 0.9),
        M.primary, { pos: [s * m.hipW * 1.02, -m.hipW * 0.45, 0], rot: [0, 0, s * 0.18] }));
    }
    if (gear.beltTech) {
      C.add('hips', torus(m.hipW * 1.02, m.hipW * 0.16, SEG.high), M.leather,
        { pos: [0, m.hipW * 0.12, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.84, 1] });
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.6;
        C.add('hips', plate(m.hipW * 0.30, m.hipW * 0.40, m.hipW * 0.22, m.hipW * 0.08, 0.3),
          i % 2 ? M.darkMetal : M.accent,
          { pos: [Math.sin(a) * m.hipW * 1.0, m.hipW * 0.10, Math.cos(a) * m.hipW * 0.9], rot: [0, a, 0] });
      }
    }

    /* backpack variants */
    const bp = gear.backpack || 'none';
    if (bp !== 'none') {
      const bw = cw * 1.05, bh = m.spineLen * 0.62, bd = cd * 0.72;
      C.add('backSocket', plate(bw, bh, bd, bw * 0.20, 0.5), M.darkMetal, { pos: [0, 0, -bd * 0.42] });
      if (bp === 'tank' || bp === 'forge') {
        [-1, 1].forEach(s => C.add('backSocket', capsule(cd * 0.34, bh * 0.72, SEG.mid), M.metal,
          { pos: [s * cw * 0.44, 0, -bd * 0.95] }));
        C.add('backSocket', torus(cd * 0.28, cd * 0.07, SEG.mid), M.glow,
          { pos: [0, bh * 0.42, -bd * 1.0], rot: [Math.PI / 2, 0, 0] });
      } else if (bp === 'ammo') {
        for (let i = 0; i < 3; i++) {
          C.add('backSocket', plate(bw * 0.26, bh * 0.5, bd * 0.4, bw * 0.06, 0.2), M.leather,
            { pos: [(i - 1) * bw * 0.30, -bh * 0.10, -bd * 0.86] });
        }
      } else if (bp === 'orbital_ring') {
        C.add('backSocket', torus(cw * 1.5, cd * 0.10, SEG.high), M.trim, { pos: [0, bh * 0.2, -bd * 0.9], rot: [0.25, 0, 0] });
        C.add('backSocket', torus(cw * 1.1, cd * 0.07, SEG.high), M.glow, { pos: [0, bh * 0.2, -bd * 0.9], rot: [0.25, 0.6, 0] });
      } else {
        C.add('backSocket', plate(bw * 0.7, bh * 0.42, bd * 0.5, bw * 0.12, 0.3), M.accent,
          { pos: [0, bh * 0.06, -bd * 0.86] });
        C.add('backSocket', torus(cd * 0.22, cd * 0.06, SEG.mid), M.glow,
          { pos: [0, -bh * 0.20, -bd * 0.94], rot: [Math.PI / 2, 0, 0] });
      }
    }

    if (gear.antenna) {
      C.add('backSocket', new THREE.CylinderGeometry(cd * 0.035, cd * 0.02, m.spineLen * 1.1, 6), M.metal,
        { pos: [cw * 0.62, m.spineLen * 0.55, -cd * 0.6], rot: [0.2, 0, -0.16] });
      C.add('backSocket', sphere(cd * 0.08, SEG.low), M.glow,
        { pos: [cw * 0.72, m.spineLen * 1.08, -cd * 0.72] });
    }

    /* cape / cloth flow — animated at runtime by the animator. */
    if (gear.cape && gear.cape !== 'none') {
      const capeLen = { short: 0.55, long: 1.05, regal: 1.35 }[gear.cape] || 0.7;
      const cw2 = cw * (gear.cape === 'regal' ? 1.9 : 1.5);
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        C.add('capeSeg' + i, plate(cw2 * (1 - t0 * 0.30), m.spineLen * capeLen / segs * 1.1, cd * 0.06, cw2 * 0.12, 0.55),
          M.secondary, { pos: [0, -m.spineLen * capeLen / segs * 0.5, 0] });
      }
    }
    if (gear.scarf) {
      C.add('neck', torus(m.headR * 0.62, m.headR * 0.20, SEG.mid), M.secondary,
        { pos: [0, m.neckLen * 0.3, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.8] });
      for (let i = 0; i < 3; i++) {
        C.add('scarfSeg' + i, plate(m.headR * 0.52, m.headR * 0.75, m.headR * 0.05, m.headR * 0.1, 0.3),
          M.secondary, { pos: [0, -m.headR * 0.38, 0] });
      }
    }
    if (gear.halo) {
      C.add('headTop', torus(m.headR * 1.25, m.headR * 0.055, SEG.high), M.glow,
        { pos: [0, m.headR * 0.55, 0], rot: [Math.PI / 2, 0, 0] });
    }

    /* Glowing seam accents — the "energy" material language, on every hero. */
    const glowStrength = skinMat.glowSeams === undefined ? 0.4 : skinMat.glowSeams;
    if (glowStrength > 0.05) {
      [-1, 1].forEach(s => {
        C.add('chest', plate(cw * 0.10, m.spineLen * 0.44, cd * 0.06, cw * 0.03, 0.4), M.glow,
          { pos: [s * cw * 0.70, m.spineLen * 0.10, cd * 0.94], rot: [0, 0, s * 0.20] });
      });
      ['L', 'R'].forEach(side => {
        C.add('armLower' + side, plate(m.armR * 0.30, m.lowerArmLen * 0.34, m.armR * 0.10, m.armR * 0.08, 0.3),
          M.glow, { pos: [0, -m.lowerArmLen * 0.46, m.armR * 0.86] });
        C.add('shin' + side, plate(m.limbR * 0.28, m.shinLen * 0.30, m.limbR * 0.10, m.limbR * 0.08, 0.3),
          M.glow, { pos: [0, -m.shinLen * 0.52, m.limbR * 0.90] });
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Public build entry
   * ------------------------------------------------------------------ */
  /**
   * @param {object} opts
   *   characterId, skinId, team ('A'|'B'), bodyHeight (world metres),
   *   detail ('full'|'preview')
   */
  CM.build = function (opts) {
    opts = opts || {};
    const charDef = HC.Characters.get(opts.characterId || 'rex');
    let skinDef = HC.Skins.tryGet(opts.skinId);
    if (!skinDef) {
      if (opts.skinId) HC.Log.warn('CharacterModel', 'skin "' + opts.skinId + '" missing — using default for ' + charDef.id);
      skinDef = HC.Skins.tryGet(HC.defaultSkinFor(charDef.id)) || { palette: {}, gear: {}, materials: {}, vfx: {} };
    }

    const pal = Object.assign({}, charDef.palette, skinDef.palette || {});
    const gear = Object.assign({}, charDef.gear, skinDef.gear || {});
    const skinMat = skinDef.materials || {};
    const teamColor = opts.team ? Mats.teamColor(opts.team) : (pal.accent || 0x36c7ff);

    const bodyHeight = opts.bodyHeight || HC.CFG.body.height;
    const m = measure(charDef.build, bodyHeight);
    const skel = buildSkeleton(m);
    const M = buildMaterials(pal, skinMat, teamColor);

    const out = {
      root: skel.root,
      bones: skel.bones,
      materials: M,
      meshes: [],
      geometries: [],
      measure: m,
      characterId: charDef.id,
      skinId: skinDef.id,
      team: opts.team || null,
      teamColor,
      palette: pal,
      gear,
      vfxColors: Object.assign({
        ability: pal.emissive, muzzle: pal.emissive, tracer: pal.accent,
        ultimate: pal.emissive, blade: pal.emissive
      }, skinDef.vfx || {}),
      overrides: skinDef.overrides || {},
      cloth: { cape: [], scarf: [] }
    };

    // Free-hanging cloth chains get their own bone chains so the animator
    // can swing them; they are parented after the skeleton exists.
    if (gear.cape && gear.cape !== 'none') {
      let parent = skel.bones.chest;
      const capeLen = { short: 0.55, long: 1.05, regal: 1.35 }[gear.cape] || 0.7;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Object3D();
        seg.name = 'capeSeg' + i;
        seg.position.set(0, i === 0 ? m.chestTop * 0.6 : -m.spineLen * capeLen / 4, i === 0 ? -m.chestDepth * 0.9 : 0);
        parent.add(seg);
        skel.bones['capeSeg' + i] = seg;
        out.cloth.cape.push(seg);
        parent = seg;
      }
    }
    if (gear.scarf) {
      let parent = skel.bones.neck;
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Object3D();
        seg.name = 'scarfSeg' + i;
        seg.position.set(0, i === 0 ? 0 : -m.headR * 0.7, i === 0 ? -m.headR * 0.5 : 0);
        parent.add(seg);
        skel.bones['scarfSeg' + i] = seg;
        out.cloth.scarf.push(seg);
        parent = seg;
      }
    }

    const C = Collector();
    buildBody(C, m, M, gear, pal, skinMat);
    buildHead(C, m, M, gear, pal);
    buildGear(C, m, M, gear, pal, skinMat);
    C.commit(skel.bones, out);

    // Ground ring: the single most valuable readability element in a
    // team fight — always shows who is on which side, even mid-explosion.
    if (opts.team) {
      const ringGeo = new THREE.RingGeometry(m.footW * 1.5, m.footW * 2.15, 28);
      const ringMat = Mats.additive(teamColor, 0.55);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      ring.renderOrder = 2;
      skel.root.add(ring);
      out.teamRing = ring;
      out.geometries.push(ringGeo);
    }

    /* --- instance API --- */
    out.setOpacity = function (alpha) {
      const list = Object.keys(M);
      for (let i = 0; i < list.length; i++) {
        const mat = M[list[i]];
        const base = mat.userData.baseOpacity === undefined
          ? (mat.userData.baseOpacity = (mat.transparent ? mat.opacity : 1))
          : mat.userData.baseOpacity;
        mat.opacity = base * alpha;
        mat.transparent = alpha < 0.999 || base < 0.999;
        mat.depthWrite = mat.opacity > 0.72;
      }
      if (out.teamRing) out.teamRing.material.opacity = 0.55 * alpha;
    };

    out.setEmissiveBoost = function (boost) {
      ['accent', 'glow', 'team', 'visor'].forEach(k => {
        const mat = M[k];
        if (!mat || mat.emissive === undefined) return;
        if (mat.userData.baseEmissive === undefined) mat.userData.baseEmissive = mat.emissiveIntensity;
        mat.emissiveIntensity = mat.userData.baseEmissive * (1 + boost);
      });
    };

    /** Flash the whole model — used for damage and ultimate activation. */
    out.setFlash = function (amount, color) {
      const c = new THREE.Color(color === undefined ? 0xffffff : color);
      Object.keys(M).forEach(k => {
        const mat = M[k];
        if (!mat.emissive) { mat.emissive = new THREE.Color(0, 0, 0); }
        if (mat.userData.flashBase === undefined) {
          mat.userData.flashBase = mat.emissive.clone();
          mat.userData.flashBaseIntensity = mat.emissiveIntensity === undefined ? 1 : mat.emissiveIntensity;
        }
        if (amount <= 0.001) {
          mat.emissive.copy(mat.userData.flashBase);
          mat.emissiveIntensity = mat.userData.flashBaseIntensity;
        } else {
          mat.emissive.copy(mat.userData.flashBase).lerp(c, U.clamp01(amount));
          mat.emissiveIntensity = U.lerp(mat.userData.flashBaseIntensity, 2.4, U.clamp01(amount));
        }
      });
    };

    out.setTeamColor = function (team) {
      const col = Mats.teamColor(team);
      out.teamColor = col;
      M.team.color.set(col);
      if (M.team.emissive) M.team.emissive.set(col);
      if (out.teamRing) out.teamRing.material.color.set(col);
      Object.keys(M).forEach(k => {
        const u = M[k].userData.rim;
        if (u && k !== 'metal' && k !== 'trim' && k !== 'skin' && k !== 'hair') u.uRimColor.value.set(col);
      });
    };

    out.setCastShadow = function (v) { out.meshes.forEach(mesh => { mesh.castShadow = v; }); };

    out.dispose = function () {
      out.geometries.forEach(g => { try { g.dispose(); } catch (e) {} });
      Object.keys(M).forEach(k => { try { M[k].dispose(); } catch (e) {} });
      out.geometries.length = 0;
      out.meshes.length = 0;
    };

    return out;
  };

  /* Exposed for weapon/prop builders so they share the shape vocabulary. */
  CM.shapes = { capsule, limb, plate, lathe, sphere, box, cone, torus, mergeGeometries, SEG };

})(window.HC, window.THREE);
