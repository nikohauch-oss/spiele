class_name ChunkManager
extends Node3D
## Verwaltet die Voxelwelt:
##  - Chunk-Daten-Generierung und Meshing in einem Worker-Thread (kein Ruckeln)
##  - dynamisches Laden/Entladen rund um den Spieler
##  - Block lesen/setzen inkl. Re-Meshing betroffener (Nachbar-)Chunks
##  - liefert editierte Chunks fuer das Speichersystem
##
## Zwei-Phasen-Pipeline: erst Daten (Radius = Sichtweite + 1), dann Mesh -
## ein Chunk wird erst vermeshed, wenn alle 4 Nachbarn Daten haben. So
## funktioniert Face-Culling auch ueber Chunkgrenzen hinweg ohne Nachbesserung.

signal chunk_meshed(cpos: Vector2i)

const DATA_MARGIN := 1
const UNLOAD_MARGIN := 2
const MESH_APPLIES_PER_FRAME := 2  # Mesh-Uebernahmen pro Frame begrenzen (Hitches)
const NEIGHBOR_OFFSETS := [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

@export var view_distance := 4  # Mesh-Radius in Chunks

var generator: TerrainGenerator

# cpos -> {"data": PackedByteArray, "max_y": int, "edited": bool,
#          "dirty": bool, "node": Chunk|null}
var chunks := {}
var _pending_data := {}
var _pending_mesh := {}

# Worker-Thread: Job-Queue rein, Ergebnis-Queue raus (Mutex-geschuetzt)
var _thread: Thread
var _mutex := Mutex.new()
var _sem := Semaphore.new()
var _jobs: Array = []
var _results: Array = []
var _mesh_backlog: Array = []
var _exit := false

var _last_player_cpos := Vector2i(1 << 30, 1 << 30)
var _scan_timer := 0.0


func setup(world_seed: int) -> void:
	generator = TerrainGenerator.new(world_seed)
	_thread = Thread.new()
	_thread.start(_worker_loop)


func _exit_tree() -> void:
	_exit = true
	_sem.post()
	if _thread and _thread.is_started():
		_thread.wait_to_finish()


func _process(delta: float) -> void:
	_scan_timer -= delta
	if Game.player:
		var cpos := world_to_chunk(Vector3i(Game.player.global_position.floor()))
		if cpos != _last_player_cpos or _scan_timer <= 0.0:
			_last_player_cpos = cpos
			_scan_timer = 0.5
			_update_chunks(cpos)
	_drain_results()


# ------------------------------------------------------------ Block-Zugriff ---

static func world_to_chunk(wpos: Vector3i) -> Vector2i:
	return Vector2i(wpos.x >> 4, wpos.z >> 4)  # SIZE = 16


func get_block(wpos: Vector3i) -> int:
	if wpos.y < 0 or wpos.y >= Chunk.HEIGHT:
		return BlockDB.AIR
	var rec: Dictionary = chunks.get(world_to_chunk(wpos), {})
	if rec.is_empty():
		return BlockDB.AIR
	return rec.data[Chunk.index(wpos.x & 15, wpos.y, wpos.z & 15)]


func set_block(wpos: Vector3i, id: int) -> void:
	if wpos.y < 0 or wpos.y >= Chunk.HEIGHT:
		return
	var cpos := world_to_chunk(wpos)
	var rec: Dictionary = chunks.get(cpos, {})
	if rec.is_empty():
		return
	var idx := Chunk.index(wpos.x & 15, wpos.y, wpos.z & 15)
	var old_id: int = rec.data[idx]
	if old_id == id:
		return
	rec.data[idx] = id
	rec.edited = true
	rec.max_y = maxi(rec.max_y, wpos.y)
	# Licht aktualisieren (chunk-uebergreifende BFS), dann alle betroffenen
	# Zellen remeshen - erst NACH dem Licht-Update, damit die Mesh-Jobs
	# bereits die neuen Lichtwerte snapshotten.
	var touched := LightEngine.on_block_changed(self, wpos, old_id, id)
	touched[wpos] = true
	_remesh_cells(touched)


## Lichtwert (0..15) einer Zelle; sky=true fuer Himmels-, false fuer Blocklicht.
func light_get(wpos: Vector3i, sky: bool) -> int:
	if wpos.y >= Chunk.HEIGHT:
		return 15 if sky else 0
	if wpos.y < 0:
		return 0
	var rec: Dictionary = chunks.get(world_to_chunk(wpos), {})
	if rec.is_empty():
		return 15 if sky else 0  # ungeladen: als beleuchtet annehmen
	var b: int = rec.light[Chunk.index(wpos.x & 15, wpos.y, wpos.z & 15)]
	return b >> 4 if sky else b & 15


## Setzt einen Lichtwert. Rueckgabe false, wenn der Chunk nicht geladen ist
## oder sich nichts geaendert hat (stoppt die BFS an Weltgrenzen).
func light_set(wpos: Vector3i, sky: bool, v: int) -> bool:
	if wpos.y < 0 or wpos.y >= Chunk.HEIGHT:
		return false
	var rec: Dictionary = chunks.get(world_to_chunk(wpos), {})
	if rec.is_empty():
		return false
	var idx := Chunk.index(wpos.x & 15, wpos.y, wpos.z & 15)
	var old: int = rec.light[idx]
	var nw := (v << 4) | (old & 15) if sky else (old & 0xF0) | v
	if nw == old:
		return false
	rec.light[idx] = nw
	rec.edited = true  # Lichtstand muss mitgespeichert werden
	return true


## Remesht alle Chunks, in denen Zellen liegen (inkl. Nachbarn bei Randzellen).
func _remesh_cells(cells: Dictionary) -> void:
	var cset := {}
	for wpos: Vector3i in cells:
		var c := world_to_chunk(wpos)
		cset[c] = true
		var lx := wpos.x & 15
		var lz := wpos.z & 15
		if lx == 0:
			cset[c + Vector2i(-1, 0)] = true
		elif lx == 15:
			cset[c + Vector2i(1, 0)] = true
		if lz == 0:
			cset[c + Vector2i(0, -1)] = true
		elif lz == 15:
			cset[c + Vector2i(0, 1)] = true
	for c: Vector2i in cset:
		_mark_dirty(c, true)


## Hoechster fester Block einer Weltsaeule (-1 wenn Chunk nicht geladen).
func get_ground_y(wx: int, wz: int) -> int:
	var rec: Dictionary = chunks.get(Vector2i(wx >> 4, wz >> 4), {})
	if rec.is_empty():
		return -1
	var col := ((wx & 15) * Chunk.SIZE + (wz & 15)) * Chunk.HEIGHT
	for y in range(mini(rec.max_y, Chunk.HEIGHT - 1), -1, -1):
		if BlockDB.is_solid(rec.data[col + y]):
			return y
	return -1


func is_chunk_meshed(cpos: Vector2i) -> bool:
	var rec: Dictionary = chunks.get(cpos, {})
	return not rec.is_empty() and rec.node != null


# ------------------------------------------------------- Speichern/Laden ---

func get_edited_chunks() -> Dictionary:
	var out := {}
	for cpos: Vector2i in chunks:
		var rec: Dictionary = chunks[cpos]
		if rec.edited:
			out[cpos] = {"data": rec.data, "light": rec.light, "max_y": rec.max_y}
	return out


## Vor dem ersten Frame aufrufen: gespeicherte Chunks haben Vorrang vor Neugenerierung.
func load_edited_chunks(saved: Dictionary) -> void:
	for cpos: Vector2i in saved:
		var e: Dictionary = saved[cpos]
		chunks[cpos] = {"data": e.data, "light": e.light, "max_y": e.max_y,
			"edited": true, "dirty": false, "node": null}


# ------------------------------------------------------------- Lade-Logik ---

func _update_chunks(center: Vector2i) -> void:
	var r := view_distance
	# 1) Daten anfordern (mit Rand fuer Nachbar-Culling)
	for dx in range(-r - DATA_MARGIN, r + DATA_MARGIN + 1):
		for dz in range(-r - DATA_MARGIN, r + DATA_MARGIN + 1):
			var c := center + Vector2i(dx, dz)
			if not chunks.has(c) and not _pending_data.has(c):
				_pending_data[c] = true
				_push_job({"type": "data", "cpos": c}, false)
	# 2) Meshes anfordern, sobald alle 4 Nachbarn Daten haben
	for dx in range(-r, r + 1):
		for dz in range(-r, r + 1):
			var c := center + Vector2i(dx, dz)
			var rec: Dictionary = chunks.get(c, {})
			if rec.is_empty() or rec.node != null or _pending_mesh.has(c):
				continue
			if _neighbors_ready(c):
				_request_mesh(c, false)
	# 3) Entfernte Chunks entladen
	for c: Vector2i in chunks.keys():
		if absi(c.x - center.x) > r + UNLOAD_MARGIN or absi(c.y - center.y) > r + UNLOAD_MARGIN:
			var rec: Dictionary = chunks[c]
			if rec.node:
				rec.node.queue_free()
				rec.node = null
			# Nicht editierte Chunks regenerieren identisch -> Daten freigeben.
			# Editierte bleiben im Speicher (Spielstand + Konsistenz).
			if not rec.edited:
				chunks.erase(c)


func _neighbors_ready(cpos: Vector2i) -> bool:
	for off: Vector2i in NEIGHBOR_OFFSETS:
		if not chunks.has(cpos + off):
			return false
	return true


func _mark_dirty(cpos: Vector2i, priority: bool) -> void:
	var rec: Dictionary = chunks.get(cpos, {})
	if rec.is_empty():
		return
	rec.dirty = true
	if not _pending_mesh.has(cpos) and _neighbors_ready(cpos):
		_request_mesh(cpos, priority)


## Snapshot der Daten (Kopien!) in den Job legen - der Worker liest sie,
## waehrend der Main-Thread die Originale weiter veraendern darf.
func _request_mesh(cpos: Vector2i, priority: bool) -> void:
	var rec: Dictionary = chunks[cpos]
	rec.dirty = false
	_pending_mesh[cpos] = true
	var job := {"type": "mesh", "cpos": cpos, "data": rec.data.duplicate(),
		"light": rec.light.duplicate(), "max_y": rec.max_y,
		"neighbors": {}, "nlights": {}}
	for off: Vector2i in NEIGHBOR_OFFSETS:
		var nrec: Dictionary = chunks.get(cpos + off, {})
		if not nrec.is_empty():
			job.neighbors[off] = nrec.data.duplicate()
			job.nlights[off] = nrec.light.duplicate()
	_push_job(job, priority)


# ---------------------------------------------------------------- Threading ---

func _push_job(job: Dictionary, priority: bool) -> void:
	_mutex.lock()
	if priority:
		_jobs.push_front(job)  # Block-Edits vor Weltgenerierung
	else:
		_jobs.push_back(job)
	_mutex.unlock()
	_sem.post()


func _worker_loop() -> void:
	while true:
		_sem.wait()
		if _exit:
			return
		_mutex.lock()
		var job: Dictionary = _jobs.pop_front() if not _jobs.is_empty() else {}
		_mutex.unlock()
		if job.is_empty():
			continue
		var res: Dictionary
		if job.type == "data":
			var g := generator.generate_chunk(job.cpos)
			res = {"type": "data", "cpos": job.cpos, "data": g.data,
				"light": g.light, "max_y": g.max_y,
				"village": g.get("village", Vector3i.ZERO)}
		else:
			res = {"type": "mesh", "cpos": job.cpos,
				"result": ChunkMesher.build(job.data, job.light,
					job.neighbors, job.nlights, job.max_y)}
		_mutex.lock()
		_results.push_back(res)
		_mutex.unlock()


func _drain_results() -> void:
	_mutex.lock()
	var incoming := _results
	_results = []
	_mutex.unlock()
	for res: Dictionary in incoming:
		if res.type == "data":
			_apply_data(res)
		else:
			_mesh_backlog.push_back(res)
	# Mesh-Uebernahme gedrosselt (ArrayMesh/Collider-Upload kostet Main-Thread-Zeit)
	var applied := 0
	while applied < MESH_APPLIES_PER_FRAME and not _mesh_backlog.is_empty():
		_apply_mesh(_mesh_backlog.pop_front())
		applied += 1


func _apply_data(res: Dictionary) -> void:
	_pending_data.erase(res.cpos)
	if chunks.has(res.cpos):
		return  # z. B. aus Spielstand geladen -> gespeicherte Daten behalten
	chunks[res.cpos] = {"data": res.data, "light": res.light, "max_y": res.max_y,
		"edited": false, "dirty": false, "node": null}
	# Haendler am frisch generierten Dorf anmelden
	var village: Vector3i = res.get("village", Vector3i.ZERO)
	if village != Vector3i.ZERO:
		Game.register_village(village)


func _apply_mesh(res: Dictionary) -> void:
	var cpos: Vector2i = res.cpos
	_pending_mesh.erase(cpos)
	var rec: Dictionary = chunks.get(cpos, {})
	if rec.is_empty():
		return  # inzwischen entladen
	if rec.node == null:
		var node := Chunk.new()
		node.name = "Chunk_%d_%d" % [cpos.x, cpos.y]
		node.position = Vector3(cpos.x * Chunk.SIZE, 0, cpos.y * Chunk.SIZE)
		add_child(node)
		rec.node = node
	rec.node.apply_mesh(res.result)
	chunk_meshed.emit(cpos)
	# Waehrend des Meshings erneut veraendert? Direkt nochmal anstossen.
	if rec.dirty and _neighbors_ready(cpos):
		_request_mesh(cpos, true)
