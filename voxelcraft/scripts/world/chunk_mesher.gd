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
	var st := SurfaceTool.new()        # opake Bloecke (mit Kollision)
	var st_glass := SurfaceTool.new()  # Glas (transparent, mit Kollision)
	var st_deco := SurfaceTool.new()   # Pflanzen/Fackeln (Cutout, KEINE Kollision)
	var st_water := SurfaceTool.new()  # Wasser (transparent, keine Kollision)
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st_glass.begin(Mesh.PRIMITIVE_TRIANGLES)
	st_deco.begin(Mesh.PRIMITIVE_TRIANGLES)
	st_water.begin(Mesh.PRIMITIVE_TRIANGLES)
	var v_count := 0
	var g_count := 0
	var d_count := 0
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
					# Schmaler Stab in der Zellenmitte; Deko-Surface = durchlaufbar
					d_count = _add_scaled_box(st_deco, x, y, z, Vector3(0.4375, 0.0, 0.4375),
						Vector3(0.5625, 0.625, 0.5625), id, light[col_base + y], false, d_count)
					continue
				if id == BlockDB.FLOWER_RED or id == BlockDB.FLOWER_YELLOW \
						or id == BlockDB.TALL_GRASS:
					d_count = _add_cross(st_deco, x, y, z, id, light[col_base + y], d_count)
					continue
				if id == BlockDB.BED:
					# Halbhohe Liegeflaeche, leicht eingerueckt gegen Z-Fighting
					v_count = _add_scaled_box(st, x, y, z, Vector3(0.01, 0.02, 0.01),
						Vector3(0.99, 0.5625, 0.99), id, light[col_base + y], true, v_count)
					continue
				if id >= BlockDB.WHEAT_0 and id <= BlockDB.WHEAT_2:
					d_count = _add_cross(st_deco, x, y, z, id, light[col_base + y], d_count)
					continue
				if id == BlockDB.LADDER:
					d_count = _add_ladder(st_deco, x, y, z, light[col_base + y],
						data, neighbors, d_count)
					continue
				if id == BlockDB.SLAB_PLANK or id == BlockDB.SLAB_STONE:
					v_count = _add_scaled_box(st, x, y, z, Vector3(0.005, 0.005, 0.005),
						Vector3(0.995, 0.5, 0.995), id, light[col_base + y], true, v_count)
					continue
				if id >= BlockDB.STAIR_PLANK_N and id <= BlockDB.STAIR_STONE_W:
					v_count = _add_stairs(st, x, y, z, id, light[col_base + y], v_count)
					continue
				if id >= BlockDB.DOOR_C_N and id <= BlockDB.DOOR_O_W:
					v_count = _add_door(st, x, y, z, id, light[col_base + y], v_count)
					continue
				if id == BlockDB.FENCE:
					v_count = _add_fence(st, x, y, z, light[col_base + y],
						data, neighbors, v_count)
					continue
				var is_water := id == BlockDB.WATER
				var is_glass := id == BlockDB.GLASS
				for f: Dictionary in FACES:
					var n: Vector3i = f.n
					var nx := x + n.x
					var ny := y + n.y
					var nz := z + n.z
					var nb := _block_at(nx, ny, nz, data, neighbors)
					if is_water:
						# Wasserflaechen gegen Luft/Deko, nie gegen Wasser/Feste
						if BlockDB.is_solid(nb) or nb == BlockDB.WATER:
							continue
					elif is_glass:
						# Glas gegen Durchsichtiges, aber nicht Glas-an-Glas
						if not BlockDB.is_see_through(nb) or nb == BlockDB.GLASS:
							continue
					elif not BlockDB.is_see_through(nb):
						continue  # Nachbar opak -> Flaeche unsichtbar
					var lb := _light_at(nx, ny, nz, light, nlights)
					if is_water:
						w_count = _add_face(st_water, f, x, y, z, id, lb, w_count)
					elif is_glass:
						g_count = _add_face(st_glass, f, x, y, z, id, lb, g_count)
					else:
						v_count = _add_face(st, f, x, y, z, id, lb, v_count)

	var result := {"mesh": null, "shape": null}
	var mesh: ArrayMesh = null
	if v_count > 0:
		st.set_material(BlockDB.opaque_material)
		mesh = st.commit()
	if g_count > 0:
		st_glass.set_material(BlockDB.glass_material)
		mesh = st_glass.commit(mesh)
	# Kollision aus Opak + Glas; Deko und Wasser kommen erst danach dazu
	if mesh != null:
		result.shape = mesh.create_trimesh_shape()
	if d_count > 0:
		st_deco.set_material(BlockDB.deco_material)
		mesh = st_deco.commit(mesh)
	if w_count > 0:
		st_water.set_material(BlockDB.water_material)
		mesh = st_water.commit(mesh)
	result.mesh = mesh
	return result


## Pflanze als zwei diagonale Kreuz-Quads (beidseitig sichtbar via cull_disabled).
static func _add_cross(st: SurfaceTool, x: int, y: int, z: int,
		block_id: int, light_byte: int, v_count: int) -> int:
	var base_uv := BlockDB.uv_base(block_id, 1)
	var span := BlockDB.UV_STEP - BlockDB.UV_INSET * 2.0
	var color := Color(LIGHT_CURVE[light_byte & 15], LIGHT_CURVE[light_byte >> 4], 1.0)
	var origin := Vector3(x, y, z)
	var quads := [
		[Vector3(0.1, 0, 0.1), Vector3(0.9, 0, 0.9)],
		[Vector3(0.9, 0, 0.1), Vector3(0.1, 0, 0.9)],
	]
	var uvs := [Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1)]
	for q: Array in quads:
		var a: Vector3 = q[0]
		var b: Vector3 = q[1]
		var verts := [origin + a, origin + a + Vector3.UP, origin + b + Vector3.UP, origin + b]
		for i in 4:
			st.set_color(color)
			st.set_normal(Vector3.UP)
			st.set_uv(base_uv + Vector2(BlockDB.UV_INSET, BlockDB.UV_INSET) + uvs[i] * span)
			st.add_vertex(verts[i])
		for idx in [0, 1, 2, 0, 2, 3]:
			st.add_index(v_count + idx)
		v_count += 4
	return v_count


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


## Verkleinerte Box innerhalb einer Zelle (Fackel, Bett): bmin/bmax in
## Zellkoordinaten 0..1. Landet in der opaken Surface, damit sie per Raycast
## anvisierbar ist. Beleuchtung kommt aus der eigenen Zelle.
static func _add_scaled_box(st: SurfaceTool, x: int, y: int, z: int,
		bmin: Vector3, bmax: Vector3, block_id: int, light_byte: int,
		include_bottom: bool, v_count: int) -> int:
	var span := BlockDB.UV_STEP - BlockDB.UV_INSET * 2.0
	var origin := Vector3(x, y, z)
	var size := bmax - bmin
	for f: Dictionary in FACES:
		var n := f.n as Vector3i
		if n.y == -1 and not include_bottom:
			continue  # Unterseite steht auf dem Boden
		var base_uv := BlockDB.uv_base(block_id, f.slot)
		var color := Color(LIGHT_CURVE[light_byte & 15], LIGHT_CURVE[light_byte >> 4], f.shade)
		for i in 4:
			var v: Vector3 = f.v[i]
			st.set_color(color)
			st.set_normal(Vector3(n))
			st.set_uv(base_uv + Vector2(BlockDB.UV_INSET, BlockDB.UV_INSET) + f.uv[i] * span)
			st.add_vertex(origin + bmin + v * size)
		for idx in [0, 1, 2, 0, 2, 3]:
			st.add_index(v_count + idx)
		v_count += 4
	return v_count


## Leiter: duenne Platte an der ersten festen Nachbarwand (kein Metadaten-Feld
## noetig - die Ausrichtung ergibt sich aus der Umgebung).
static func _add_ladder(st: SurfaceTool, x: int, y: int, z: int, light_byte: int,
		data: PackedByteArray, neighbors: Dictionary, v_count: int) -> int:
	var bmin := Vector3(0.05, 0.0, 0.46)
	var bmax := Vector3(0.95, 1.0, 0.54)
	for side in [[Vector3i(-1, 0, 0), Vector3(0.005, 0, 0.05), Vector3(0.085, 1, 0.95)],
			[Vector3i(1, 0, 0), Vector3(0.915, 0, 0.05), Vector3(0.995, 1, 0.95)],
			[Vector3i(0, 0, -1), Vector3(0.05, 0, 0.005), Vector3(0.95, 1, 0.085)],
			[Vector3i(0, 0, 1), Vector3(0.05, 0, 0.915), Vector3(0.95, 1, 0.995)]]:
		var off: Vector3i = side[0]
		if BlockDB.is_solid(_block_at(x + off.x, y + off.y, z + off.z, data, neighbors)):
			bmin = side[1]
			bmax = side[2]
			break
	return _add_scaled_box(st, x, y, z, bmin, bmax, BlockDB.LADDER, light_byte, false, v_count)


## Stufen: unterer Halbblock + obere Haelfte auf der Aufstiegsseite.
static func _add_stairs(st: SurfaceTool, x: int, y: int, z: int, id: int,
		light_byte: int, v_count: int) -> int:
	var dir := (id - BlockDB.STAIR_PLANK_N) % 4  # 0=N(-z) 1=O(+x) 2=S(+z) 3=W(-x)
	v_count = _add_scaled_box(st, x, y, z, Vector3(0.005, 0.005, 0.005),
		Vector3(0.995, 0.5, 0.995), id, light_byte, true, v_count)
	var tops := [
		[Vector3(0.005, 0.5, 0.005), Vector3(0.995, 0.995, 0.5)],   # N
		[Vector3(0.5, 0.5, 0.005), Vector3(0.995, 0.995, 0.995)],   # O
		[Vector3(0.005, 0.5, 0.5), Vector3(0.995, 0.995, 0.995)],   # S
		[Vector3(0.005, 0.5, 0.005), Vector3(0.5, 0.995, 0.995)],   # W
	]
	return _add_scaled_box(st, x, y, z, tops[dir][0], tops[dir][1], id,
		light_byte, false, v_count)


## Tuer: duenne Platte an einer Zellkante; offene Tueren sind um 90 Grad
## auf die Nachbarkante gedreht. Beide Zellhaelften zeichnen dieselbe Form.
static func _add_door(st: SurfaceTool, x: int, y: int, z: int, id: int,
		light_byte: int, v_count: int) -> int:
	var dir := (id - BlockDB.DOOR_C_N) % 4
	if id >= BlockDB.DOOR_O_N:
		dir = (dir + 1) % 4  # geoeffnet: an die Seitenkante klappen
	var edges := [
		[Vector3(0.005, 0.0, 0.005), Vector3(0.995, 1.0, 0.19)],    # N
		[Vector3(0.81, 0.0, 0.005), Vector3(0.995, 1.0, 0.995)],    # O
		[Vector3(0.005, 0.0, 0.81), Vector3(0.995, 1.0, 0.995)],    # S
		[Vector3(0.005, 0.0, 0.005), Vector3(0.19, 1.0, 0.995)],    # W
	]
	return _add_scaled_box(st, x, y, z, edges[dir][0], edges[dir][1], id,
		light_byte, true, v_count)


## Zaun: Mittelpfosten + Querriegel zu festen Nachbarn/anderen Zaeunen.
static func _add_fence(st: SurfaceTool, x: int, y: int, z: int, light_byte: int,
		data: PackedByteArray, neighbors: Dictionary, v_count: int) -> int:
	v_count = _add_scaled_box(st, x, y, z, Vector3(0.375, 0.0, 0.375),
		Vector3(0.625, 1.0, 0.625), BlockDB.FENCE, light_byte, false, v_count)
	var arms := [
		[Vector3i(1, 0, 0), Vector3(0.625, 0.35, 0.42), Vector3(0.995, 0.9, 0.58)],
		[Vector3i(-1, 0, 0), Vector3(0.005, 0.35, 0.42), Vector3(0.375, 0.9, 0.58)],
		[Vector3i(0, 0, 1), Vector3(0.42, 0.35, 0.625), Vector3(0.58, 0.9, 0.995)],
		[Vector3i(0, 0, -1), Vector3(0.42, 0.35, 0.005), Vector3(0.58, 0.9, 0.375)],
	]
	for a: Array in arms:
		var off: Vector3i = a[0]
		var nb := _block_at(x + off.x, y + off.y, z + off.z, data, neighbors)
		if nb == BlockDB.FENCE or BlockDB.is_solid(nb):
			v_count = _add_scaled_box(st, x, y, z, a[1], a[2], BlockDB.FENCE,
				light_byte, true, v_count)
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
