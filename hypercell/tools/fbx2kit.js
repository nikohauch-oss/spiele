#!/usr/bin/env node
'use strict';
/* =========================================================================
 * HYPERCELL — tools/fbx2kit.js
 *
 * Converts the CC0 modular prototyping kit (binary FBX) into a compact JS
 * module the build can inline, so the game stays one self-contained file.
 *
 *   node hypercell/tools/fbx2kit.js <asset-root> [--out src/14a_kit.js]
 *
 * What it does:
 *   - reads every .fbx under Pieces/ (and Character/ for reference)
 *   - bakes the model transform chain into the vertices
 *   - converts Blender's Z-up to the game's Y-up
 *   - recentres each piece on its own footprint so placement code can think
 *     in terms of "put the ladder here", not "compensate for the pivot"
 *   - welds vertices (position + normal, so flat facets stay flat)
 *   - quantises to a fixed grid and emits indexed arrays
 *
 * UVs are dropped on purpose: every piece in this pack maps its whole mesh
 * to a single cell of an 8x8 palette PNG, so the UVs carry no information —
 * the game assigns its own materials instead.
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { readScene } = require('./fbx.js');

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node fbx2kit.js <asset-root> [--out <file>]');
  process.exit(1);
}
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 && process.argv[outArg + 1]
  ? path.resolve(process.argv[outArg + 1])
  : path.resolve(__dirname, '..', 'src', '14a_kit.js');

/* Pieces worth importing.
 *
 * The pack is a grey-box kit: most of it is cubes, spheres, cones and plain
 * wall slabs that this game already generates procedurally, with more detail.
 * What it has that the game does not is *fabricated* props — things made of
 * bars and rungs, which are tedious and expensive to author procedurally.
 * Those are the ones taken. */
const WANTED = {
  'ladder.fbx': 'ladder',
  'ladder1.fbx': 'ladderLong',
  'railing.fbx': 'railing',
  'railing edge.fbx': 'railingCorner',
  'fence.fbx': 'fence',
  'fence2.fbx': 'fencePanel',
  'fence3.fbx': 'fenceLow',
  'fence edge.fbx': 'fenceCorner',
  'fence wood.fbx': 'fenceWood',
  'stairs.fbx': 'stairs',
  'stairs1.fbx': 'stairsLow',
  'stairs2.fbx': 'stairsBlock',
  'stairs corner.fbx': 'stairsCorner',
  'stairs corner1.fbx': 'stairsCornerB',
  'ramp.fbx': 'ramp',
  'ramp1.fbx': 'rampLow',
  'door.fbx': 'door',
  'door1.fbx': 'doorSlim',
  'door2.fbx': 'doorTall',
  'door3.fbx': 'doorTallSlim',
  'window.fbx': 'windowFrame',
  'window1.fbx': 'windowFrameSlim',
  'wall window.fbx': 'wallWindow',
  'wall window1.fbx': 'wallWindowWide',
  'wall door.fbx': 'wallDoor',
  'spikes small.fbx': 'spikeSmall',
  'spikes big.fbx': 'spikeBig',
  'spike.fbx': 'spikeRow',
  'arrow.fbx': 'arrow',
  'coin.fbx': 'coin',
  'key.fbx': 'key',
  'torus.fbx': 'torus',
  'toggle switch.fbx': 'toggle',
  'pillar.fbx': 'pillar',
  'pillar1.fbx': 'pillarShort',
  'pillar3.fbx': 'pillarRound',
  'pillar4.fbx': 'pillarWide'
};

const Q = 1e4;                       // quantisation grid for positions
const round = v => Math.round(v * Q) / Q;

function applyEuler(v, r) {
  // FBX default rotation order is XYZ, applied as R = Rz * Ry * Rx.
  let [x, y, z] = v;
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  let y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1;
  let x1 = x * cy + z * sy; z1 = -x * sy + z * cy; x = x1; z = z1;
  x1 = x * cz - y * sz; y1 = x * sz + y * cz; x = x1; y = y1;
  return [x, y, z];
}

/**
 * Bakes a mesh's transform chain into its vertices and returns metres.
 *
 * This pack declares UpAxis = Y and carries the Z-up-to-Y-up correction in
 * each model's own -90 degree X rotation, so applying the transform is the
 * whole axis conversion — swapping axes again on top of it lays every piece
 * on its side. The models also carry a scale of 100 against a file whose
 * unit is the centimetre, which is where `scale` comes in.
 */
function bake(mesh, scale) {
  const g = mesh.geometry;
  const pos = [], nrm = [];
  const src = g.position, sn = g.normal;
  for (let i = 0; i < src.length; i += 3) {
    let p = [src[i], src[i + 1], src[i + 2]];
    let n = sn ? [sn[i], sn[i + 1], sn[i + 2]] : [0, 1, 0];
    for (const t of mesh.transforms) {
      p = [p[0] * t.scale[0], p[1] * t.scale[1], p[2] * t.scale[2]];
      p = applyEuler(p, t.rotation);
      p = [p[0] + t.position[0], p[1] + t.position[1], p[2] + t.position[2]];
      n = applyEuler(n, t.rotation);
    }
    pos.push(p[0] * scale, p[1] * scale, p[2] * scale);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    nrm.push(n[0] / len, n[1] / len, n[2] / len);
  }
  return { pos, nrm };
}

function convert(file, name) {
  const scene = readScene(file);
  if (!scene.meshes.length) return null;

  const scale = 0.01 * (scene.unitScaleFactor || 1);
  const pos = [], nrm = [];
  for (const m of scene.meshes) {
    const b = bake(m, scale);
    pos.push(...b.pos);
    nrm.push(...b.nrm);
  }

  // Recentre on the footprint: X/Z centred, Y resting on zero. Placement code
  // should never have to know where the artist happened to put the origin.
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (pos[i + k] < lo[k]) lo[k] = pos[i + k];
      if (pos[i + k] > hi[k]) hi[k] = pos[i + k];
    }
  }
  const off = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= off[0]; pos[i + 1] -= off[1]; pos[i + 2] -= off[2];
  }

  // Weld on position+normal so flat facets stay flat and smooth runs merge.
  const map = new Map();
  const P = [], N = [], idx = [];
  for (let i = 0; i < pos.length; i += 3) {
    const px = round(pos[i]), py = round(pos[i + 1]), pz = round(pos[i + 2]);
    const nx = Math.round(nrm[i] * 100) / 100;
    const ny = Math.round(nrm[i + 1] * 100) / 100;
    const nz = Math.round(nrm[i + 2] * 100) / 100;
    const key = px + ',' + py + ',' + pz + ',' + nx + ',' + ny + ',' + nz;
    let k = map.get(key);
    if (k === undefined) {
      k = P.length / 3;
      map.set(key, k);
      P.push(px, py, pz);
      N.push(nx, ny, nz);
    }
    idx.push(k);
  }

  return {
    name,
    size: [round(hi[0] - lo[0]), round(hi[1] - lo[1]), round(hi[2] - lo[2])],
    verts: P.length / 3,
    tris: idx.length / 3,
    p: P, n: N, i: idx
  };
}

/* ---- run ---------------------------------------------------------- */
const piecesDir = path.join(ROOT, 'Pieces');
const files = fs.readdirSync(piecesDir).filter(f => f.toLowerCase().endsWith('.fbx'));

const kit = [];
const missing = [];
for (const [file, name] of Object.entries(WANTED)) {
  const match = files.find(f => f.toLowerCase() === file.toLowerCase());
  if (!match) { missing.push(file); continue; }
  try {
    const c = convert(path.join(piecesDir, match), name);
    if (c) kit.push(c);
  } catch (e) {
    console.error('  ! ' + file + ': ' + e.message);
  }
}

kit.sort((a, b) => a.name.localeCompare(b.name));

const lines = [];
lines.push('/* =========================================================================');
lines.push(' * HYPERCELL — 14a_kit.js');
lines.push(' *');
lines.push(' * Prop meshes converted from the CC0 "Free 3D Modular Game Assets For');
lines.push(' * Prototyping" pack by Raphael Gonçalves (rgsdev). CC0 / public domain:');
lines.push(' * free for any use, commercial included, credit not required — credited');
lines.push(' * here anyway.');
lines.push(' *');
lines.push(' * GENERATED FILE — do not edit by hand.');
lines.push(' *   node hypercell/tools/fbx2kit.js <asset-root>');
lines.push(' *');
lines.push(' * Only the fabricated pieces are taken: ladders, railings, fences, stairs,');
lines.push(' * door and window frames, hazards and pickups. The pack\'s walls, cubes,');
lines.push(' * spheres and cones are plain primitives that the map already generates');
lines.push(' * with more detail, and its character is a 556-triangle grey-box figure —');
lines.push(' * importing either would have made the game look cheaper, not richer.');
lines.push(' *');
lines.push(' * Coordinates are metres, Y-up, each piece centred on its footprint with');
lines.push(' * its base resting on y = 0.');
lines.push(' * ========================================================================= */');
lines.push('(function (HC, THREE) {');
lines.push("  'use strict';");
lines.push('');
lines.push('  const DATA = {');
for (const k of kit) {
  lines.push('    ' + k.name + ': {');
  lines.push('      size: [' + k.size.join(', ') + '],');
  lines.push('      p: [' + k.p.join(',') + '],');
  lines.push('      n: [' + k.n.join(',') + '],');
  lines.push('      i: [' + k.i.join(',') + ']');
  lines.push('    },');
}
lines.push('  };');
lines.push('');
lines.push('  const cache = new Map();');
lines.push('');
lines.push('  const Kit = HC.Kit = {');
lines.push('    /** Names of every available prop. */');
lines.push('    names() { return Object.keys(DATA); },');
lines.push('    /** Footprint of a prop, in metres, as [x, y, z]. */');
lines.push('    size(name) { const d = DATA[name]; return d ? d.size.slice() : null; },');
lines.push('    /**');
lines.push('     * Returns the shared BufferGeometry for a prop, built on first use.');
lines.push('     * Callers must not mutate it — clone if you need to transform.');
lines.push('     */');
lines.push('    geometry(name) {');
lines.push('      if (cache.has(name)) return cache.get(name);');
lines.push('      const d = DATA[name];');
lines.push('      if (!d) {');
lines.push("        HC.Log.warn('Kit', 'unknown prop \"' + name + '\"');");
lines.push('        return null;');
lines.push('      }');
lines.push('      const g = new THREE.BufferGeometry();');
lines.push("      g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));");
lines.push("      g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));");
lines.push('      g.setIndex(d.i);');
lines.push('      // The pack ships no useful UVs (every piece maps to one palette cell),');
lines.push('      // so give it a planar set the game\'s own materials can tile against.');
lines.push('      const p = g.attributes.position, uv = new Float32Array(p.count * 2);');
lines.push('      for (let k = 0; k < p.count; k++) {');
lines.push('        uv[k * 2] = p.getX(k) * 0.5 + p.getZ(k) * 0.5;');
lines.push('        uv[k * 2 + 1] = p.getY(k) * 0.5;');
lines.push('      }');
lines.push("      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));");
lines.push('      g.computeBoundingSphere();');
lines.push('      cache.set(name, g);');
lines.push('      return g;');
lines.push('    },');
lines.push('    /** Frees every built geometry. */');
lines.push('    dispose() {');
lines.push('      cache.forEach(g => { try { g.dispose(); } catch (e) {} });');
lines.push('      cache.clear();');
lines.push('    }');
lines.push('  };');
lines.push('');
lines.push('  void Kit;');
lines.push('})(window.HC, window.THREE);');

fs.writeFileSync(OUT, lines.join('\n') + '\n');

const totalTris = kit.reduce((a, k) => a + k.tris, 0);
console.log('kit: ' + kit.length + ' props, ' + totalTris + ' triangles');
kit.forEach(k => console.log('  ' + k.name.padEnd(18) +
  ' tris=' + String(k.tris).padStart(5) +
  ' verts=' + String(k.verts).padStart(5) +
  ' size=' + k.size.map(v => v.toFixed(2)).join(' x ')));
if (missing.length) console.log('  missing: ' + missing.join(', '));
console.log('-> ' + path.relative(process.cwd(), OUT) +
  ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
