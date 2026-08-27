# Third-party assets

## Free 3D Modular Game Assets For Prototyping

- **Author:** Raphael Gonçalves (rgsdev) — https://www.patreon.com/rgsdev
- **Licence:** CC0 / public domain. Free for any use, commercial included.
  Credit is not required; it is given here anyway.
- **Source archive:** `hypercell/assets-src-modular-kit.zip` (kept in the repo so
  the conversion is reproducible without the original download).

### What is used

Only the *fabricated* pieces — ladders, railings, fences, stairs, ramps, door
and window frames, pillars, hazards and pickups. Those are made of bars and
rungs, which are tedious to author procedurally and are exactly what the map
was missing.

Deliberately **not** used:

- The pack's walls, cubes, spheres, cones and ground tiles. They are plain
  primitives; `15_map_nova_district.js` already generates the same shapes with
  window frames, sills, mullions, pipework and rooftop clutter on them.
- `Character/Character.fbx`. It is a 556-triangle faceted grey-box mannequin in
  a T-pose, with no rig, no hands and no gear. The game's own character system
  builds a sculpted head, a lofted body, skins and a procedural animation rig;
  swapping the pack's figure in would be a large step backwards.
- `texture.png`. It is an 8x8 palette atlas, and every mesh in the pack maps its
  whole surface to a single cell of it — so the UVs carry no information. The
  game assigns its own procedural materials instead.

### Conversion

The container has no Blender, no assimp and no FBX2glTF, and three.js's
`FBXLoader` is an examples module that is not in the vendored UMD core build.
So the import is done offline by two tools in `hypercell/tools/`:

- `fbx.js` — a minimal binary-FBX reader (node tree, geometry layers with their
  mapping/reference modes, model transforms, connection graph).
- `fbx2kit.js` — bakes transforms, converts to metres, recentres each piece on
  its footprint, welds vertices and writes `src/14a_kit.js`.

Regenerate with:

    node hypercell/tools/fbx2kit.js <unzipped-asset-root>

`src/14a_kit.js` is generated — do not edit it by hand.

Render a contact sheet of everything imported with:

    node hypercell/tools/kitsheet.js      # -> dist/shots/kitsheet.png
