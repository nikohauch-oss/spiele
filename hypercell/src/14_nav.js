/* =========================================================================
 * HYPERCELL — 14_nav.js
 * Navigation graph, generated automatically by sampling the collision
 * world. Bots path on this with A*; it also feeds objective routing and
 * "where should I retreat to" queries.
 *
 * Generating rather than hand-authoring means the graph can never fall out
 * of sync with the geometry when the map changes.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  HC.NavGraph = function NavGraph(world, opts) {
    opts = Object.assign({
      spacing: 2.6,
      bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
      maxLevels: 4,
      agentRadius: CFG.body.radius * 1.12,
      agentHeight: CFG.body.height,
      maxStep: CFG.body.stepHeight,
      maxDrop: 3.2,
      probeTop: 34
    }, opts || {});

    const nodes = [];
    const cellIndex = new Map();
    const N = {
      nodes, opts,
      /* --- build ------------------------------------------------------- */
      build() {
        nodes.length = 0; cellIndex.clear();
        const { spacing, bounds } = opts;
        const cols = Math.floor((bounds.maxX - bounds.minX) / spacing) + 1;
        const rows = Math.floor((bounds.maxZ - bounds.minZ) / spacing) + 1;

        for (let ix = 0; ix < cols; ix++) {
          for (let iz = 0; iz < rows; iz++) {
            const x = bounds.minX + ix * spacing;
            const z = bounds.minZ + iz * spacing;
            // Walk down from above, recording each distinct standable level.
            let probeY = opts.probeTop;
            for (let level = 0; level < opts.maxLevels; level++) {
              const g = world.groundHeight(x, probeY, z, opts.probeTop + 5);
              if (g.y === -Infinity) break;
              const y = g.y;
              if (!world.capsuleBlocked(x, y + 0.06, z, opts.agentRadius, opts.agentHeight)) {
                addNode(x, y, z, ix, iz, g.surface);
              }
              probeY = y - 0.35;
              if (probeY < -6) break;
            }
          }
        }

        // Link neighbours (4- and 8-connected) where an agent can actually walk.
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let d = 0; d < dirs.length; d++) {
            const list = cellIndex.get(cellKey(a.ix + dirs[d][0], a.iz + dirs[d][1]));
            if (!list) continue;
            for (let k = 0; k < list.length; k++) {
              const b = list[k];
              if (b === a) continue;
              const dy = b.y - a.y;
              if (dy > opts.maxStep + 0.02 || dy < -opts.maxDrop) continue;
              if (!clearBetween(a, b)) continue;
              const cost = Math.hypot(b.x - a.x, b.z - a.z) + Math.max(0, dy) * 1.6 + Math.max(0, -dy) * 0.4;
              a.links.push({ node: b, cost });
            }
          }
        }
        // Drop orphans so pathfinding never targets an unreachable island.
        for (let i = nodes.length - 1; i >= 0; i--) if (!nodes[i].links.length) removeNode(i);
        for (let i = 0; i < nodes.length; i++) nodes[i].index = i;

        HC.Log.info('Nav', 'graph built: ' + nodes.length + ' nodes');
        return N;
      },

      /* --- queries ----------------------------------------------------- */
      nearest(pos, maxDist) {
        let best = null, bestD = (maxDist || 14) * (maxDist || 14);
        // Search the local cells first, widening if nothing is found.
        for (let ring = 0; ring <= 4 && !best; ring++) {
          const ix = Math.round((pos.x - opts.bounds.minX) / opts.spacing);
          const iz = Math.round((pos.z - opts.bounds.minZ) / opts.spacing);
          for (let dx = -ring; dx <= ring; dx++) {
            for (let dz = -ring; dz <= ring; dz++) {
              if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
              const list = cellIndex.get(cellKey(ix + dx, iz + dz));
              if (!list) continue;
              for (let i = 0; i < list.length; i++) {
                const n = list[i];
                const d = (n.x - pos.x) * (n.x - pos.x) + (n.z - pos.z) * (n.z - pos.z) + (n.y - pos.y) * (n.y - pos.y) * 2.2;
                if (d < bestD) { bestD = d; best = n; }
              }
            }
          }
        }
        return best;
      },

      /** A* between two world positions. Returns an array of Vector3 or null. */
      findPath(from, to, out) {
        const start = N.nearest(from);
        const goal = N.nearest(to);
        if (!start || !goal) return null;
        if (start === goal) { const r = out || []; r.length = 0; r.push(new THREE.Vector3(goal.x, goal.y, goal.z)); return r; }

        searchStamp++;
        open.length = 0;
        start.g = 0;
        start.f = heuristic(start, goal);
        start.parent = null;
        start.stamp = searchStamp;
        start.closed = false;
        pushOpen(start);

        let guard = 0;
        while (open.length && guard++ < 6000) {
          const current = popOpen();
          if (current === goal) return reconstruct(goal, out);
          current.closed = true;
          for (let i = 0; i < current.links.length; i++) {
            const link = current.links[i];
            const nb = link.node;
            if (nb.stamp !== searchStamp) {
              nb.stamp = searchStamp; nb.g = Infinity; nb.closed = false; nb.parent = null; nb.heapIndex = -1;
            }
            if (nb.closed) continue;
            const g = current.g + link.cost;
            if (g < nb.g) {
              nb.g = g;
              nb.f = g + heuristic(nb, goal);
              nb.parent = current;
              pushOpen(nb);
            }
          }
        }
        return null;
      },

      /** Straight-line shortcut test used to smooth paths. */
      canWalkDirect(a, b) {
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8);
        if (steps <= 1) return true;
        let prevY = a.y;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = U.lerp(a.x, b.x, t), z = U.lerp(a.z, b.z, t);
          const g = world.groundHeight(x, prevY + opts.maxStep + 0.3, z, opts.maxDrop + 1.5);
          if (g.y === -Infinity) return false;
          if (g.y - prevY > opts.maxStep + 0.05) return false;
          if (world.capsuleBlocked(x, g.y + 0.06, z, opts.agentRadius, opts.agentHeight)) return false;
          prevY = g.y;
        }
        return true;
      },

      /** Random reachable point near a position — used for bot repositioning. */
      randomNear(pos, radius, rnd) {
        const candidates = [];
        for (let i = 0; i < nodes.length; i += 3) {
          const n = nodes[i];
          const d = Math.hypot(n.x - pos.x, n.z - pos.z);
          if (d < radius && d > radius * 0.35) candidates.push(n);
        }
        if (!candidates.length) return null;
        const n = candidates[Math.floor((rnd ? rnd() : Math.random()) * candidates.length)];
        return new THREE.Vector3(n.x, n.y, n.z);
      },

      debugPoints() { return nodes.map(n => new THREE.Vector3(n.x, n.y, n.z)); }
    };

    /* ---- internals ---------------------------------------------------- */
    function cellKey(ix, iz) { return ix * 4096 + iz; }

    function addNode(x, y, z, ix, iz, surface) {
      const n = { x, y, z, ix, iz, surface, links: [], g: 0, f: 0, parent: null,
        stamp: 0, closed: false, heapIndex: -1, index: nodes.length, flags: 0 };
      nodes.push(n);
      const k = cellKey(ix, iz);
      let list = cellIndex.get(k);
      if (!list) { list = []; cellIndex.set(k, list); }
      list.push(n);
      return n;
    }

    function removeNode(i) {
      const n = nodes[i];
      const list = cellIndex.get(cellKey(n.ix, n.iz));
      if (list) { const j = list.indexOf(n); if (j >= 0) list.splice(j, 1); }
      nodes.splice(i, 1);
    }

    function clearBetween(a, b) {
      const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
      const my = Math.max(a.y, b.y);
      if (world.capsuleBlocked(mx, my + 0.06, mz, opts.agentRadius * 0.92, opts.agentHeight * 0.92)) return false;
      const g = world.groundHeight(mx, my + opts.maxStep + 0.2, mz, opts.maxDrop + 1);
      if (g.y === -Infinity) return false;
      if (Math.abs(g.y - my) > opts.maxStep + 0.35 && Math.abs(g.y - Math.min(a.y, b.y)) > opts.maxStep + 0.35) return false;
      return true;
    }

    function heuristic(a, b) {
      return Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.2;
    }

    /* Binary heap for the open set. */
    const open = [];
    let searchStamp = 1;
    function pushOpen(n) {
      if (n.heapIndex >= 0 && open[n.heapIndex] === n) { siftUp(n.heapIndex); return; }
      open.push(n); n.heapIndex = open.length - 1; siftUp(n.heapIndex);
    }
    function popOpen() {
      const top = open[0];
      const last = open.pop();
      top.heapIndex = -1;
      if (open.length) { open[0] = last; last.heapIndex = 0; siftDown(0); }
      return top;
    }
    function siftUp(i) {
      const n = open[i];
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p].f <= n.f) break;
        open[i] = open[p]; open[i].heapIndex = i; i = p;
      }
      open[i] = n; n.heapIndex = i;
    }
    function siftDown(i) {
      const n = open[i], len = open.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < len && open[l].f < open[s].f) s = l;
        if (r < len && open[r].f < open[s].f) s = r;
        if (s === i) break;
        open[i] = open[s]; open[i].heapIndex = i; i = s;
      }
      open[i] = n; n.heapIndex = i;
    }

    function reconstruct(goal, out) {
      const result = out || [];
      result.length = 0;
      let n = goal, guard = 0;
      while (n && guard++ < 4000) { result.push(new THREE.Vector3(n.x, n.y, n.z)); n = n.parent; }
      result.reverse();
      // String-pull: drop waypoints we can walk past directly.
      if (result.length > 2) {
        const smoothed = [result[0]];
        let i = 0;
        while (i < result.length - 1) {
          let j = result.length - 1;
          for (; j > i + 1; j--) if (N.canWalkDirect(result[i], result[j])) break;
          smoothed.push(result[j]);
          i = j;
        }
        result.length = 0;
        for (let k = 0; k < smoothed.length; k++) result.push(smoothed[k]);
      }
      return result;
    }

    return N;
  };

})(window.HC, window.THREE);
