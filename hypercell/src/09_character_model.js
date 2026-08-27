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
  const SEG = { low: 12, mid: 20, high: 32 };

  /* ------------------------------------------------------------------ *
   * Loft — the shape primitive the whole body is built from.
   *
   * A stack of elliptical rings, smoothly interpolated with Catmull-Rom and
   * skinned into one continuous surface. This is the difference between a
   * character and a pile of cylinders: a chest can be wide and shallow, a
   * waist can pinch, a bicep can swell and taper into an elbow — all as a
   * single unbroken surface with smooth normals and no seams at the joints.
   *
   * @param controls [{ y, rx, rz, dx, dz }] bottom→top; rz/dx/dz optional
   * @param radial   segments around the ring
   * @param steps    interpolated rings between the first and last control
   * ------------------------------------------------------------------ */
  function loft(controls, radial, steps, opts) {
    opts = opts || {};
    radial = radial || SEG.mid;
    steps = steps || Math.max(controls.length * 4, 12);

    const n = controls.length;
    const get = (i, key, fallback) => {
      const c = controls[U.clamp(i, 0, n - 1)];
      const v = c[key];
      return v === undefined ? (fallback === undefined ? 0 : (typeof fallback === 'function' ? fallback(c) : fallback)) : v;
    };
    // Catmull-Rom through the control values so few controls give a smooth form.
    const spline = (i0, t, key, fallback) => {
      const p0 = get(i0 - 1, key, fallback), p1 = get(i0, key, fallback);
      const p2 = get(i0 + 1, key, fallback), p3 = get(i0 + 2, key, fallback);
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    const rings = [];
    for (let s = 0; s <= steps; s++) {
      const f = (s / steps) * (n - 1);
      const i0 = Math.min(n - 2, Math.floor(f));
      const t = f - i0;
      rings.push({
        y: spline(i0, t, 'y'),
        rx: Math.max(0.0006, spline(i0, t, 'rx')),
        rz: Math.max(0.0006, spline(i0, t, 'rz', (c) => c.rx)),
        dx: spline(i0, t, 'dx'),
        dz: spline(i0, t, 'dz'),
        v: s / steps
      });
    }

    // The seam column lands wherever the ring starts, so it defaults to the
    // BACK of the part: a UV/normal discontinuity straight down the middle of
    // a face is the one place you cannot afford it.
    const phase = opts.phase === undefined ? Math.PI : opts.phase;
    const cols = radial + 1;
    const vertCount = rings.length * cols + (opts.capBottom ? 1 : 0) + (opts.capTop ? 1 : 0);
    const pos = new Float32Array(vertCount * 3);
    const uv = new Float32Array(vertCount * 2);
    let p = 0, q = 0;
    for (let r = 0; r < rings.length; r++) {
      const R = rings[r];
      for (let c = 0; c <= radial; c++) {
        const a = phase + (c / radial) * U.TAU;
        pos[p++] = Math.sin(a) * R.rx + R.dx;
        pos[p++] = R.y;
        pos[p++] = Math.cos(a) * R.rz + R.dz;
        uv[q++] = c / radial;
        uv[q++] = R.v;
      }
    }
    const first = rings[0], last = rings[rings.length - 1];
    let bottomIdx = -1, topIdx = -1;
    if (opts.capBottom) {
      bottomIdx = p / 3;
      pos[p++] = first.dx; pos[p++] = first.y - first.rx * (opts.capRound || 0.55); pos[p++] = first.dz;
      uv[q++] = 0.5; uv[q++] = 0;
    }
    if (opts.capTop) {
      topIdx = p / 3;
      pos[p++] = last.dx; pos[p++] = last.y + last.rx * (opts.capRound || 0.55); pos[p++] = last.dz;
      uv[q++] = 0.5; uv[q++] = 1;
    }

    /* Winding matters: rings advance anticlockwise when viewed from +Y, so
     * the outward face is (a0, a1, b0). Getting this backwards turns every
     * lofted surface inside out — the renderer then culls the side you are
     * looking at, shows you the far inner wall instead, and lights it with a
     * normal pointing into the body. */
    const idx = [];
    for (let r = 0; r < rings.length - 1; r++) {
      for (let c = 0; c < radial; c++) {
        const a0 = r * cols + c, a1 = a0 + 1;
        const b0 = (r + 1) * cols + c, b1 = b0 + 1;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
    if (opts.capBottom) {
      for (let c = 0; c < radial; c++) idx.push(bottomIdx, c, c + 1);
    }
    if (opts.capTop) {
      const base = (rings.length - 1) * cols;
      for (let c = 0; c < radial; c++) idx.push(topIdx, base + c + 1, base + c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Sculpts an existing lofted surface with smooth analytic bumps.
   *
   * Faces built by stacking spheres always look like faces built by stacking
   * spheres: every primitive announces itself with a hard intersection line.
   * The fix is to keep the head as ONE surface and push it around. Each bump
   * is an anisotropic blob that displaces the surface along its own normal,
   * so a brow, a nose and a cheek all melt into the skull the way real
   * anatomy does.
   *
   * bumps: [{ p:[x,y,z], s:[sx,sy,sz], amp, along:[x,y,z] }]
   *   p     centre of influence
   *   s     falloff radii per axis (the blob's shape)
   *   amp   displacement in metres; negative carves inward
   *   along optional fixed push direction (defaults to the surface normal)
   *
   * `seamCols` is loft()'s duplicated seam column count, so the two copies of
   * the seam can be welded back together before normals are recomputed.
   */
  function sculpt(geo, bumps, seamCols) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const count = pos.count;
    const px = new Float32Array(count), py = new Float32Array(count), pz = new Float32Array(count);
    for (let i = 0; i < count; i++) { px[i] = pos.getX(i); py[i] = pos.getY(i); pz[i] = pos.getZ(i); }

    for (let b = 0; b < bumps.length; b++) {
      const B = bumps[b];
      const cx = B.p[0], cy = B.p[1], cz = B.p[2];
      const sx = B.s[0] || 1e-4, sy = B.s[1] || 1e-4, sz = B.s[2] || 1e-4;
      const amp = B.amp;
      for (let i = 0; i < count; i++) {
        const dx = (px[i] - cx) / sx, dy = (py[i] - cy) / sy, dz = (pz[i] - cz) / sz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= 1) continue;
        // Smooth compact support: zero value AND zero slope at the boundary,
        // which is what keeps the bump from leaving a visible rim.
        const t = 1 - d2;
        const w = t * t * t;
        let ax, ay, az;
        if (B.along) { ax = B.along[0]; ay = B.along[1]; az = B.along[2]; }
        else { ax = nrm.getX(i); ay = nrm.getY(i); az = nrm.getZ(i); }
        const len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        pos.setXYZ(i,
          pos.getX(i) + (ax / len) * amp * w,
          pos.getY(i) + (ay / len) * amp * w,
          pos.getZ(i) + (az / len) * amp * w);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Weld the loft seam: the first and last column sit on top of each other,
    // and un-averaged normals there show as a crease straight down the back.
    if (seamCols) {
      const n2 = geo.attributes.normal;
      const rows = Math.floor(count / seamCols);
      for (let r = 0; r < rows; r++) {
        const a = r * seamCols, z = a + seamCols - 1;
        if (z >= count) break;
        const nx = (n2.getX(a) + n2.getX(z)) * 0.5;
        const ny = (n2.getY(a) + n2.getY(z)) * 0.5;
        const nz = (n2.getZ(a) + n2.getZ(z)) * 0.5;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        n2.setXYZ(a, nx / l, ny / l, nz / l);
        n2.setXYZ(z, nx / l, ny / l, nz / l);
      }
      n2.needsUpdate = true;
    }
    return geo;
  }

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
  function lathe(points, seg, phiLength, phiStart) {
    const v = points.map(p => new THREE.Vector2(Math.max(0.0001, p[0]), p[1]));
    return new THREE.LatheGeometry(v, seg || SEG.mid, phiStart || 0,
      phiLength === undefined ? U.TAU : phiLength);
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
    const chestW = H * 0.150 * b.shoulderWidth;
    const chestDepth = H * 0.077 * b.chestDepth;
    const upperArmLen = H * 0.163 * b.armLength;
    const lowerArmLen = H * 0.150 * b.armLength;
    return {
      height: H, legLen, thighLen, shinLen, footH, hipHeight,
      headR, neckLen, spineLen,
      chestTop: spineLen * 0.36,
      chestW, chestDepth,
      // Hips must be wider than the waist or the torso reads as a pipe.
      hipW: H * 0.092 * b.hipWidth,
      hipX: H * 0.053 * b.hipWidth,
      shoulderX: chestW,
      shoulderY: spineLen * 0.30,
      upperArmLen, lowerArmLen,
      handLen: H * 0.058 * b.handScale,
      handW: H * 0.036 * b.handScale,
      footLen: H * 0.088 * b.footScale,
      footW: H * 0.042 * b.footScale,
      limbR: H * 0.032 * b.bulk,
      armR: H * 0.033 * b.bulk,
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
    // A heavy rim on every surface reads as cheap plastic, not as art
    // direction. It is here to separate a silhouette from the background,
    // which needs far less than it was doing.
    const rimTeam = { color: teamColor, strength: 0.24, power: 3.0 };
    const seed = (pal.primary ^ pal.accent) & 0xffff;

    const set = {
      cloth: Mats.make({ unique: true, kind: 'fabric', color: pal.cloth, seed: seed + 1,
        roughness: skinMat.fabricRough === undefined ? 0.86 : skinMat.fabricRough,
        repeat: 5.0, normalScale: 0.55, wear, rim: rimTeam }),
      primary: Mats.make({ unique: true, kind: 'plate', color: pal.primary, seed: seed + 2,
        roughness: skinMat.metalRough === undefined ? 0.40 : skinMat.metalRough,
        metalness: 0.38, repeat: 1.6, normalScale: 0.60, wear, rim: rimTeam }),
      secondary: Mats.make({ unique: true, kind: 'fabric', color: pal.secondary, seed: seed + 3,
        roughness: 0.80, repeat: 4.5, normalScale: 0.50, wear, rim: rimTeam }),
      metal: Mats.make({ unique: true, kind: 'metal', color: pal.metal, seed: seed + 4,
        roughness: skinMat.metalRough === undefined ? 0.26 : skinMat.metalRough * 0.7,
        metalness: 1.0, repeat: 2.4, normalScale: 0.45,
        rim: { color: 0xffffff, strength: 0.24, power: 3.4 } }),
      darkMetal: Mats.make({ unique: true, kind: 'metal', color: pal.darkMetal, seed: seed + 5,
        roughness: 0.42, metalness: 0.95, repeat: 2.6, normalScale: 0.50, rim: rimTeam }),
      skin: Mats.make({ unique: true, kind: 'skin', color: pal.skin, roughness: 0.58,
        rim: { color: 0xffd9c0, strength: 0.20, power: 3.6 } }),
      hair: Mats.make({ unique: true, kind: 'hair', color: pal.hair, seed: seed + 6,
        roughness: 0.74, metalness: 0.0, repeat: 2.2, normalScale: 0.75,
        rim: { color: 0xd8e4f4, strength: 0.26, power: 2.6 } }),
      leather: Mats.make({ unique: true, kind: 'leather', color: pal.leather, seed: seed + 7,
        roughness: 0.66, repeat: 3.2, normalScale: 0.55, wear, rim: rimTeam }),
      rubber: Mats.make({ unique: true, kind: 'rubber', color: pal.rubber, seed: seed + 8,
        roughness: 0.92, repeat: 3.4, normalScale: 0.50,
        rim: { color: 0x88a0c0, strength: 0.18, power: 3.2 } }),
      trim: Mats.make({ unique: true, kind: 'metal', color: pal.trim, seed: seed + 9,
        roughness: skinMat.goldTrim ? 0.18 : 0.30, metalness: skinMat.goldTrim ? 1.0 : 0.85,
        repeat: 2.0, normalScale: 0.45, rim: { color: 0xffffff, strength: 0.22, power: 3.2 } }),
      visor: Mats.make({ unique: true, kind: 'glass', color: pal.visor, roughness: 0.07,
        metalness: 0.35, opacity: 0.55, emissive: pal.emissive, emissiveIntensity: 0.28,
        rim: { color: pal.emissive, strength: 0.6, power: 2.0 } }),
      glow: Mats.make({ unique: true, kind: 'energy', color: pal.emissive, emissive: pal.emissive,
        emissiveIntensity: skinMat.glowSeams ? 2.6 : 1.8, opacity: 0.92, depthWrite: true, rim: false }),
      accent: Mats.make({ unique: true, kind: 'plate', color: pal.accent, seed: seed + 10,
        roughness: 0.36, metalness: 0.44, repeat: 1.4, normalScale: 0.55, emissive: pal.emissive,
        emissiveIntensity: skinMat.glowSeams ? 0.55 : 0.22, rim: rimTeam }),
      team: Mats.make({ unique: true, kind: 'plate', color: teamColor, seed: seed + 11,
        roughness: 0.36, metalness: 0.35, repeat: 1.4, normalScale: 0.55, emissive: teamColor,
        emissiveIntensity: 0.55, rim: { color: teamColor, strength: 0.7, power: 2.2 } })
    };

    /* Eye materials.
     *
     * These are deliberately not drawn from the palette: eyes are the one part
     * of a character that must read the same on every skin, and a "trim" colour
     * in the eye socket is what turns a face into a mannequin. */
    set.eyeSocket = Mats.make({ unique: true, kind: 'skin', color: 0x7a4a35,
      roughness: 0.86, rim: false, albedo: false });
    set.sclera = Mats.make({ unique: true, kind: 'skin', color: 0xdcd8d2,
      roughness: 0.22, rim: false, albedo: false });
    set.iris = Mats.make({ unique: true, kind: 'skin', color: pal.eye === undefined ? 0x4a6a78 : pal.eye,
      roughness: 0.14, rim: { color: 0xffffff, strength: 0.18, power: 4.0 }, albedo: false });
    set.pupil = Mats.make({ unique: true, kind: 'skin', color: 0x07090c,
      roughness: 0.10, rim: false, albedo: false });
    set.lash = Mats.make({ unique: true, kind: 'skin', color: 0x2a1a14,
      roughness: 0.7, rim: false, albedo: false });
    set.mouthLine = Mats.make({ unique: true, kind: 'skin', color: 0x5b2f2a,
      roughness: 0.55, rim: false, albedo: false });
    set.catchlight = Mats.make({ unique: true, kind: 'energy', color: 0xffffff,
      emissive: 0xffffff, emissiveIntensity: 1.1, opacity: 0.95, depthWrite: true, rim: false });

    // With image-based lighting present, metals want a real envMap weight or
    // they stay as flat as they were before the environment existed.
    ['metal', 'darkMetal', 'trim', 'primary', 'accent', 'team'].forEach(k => {
      if (set[k]) set[k].envMapIntensity = 1.35;
    });
    if (set.visor) set.visor.envMapIntensity = 2.0;
    if (set.skin) set.skin.envMapIntensity = 0.55;
    if (set.cloth) set.cloth.envMapIntensity = 0.45;
    if (set.hair) set.hair.envMapIntensity = 0.35;

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
    const cw = m.chestW, cd = m.chestDepth;
    const R = SEG.mid;

    /* --- TORSO ------------------------------------------------------------
     * One continuous surface from hips to shoulders. The cross-sections are
     * ellipses, wider than deep, and the waist pinches — that silhouette is
     * what separates a body from a barrel. */
    C.add('hips', loft([
      { y: -m.hipW * 0.72, rx: m.hipW * 0.72, rz: m.hipW * 0.58 },
      { y: -m.hipW * 0.30, rx: m.hipW * 1.00, rz: m.hipW * 0.76, dz: -m.hipW * 0.04 },
      { y: m.hipW * 0.12, rx: m.hipW * 1.04, rz: m.hipW * 0.78 },
      { y: m.hipW * 0.58, rx: m.hipW * 0.86, rz: m.hipW * 0.66 }
    ], R, 18, { capBottom: true, capRound: 0.5 }), M.cloth, {});

    // Spine section: waist tapering up out of the hips.
    C.add('spine', loft([
      { y: -m.spineLen * 0.16, rx: cw * 0.66, rz: cd * 0.82 },
      { y: m.spineLen * 0.06, rx: cw * 0.62, rz: cd * 0.76 },
      { y: m.spineLen * 0.30, rx: cw * 0.72, rz: cd * 0.86 },
      { y: m.spineLen * 0.52, rx: cw * 0.82, rz: cd * 0.96 }
    ], R, 16), M.cloth, {});

    // Chest: swells out of the waist, widest and deepest just under the
    // shoulders, then flattens across the top where the collarbones sit.
    C.add('chest', loft([
      { y: -m.spineLen * 0.24, rx: cw * 0.80, rz: cd * 0.94 },
      { y: -m.spineLen * 0.02, rx: cw * 0.94 * t, rz: cd * 1.10 },
      { y: m.spineLen * 0.18, rx: cw * 1.00 * t, rz: cd * 1.06, dz: cd * 0.04 },
      { y: m.chestTop * 0.72, rx: cw * 0.96, rz: cd * 0.86 },
      { y: m.chestTop * 1.04, rx: cw * 0.70, rz: cd * 0.62 }
    ], R, 20, { capTop: true, capRound: 0.35 }), M.primary, {});

    // Trapezius wedges filling the neck-to-shoulder run.
    [-1, 1].forEach(sgn => {
      C.add('chest', loft([
        { y: 0, rx: cw * 0.30, rz: cd * 0.52 },
        { y: m.chestTop * 0.55, rx: cw * 0.22, rz: cd * 0.40 },
        { y: m.chestTop * 0.95, rx: cw * 0.11, rz: cd * 0.22 }
      ], SEG.low, 8, { capTop: true }), M.primary,
        { pos: [sgn * cw * 0.52, m.spineLen * 0.24, 0] });
    });

    // Pectoral definition and the centre chest plate — the focal point.
    [-1, 1].forEach(sgn => {
      C.add('chest', sphere(cw * 0.36, SEG.mid), M.primary,
        { pos: [sgn * cw * 0.36, m.spineLen * 0.10, cd * 0.62], scale: [1.0, 0.72, 0.46] });
    });
    C.add('chest', plate(cw * 0.74, m.spineLen * 0.36, cd * 0.20, cw * 0.24, 0.75),
      M.accent, { pos: [0, m.spineLen * 0.10, cd * 0.94] });
    C.add('chest', plate(cw * 0.30, m.spineLen * 0.14, cd * 0.14, cw * 0.09, 0.4),
      M.team, { pos: [0, m.spineLen * 0.21, cd * 1.02] });

    // Shoulder blades / back plate.
    C.add('chest', plate(cw * 1.05, m.spineLen * 0.44, cd * 0.16, cw * 0.28, 0.85),
      M.secondary, { pos: [0, m.spineLen * 0.10, -cd * 0.92], rot: [0, Math.PI, 0] });

    /* --- NECK --- */
    C.add('neck', loft([
      { y: -m.neckLen * 0.35, rx: m.headR * 0.52, rz: m.headR * 0.50 },
      { y: m.neckLen * 0.45, rx: m.headR * 0.42, rz: m.headR * 0.42 },
      { y: m.neckLen * 1.15, rx: m.headR * 0.46, rz: m.headR * 0.46 }
    ], SEG.mid, 10), M.skin, {});
    if (gear.collar) {
      C.add('chest', loft([
        { y: 0, rx: m.headR * 0.66, rz: m.headR * 0.62 },
        { y: m.neckLen * 0.55, rx: m.headR * 0.74, rz: m.headR * 0.70 },
        { y: m.neckLen * 0.95, rx: m.headR * 0.62, rz: m.headR * 0.58 }
      ], SEG.mid, 10), M.primary, { pos: [0, m.chestTop * 0.86, 0] });
    }

    /* --- ARMS -------------------------------------------------------------
     * Deltoid, bicep swell, elbow pinch, forearm swell, wrist pinch — each
     * limb is one lofted surface so there is no seam where a joint would be. */
    ['L', 'R'].forEach(side => {
      const sgn = side === 'L' ? 1 : -1;
      const ar = m.armR;

      // Deltoid cap, lofted so it merges into the chest rather than floating.
      C.add('shoulder' + side, loft([
        { y: -ar * 1.5, rx: ar * 1.06, rz: ar * 1.02 },
        { y: -ar * 0.4, rx: ar * 1.32, rz: ar * 1.24 },
        { y: ar * 0.55, rx: ar * 1.18, rz: ar * 1.10 },
        { y: ar * 1.05, rx: ar * 0.62, rz: ar * 0.60 }
      ], R, 14, { capTop: true }), M.cloth, {});

      C.add('armUpper' + side, loft([
        { y: 0, rx: ar * 1.20, rz: ar * 1.16 },
        { y: -m.upperArmLen * 0.28, rx: ar * 1.16, rz: ar * 1.12 },
        { y: -m.upperArmLen * 0.62, rx: ar * 0.98, rz: ar * 0.96 },
        { y: -m.upperArmLen * 1.02, rx: ar * 0.86, rz: ar * 0.88 }
      ], R, 16), M.cloth, {});

      C.add('armLower' + side, loft([
        { y: ar * 0.18, rx: ar * 0.92, rz: ar * 0.94 },
        { y: -m.lowerArmLen * 0.26, rx: ar * 0.96, rz: ar * 0.98 },
        { y: -m.lowerArmLen * 0.66, rx: ar * 0.76, rz: ar * 0.78 },
        { y: -m.lowerArmLen * 1.02, rx: ar * 0.60, rz: ar * 0.64 }
      ], R, 16, { capBottom: true, capRound: 0.4 }), M.cloth, {});

      // Forearm guard, wrapped to the limb.
      const guardMat = (gear.gloves === 'gauntlet' || gear.gloves === 'armored') ? M.metal : M.darkMetal;
      C.add('armLower' + side, plate(ar * 1.7, m.lowerArmLen * 0.56, ar * 0.42, ar * 0.5, 1.0),
        guardMat, { pos: [0, -m.lowerArmLen * 0.44, ar * 0.52] });

      /* Hand: a lofted mitten with a separate thumb, instead of stacked
       * plates that read as crumpled foil. */
      const hw = m.handW, hl = m.handLen;
      const handMat = (gear.gloves && gear.gloves !== 'none') ? M.leather : M.skin;
      C.add('hand' + side, loft([
        { y: 0, rx: hw * 0.62, rz: hw * 0.44 },
        { y: -hl * 0.30, rx: hw * 0.76, rz: hw * 0.50 },
        { y: -hl * 0.72, rx: hw * 0.72, rz: hw * 0.46 },
        { y: -hl * 1.00, rx: hw * 0.52, rz: hw * 0.36 }
      ], SEG.mid, 12, { capBottom: true, capRound: 0.6 }), handMat, {});
      // Thumb along the inside edge.
      C.add('hand' + side, loft([
        { y: 0, rx: hw * 0.24, rz: hw * 0.24 },
        { y: -hl * 0.34, rx: hw * 0.20, rz: hw * 0.20 }
      ], SEG.low, 6, { capBottom: true, capTop: true }), handMat,
        { pos: [sgn * hw * 0.56, -hl * 0.26, hw * 0.10], rot: [0, 0, sgn * 0.85] });

      if (gear.gloves === 'blade_gauntlet') {
        C.add('hand' + side, plate(hw * 1.0, hl * 0.44, hw * 0.3, hw * 0.16, 0),
          M.glow, { pos: [0, -hl * 0.24, hw * 0.52] });
      }
    });

    /* --- LEGS -------------------------------------------------------------
     * Thigh swell, knee pinch, calf swell, ankle pinch. */
    ['L', 'R'].forEach(side => {
      const lr = m.limbR;

      C.add('thigh' + side, loft([
        { y: lr * 0.7, rx: lr * 1.30, rz: lr * 1.26 },
        { y: -m.thighLen * 0.24, rx: lr * 1.44, rz: lr * 1.38 },
        { y: -m.thighLen * 0.62, rx: lr * 1.18, rz: lr * 1.16 },
        { y: -m.thighLen * 1.02, rx: lr * 0.98, rz: lr * 1.00 }
      ], R, 18, { capTop: true }), M.cloth, {});

      C.add('shin' + side, loft([
        { y: lr * 0.14, rx: lr * 1.02, rz: lr * 1.04 },
        { y: -m.shinLen * 0.22, rx: lr * 1.10, rz: lr * 1.18 },
        { y: -m.shinLen * 0.58, rx: lr * 0.82, rz: lr * 0.90 },
        { y: -m.shinLen * 1.00, rx: lr * 0.58, rz: lr * 0.62 }
      ], R, 18), M.cloth, {});

      if (gear.kneePads) {
        C.add('shin' + side, plate(lr * 2.0, lr * 1.9, lr * 0.6, lr * 0.8, 1.1),
          M.darkMetal, { pos: [0, -lr * 0.16, lr * 0.88] });
      }
      if (gear.legWrap) {
        for (let i = 0; i < 3; i++) {
          C.add('shin' + side, torus(lr * (0.95 - i * 0.07), lr * 0.12, SEG.mid),
            M.leather, { pos: [0, -m.shinLen * (0.30 + i * 0.16), 0], rot: [Math.PI / 2, 0, 0] });
        }
      }

      /* Boot: heel, arch and toe box as one lofted form along Z. */
      const fl = m.footLen, fw = m.footW;
      const boot = loft([
        { y: -fl * 0.34, rx: fw * 0.40, rz: m.footH * 1.5, dz: 0 },
        { y: -fl * 0.10, rx: fw * 0.50, rz: m.footH * 2.4 },
        { y: fl * 0.26, rx: fw * 0.50, rz: m.footH * 2.2 },
        { y: fl * 0.52, rx: fw * 0.44, rz: m.footH * 1.7 },
        { y: fl * 0.66, rx: fw * 0.30, rz: m.footH * 1.1 }
      ], SEG.mid, 16, { capBottom: true, capTop: true, capRound: 0.4 });
      // Loft builds along Y; rotate it to lie along the foot's forward axis.
      C.add('foot' + side, boot, M.leather,
        { pos: [0, m.footH * 1.5, fl * 0.06], rot: [Math.PI / 2, 0, 0] });
      // Sole.
      C.add('foot' + side, plate(fw * 1.02, fl * 0.94, m.footH * 1.1, fw * 0.3, 0.2),
        M.rubber, { pos: [0, m.footH * 0.5, fl * 0.08], rot: [Math.PI / 2, 0, 0] });
      // Ankle collar tying the boot to the shin.
      C.add('foot' + side, loft([
        { y: m.footH * 1.6, rx: fw * 0.40, rz: fw * 0.36 },
        { y: m.footH * 3.0, rx: fw * 0.34, rz: fw * 0.32 }
      ], SEG.mid, 6), M.leather, { pos: [0, 0, -fl * 0.04] });

      if (gear.boots === 'stomper' || gear.boots === 'armored') {
        C.add('foot' + side, plate(fw * 1.05, fl * 0.36, m.footH * 1.0, fw * 0.2, 0.3),
          M.metal, { pos: [0, m.footH * 1.2, fl * 0.36], rot: [Math.PI / 2, 0, 0] });
      }
      if (gear.boots === 'levitator') {
        C.add('foot' + side, torus(fw * 0.46, fw * 0.12, SEG.mid), M.glow,
          { pos: [0, m.footH * 0.35, fl * 0.05], rot: [Math.PI / 2, 0, 0] });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Head + face
   * ------------------------------------------------------------------ */
  function buildHead(C, m, M, gear, pal) {
    const r = m.headR;
    const R = SEG.high;
    const sealed = gear.helmet === 'full_sealed' || gear.helmet === 'sovereign_crown' ||
                   gear.helmet === 'titan_forge' || gear.helmet === 'warlord_mask' ||
                   gear.helmet === 'doomsday_rig' || gear.helmet === 'beast_skull';
    const headMat = sealed ? M.primary : M.skin;

    /* --- SKULL ------------------------------------------------------------
     * One continuous lofted surface, then sculpted. Every facial feature —
     * brow, nose, cheeks, lips, chin, eye sockets — is a displacement of this
     * same mesh rather than a separate primitive glued on top, which is the
     * whole difference between a face and a pile of eggs. */
    const RADIAL = 48, STEPS = 44;
    const skull = loft([
      { y: -r * 0.94, rx: r * 0.36, rz: r * 0.42, dz: r * 0.14 },   // chin
      { y: -r * 0.76, rx: r * 0.58, rz: r * 0.68, dz: r * 0.12 },   // jaw
      { y: -r * 0.50, rx: r * 0.75, rz: r * 0.84, dz: r * 0.08 },   // mouth line
      { y: -r * 0.20, rx: r * 0.86, rz: r * 0.93, dz: r * 0.035 },  // cheekbone
      { y: r * 0.10, rx: r * 0.90, rz: r * 0.97, dz: 0 },           // eye line
      { y: r * 0.38, rx: r * 0.92, rz: r * 0.98, dz: -r * 0.02 },   // brow / temple
      { y: r * 0.64, rx: r * 0.90, rz: r * 0.95, dz: -r * 0.04 },   // forehead
      { y: r * 0.86, rx: r * 0.81, rz: r * 0.86, dz: -r * 0.05 },   // upper cranium
      { y: r * 1.02, rx: r * 0.60, rz: r * 0.64, dz: -r * 0.06 },   // crown shoulder
      { y: r * 1.10, rx: r * 0.28, rz: r * 0.30, dz: -r * 0.06 }    // crown
    ], RADIAL, STEPS, { capTop: true, capBottom: true, capRound: 0.85 });

    if (!sealed) {
      const F = r;   // every feature is expressed in head radii
      sculpt(skull, [
        // Brow ridge: one bar across both eyes, heavier at the outer edge.
        { p: [0, F * 0.33, F * 0.86], s: [F * 0.80, F * 0.22, F * 0.54], amp: F * 0.085 },
        // Eye sockets carved back under it.
        { p: [ F * 0.30, F * 0.13, F * 0.90], s: [F * 0.27, F * 0.21, F * 0.42], amp: -F * 0.130 },
        { p: [-F * 0.30, F * 0.13, F * 0.90], s: [F * 0.27, F * 0.21, F * 0.42], amp: -F * 0.130 },
        // Nose bridge running down from between the brows...
        { p: [0, F * 0.22, F * 0.92], s: [F * 0.12, F * 0.28, F * 0.32], amp: F * 0.080 },
        // ...into the tip, which is the part that actually protrudes.
        { p: [0, -F * 0.02, F * 0.94], s: [F * 0.14, F * 0.16, F * 0.28], amp: F * 0.160 },
        // Nostril wings either side of it.
        { p: [ F * 0.10, -F * 0.09, F * 0.90], s: [F * 0.10, F * 0.10, F * 0.22], amp: F * 0.080 },
        { p: [-F * 0.10, -F * 0.09, F * 0.90], s: [F * 0.10, F * 0.10, F * 0.22], amp: F * 0.080 },
        // Cheekbones: broad, high, and pulled outward rather than forward.
        { p: [ F * 0.62, -F * 0.06, F * 0.56], s: [F * 0.42, F * 0.30, F * 0.54], amp: F * 0.075 },
        { p: [-F * 0.62, -F * 0.06, F * 0.56], s: [F * 0.42, F * 0.30, F * 0.54], amp: F * 0.075 },
        // Hollow below them, which is what reads as a jawline.
        { p: [ F * 0.58, -F * 0.46, F * 0.48], s: [F * 0.34, F * 0.26, F * 0.46], amp: -F * 0.045 },
        { p: [-F * 0.58, -F * 0.46, F * 0.48], s: [F * 0.34, F * 0.26, F * 0.46], amp: -F * 0.045 },
        // Mouth: an upper and lower lip mass with a crease between them.
        { p: [0, -F * 0.36, F * 0.88], s: [F * 0.30, F * 0.11, F * 0.28], amp: F * 0.055 },
        { p: [0, -F * 0.53, F * 0.86], s: [F * 0.28, F * 0.12, F * 0.28], amp: F * 0.050 },
        { p: [0, -F * 0.44, F * 0.90], s: [F * 0.32, F * 0.050, F * 0.26], amp: -F * 0.060 },
        // Chin ball and the crease above it.
        { p: [0, -F * 0.76, F * 0.74], s: [F * 0.30, F * 0.24, F * 0.38], amp: F * 0.070 },
        { p: [0, -F * 0.64, F * 0.82], s: [F * 0.22, F * 0.07, F * 0.24], amp: -F * 0.028 },
        // Temples pinched in, so the cranium is not a perfect ovoid.
        { p: [ F * 0.86, F * 0.44, F * 0.22], s: [F * 0.34, F * 0.34, F * 0.46], amp: -F * 0.040 },
        { p: [-F * 0.86, F * 0.44, F * 0.22], s: [F * 0.34, F * 0.34, F * 0.46], amp: -F * 0.040 },
        // Occiput: the back of a real skull bulges below the crown.
        { p: [0, F * 0.30, -F * 0.86], s: [F * 0.60, F * 0.50, F * 0.40], amp: F * 0.035 }
      ], RADIAL + 1);
    }
    C.add('head', skull, headMat, { pos: [0, r * 0.12, 0] });

    if (!sealed) {
      /* Eyes.
       *
       * A human eye reads as mostly *dark*: the iris and pupil cover half the
       * visible aperture and the sclera is only ever a sliver either side.
       * These are the only parts of the face that stay separate geometry,
       * because in a real head they are separate objects. */
      [-1, 1].forEach(sg => {
        const ex = sg * r * 0.30, ey = r * 0.13;
        // These sit in the socket the sculpt carved, so their depth is tied to
        // the carve: too far back and the whole eye disappears into the skull.
        const ez = r * 0.845;
        // Sclera — matte, never metallic.
        C.add('head', sphere(r * 0.094, SEG.mid), M.sclera,
          { pos: [ex, ey, ez], scale: [1.0, 0.86, 0.72] });
        // Iris and pupil: the dark mass that makes a face look at you.
        C.add('head', sphere(r * 0.052, SEG.mid), M.iris,
          { pos: [ex + sg * r * 0.004, ey, ez + r * 0.055], scale: [1.0, 1.0, 0.44] });
        C.add('head', sphere(r * 0.026, SEG.low), M.pupil,
          { pos: [ex + sg * r * 0.004, ey, ez + r * 0.066], scale: [1.0, 1.0, 0.42] });
        // Catchlight — small, offset, and the only bright thing in the eye.
        C.add('head', sphere(r * 0.014, SEG.low), M.catchlight,
          { pos: [ex + sg * r * 0.020, ey + r * 0.024, ez + r * 0.073], scale: [1, 1, 0.6] });
        // Lids: an upper lid that overhangs and a lower lid that lifts. Skin
        // coloured, so they merge into the sculpted socket rather than ring it.
        C.add('head', sphere(r * 0.136, SEG.mid), M.skin,
          { pos: [ex, ey + r * 0.086, ez - r * 0.045], scale: [1.14, 0.48, 0.62] });
        C.add('head', sphere(r * 0.124, SEG.mid), M.skin,
          { pos: [ex, ey - r * 0.086, ez - r * 0.040], scale: [1.06, 0.40, 0.60] });
        // Lash line: a thin dark edge, not a bar. Anything heavier here and
        // the character looks like it is wearing stage make-up.
        C.add('head', sphere(r * 0.108, SEG.mid), M.lash,
          { pos: [ex, ey + r * 0.060, ez + r * 0.010], scale: [1.06, 0.075, 0.34] });
        // Eyebrow: sits up on the brow ridge, well clear of the lid.
        C.add('head', sphere(r * 0.160, SEG.mid), M.hair,
          { pos: [sg * r * 0.30, r * 0.325, ez + r * 0.030], scale: [1.20, 0.15, 0.22],
            rot: [0, 0, sg * 0.17] });
      });

      /* Mouth line: a thin shadow in the crease the sculpt already carved. */
      C.add('head', plate(r * 0.36, r * 0.026, r * 0.05, r * 0.011, 0.7), M.mouthLine,
        { pos: [0, -r * 0.32, r * 0.955] });

      /* Ears */
      [-1, 1].forEach(sg => {
        C.add('head', sphere(r * 0.19, SEG.mid), M.skin,
          { pos: [sg * r * 0.90, r * 0.10, -r * 0.02], scale: [0.30, 0.98, 0.62] });
        C.add('head', sphere(r * 0.11, SEG.low), M.eyeSocket,
          { pos: [sg * r * 0.94, r * 0.06, -r * 0.02], scale: [0.16, 0.66, 0.46] });
      });
    }

    /* --- HEADGEAR --------------------------------------------------------- */
    const G = gear.helmet;
    const glowVisor = (yy, ww, hh) => C.add('head', plate(ww, hh, r * 0.22, hh * 0.42, 0.9),
      M.visor, { pos: [0, yy, r * 0.82] });

    if (G === 'visor_light') {
      C.add('head', loft([
        { y: 0, rx: r * 0.98, rz: r * 1.00 },
        { y: r * 0.30, rx: r * 0.96, rz: r * 0.98 }
      ], R, 6), M.darkMetal, { pos: [0, r * 0.30, 0] });
      glowVisor(r * 0.34, r * 1.4, r * 0.20);
    } else if (G === 'goggles' || G === 'blast_hood') {
      [-1, 1].forEach(sg => {
        C.add('head', new THREE.CylinderGeometry(r * 0.30, r * 0.34, r * 0.24, SEG.mid), M.metal,
          { pos: [sg * r * 0.36, r * 0.30, r * 0.74], rot: [Math.PI / 2, 0, 0] });
        C.add('head', new THREE.CylinderGeometry(r * 0.23, r * 0.23, r * 0.09, SEG.mid), M.visor,
          { pos: [sg * r * 0.36, r * 0.30, r * 0.88], rot: [Math.PI / 2, 0, 0] });
      });
      C.add('head', torus(r * 0.98, r * 0.085, SEG.high), M.leather, { pos: [0, r * 0.30, 0] });
    } else if (G === 'half_mask') {
      C.add('head', loft([
        { y: -r * 0.92, rx: r * 0.36, rz: r * 0.40, dz: r * 0.18 },
        { y: -r * 0.56, rx: r * 0.60, rz: r * 0.66, dz: r * 0.12 },
        { y: -r * 0.18, rx: r * 0.78, rz: r * 0.84, dz: r * 0.06 }
      ], R, 12, { capBottom: true }), M.darkMetal, { pos: [0, r * 0.12, r * 0.04] });
      C.add('head', plate(r * 0.36, r * 0.16, r * 0.12, r * 0.06, 0.4), M.glow,
        { pos: [0, -r * 0.34, r * 0.88] });
    } else if (G === 'mask_full' || G === 'empress_crown' || G === 'warlord_mask') {
      C.add('head', loft([
        { y: -r * 1.0, rx: r * 0.34, rz: r * 0.40, dz: r * 0.20 },
        { y: -r * 0.50, rx: r * 0.74, rz: r * 0.82, dz: r * 0.12 },
        { y: r * 0.20, rx: r * 0.94, rz: r * 0.98, dz: r * 0.02 },
        { y: r * 0.80, rx: r * 0.86, rz: r * 0.90, dz: -r * 0.04 },
        { y: r * 1.14, rx: r * 0.44, rz: r * 0.48 }
      ], R, 22, { capTop: true, capBottom: true }), M.primary, { pos: [0, r * 0.12, 0] });
      C.add('head', plate(r * 0.98, r * 0.18, r * 0.14, r * 0.08, 0.9), M.glow,
        { pos: [0, r * 0.28, r * 0.90] });
      [-1, 1].forEach(sg => C.add('head', plate(r * 0.12, r * 0.44, r * 0.10, r * 0.04, 0.3), M.trim,
        { pos: [sg * r * 0.48, -r * 0.28, r * 0.86] }));
      if (G === 'empress_crown') {
        for (let i = -2; i <= 2; i++) {
          C.add('head', cone(r * 0.10, r * (0.58 - Math.abs(i) * 0.10), 6), M.trim,
            { pos: [i * r * 0.32, r * 1.16, -r * 0.08], rot: [-0.2, 0, i * 0.16] });
        }
      }
      if (G === 'warlord_mask') {
        [-1, 1].forEach(sg => C.add('head', cone(r * 0.15, r * 0.95, 7), M.trim,
          { pos: [sg * r * 0.74, r * 0.86, -r * 0.10], rot: [-0.35, 0, sg * 0.42] }));
      }
    } else if (sealed) {
      C.add('head', loft([
        { y: -r * 1.00, rx: r * 0.40, rz: r * 0.46, dz: r * 0.14 },
        { y: -r * 0.52, rx: r * 0.82, rz: r * 0.90, dz: r * 0.08 },
        { y: r * 0.10, rx: r * 1.02, rz: r * 1.06 },
        { y: r * 0.72, rx: r * 0.94, rz: r * 0.98, dz: -r * 0.04 },
        { y: r * 1.16, rx: r * 0.44, rz: r * 0.48, dz: -r * 0.06 }
      ], R, 24, { capTop: true, capBottom: true }), M.primary, { pos: [0, r * 0.12, 0] });
      C.add('head', plate(r * 1.22, r * 0.40, r * 0.20, r * 0.17, 1.0), M.visor,
        { pos: [0, r * 0.26, r * 0.90] });
      C.add('head', plate(r * 0.84, r * 0.14, r * 0.12, r * 0.06, 0.8), M.glow,
        { pos: [0, r * 0.26, r * 0.98] });
      if (G === 'sovereign_crown' || G === 'titan_forge') {
        C.add('head', torus(r * 1.00, r * 0.09, SEG.high), M.trim, { pos: [0, r * 0.82, 0], rot: [Math.PI / 2, 0, 0] });
        C.add('head', cone(r * 0.13, r * 0.60, 7), M.trim, { pos: [0, r * 1.42, 0] });
      }
      if (G === 'beast_skull') {
        [-1, 1].forEach(sg => C.add('head', cone(r * 0.19, r * 1.10, 7), M.trim,
          { pos: [sg * r * 0.80, r * 0.74, r * 0.08], rot: [0.2, 0, sg * 0.85] }));
      }
      if (G === 'doomsday_rig') {
        [-1, 1].forEach(sg => C.add('head', new THREE.CylinderGeometry(r * 0.12, r * 0.15, r * 0.9, 9), M.metal,
          { pos: [sg * r * 0.78, r * 0.72, -r * 0.34], rot: [0.3, 0, sg * 0.3] }));
      }
    } else if (G === 'hood' || G === 'crown' || G === 'hardhat' || G === 'scrap_crown' ||
               G === 'singularity_crown' || G === 'prism_crest') {
      if (G === 'hood') {
        C.add('head', loft([
          { y: -r * 0.90, rx: r * 0.86, rz: r * 0.92, dz: -r * 0.10 },
          { y: -r * 0.20, rx: r * 1.16, rz: r * 1.22, dz: -r * 0.10 },
          { y: r * 0.55, rx: r * 1.14, rz: r * 1.20, dz: -r * 0.12 },
          { y: r * 1.06, rx: r * 0.72, rz: r * 0.78, dz: -r * 0.14 },
          { y: r * 1.26, rx: r * 0.24, rz: r * 0.26, dz: -r * 0.16 }
        ], R, 20, { capTop: true }), M.cloth, { pos: [0, r * 0.12, 0] });
        C.add('head', plate(r * 1.5, r * 0.85, r * 0.26, r * 0.36, 1.1), M.cloth,
          { pos: [0, r * 0.56, r * 0.66], rot: [-0.35, 0, 0] });
      } else if (G === 'hardhat') {
        C.add('head', loft([
          { y: 0, rx: r * 1.12, rz: r * 1.16 },
          { y: r * 0.40, rx: r * 1.06, rz: r * 1.10 },
          { y: r * 0.88, rx: r * 0.70, rz: r * 0.74 },
          { y: r * 1.06, rx: r * 0.22, rz: r * 0.24 }
        ], R, 14, { capTop: true }), M.accent, { pos: [0, r * 0.34, 0] });
        C.add('head', plate(r * 1.4, r * 0.62, r * 0.09, r * 0.24, 0.9), M.accent,
          { pos: [0, r * 0.36, r * 0.84], rot: [-0.15, 0, 0] });
      } else {
        C.add('head', torus(r * 0.98, r * 0.07, SEG.high), M.trim, { pos: [0, r * 0.76, 0], rot: [Math.PI / 2, 0, 0] });
        const spokes = G === 'scrap_crown' ? 5 : 7;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI - Math.PI / 2;
          C.add('head', cone(r * 0.085, r * (0.44 + Math.cos(a) * 0.34), 6),
            G === 'scrap_crown' ? M.metal : M.glow,
            { pos: [Math.sin(a) * r * 0.90, r * 1.04, Math.cos(a) * r * 0.48], rot: [0, 0, Math.sin(a) * 0.5] });
        }
      }
    }

    /* --- hair ------------------------------------------------------------
     * A full lathe would revolve straight across the face. Hair is therefore
     * built as a crown (above the brow, all the way round) plus a back-and-
     * sides skirt that stops short of the face, leaving a real hairline.
     * LatheGeometry measures phi from +Z, so the gap is centred on the front. */
    const hairStyle = gear.hair;
    if (hairStyle && hairStyle !== 'none' && !sealed) {
      // A generous opening at the front. The old 89-degree window left only a
      // slot for the face and turned every hairstyle into a helmet.
      const FACE_GAP = 2.55;
      const BACK_START = FACE_GAP * 0.5;
      const BACK_LEN = U.TAU - FACE_GAP;

      /** Skull cap sitting above the brow — safe to revolve fully. */
      function crown(lift, thick) {
        // Sits above the hairline, follows the skull section, and closes at
        // the top — the old version stopped at a 0.22r ring and left a hole
        // right where everyone looks first.
        const t = 0.045 + thick;
        C.add('head', loft([
          { y: r * (0.58 + lift), rx: r * (0.94 + t), rz: r * (1.00 + t), dz: -r * 0.02 },
          { y: r * (0.78 + lift), rx: r * (0.90 + t), rz: r * (0.95 + t), dz: -r * 0.04 },
          { y: r * (0.96 + lift), rx: r * (0.79 + t), rz: r * (0.84 + t), dz: -r * 0.05 },
          { y: r * (1.10 + lift), rx: r * (0.56 + t), rz: r * (0.60 + t), dz: -r * 0.06 },
          { y: r * (1.19 + lift), rx: r * (0.26 + t), rz: r * (0.28 + t), dz: -r * 0.06 },
          { y: r * (1.23 + lift), rx: r * 0.06, rz: r * 0.06, dz: -r * 0.06 }
        ], SEG.high, 18, { capTop: true, capRound: 0.9 }), M.hair, { pos: [0, r * 0.12, 0] });
      }

      /** Back and sides, dropping to `bottom` (in head radii). */
      function skirt(bottom, thick) {
        // Back and sides only, stopping above the cheekbone so the face,
        // ears and jaw all stay visible. It overlaps the crown so the two
        // never show a seam where they meet.
        const t = 0.045 + thick;
        C.add('head', lathe([
          [r * (0.92 + t), r * bottom],
          [r * (0.97 + t), r * 0.22],
          [r * (0.97 + t), r * 0.48],
          [r * (0.95 + t), r * 0.66]
        ], SEG.high, BACK_LEN, BACK_START), M.hair, { pos: [0, r * 0.12, -r * 0.03], scale: [1.0, 1, 1.04] });
      }

      /** Fringe swept across the forehead. */
      /**
       * Fringe: a shell of hair over the forehead, revolved around the same
       * axis as the crown so it follows the skull instead of hovering in
       * front of it. A flat plate here read as a sticker taped to the head.
       */
      function fringe(drop, sweep) {
        const FRONT_LEN = FACE_GAP * 0.92;
        const yLow = r * (0.50 - drop * 0.30);
        C.add('head', lathe([
          [r * 0.97, yLow],
          [r * 1.02, yLow + r * 0.16],
          [r * 1.01, yLow + r * 0.34],
          [r * 0.94, yLow + r * 0.50]
        ], SEG.high, FRONT_LEN, -FRONT_LEN / 2), M.hair,
          { pos: [0, r * 0.12, 0], rot: [0, 0, (sweep || 0) * 0.55], scale: [1, 1, 1.03] });
        // A heavier sweep on one side, so the hairline is not symmetrical.
        const side = (sweep || 0) >= 0 ? 1 : -1;
        C.add('head', lathe([
          [r * 0.99, yLow - r * 0.09],
          [r * 1.04, yLow + r * 0.12],
          [r * 1.00, yLow + r * 0.30]
        ], SEG.high, FRONT_LEN * 0.42, side * FRONT_LEN * 0.06), M.hair,
          { pos: [0, r * 0.12, 0], rot: [0, 0, (sweep || 0) * 0.9], scale: [1, 1, 1.04] });
      }

      switch (hairStyle) {
        case 'buzz':
          crown(-0.06, -0.01);
          skirt(-0.06, -0.015);
          break;

        case 'short_fade':
          crown(0, 0);
          skirt(-0.16, -0.01);
          fringe(0.30, 0.10);
          break;

        case 'messy':
          crown(0.02, 0.03);
          skirt(-0.12, 0.02);
          fringe(0.34, -0.14);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * U.TAU;
            C.add('head', cone(r * 0.15, r * 0.42, 5), M.hair,
              { pos: [Math.cos(a) * r * 0.58, r * 1.06, Math.sin(a) * r * 0.58],
                rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
          }
          break;

        case 'high_ponytail':
          crown(0, 0);
          skirt(-0.10, -0.01);
          fringe(0.26, 0.18);
          C.add('headTop', capsule(r * 0.24, r * 1.5, SEG.low), M.hair,
            { pos: [0, r * 0.05, -r * 0.95], rot: [1.15, 0, 0] });
          C.add('headTop', capsule(r * 0.15, r * 0.9, SEG.low), M.hair,
            { pos: [r * 0.16, -r * 0.35, -r * 1.5], rot: [1.45, 0, 0.2] });
          break;

        case 'undercut_long':
          crown(0.02, 0.01);
          skirt(-0.30, 0.0);
          fringe(0.42, -0.24);
          [-1, 1].forEach(s => C.add('head', plate(r * 0.30, r * 1.4, r * 0.24, r * 0.13, 0.5), M.hair,
            { pos: [s * r * 0.88, -r * 0.34, r * 0.06], rot: [0, 0, s * 0.10] }));
          break;

        case 'braids':
          crown(0, 0);
          skirt(-0.14, -0.01);
          fringe(0.24, 0);
          [-1, 1].forEach(s => {
            for (let i = 0; i < 4; i++) {
              C.add('head', sphere(r * 0.16, SEG.low), M.hair,
                { pos: [s * r * 0.72, -r * (0.15 + i * 0.34), -r * (0.2 + i * 0.12)],
                  scale: [0.9, 0.8, 1.1] });
            }
          });
          break;

        case 'long_flow': case 'void_flow': case 'void_veil': case 'mane': case 'prism_crest':
          crown(0.02, 0.02);
          skirt(-0.34, 0.01);
          fringe(0.40, 0.16);
          for (let i = 0; i < 7; i++) {
            const a = -Math.PI * 0.5 + (i / 6) * Math.PI;
            C.add('head', capsule(r * 0.17, r * (1.4 + (i % 2) * 0.5), SEG.low), M.hair,
              { pos: [Math.cos(a) * r * 0.80, -r * 0.55, -r * 0.55 + Math.sin(a) * r * 0.30],
                rot: [0.12, 0, Math.cos(a) * 0.22] });
          }
          break;

        default:
          crown(0, 0);
          skirt(-0.12, 0);
          fringe(0.28, 0);
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
        const pw = m.armR * padSpec.w, ph = m.armR * padSpec.h, pd = m.armR * padSpec.d;
        // A domed pauldron: wide at the shoulder, tapering as it wraps down
        // the arm. Flat plates were what made the shoulders look like boxes.
        C.add('shoulder' + side, loft([
          { y: -ph * 1.25, rx: pw * 0.72, rz: pd * 1.30 },
          { y: -ph * 0.45, rx: pw * 1.16, rz: pd * 1.72 },
          { y: ph * 0.35, rx: pw * 1.20, rz: pd * 1.66 },
          { y: ph * 0.95, rx: pw * 0.86, rz: pd * 1.18 },
          { y: ph * 1.25, rx: pw * 0.34, rz: pd * 0.48 }
        ], SEG.mid, 18, { capTop: true, capRound: 0.4 }),
          padStyle === 'sovereign' || padStyle === 'warlord' ? M.trim : M.primary,
          { pos: [sgn * m.armR * 0.30, m.armR * 0.10, 0], rot: [0, 0, sgn * -0.20] });
        if (padSpec.spikes) {
          for (let i = 0; i < padSpec.spikes; i++) {
            C.add('shoulder' + side, cone(m.armR * 0.24, m.armR * (0.9 - i * 0.14), 6), M.metal,
              { pos: [sgn * m.armR * (0.9 + i * 0.30), m.armR * (0.5 - i * 0.16), 0],
                rot: [0, 0, sgn * (-0.9 - i * 0.15)] });
          }
        }
        // Team stripe on the pad — instant friend/foe read from behind.
        C.add('shoulder' + side, plate(pw * 0.50, ph * 0.85, pd * 0.30, pw * 0.14, 0.9), M.team,
          { pos: [sgn * m.armR * 0.30, m.armR * 0.05, pd * 1.55], rot: [0, 0, sgn * -0.20] });
      });
    }

    /* jacket / coat / armour suit */
    const jacket = gear.jacket || 'none';
    if (jacket === 'bomber' || jacket === 'cropped' || jacket === 'workwear' || jacket === 'wrap' ||
        jacket === 'parka' || jacket === 'pelt_tech' || jacket === 'beast_hide') {
      const len = jacket === 'cropped' ? 0.30 : (jacket === 'parka' ? 0.95 : 0.62);
      const pad = 1.09;   // the shell sits just proud of the body beneath it
      // Shell over the chest, echoing the torso's own section profile.
      C.add('chest', loft([
        { y: -m.spineLen * 0.26, rx: cw * 0.84 * pad, rz: cd * 0.98 * pad },
        { y: -m.spineLen * 0.02, rx: cw * 0.96 * pad, rz: cd * 1.12 * pad },
        { y: m.spineLen * 0.20, rx: cw * 1.00 * pad, rz: cd * 1.06 * pad },
        { y: m.chestTop * 0.78, rx: cw * 0.92 * pad, rz: cd * 0.84 * pad },
        { y: m.chestTop * 1.02, rx: cw * 0.66, rz: cd * 0.60 }
      ], SEG.mid, 18), M.cloth, {});
      // Skirt of the jacket falling over the waist.
      C.add('spine', loft([
        { y: -m.spineLen * len * 0.62, rx: cw * 0.74 * pad, rz: cd * 0.88 * pad },
        { y: -m.spineLen * 0.10, rx: cw * 0.70 * pad, rz: cd * 0.84 * pad },
        { y: m.spineLen * 0.34, rx: cw * 0.86 * pad, rz: cd * 1.00 * pad }
      ], SEG.mid, 14, { capBottom: true, capRound: 0.15 }), M.cloth, {});
      // A zip seam down the centre plus narrow lapels, rather than two
      // slabs hung off the chest.
      C.add('chest', plate(cw * 0.10, m.spineLen * 0.86, cd * 0.10, cw * 0.03, 0.5),
        M.secondary, { pos: [0, m.spineLen * 0.02, cd * 1.08] });
      [-1, 1].forEach(s => C.add('chest', plate(cw * 0.22, m.spineLen * 0.44, cd * 0.09, cw * 0.07, 0.9),
        M.secondary, { pos: [s * cw * 0.34, m.spineLen * 0.22, cd * 1.04], rot: [0, s * -0.36, 0] }));
      if (jacket === 'pelt_tech' || jacket === 'beast_hide') {
        for (let i = 0; i < 5; i++) {
          C.add('chest', plate(cw * 0.30, m.spineLen * 0.34, cd * 0.10, cw * 0.10, 0.4), M.leather,
            { pos: [(i - 2) * cw * 0.34, m.spineLen * 0.02, cd * 0.98], rot: [0, 0, (i - 2) * 0.10] });
        }
      }
    } else if (jacket !== 'none') {
      // Plated / armoured torso variants: a hard shell that still follows the
      // body's section profile, so the armour reads as fitted rather than worn
      // over a cylinder.
      const pad = 1.12;
      C.add('chest', loft([
        { y: -m.spineLen * 0.22, rx: cw * 0.86 * pad, rz: cd * 1.00 * pad },
        { y: m.spineLen * 0.02, rx: cw * 1.00 * pad, rz: cd * 1.16 * pad },
        { y: m.spineLen * 0.26, rx: cw * 1.02 * pad, rz: cd * 1.06 * pad },
        { y: m.chestTop * 0.82, rx: cw * 0.90 * pad, rz: cd * 0.82 * pad },
        { y: m.chestTop * 1.06, rx: cw * 0.62, rz: cd * 0.56 }
      ], SEG.high, 20), M.primary, {});
      C.add('chest', plate(cw * 1.3, m.spineLen * 0.20, cd * 0.14, cw * 0.18, 1.0), M.trim,
        { pos: [0, m.spineLen * 0.34, cd * 0.96] });
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
    /* Hides the body without hiding what is parented to its bones — the held
     * weapon stays on screen when the camera is pushed inside the shoulder. */
    out.setBodyVisible = function (v) { out.meshes.forEach(mesh => { mesh.visible = v; }); };

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

  /* ------------------------------------------------------------------ *
   * Two-handed grip IK
   *
   * A pose can only guess where the off hand should be, and a hand floating
   * next to the weapon instead of on it is one of the loudest "this is a
   * prototype" signals there is. This solves the left arm properly: a
   * two-bone analytic solve that puts the hand on the weapon's foregrip
   * socket, wherever pose and aim have moved it to.
   *
   * Lives here rather than in the actor so the character-select stage can
   * use the identical solve — the hero you inspect grips its weapon exactly
   * like the hero you play.
   * ------------------------------------------------------------------ */
  const _ikShoulder = new THREE.Vector3();
  const _ikTarget = new THREE.Vector3();
  const _ikDir = new THREE.Vector3();
  const _ikLocal = new THREE.Vector3();
  const _ikQuat = new THREE.Quaternion();
  const _ikBend = new THREE.Quaternion();
  const _ikMat = new THREE.Matrix3();
  const IK_DOWN = new THREE.Vector3(0, -1, 0);
  const IK_AXIS_X = new THREE.Vector3(1, 0, 0);

  CM.solveGripIK = function (model, socket, weight) {
    if (!model || !socket || weight < 0.02) return;
    const bones = model.bones;
    const shoulder = bones.shoulderL, upper = bones.armUpperL, lower = bones.armLowerL;
    if (!shoulder || !upper || !lower) return;

    shoulder.updateWorldMatrix(true, false);
    socket.updateWorldMatrix(true, false);
    _ikShoulder.setFromMatrixPosition(shoulder.matrixWorld);
    _ikTarget.setFromMatrixPosition(socket.matrixWorld);

    const L1 = model.measure.upperArmLen;
    const L2 = model.measure.lowerArmLen;
    _ikDir.copy(_ikTarget).sub(_ikShoulder);
    let d = _ikDir.length();
    if (d < 1e-4) return;
    // Clamp into the arm's reachable band so acos never goes out of domain.
    d = U.clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    _ikDir.multiplyScalar(1 / _ikDir.length());

    // Direction into the shoulder bone's own frame.
    _ikMat.setFromMatrix4(shoulder.matrixWorld).invert();
    _ikLocal.copy(_ikDir).applyMatrix3(_ikMat).normalize();

    // Law of cosines: shoulder offset from the straight line, elbow interior.
    const shoulderOff = Math.acos(U.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const elbowIn = Math.acos(U.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));

    _ikQuat.setFromUnitVectors(IK_DOWN, _ikLocal);
    _ikBend.setFromAxisAngle(IK_AXIS_X, -shoulderOff);
    _ikQuat.multiply(_ikBend);

    // Blend in, so switching to and from the grip is never a pop.
    upper.quaternion.slerp(_ikQuat, weight);
    const bendX = -(Math.PI - elbowIn);
    lower.rotation.x = U.lerp(lower.rotation.x, bendX, weight);
    lower.rotation.y = U.lerp(lower.rotation.y, 0, weight);
    lower.rotation.z = U.lerp(lower.rotation.z, 0, weight);

    // Roll the hand so the palm faces the weapon rather than the sky.
    const hand = bones.handL;
    if (hand) hand.rotation.set(U.lerp(hand.rotation.x, 0.28, weight), 0,
      U.lerp(hand.rotation.z, 0.22, weight));
  };

})(window.HC, window.THREE);
