/* =========================================================================
 * HYPERCELL — 13_physics.js
 * Deterministic collision world built from axis-aligned boxes and sloped
 * ramps, accelerated by a uniform spatial hash.
 *
 * Design note: a hero shooter does not need a general rigid-body solver —
 * it needs movement that is *predictable*. Axis-separated capsule sweeps
 * with auto step-up give exactly that, plus cheap, exact raycasts for
 * hitscan weapons and camera collision.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const CELL = 8;

  function key(ix, iy, iz) { return ix + ',' + iy + ',' + iz; }

  HC.PhysicsWorld = function PhysicsWorld() {
    const boxes = [];
    const ramps = [];
    const grid = new Map();
    let nextId = 1;

    const W = {
      boxes, ramps,
      gravity: CFG.sim.gravity,

      /* ---- construction ------------------------------------------------ */
      addBox(min, max, surface, opts) {
        opts = opts || {};
        const b = {
          id: nextId++, kind: 'box',
          minX: Math.min(min.x, max.x), minY: Math.min(min.y, max.y), minZ: Math.min(min.z, max.z),
          maxX: Math.max(min.x, max.x), maxY: Math.max(min.y, max.y), maxZ: Math.max(min.z, max.z),
          surface: surface || 'concrete',
          blocksMovement: opts.blocksMovement !== false,
          blocksProjectiles: opts.blocksProjectiles !== false,
          blocksSight: opts.blocksSight !== false,
          owner: opts.owner || null,
          team: opts.team || null,
          enabled: true
        };
        boxes.push(b);
        index(b);
        return b;
      },

      /** Sloped surface. Height rises along `axis` from min to max. */
      addRamp(min, max, axis, ascending, surface) {
        const r = {
          id: nextId++, kind: 'ramp',
          minX: Math.min(min.x, max.x), minY: Math.min(min.y, max.y), minZ: Math.min(min.z, max.z),
          maxX: Math.max(min.x, max.x), maxY: Math.max(min.y, max.y), maxZ: Math.max(min.z, max.z),
          axis: axis === 'x' ? 'x' : 'z',
          ascending: ascending !== false,
          surface: surface || 'concrete',
          blocksMovement: true, blocksProjectiles: true, blocksSight: true,
          enabled: true
        };
        ramps.push(r);
        index(r);
        return r;
      },

      removeShape(shape) {
        shape.enabled = false;
        const arr = shape.kind === 'ramp' ? ramps : boxes;
        const i = arr.indexOf(shape);
        if (i >= 0) arr.splice(i, 1);
        unindex(shape);
      },

      setEnabled(shape, on) { shape.enabled = !!on; },

      /** Move a shape's bounds and re-index it in the spatial hash.
       *  Anything that follows a player (Brutus' shield) must use this —
       *  mutating the bounds alone leaves the shape in its old cells. */
      moveBox(shape, minX, minY, minZ, maxX, maxY, maxZ) {
        if (shape.minX === minX && shape.minY === minY && shape.minZ === minZ &&
            shape.maxX === maxX && shape.maxY === maxY && shape.maxZ === maxZ) return shape;
        unindex(shape);
        shape.minX = minX; shape.minY = minY; shape.minZ = minZ;
        shape.maxX = maxX; shape.maxY = maxY; shape.maxZ = maxZ;
        index(shape);
        return shape;
      },

      clear() {
        boxes.length = 0; ramps.length = 0; grid.clear(); nextId = 1;
      },

      get shapeCount() { return boxes.length + ramps.length; },

      /* ---- queries ----------------------------------------------------- */
      /** Height of the walkable surface of a ramp at a world XZ point. */
      rampHeight(r, x, z) {
        const t = r.axis === 'x'
          ? U.clamp01((x - r.minX) / Math.max(0.0001, r.maxX - r.minX))
          : U.clamp01((z - r.minZ) / Math.max(0.0001, r.maxZ - r.minZ));
        return U.lerp(r.minY, r.maxY, r.ascending ? t : 1 - t);
      },

      rampNormal(r, out) {
        const run = r.axis === 'x' ? (r.maxX - r.minX) : (r.maxZ - r.minZ);
        const rise = r.maxY - r.minY;
        const s = r.ascending ? -1 : 1;
        if (r.axis === 'x') out.set(s * rise, run, 0);
        else out.set(0, run, s * rise);
        return out.normalize();
      },

      /** Collect shapes whose AABB overlaps the query box. */
      query(minX, minY, minZ, maxX, maxY, maxZ, out) {
        out.length = 0;
        const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
        const y0 = Math.floor(minY / CELL), y1 = Math.floor(maxY / CELL);
        const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
              const cell = grid.get(key(x, y, z));
              if (!cell) continue;
              for (let i = 0; i < cell.length; i++) {
                const s = cell[i];
                if (!s.enabled || s._mark === queryStamp) continue;
                if (s.maxX < minX || s.minX > maxX) continue;
                if (s.maxY < minY || s.minY > maxY) continue;
                if (s.maxZ < minZ || s.minZ > maxZ) continue;
                s._mark = queryStamp;
                out.push(s);
              }
            }
          }
        }
        queryStamp++;
        return out;
      },

      /**
       * Ray vs world. Returns null or a hit record.
       * @param filter optional (shape) => boolean
       */
      raycast(origin, dir, maxDist, filter, mode) {
        mode = mode || 'projectiles';
        let best = null;
        const pad = 0.001;
        const ex = Math.abs(dir.x) * maxDist, ey = Math.abs(dir.y) * maxDist, ez = Math.abs(dir.z) * maxDist;
        const list = W.query(
          Math.min(origin.x, origin.x + dir.x * maxDist) - pad,
          Math.min(origin.y, origin.y + dir.y * maxDist) - pad,
          Math.min(origin.z, origin.z + dir.z * maxDist) - pad,
          Math.max(origin.x, origin.x + dir.x * maxDist) + pad,
          Math.max(origin.y, origin.y + dir.y * maxDist) + pad,
          Math.max(origin.z, origin.z + dir.z * maxDist) + pad,
          _scratchA);

        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (mode === 'sight' && !s.blocksSight) continue;
          if (mode === 'projectiles' && !s.blocksProjectiles) continue;
          if (mode === 'movement' && !s.blocksMovement) continue;
          if (filter && !filter(s)) continue;
          const h = s.kind === 'ramp' ? rayRamp(origin, dir, maxDist, s) : rayBox(origin, dir, maxDist, s);
          if (h && (!best || h.distance < best.distance)) best = h;
        }
        return best;
      },

      /** Is there clear line of sight between two world points? */
      lineOfSight(a, b, filter) {
        _dir.copy(b).sub(a);
        const d = _dir.length();
        if (d < 0.001) return true;
        _dir.multiplyScalar(1 / d);
        return !W.raycast(a, _dir, d - 0.05, filter, 'sight');
      },

      /** Nearest ground height under a point, or -Infinity. */
      groundHeight(x, y, z, maxDrop) {
        const list = W.query(x - 0.01, y - (maxDrop || 40), z - 0.01, x + 0.01, y + 0.1, z + 0.01, _scratchB);
        let best = -Infinity, surface = 'concrete';
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (!s.blocksMovement) continue;
          if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
          const top = s.kind === 'ramp' ? W.rampHeight(s, x, z) : s.maxY;
          if (top <= y + 0.05 && top > best) { best = top; surface = s.surface; }
        }
        return { y: best, surface };
      },

      /**
       * Move a vertical capsule through the world.
       * @param pos      THREE.Vector3, feet position (mutated)
       * @param vel      THREE.Vector3, velocity (mutated on collision)
       * @param radius   capsule radius
       * @param height   capsule height
       * @param dt       timestep
       * @param state    { grounded, groundSurface, stepUp }
       */
      moveCapsule(pos, vel, radius, height, dt, state) {
        state = state || {};
        state.hitWall = false;
        state.hitCeiling = false;
        state.steppedUp = 0;
        const wasGrounded = state.grounded;
        state.grounded = false;
        state.groundSurface = 'concrete';

        const maxStep = 0.35;   // sub-stepping keeps fast movers from tunnelling
        const dist = Math.hypot(vel.x * dt, vel.y * dt, vel.z * dt);
        const steps = Math.min(8, Math.max(1, Math.ceil(dist / maxStep)));
        const sdt = dt / steps;

        for (let s = 0; s < steps; s++) {
          // --- horizontal X ---
          if (vel.x !== 0) sweepAxis(pos, vel, radius, height, sdt, 0, state, maxStep);
          // --- horizontal Z ---
          if (vel.z !== 0) sweepAxis(pos, vel, radius, height, sdt, 2, state, maxStep);
          // --- vertical Y ---
          sweepVertical(pos, vel, radius, height, sdt, state, wasGrounded);
        }

        // Snap to ground when running down small steps so the camera doesn't hop.
        if (!state.grounded && wasGrounded && vel.y <= 0.5) {
          const g = W.groundHeight(pos.x, pos.y + 0.1, pos.z, CFG.body.groundSnap + 0.2);
          if (g.y > -Infinity && pos.y - g.y <= CFG.body.groundSnap) {
            pos.y = g.y;
            vel.y = 0;
            state.grounded = true;
            state.groundSurface = g.surface;
          }
        }
        return state;
      },

      /** Does a capsule at this position overlap solid geometry? */
      capsuleBlocked(x, y, z, radius, height) {
        const list = W.query(x - radius, y + 0.02, z - radius, x + radius, y + height - 0.02, z + radius, _scratchB);
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (!s.blocksMovement) continue;
          if (s.kind === 'ramp') {
            const top = W.rampHeight(s, U.clamp(x, s.minX, s.maxX), U.clamp(z, s.minZ, s.maxZ));
            if (top > y + 0.05 && s.minY < y + height) return true;
          } else return true;
        }
        return false;
      },

      /** All shapes overlapping a sphere — used by explosions for cover checks. */
      overlapSphere(center, radius, out) {
        return W.query(center.x - radius, center.y - radius, center.z - radius,
          center.x + radius, center.y + radius, center.z + radius, out);
      }
    };

    /* ---- spatial hash ------------------------------------------------- */
    let queryStamp = 1;
    const _scratchA = [], _scratchB = [], _scratchC = [];
    const _dir = new THREE.Vector3();

    function index(s) {
      s._cells = [];
      const x0 = Math.floor(s.minX / CELL), x1 = Math.floor(s.maxX / CELL);
      const y0 = Math.floor(s.minY / CELL), y1 = Math.floor(s.maxY / CELL);
      const z0 = Math.floor(s.minZ / CELL), z1 = Math.floor(s.maxZ / CELL);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const k = key(x, y, z);
        let cell = grid.get(k);
        if (!cell) { cell = []; grid.set(k, cell); }
        cell.push(s);
        s._cells.push(cell);
      }
    }
    function unindex(s) {
      (s._cells || []).forEach(cell => {
        const i = cell.indexOf(s);
        if (i >= 0) cell.splice(i, 1);
      });
      s._cells = null;
    }

    /* ---- sweeps ------------------------------------------------------- */
    function sweepAxis(pos, vel, radius, height, dt, axis, state, maxStep) {
      const comp = axis === 0 ? 'x' : 'z';
      const delta = vel[comp] * dt;
      if (delta === 0) return;
      pos[comp] += delta;

      const list = W.query(pos.x - radius, pos.y + 0.05, pos.z - radius,
        pos.x + radius, pos.y + height - 0.05, pos.z + radius, _scratchC);
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.blocksMovement) continue;

        if (s.kind === 'ramp') {
          // Ramps are walkable: only block if the surface is above head height.
          const top = W.rampHeight(s, U.clamp(pos.x, s.minX, s.maxX), U.clamp(pos.z, s.minZ, s.maxZ));
          if (top <= pos.y + CFG.body.stepHeight) continue;
          if (s.minY > pos.y + height) continue;
        } else {
          if (s.maxY <= pos.y + 0.05) continue;                 // below the feet
          if (s.minY >= pos.y + height - 0.05) continue;        // above the head
          // Auto step-up: if the top is a short hop away and there is room, climb.
          const stepTarget = s.maxY;
          if (stepTarget - pos.y <= CFG.body.stepHeight && stepTarget - pos.y > 0 &&
              !W.capsuleBlocked(pos.x, stepTarget + 0.02, pos.z, radius, height)) {
            state.steppedUp += stepTarget - pos.y;
            pos.y = stepTarget + 0.001;
            continue;
          }
        }

        // Push out along this axis only.
        const top = s.kind === 'ramp' ? s.maxY : s.maxY;
        if (delta > 0) pos[comp] = (comp === 'x' ? s.minX : s.minZ) - radius - 0.001;
        else pos[comp] = (comp === 'x' ? s.maxX : s.maxZ) + radius + 0.001;
        vel[comp] = 0;
        state.hitWall = true;
      }
    }

    function sweepVertical(pos, vel, radius, height, dt, state, wasGrounded) {
      const delta = vel.y * dt;
      pos.y += delta;

      const list = W.query(pos.x - radius, pos.y - 0.05, pos.z - radius,
        pos.x + radius, pos.y + height + 0.05, pos.z + radius, _scratchC);

      let landed = false, landY = -Infinity, landSurface = 'concrete';
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.blocksMovement) continue;

        let top, bottom;
        if (s.kind === 'ramp') {
          top = W.rampHeight(s, U.clamp(pos.x, s.minX, s.maxX), U.clamp(pos.z, s.minZ, s.maxZ));
          bottom = s.minY;
        } else { top = s.maxY; bottom = s.minY; }

        if (vel.y <= 0 && pos.y < top && pos.y > top - Math.max(0.6, Math.abs(delta) + 0.35)) {
          if (top > landY) { landY = top; landSurface = s.surface; landed = true; }
        } else if (vel.y > 0 && pos.y + height > bottom && pos.y + height < bottom + Math.abs(delta) + 0.3 && pos.y < bottom) {
          pos.y = bottom - height - 0.001;
          vel.y = 0;
          state.hitCeiling = true;
        }
      }
      if (landed) {
        pos.y = landY;
        if (vel.y < 0) { state.impactSpeed = -vel.y; vel.y = 0; }
        state.grounded = true;
        state.groundSurface = landSurface;
      }
    }

    /* ---- ray primitives ------------------------------------------------ */
    function rayBox(o, d, maxDist, b) {
      let tmin = 0, tmax = maxDist;
      // X
      if (Math.abs(d.x) < 1e-8) { if (o.x < b.minX || o.x > b.maxX) return null; }
      else {
        const inv = 1 / d.x;
        let t1 = (b.minX - o.x) * inv, t2 = (b.maxX - o.x) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
      if (Math.abs(d.y) < 1e-8) { if (o.y < b.minY || o.y > b.maxY) return null; }
      else {
        const inv = 1 / d.y;
        let t1 = (b.minY - o.y) * inv, t2 = (b.maxY - o.y) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
      if (Math.abs(d.z) < 1e-8) { if (o.z < b.minZ || o.z > b.maxZ) return null; }
      else {
        const inv = 1 / d.z;
        let t1 = (b.minZ - o.z) * inv, t2 = (b.maxZ - o.z) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
      if (tmin < 0.0001) return null;

      const px = o.x + d.x * tmin, py = o.y + d.y * tmin, pz = o.z + d.z * tmin;
      // Determine which face was hit by proximity.
      const eps = 0.004;
      let nx = 0, ny = 0, nz = 0;
      if (Math.abs(px - b.minX) < eps) nx = -1;
      else if (Math.abs(px - b.maxX) < eps) nx = 1;
      else if (Math.abs(py - b.minY) < eps) ny = -1;
      else if (Math.abs(py - b.maxY) < eps) ny = 1;
      else if (Math.abs(pz - b.minZ) < eps) nz = -1;
      else nz = 1;

      return {
        distance: tmin, shape: b, surface: b.surface,
        point: new THREE.Vector3(px, py, pz),
        normal: new THREE.Vector3(nx, ny, nz)
      };
    }

    const _n = new THREE.Vector3();
    function rayRamp(o, d, maxDist, r) {
      // Intersect the sloped plane, then verify the point is inside the footprint.
      W.rampNormal(r, _n);
      const px = r.axis === 'x' ? (r.ascending ? r.minX : r.maxX) : r.minX;
      const pz = r.axis === 'z' ? (r.ascending ? r.minZ : r.maxZ) : r.minZ;
      const p0y = r.ascending ? r.minY : r.minY;
      const denom = _n.x * d.x + _n.y * d.y + _n.z * d.z;
      let best = null;
      if (Math.abs(denom) > 1e-8) {
        const ox = o.x - (r.axis === 'x' ? px : r.minX);
        const oy = o.y - p0y;
        const oz = o.z - (r.axis === 'z' ? pz : r.minZ);
        const t = -(_n.x * ox + _n.y * oy + _n.z * oz) / denom;
        if (t > 0.0001 && t < maxDist) {
          const hx = o.x + d.x * t, hy = o.y + d.y * t, hz = o.z + d.z * t;
          if (hx >= r.minX - 0.02 && hx <= r.maxX + 0.02 && hz >= r.minZ - 0.02 && hz <= r.maxZ + 0.02) {
            const surf = W.rampHeight(r, hx, hz);
            if (Math.abs(hy - surf) < 0.06) {
              best = { distance: t, shape: r, surface: r.surface,
                point: new THREE.Vector3(hx, hy, hz), normal: _n.clone() };
            }
          }
        }
      }
      // Fall back to the ramp's solid body (sides / underside).
      if (!best) {
        const bodyHit = rayBox(o, d, maxDist, r);
        if (bodyHit) {
          const surf = W.rampHeight(r, bodyHit.point.x, bodyHit.point.z);
          if (bodyHit.point.y <= surf + 0.05) best = bodyHit;
        }
      }
      return best;
    }

    return W;
  };

})(window.HC, window.THREE);
