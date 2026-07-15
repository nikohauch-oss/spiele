class_name LightEngine
## Voxel-Beleuchtung im Minecraft-Stil. Zwei Kanaele pro Block, Werte 0..15,
## gepackt als ein Byte pro Voxel: (Himmelslicht << 4) | Blocklicht.
##  - Himmelslicht: 15 ueber dem Terrain, faellt seitlich/unter Ueberhaenge ab;
##    senkrecht nach unten bleibt 15 erhalten (Schaechte bleiben hell).
##  - Blocklicht: Fackeln (Level 14), Ausbreitung -1 pro Block.
##
## Das initiale Himmelslicht berechnet der Worker-Thread pro Chunk
## (compute_skylight, rein lokal). Aenderungen zur Laufzeit (Block gesetzt/
## abgebaut, Fackel platziert) laufen als inkrementelle BFS auf dem
## Main-Thread chunk-uebergreifend ueber den ChunkManager.

const TORCH_LEVEL := 14
const DIRS := [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1)]


# ------------------------------------------------ Initial (Worker-Thread) ---

## Himmelslicht fuer frisch generierte Chunk-Daten (nur innerhalb des Chunks;
## Uebergaenge an Chunkgrenzen glaettet das Sampling des Meshers).
static func compute_skylight(data: PackedByteArray, max_y: int) -> PackedByteArray:
	var light := PackedByteArray()
	light.resize(data.size())
	var top := mini(max_y + 1, Chunk.HEIGHT - 1)

	# 1) Spalten von oben fuellen: volle 15 bis zum ersten opaken Block
	for x in Chunk.SIZE:
		for z in Chunk.SIZE:
			var col := (x * Chunk.SIZE + z) * Chunk.HEIGHT
			var y := Chunk.HEIGHT - 1
			while y >= 0 and BlockDB.is_see_through(data[col + y]):
				light[col + y] = 15 << 4
				y -= 1

	# 2) Voll beleuchtete Zellen neben dunklen, durchsichtigen Zellen als
	#    BFS-Startpunkte sammeln (Eintrag gepackt: index << 4 | level)
	var queue: Array = []
	for x in Chunk.SIZE:
		for z in Chunk.SIZE:
			var col := (x * Chunk.SIZE + z) * Chunk.HEIGHT
			for y in top + 1:
				if light[col + y] >> 4 != 15:
					continue
				for d: Vector3i in DIRS:
					var nx := x + d.x
					var ny := y + d.y
					var nz := z + d.z
					if nx < 0 or nx >= Chunk.SIZE or nz < 0 or nz >= Chunk.SIZE \
							or ny < 0 or ny >= Chunk.HEIGHT:
						continue
					var ni := Chunk.index(nx, ny, nz)
					if light[ni] == 0 and BlockDB.is_see_through(data[ni]):
						queue.push_back((col + y) << 4 | 15)
						break

	# 3) Ausbreitung
	var head := 0
	while head < queue.size():
		var packed: int = queue[head]
		head += 1
		var idx := packed >> 4
		var level := packed & 15
		var y := idx % Chunk.HEIGHT
		@warning_ignore("integer_division")
		var rest := idx / Chunk.HEIGHT
		var z := rest % Chunk.SIZE
		@warning_ignore("integer_division")
		var x := rest / Chunk.SIZE
		for d: Vector3i in DIRS:
			var target := 15 if (d.y == -1 and level == 15) else level - 1
			if target <= 0:
				continue
			var nx := x + d.x
			var ny := y + d.y
			var nz := z + d.z
			if nx < 0 or nx >= Chunk.SIZE or nz < 0 or nz >= Chunk.SIZE \
					or ny < 0 or ny >= Chunk.HEIGHT:
				continue
			var ni := Chunk.index(nx, ny, nz)
			if not BlockDB.is_see_through(data[ni]):
				continue
			if light[ni] >> 4 < target:
				light[ni] = (light[ni] & 15) | (target << 4)
				queue.push_back(ni << 4 | target)
	return light


# --------------------------------------------- Inkrementell (Main-Thread) ---

## Zentraler Einstieg fuer Blockaenderungen. Aktualisiert beide Lichtkanaele
## und liefert alle Zellen, deren Licht sich geaendert hat (fuer das Remeshing).
static func on_block_changed(cm, wpos: Vector3i, old_id: int, new_id: int) -> Dictionary:
	var touched := {}
	if old_id == BlockDB.TORCH:
		_remove_light(cm, wpos, false, touched)
	if not BlockDB.is_see_through(new_id):
		# Zelle wurde opak: Licht hier loeschen (inkl. Himmelslicht-Saeule darunter)
		_remove_light(cm, wpos, true, touched)
		_remove_light(cm, wpos, false, touched)
	else:
		# Zelle wurde durchlaessig: Licht der Nachbarn einstroemen lassen
		_inflow(cm, wpos, true, touched)
		_inflow(cm, wpos, false, touched)
	if new_id == BlockDB.TORCH:
		_add_light(cm, wpos, false, TORCH_LEVEL, touched)
	return touched


static func _add_light(cm, pos: Vector3i, sky: bool, level: int, touched: Dictionary) -> void:
	if cm.light_set(pos, sky, level):
		touched[pos] = true
	_spread(cm, [[pos, level]], sky, touched)


## Nachbarlevels als BFS-Quellen in eine frisch geoeffnete Zelle fliessen lassen.
static func _inflow(cm, pos: Vector3i, sky: bool, touched: Dictionary) -> void:
	var queue: Array = []
	for d: Vector3i in DIRS:
		var np: Vector3i = pos + d
		var l: int = cm.light_get(np, sky)
		if l > 1:
			queue.push_back([np, l])
	_spread(cm, queue, sky, touched)


static func _spread(cm, queue: Array, sky: bool, touched: Dictionary) -> void:
	var head := 0
	while head < queue.size():
		var entry: Array = queue[head]
		head += 1
		var p: Vector3i = entry[0]
		var level: int = entry[1]
		for d: Vector3i in DIRS:
			var target := 15 if (sky and d.y == -1 and level == 15) else level - 1
			if target <= 0:
				continue
			var np: Vector3i = p + d
			if not BlockDB.is_see_through(cm.get_block(np)):
				continue
			if cm.light_get(np, sky) < target:
				if cm.light_set(np, sky, target):  # false bei nicht geladenem Chunk
					touched[np] = true
					queue.push_back([np, target])


## Klassisches zweiphasiges Entfernen: erst alle von dieser Quelle gespeisten
## Zellen dunkel ziehen, dann von den Randzellen aus neu ausbreiten.
static func _remove_light(cm, pos: Vector3i, sky: bool, touched: Dictionary) -> void:
	var old: int = cm.light_get(pos, sky)
	if old <= 0:
		return
	cm.light_set(pos, sky, 0)
	touched[pos] = true
	var removal: Array = [[pos, old]]
	var readd: Array = []
	var head := 0
	while head < removal.size():
		var entry: Array = removal[head]
		head += 1
		var p: Vector3i = entry[0]
		var level: int = entry[1]
		for d: Vector3i in DIRS:
			var np: Vector3i = p + d
			var nl: int = cm.light_get(np, sky)
			if nl <= 0:
				continue
			# Senkrecht nach unten speist 15 auch 15 (Himmelslicht-Saeule)
			if nl < level or (sky and d.y == -1 and level == 15):
				if cm.light_set(np, sky, 0):
					touched[np] = true
					removal.push_back([np, nl])
			else:
				readd.push_back([np, nl])
	_spread(cm, readd, sky, touched)
