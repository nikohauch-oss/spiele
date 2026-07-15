class_name ChunkMesher
## Baut aus rohen Blockdaten ein ArrayMesh + Kollisionsform fuer einen Chunk.
## Face-Culling: Nur Flaechen zu durchsichtigen Nachbarn (Luft/Wasser/Fackel)
## werden erzeugt. Das Voxel-Licht (LightEngine) wird pro Flaeche aus der Zelle
## VOR der Flaeche gesampelt und in die Vertex-Farbe gebacken:
## R = Blocklicht, G = Himmelslicht, B = Richtungs-Schattierung (Shader in BlockDB).
## Laeuft komplett im Worker-Thread - erzeugt nur Ressourcen, keine Nodes.

# Wahrnehmungs-Kurve fuer Lichtlevel 0..15 (Minecraft-artiger Abfall ~0.82^n)
const LIGHT_CURVE := [0.0, 0.062, 0.076, 0.092, 0.113, 0.137, 0.168, 0.204,
	0.249, 0.304, 0.371, 0.452, 0.551, 0.672, 0.82, 1.0]

# 6 Wuerfelflaechen. Eckpunkte im Uhrzeigersinn von aussen gesehen
# (Godot-Frontface-Winding). slot: 0=oben, 1=seite, 2=unten (Atlas-Kachelwahl).
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


## data/light:       Block- und Lichtdaten dieses Chunks (Kopien, threadsicher)
## neighbors/nlights: Vector2i-Offset -> Daten der 4 Nachbar-Chunks
## max_y:            hoechster belegter Block (Luft darueber wird uebersprungen)
## Rueckgabe: {"mesh": ArrayMesh oder null, "shape": ConcavePolygonShape3D oder null}
static func build(data: PackedByteArray, light: PackedByteArray,
		neighbors: Dictionary, nlights: Dictionary, max_y: int) -> Dictionary:
	var st := SurfaceTool.new()        # opake Bloecke (+ Fackeln, wg. Anvisierbarkeit)
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
				if id == BlockDB.TORCH:
					v_count = _add_torch(st, x, y, z, light[col_base + y], v_count)
					continue
				var is_water := id == BlockDB.WATER
				for f: Dictionary in FACES:
					var n: Vector3i = f.n
					var nx := x + n.x
					var ny := y + n.y
					var nz := z + n.z
					var nb := _block_at(nx, ny, nz, data, neighbors)
					if is_water:
						# Wasserflaechen gegen Luft/Fackeln, nie gegen Wasser/Feste
						if BlockDB.is_solid(nb) or nb == BlockDB.WATER:
							continue
					elif not BlockDB.is_see_through(nb):
						continue  # Nachbar opak -> Flaeche unsichtbar
					var lb := _light_at(nx, ny, nz, light, nlights)
					if is_water:
						w_count = _add_face(st_water, f, x, y, z, id, lb, w_count)
					else:
						v_count = _add_face(st, f, x, y, z, id, lb, v_count)

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
		block_id: int, light_byte: int, v_count: int) -> int:
	var base_uv := BlockDB.uv_base(block_id, f.slot)
	var span := BlockDB.UV_STEP - BlockDB.UV_INSET * 2.0
	var color := Color(LIGHT_CURVE[light_byte & 15], LIGHT_CURVE[light_byte >> 4], f.shade)
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


## Fackel als schmale Box (2/16 breit, 10/16 hoch) in der Zellenmitte.
## Landet in der opaken Surface, damit sie per Raycast anvisierbar ist -
## die winzige Kollisionsbox stoert die Bewegung praktisch nicht.
static func _add_torch(st: SurfaceTool, x: int, y: int, z: int,
		light_byte: int, v_count: int) -> int:
	var base_uv := BlockDB.uv_base(BlockDB.TORCH, 1)
	var span := BlockDB.UV_STEP - BlockDB.UV_INSET * 2.0
	# Fackeln leuchten selbst: eigene Zelle, volle Schattierung
	var color := Color(LIGHT_CURVE[light_byte & 15], LIGHT_CURVE[light_byte >> 4], 1.0)
	var origin := Vector3(x, y, z)
	for f: Dictionary in FACES:
		if (f.n as Vector3i).y == -1:
			continue  # Unterseite steht auf dem Boden
		for i in 4:
			var v: Vector3 = f.v[i]
			var p := origin + Vector3(0.4375 + v.x * 0.125, v.y * 0.625, 0.4375 + v.z * 0.125)
			st.set_color(color)
			st.set_normal(Vector3(f.n))
			st.set_uv(base_uv + Vector2(BlockDB.UV_INSET, BlockDB.UV_INSET) + f.uv[i] * span)
			st.add_vertex(p)
		for idx in [0, 1, 2, 0, 2, 3]:
			st.add_index(v_count + idx)
		v_count += 4
	return v_count


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


## Lichtbyte der Zelle (analog zu _block_at, inkl. Nachbar-Chunks).
static func _light_at(x: int, y: int, z: int, light: PackedByteArray, nlights: Dictionary) -> int:
	if y < 0:
		return 0
	if y >= Chunk.HEIGHT:
		return 15 << 4  # ueber der Welt: volles Himmelslicht
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
		return light[Chunk.index(x, y, z)]
	var nl: PackedByteArray = nlights.get(Vector2i(dx, dz), PackedByteArray())
	if nl.is_empty():
		return 15 << 4
	return nl[Chunk.index(x - dx * Chunk.SIZE, y, z - dz * Chunk.SIZE)]
