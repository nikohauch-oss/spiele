class_name PlayerInteraction
extends Node
## Blick-Interaktion des Spielers (RayCast3D an der Kamera):
##  - Linke Maustaste: Block abbauen (mit Abbauzeit je Werkzeug/Blockhaerte)
##    bzw. Gegner angreifen
##  - Rechte Maustaste: Block platzieren / Werkbank+Ofen oeffnen / essen
##  - zeichnet einen Drahtgitter-Rahmen um den anvisierten Block

const REACH := 5.0
const ATTACK_COOLDOWN := 0.5
const PLACE_REPEAT := 0.25   # Wiederholrate bei gehaltener rechter Maustaste

var player: PlayerController
var ray: RayCast3D
var highlight: MeshInstance3D

var _dig_target := Vector3i.ZERO
var _dig_progress := 0.0
var _attack_cd := 0.0
var _place_cd := 0.0


func setup(p: PlayerController) -> void:
	player = p
	ray = RayCast3D.new()
	ray.target_position = Vector3(0, 0, -REACH)
	ray.collision_mask = 1 | 4  # Welt + Gegner
	p.camera.add_child(ray)
	_build_highlight()


## Drahtgitter-Box (12 Kanten) per ImmediateMesh - kein Asset noetig.
func _build_highlight() -> void:
	var im := ImmediateMesh.new()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.05, 0.05, 0.05)
	im.surface_begin(Mesh.PRIMITIVE_LINES, mat)
	var o := 0.002  # minimal groesser gegen Z-Fighting
	var lo := -o
	var hi := 1.0 + o
	var corners := [
		Vector3(lo, lo, lo), Vector3(hi, lo, lo), Vector3(hi, lo, hi), Vector3(lo, lo, hi),
		Vector3(lo, hi, lo), Vector3(hi, hi, lo), Vector3(hi, hi, hi), Vector3(lo, hi, hi),
	]
	for e in [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
			[0, 4], [1, 5], [2, 6], [3, 7]]:
		im.surface_add_vertex(corners[e[0]])
		im.surface_add_vertex(corners[e[1]])
	im.surface_end()
	highlight = MeshInstance3D.new()
	highlight.mesh = im
	highlight.top_level = true  # Weltkoordinaten statt Spieler-Transform
	highlight.visible = false
	player.add_child(highlight)


func _physics_process(delta: float) -> void:
	_attack_cd = maxf(_attack_cd - delta, 0.0)
	_place_cd = maxf(_place_cd - delta, 0.0)
	if player.frozen or Game.ui_open or Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		_stop_digging()
		highlight.visible = false
		return

	var collider: Object = ray.get_collider() if ray.is_colliding() else null

	# --------------------------------------------- Kreatur anvisiert ---
	var mob := collider as Mob
	if mob != null:
		highlight.visible = false
		_dig_progress = 0.0
		Game.hud.set_dig_progress(-1.0)
		if Input.is_action_pressed("attack") and _attack_cd <= 0.0:
			_attack_cd = ATTACK_COOLDOWN
			var dir := -player.camera.global_transform.basis.z
			mob.take_damage(ItemDB.attack_damage(player.inventory.selected_id()), dir)
			if player.inventory.damage_selected():
				Game.hud.toast("Werkzeug zerbrochen!")
		return

	# ------------------------------------------------- Block anvisiert ---
	if collider == null:
		_stop_digging()
		highlight.visible = false
		return

	var point := ray.get_collision_point()
	var normal := ray.get_collision_normal()
	var block_pos := Vector3i((point - normal * 0.5).floor())
	var place_pos := Vector3i((point + normal * 0.5).floor())

	highlight.visible = true
	highlight.global_position = Vector3(block_pos)

	if Input.is_action_pressed("attack"):
		_dig(delta, block_pos)
	else:
		_stop_digging()

	if Input.is_action_pressed("use") and _place_cd <= 0.0:
		_place_cd = PLACE_REPEAT
		_use(block_pos, place_pos)


# ------------------------------------------------------------------ Abbau ---

func _dig(delta: float, block_pos: Vector3i) -> void:
	if block_pos != _dig_target:
		_dig_target = block_pos
		_dig_progress = 0.0
	var block_id: int = Game.chunk_manager.get_block(block_pos)
	if block_id == BlockDB.AIR:
		return
	var held := player.inventory.selected_id()
	var needed := 0.05 if player.creative else ItemDB.dig_time(block_id, held)
	if needed == INF:
		Game.hud.set_dig_progress(-1.0)
		return
	_dig_progress += delta
	Game.hud.set_dig_progress(clampf(_dig_progress / needed, 0.0, 1.0))
	if _dig_progress >= needed:
		_break_block(block_pos, block_id, held)


func _stop_digging() -> void:
	_dig_progress = 0.0
	Game.hud.set_dig_progress(-1.0)


func _break_block(pos: Vector3i, block_id: int, held: String) -> void:
	var center := Vector3(pos) + Vector3(0.5, 0.4, 0.5)
	# Drops als aufsammelbare Item-Entities in die Welt werfen
	if ItemDB.yields_drops(block_id, held):
		var drop: String = BlockDB.get_def(block_id).drop
		if drop != "":
			ItemEntity.spawn_id(drop, 1, center)
		elif block_id == BlockDB.LEAVES and randf() < 0.08:
			ItemEntity.spawn_id("apple", 1, center)  # seltener Apfeldrop
	# Werkzeug abnutzen (nicht im Kreativmodus)
	if not player.creative and ItemDB.is_tool(held):
		if player.inventory.damage_selected():
			Game.hud.toast("Werkzeug zerbrochen!")
	# Inhalt von Block-Entities fallen lassen, bevor der Block verschwindet
	if block_id == BlockDB.FURNACE:
		for stack in Game.remove_furnace(pos):
			ItemEntity.spawn_stack(stack, center)
	elif block_id == BlockDB.CHEST:
		for stack in Game.remove_chest(pos):
			ItemEntity.spawn_stack(stack, center)
	Game.chunk_manager.set_block(pos, BlockDB.AIR)
	_spawn_break_particles(pos, block_id)
	_dig_progress = 0.0
	Game.hud.set_dig_progress(-1.0)


## Kleine Wuerfel-Partikel in der Durchschnittsfarbe des Blocks.
func _spawn_break_particles(pos: Vector3i, block_id: int) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = 14
	p.lifetime = 0.5
	p.explosiveness = 1.0
	p.direction = Vector3.UP
	p.spread = 60.0
	p.initial_velocity_min = 2.0
	p.initial_velocity_max = 3.5
	p.gravity = Vector3(0, -14, 0)
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(0.3, 0.3, 0.3)
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.08, 0.08, 0.08)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = BlockDB.avg_color(block_id)
	mesh.material = mat
	p.mesh = mesh
	Game.world.add_child(p)
	p.global_position = Vector3(pos) + Vector3(0.5, 0.5, 0.5)
	p.emitting = true
	p.finished.connect(p.queue_free)  # raeumt sich selbst auf


# ------------------------------------------------------- Benutzen/Platzieren ---

func _use(block_pos: Vector3i, place_pos: Vector3i) -> void:
	var target_id: int = Game.chunk_manager.get_block(block_pos)
	# Interaktive Bloecke oeffnen
	if target_id == BlockDB.CRAFTING_TABLE:
		Game.open_container(ContainerUI.Mode.TABLE)
		return
	if target_id == BlockDB.FURNACE:
		if not Game.furnaces.has(block_pos):
			Game.create_furnace(block_pos)  # z. B. aus altem Spielstand
		Game.open_container(ContainerUI.Mode.FURNACE, block_pos)
		return
	if target_id == BlockDB.CHEST:
		if not Game.chests.has(block_pos):
			Game.create_chest(block_pos)
		Game.open_container(ContainerUI.Mode.CHEST, block_pos)
		return

	var held := player.inventory.selected_id()
	if held == "":
		return
	# Essen
	if ItemDB.food_value(held) > 0:
		if player.stats.hunger < PlayerStats.MAX_HUNGER:
			player.stats.eat(ItemDB.food_value(held))
			player.inventory.consume_selected()
		return
	# Block platzieren
	var block := ItemDB.block_of(held)
	if block < 0:
		return
	var cell: int = Game.chunk_manager.get_block(place_pos)
	if cell != BlockDB.AIR and cell != BlockDB.WATER:
		return
	# Fackeln brauchen einen festen Block darunter und vertragen kein Wasser
	if block == BlockDB.TORCH:
		var below: int = Game.chunk_manager.get_block(place_pos + Vector3i(0, -1, 0))
		if cell == BlockDB.WATER or not BlockDB.is_solid(below):
			return
	# Nicht im eigenen Koerper platzieren
	var block_box := AABB(Vector3(place_pos), Vector3.ONE)
	var player_box := AABB(player.global_position - Vector3(0.4, 0.0, 0.4),
		Vector3(0.8, 1.85, 0.8))
	if block != BlockDB.TORCH and block_box.intersects(player_box):
		return
	Game.chunk_manager.set_block(place_pos, block)
	if block == BlockDB.FURNACE:
		Game.create_furnace(place_pos)
	elif block == BlockDB.CHEST:
		Game.create_chest(place_pos)
	player.inventory.consume_selected()
