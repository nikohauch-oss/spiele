class_name ChunkMesher
## Baut aus rohen Blockdaten ein ArrayMesh + Kollisionsform fuer einen Chunk.
## Face-Culling: Nur Flaechen zu durchsichtigen Nachbarn (Luft/Wasser) werden
## erzeugt. Laeuft komplett im Worker-Thread - erzeugt nur Ressourcen, keine Nodes.

# 6 Wuerfelflaechen. Eckpunkte im Uhrzeigersinn von aussen gesehen
# (Godot-Frontface-Winding). slot: 0=oben, 1=seite, 2=unten (Atlas-Kachelwahl).
# shade: einfache Richtungs-Schattierung ueber Vertex-Farben.
const FACES := [
	{"n": Vector3i(0, 1, 0), "slot": 0, "shade": 1.0,
		"v": [Vector3(0, 1, 0), Vector3(1, 1, 0), Vector3(1, 1, 1), Vector3(0, 1, 1)],
		"uv": [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]},
	{"n": Vector3i(0, -1, 0), "slot": 2, "shade": 0.5,
		"v": [Vector3(0, 0, 0), Vector3(0, 0, 1), Vector3(1, 0, 1), Vector3(1, 0, 0)],
		"uv": [Vector2(0, 0), Vector2(0, 1), Vector2(1, 1), Vector2(1, 0)]},
	{"n": Vector3i(1, 0, 0), "slot": 1, "shade": 0.8,
		"v": [Vector3(1, 0, 1), Vector3(1, 1, 1), Vector3(1, 1, 0), Vector3(1, 0, 0)],
		"uv": [Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1)]},
	{"n": Vector3i(-1, 0, 0), "slot": 1, "shade": 0.8,
		"v": [Vector3(0, 0, 0), Vector3(0, 1, 0), Vector3(0, 1, 1), Vector3(0, 0, 1)],
		"uv": [Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1)]},
	{"n": Vector3i(0, 0, 1), "slot": 1, "shade": 0.65,
		"v": [Vector3(0, 0, 1), Vector3(0, 1, 1), Vector3(1, 1, 1), Vector3(1, 0, 1)],
		"uv": [Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1)]},
	{"n": Vector3i(0, 0, -1), "slot": 1, "shade": 0.65,
		"v": [Vector3(1, 0, 0), Vector3(1, 1, 0), Vector3(0, 1, 0), Vector3(0, 0, 0)],
		"uv": [Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1)]},
]


## data:      Blockdaten dieses Chunks (Kopie, threadsicher)
## neighbors: Vector2i(+-1, +-1-Achsen) -> Blockdaten der 4 Nachbar-Chunks
## max_y:     hoechster belegter Block (Meshing ueberspringt leere Luft darueber)
## Rueckgabe: {"mesh": ArrayMesh oder null, "shape": ConcavePolygonShape3D oder null}
static func build(data: PackedByteArray, neighbors: Dictionary, max_y: int) -> Dictionary:
	var st := SurfaceTool.new()        # opake Bloecke
	var st_water := SurfaceTool.new()  # transparentes Wasser (eigene Surface)
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st_water.begin(Mesh.PRIMITIVE_TRIANGLES)
	var v_count := 0
	var w_count := 0
	var top := mini(max_y, Chunk.HEIGHT - 1)

	for x in Chunk.SIZE:
		for z in Chunk.SIZE:
			var col_base := (x * Chunk.SIZE + z) * Chunk.HEIGHT
			for y in top + 1:
				var id := data[col_base + y]
				if id == BlockDB.AIR:
					continue
				var is_water := id == BlockDB.WATER
				for f: Dictionary in FACES:
					var n: Vector3i = f.n
					var nb := _block_at(x + n.x, y + n.y, z + n.z, data, neighbors)
					if is_water:
						if nb != BlockDB.AIR:
							continue  # Wasserflaechen nur gegen Luft
					elif not BlockDB.is_see_through(nb):
						continue      # Nachbar opak -> Flaeche unsichtbar
					if is_water:
						w_count = _add_face(st_water, f, x, y, z, id, w_count)
					else:
						v_count = _add_face(st, f, x, y, z, id, v_count)

	var result := {"mesh": null, "shape": null}
	var mesh: ArrayMesh = null
	if v_count > 0:
		st.set_material(BlockDB.opaque_material)
		mesh = st.commit()
		# Kollision nur aus der opaken Surface (Wasser bleibt begehbar/schwimmbar)
		result.shape = mesh.create_trimesh_shape()
	if w_count > 0:
		st_water.set_material(BlockDB.water_material)
		mesh = st_water.commit(mesh)
	result.mesh = mesh
	return result


static func _add_face(st: SurfaceTool, f: Dictionary, x: int, y: int, z: int,
		block_id: int, v_count: int) -> int:
	var base_uv := BlockDB.uv_base(block_id, f.slot)
	var span := BlockDB.UV_STEP - BlockDB.UV_INSET * 2.0
	var shade: float = f.shade
	var color := Color(shade, shade, shade)
	var normal := Vector3(f.n)
	var origin := Vector3(x, y, z)
	for i in 4:
		st.set_color(color)
		st.set_normal(normal)
		st.set_uv(base_uv + Vector2(BlockDB.UV_INSET, BlockDB.UV_INSET) + f.uv[i] * span)
		st.add_vertex(origin + f.v[i])
	# Quad als zwei Dreiecke indizieren
	for idx in [0, 1, 2, 0, 2, 3]:
		st.add_index(v_count + idx)
	return v_count + 4


## Block an (x,y,z) in Chunk-Lokalkoordinaten; greift am Rand auf Nachbardaten zu.
static func _block_at(x: int, y: int, z: int, data: PackedByteArray, neighbors: Dictionary) -> int:
	if y < 0:
		return BlockDB.BEDROCK  # Weltboden nie von unten rendern
	if y >= Chunk.HEIGHT:
		return BlockDB.AIR
	var dx := 0
	var dz := 0
	if x < 0:
		dx = -1
	elif x >= Chunk.SIZE:
		dx = 1
	if z < 0:
		dz = -1
	elif z >= Chunk.SIZE:
		dz = 1
	if dx == 0 and dz == 0:
		return data[Chunk.index(x, y, z)]
	var nd: PackedByteArray = neighbors.get(Vector2i(dx, dz), PackedByteArray())
	if nd.is_empty():
		# Nachbar (noch) nicht generiert: als Luft behandeln. Der ChunkManager
		# vermeshed nur Chunks, deren 4 Nachbarn Daten haben - dieser Fall
		# tritt also nur am aeussersten Rand des geladenen Bereichs auf.
		return BlockDB.AIR
	return nd[Chunk.index(x - dx * Chunk.SIZE, y, z - dz * Chunk.SIZE)]
