'use strict';
/* =========================================================================
 * HYPERCELL — tools/fbx.js
 *
 * A minimal reader for binary FBX (Kaydara, version 7000–7700). Only what is
 * needed to lift static meshes out of an asset pack: the node tree, geometry
 * vertex/index/normal/UV arrays, model transforms and the connection graph.
 *
 * This exists because the container has no Blender, no assimp and no
 * FBX2glTF, and because three.js's FBXLoader is an examples module that is
 * not in the UMD core build the game vendors. Converting offline also keeps
 * the shipped game a single self-contained file.
 *
 * Not supported (not needed here): animation curves, skinning clusters,
 * embedded media, ASCII FBX.
 * ========================================================================= */
const fs = require('fs');
const zlib = require('zlib');

/* ------------------------------------------------------------------ *
 * Low-level node reader
 * ------------------------------------------------------------------ */

function readProperty(buf, cur) {
  const type = String.fromCharCode(buf.readUInt8(cur.o));
  cur.o += 1;
  switch (type) {
    case 'Y': { const v = buf.readInt16LE(cur.o); cur.o += 2; return v; }
    case 'C': { const v = buf.readUInt8(cur.o) !== 0; cur.o += 1; return v; }
    case 'I': { const v = buf.readInt32LE(cur.o); cur.o += 4; return v; }
    case 'F': { const v = buf.readFloatLE(cur.o); cur.o += 4; return v; }
    case 'D': { const v = buf.readDoubleLE(cur.o); cur.o += 8; return v; }
    case 'L': { const v = Number(buf.readBigInt64LE(cur.o)); cur.o += 8; return v; }
    case 'S':
    case 'R': {
      const len = buf.readUInt32LE(cur.o); cur.o += 4;
      const v = buf.slice(cur.o, cur.o + len); cur.o += len;
      return type === 'S' ? v.toString('binary') : v;
    }
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const count = buf.readUInt32LE(cur.o); cur.o += 4;
      const encoding = buf.readUInt32LE(cur.o); cur.o += 4;
      const compLen = buf.readUInt32LE(cur.o); cur.o += 4;
      let data = buf.slice(cur.o, cur.o + compLen);
      cur.o += compLen;
      if (encoding === 1) data = zlib.inflateSync(data);
      const stride = { f: 4, d: 8, l: 8, i: 4, b: 1 }[type];
      const out = type === 'd' ? new Float64Array(count)
        : type === 'f' ? new Float32Array(count)
          : type === 'b' ? new Uint8Array(count)
            : type === 'l' ? new Float64Array(count)     // ids fit in a double
              : new Int32Array(count);
      for (let i = 0; i < count; i++) {
        const at = i * stride;
        switch (type) {
          case 'f': out[i] = data.readFloatLE(at); break;
          case 'd': out[i] = data.readDoubleLE(at); break;
          case 'i': out[i] = data.readInt32LE(at); break;
          case 'l': out[i] = Number(data.readBigInt64LE(at)); break;
          case 'b': out[i] = data.readUInt8(at); break;
        }
      }
      return out;
    }
    default:
      throw new Error('unknown FBX property type "' + type + '" at ' + (cur.o - 1));
  }
}

function readNode(buf, cur, wide) {
  const start = cur.o;
  let endOffset, numProps, propListLen;
  if (wide) {
    endOffset = Number(buf.readBigUInt64LE(cur.o)); cur.o += 8;
    numProps = Number(buf.readBigUInt64LE(cur.o)); cur.o += 8;
    propListLen = Number(buf.readBigUInt64LE(cur.o)); cur.o += 8;
  } else {
    endOffset = buf.readUInt32LE(cur.o); cur.o += 4;
    numProps = buf.readUInt32LE(cur.o); cur.o += 4;
    propListLen = buf.readUInt32LE(cur.o); cur.o += 4;
  }
  const nameLen = buf.readUInt8(cur.o); cur.o += 1;

  // A record of all zeroes is the sentinel that ends a nested list.
  if (endOffset === 0) return null;

  const name = buf.slice(cur.o, cur.o + nameLen).toString('binary');
  cur.o += nameLen;

  const props = [];
  const propsEnd = cur.o + propListLen;
  for (let i = 0; i < numProps; i++) props.push(readProperty(buf, cur));
  cur.o = propsEnd;

  const node = { name, props, children: [] };
  while (cur.o < endOffset - (wide ? 25 : 13)) {
    const child = readNode(buf, cur, wide);
    if (!child) break;
    node.children.push(child);
  }
  cur.o = endOffset;
  void start;
  return node;
}

/** Parses a binary FBX file into a node tree. */
function parse(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.slice(0, 21).toString('binary');
  if (!magic.startsWith('Kaydara FBX Binary')) {
    throw new Error(file + ': not a binary FBX (ASCII FBX is not supported)');
  }
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const cur = { o: 27 };
  const root = { name: '<root>', props: [], children: [] };
  while (cur.o < buf.length - (wide ? 25 : 13)) {
    const node = readNode(buf, cur, wide);
    if (!node) break;
    root.children.push(node);
  }
  return { version, root };
}

/* ------------------------------------------------------------------ *
 * Scene extraction
 * ------------------------------------------------------------------ */

const find = (node, name) => node.children.find(c => c.name === name);
const findAll = (node, name) => node.children.filter(c => c.name === name);

/**
 * Expands FBX's per-polygon-vertex layers into one flat, triangulated,
 * non-indexed mesh: position/normal/uv arrays that map 1:1 onto vertices.
 *
 * FBX stores normals and UVs with their own mapping and reference modes, and
 * getting those wrong is how imported meshes end up faceted or with the
 * texture scrambled — so each combination is handled explicitly.
 */
function readGeometry(geoNode) {
  const vertsNode = find(geoNode, 'Vertices');
  const idxNode = find(geoNode, 'PolygonVertexIndex');
  if (!vertsNode || !idxNode) return null;

  const verts = vertsNode.props[0];
  const indices = idxNode.props[0];

  // Normals
  let normals = null, normMap = null, normRef = null, normIdx = null;
  const nl = find(geoNode, 'LayerElementNormal');
  if (nl) {
    const n = find(nl, 'Normals');
    if (n) {
      normals = n.props[0];
      normMap = (find(nl, 'MappingInformationType') || { props: [''] }).props[0];
      normRef = (find(nl, 'ReferenceInformationType') || { props: [''] }).props[0];
      const ni = find(nl, 'NormalsIndex');
      if (ni) normIdx = ni.props[0];
    }
  }

  // UVs
  let uvs = null, uvMap = null, uvRef = null, uvIdx = null;
  const ul = find(geoNode, 'LayerElementUV');
  if (ul) {
    const u = find(ul, 'UV');
    if (u) {
      uvs = u.props[0];
      uvMap = (find(ul, 'MappingInformationType') || { props: [''] }).props[0];
      uvRef = (find(ul, 'ReferenceInformationType') || { props: [''] }).props[0];
      const ui = find(ul, 'UVIndex');
      if (ui) uvIdx = ui.props[0];
    }
  }

  // Per-face material slot, so multi-material pieces keep their colours.
  let matIdx = null, matMap = null;
  const ml = find(geoNode, 'LayerElementMaterial');
  if (ml) {
    const mm = find(ml, 'Materials');
    if (mm) {
      matIdx = mm.props[0];
      matMap = (find(ml, 'MappingInformationType') || { props: [''] }).props[0];
    }
  }

  const position = [], normal = [], uv = [], material = [];

  function pushVertex(pvIndex, vIndex, faceIndex) {
    position.push(verts[vIndex * 3], verts[vIndex * 3 + 1], verts[vIndex * 3 + 2]);

    if (normals) {
      let k;
      if (normMap === 'ByPolygonVertex') {
        k = normRef === 'IndexToDirect' && normIdx ? normIdx[pvIndex] : pvIndex;
      } else if (normMap === 'ByVertice' || normMap === 'ByVertex') {
        k = normRef === 'IndexToDirect' && normIdx ? normIdx[vIndex] : vIndex;
      } else if (normMap === 'ByPolygon') {
        k = normRef === 'IndexToDirect' && normIdx ? normIdx[faceIndex] : faceIndex;
      } else {
        k = 0;   // AllSame
      }
      normal.push(normals[k * 3], normals[k * 3 + 1], normals[k * 3 + 2]);
    }

    if (uvs) {
      let k;
      if (uvMap === 'ByPolygonVertex') {
        k = uvRef === 'IndexToDirect' && uvIdx ? uvIdx[pvIndex] : pvIndex;
      } else if (uvMap === 'ByVertice' || uvMap === 'ByVertex') {
        k = uvRef === 'IndexToDirect' && uvIdx ? uvIdx[vIndex] : vIndex;
      } else {
        k = 0;
      }
      uv.push(uvs[k * 2], uvs[k * 2 + 1]);
    }
  }

  // Walk polygons: FBX marks the last index of each polygon by bitwise-NOT.
  let face = [], facePv = [], faceIndex = 0;
  for (let i = 0; i < indices.length; i++) {
    let vi = indices[i];
    let last = false;
    if (vi < 0) { vi = ~vi; last = true; }
    face.push(vi);
    facePv.push(i);
    if (!last) continue;

    // Fan-triangulate the polygon.
    for (let t = 1; t + 1 < face.length; t++) {
      pushVertex(facePv[0], face[0], faceIndex);
      pushVertex(facePv[t], face[t], faceIndex);
      pushVertex(facePv[t + 1], face[t + 1], faceIndex);
      const m = !matIdx ? 0 : (matMap === 'AllSame' ? matIdx[0] : matIdx[faceIndex]);
      material.push(m, m, m);
    }
    face = []; facePv = []; faceIndex++;
  }

  return {
    id: geoNode.props[0],
    name: String(geoNode.props[1] || '').split(' ')[0],
    position: Float32Array.from(position),
    normal: normal.length ? Float32Array.from(normal) : null,
    uv: uv.length ? Float32Array.from(uv) : null,
    material: Uint16Array.from(material),
    triangles: position.length / 9
  };
}

const DEG = Math.PI / 180;

/** Reads Lcl Translation/Rotation/Scaling out of a Model's Properties70. */
function readModelTransform(modelNode) {
  const t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1];
  const p70 = find(modelNode, 'Properties70');
  if (p70) {
    for (const p of p70.children) {
      const key = p.props[0];
      if (key === 'Lcl Translation') { t[0] = p.props[4]; t[1] = p.props[5]; t[2] = p.props[6]; }
      else if (key === 'Lcl Rotation') { r[0] = p.props[4] * DEG; r[1] = p.props[5] * DEG; r[2] = p.props[6] * DEG; }
      else if (key === 'Lcl Scaling') { s[0] = p.props[4]; s[1] = p.props[5]; s[2] = p.props[6]; }
      else if (key === 'GeometricTranslation') { /* rare; ignored deliberately */ }
    }
  }
  return { position: t, rotation: r, scale: s };
}

/**
 * Pulls a flat scene out of a parsed FBX: every mesh with its world
 * transform, plus the materials it references.
 */
function readScene(file) {
  const { root } = parse(file);
  const objects = find(root, 'Objects');
  if (!objects) return { meshes: [], materials: [], unitScaleFactor: 1 };

  // FBX states its own unit in GlobalSettings. 1 means centimetres, which is
  // what Blender writes by default, and what makes a 4-metre wall arrive as
  // 400 unless the caller divides it back out.
  let unitScaleFactor = 1;
  const gs = find(root, 'GlobalSettings');
  const gsp = gs && find(gs, 'Properties70');
  if (gsp) {
    const u = gsp.children.find(c => c.props[0] === 'UnitScaleFactor');
    if (u && typeof u.props[4] === 'number') unitScaleFactor = u.props[4];
  }

  const geometries = new Map();
  findAll(objects, 'Geometry').forEach(g => {
    const geo = readGeometry(g);
    if (geo) geometries.set(geo.id, geo);
  });

  const models = new Map();
  findAll(objects, 'Model').forEach(m => {
    models.set(m.props[0], {
      id: m.props[0],
      name: String(m.props[1] || '').split(' ')[0],
      type: m.props[2],
      transform: readModelTransform(m),
      geometryIds: [],
      materialIds: [],
      parent: 0
    });
  });

  const materials = new Map();
  findAll(objects, 'Material').forEach(m => {
    const mat = {
      id: m.props[0],
      name: String(m.props[1] || '').split(' ')[0],
      color: [0.8, 0.8, 0.8]
    };
    const p70 = find(m, 'Properties70');
    if (p70) {
      for (const p of p70.children) {
        if (p.props[0] === 'DiffuseColor' || p.props[0] === 'Diffuse') {
          mat.color = [p.props[4], p.props[5], p.props[6]];
        }
      }
    }
    materials.set(mat.id, mat);
  });

  // Connections: "OO" links child -> parent by id.
  const conns = find(root, 'Connections');
  if (conns) {
    for (const c of conns.children) {
      if (c.props[0] !== 'OO') continue;
      const child = c.props[1], parent = c.props[2];
      if (geometries.has(child) && models.has(parent)) models.get(parent).geometryIds.push(child);
      else if (materials.has(child) && models.has(parent)) models.get(parent).materialIds.push(child);
      else if (models.has(child) && models.has(parent)) models.get(child).parent = parent;
    }
  }

  // World transforms by walking up the model hierarchy.
  function worldOf(model) {
    const chain = [];
    let m = model, guard = 0;
    while (m && guard++ < 64) { chain.unshift(m); m = m.parent ? models.get(m.parent) : null; }
    return chain.map(n => n.transform);
  }

  const meshes = [];
  for (const model of models.values()) {
    for (const gid of model.geometryIds) {
      const geo = geometries.get(gid);
      if (!geo) continue;
      meshes.push({
        name: model.name || geo.name,
        geometry: geo,
        transforms: worldOf(model),
        materials: model.materialIds.map(id => materials.get(id)).filter(Boolean)
      });
    }
  }

  return { meshes, materials: [...materials.values()], unitScaleFactor };
}

module.exports = { parse, readScene, readGeometry, find, findAll };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node fbx.js <file.fbx>'); process.exit(1); }
  const scene = readScene(file);
  console.log(file);
  scene.meshes.forEach(m => {
    const p = m.geometry.position;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < lo[k]) lo[k] = p[i + k];
        if (p[i + k] > hi[k]) hi[k] = p[i + k];
      }
    }
    console.log('  ' + m.name.padEnd(24) +
      ' tris=' + String(m.geometry.triangles).padStart(6) +
      ' uv=' + (m.geometry.uv ? 'y' : 'n') +
      ' size=' + hi.map((v, k) => (v - lo[k]).toFixed(2)).join('x') +
      ' mats=' + m.materials.length);
  });
}
