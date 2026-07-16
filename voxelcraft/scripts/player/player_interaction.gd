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

# Angel-Zustand
var _fishing := false
var _bobber: MeshInstance3D
var _bite_timer := 0.0
var _bite_window := 0.0


func setup(p: PlayerController) -> void:
	player = p
	# Physik-Ray nur noch fuer Kreaturen; Bloecke findet ein Voxel-Raycast
	# (DDA) direkt in den Chunk-Daten - dadurch sind auch Pflanzen und
	# Fackeln ohne Kollisionsbox exakt anvisierbar.
	ray = RayCast3D.new()
	ray.target_position = Vector3(0, 0, -REACH)
	ray.collision_mask = 4
	p.camera.add_child(ray)
	_build_highlight()


## Voxel-Raycast (Amanatides & Woo): laeuft Zelle fuer Zelle durch die Welt.
## Rueckgabe: {"pos": Vector3i, "normal": Vector3i, "dist": float} oder {}.
func _voxel_raycast(from: Vector3, dir: Vector3, max_dist: float,
		stop_at_water := false) -> Dictionary:
	var pos := Vector3i(from.floor())
	var step := Vector3i(signf(dir.x), signf(dir.y), signf(dir.z))
	var t_max := Vector3.INF
	var t_delta := Vector3.INF
	for axis in 3:
		if absf(dir[axis]) > 0.0001:
			t_delta[axis] = absf(1.0 / dir[axis])
			var boundary := float(pos[axis] + (1 if step[axis] > 0 else 0))
			t_max[axis] = (boundary - from[axis]) / dir[axis]
	var normal := Vector3i.ZERO
	var t := 0.0
	while t <= max_dist:
		var id: int = Game.chunk_manager.get_block(pos)
		if id != BlockDB.AIR and id != BlockDB.WATER and id != BlockDB.LAVA:
			return {"pos": pos, "normal": normal, "dist": t}
		if stop_at_water and id == BlockDB.WATER:
			return {"pos": pos, "normal": normal, "dist": t, "water": true}
		# zur naechsten Zellgrenze springen (kleinstes t_max gewinnt)
		var axis := 0
		if t_max.y < t_max.x:
			axis = 1
		if t_max.z < t_max[axis]:
			axis = 2
		t = t_max[axis]
		t_max[axis] += t_delta[axis]
		pos[axis] += step[axis]
		normal = Vector3i.ZERO
		normal[axis] = -step[axis]
	return {}


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
	_tick_fishing(delta)
	if player.frozen or Game.ui_open or Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		_stop_digging()
		highlight.visible = false
		return

	var cam_pos := player.camera.global_position
	var cam_dir := -player.camera.global_transform.basis.z
	var block_hit := _voxel_raycast(cam_pos, cam_dir, REACH)

	# --------------------------------------------- Kreatur anvisiert ---
	var mob := (ray.get_collider() if ray.is_colliding() else null) as Mob
	if mob != null and not block_hit.is_empty() \
			and ray.get_collision_point().distance_to(cam_pos) > float(block_hit.dist):
		mob = null  # ein Block verdeckt die Kreatur
	if mob != null:
		highlight.visible = false
		_dig_progress = 0.0
		Game.hud.set_dig_progress(-1.0)
		# Rechtsklick auf Kreaturen: fuettern, zaehmen, handeln
		if Input.is_action_pressed("use") and _place_cd <= 0.0:
			var held_use := player.inventory.selected_id()
			if mob is Trader:
				_place_cd = PLACE_REPEAT
				Game.open_container(ContainerUI.Mode.TRADE)
				return
			if mob is Animal and held_use == "wheat":
				_place_cd = PLACE_REPEAT
				if (mob as Animal).try_feed():
					player.inventory.consume_selected()
					Sfx.play("eat")
				return
			if mob is Wolf and held_use in Wolf.MEAT:
				_place_cd = PLACE_REPEAT
				if (mob as Wolf).try_tame():
					player.inventory.consume_selected()
					Sfx.play("eat")
				return
		if Input.is_action_pressed("attack") and _attack_cd <= 0.0:
			_attack_cd = ATTACK_COOLDOWN
			var dir := -player.camera.global_transform.basis.z
			mob.take_damage(ItemDB.attack_damage(player.inventory.selected_id()), dir)
			if player.inventory.damage_selected():
				Game.hud.toast("Werkzeug zerbrochen!")
		_handle_use(Vector3i.ZERO, Vector3i.ZERO, false)  # Bogen/Essen geht trotzdem
		return

	# ------------------------------------------------- Block anvisiert ---
	if block_hit.is_empty():
		_stop_digging()
		highlight.visible = false
		_handle_use(Vector3i.ZERO, Vector3i.ZERO, false)  # Bogen/Essen in die Luft
		return

	var block_pos: Vector3i = block_hit.pos
	var place_pos: Vector3i = block_hit.pos + block_hit.normal

	highlight.visible = true
	highlight.global_position = Vector3(block_pos)

	if Input.is_action_pressed("attack"):
		_dig(delta, block_pos)
	else:
		_stop_digging()

	_handle_use(block_pos, place_pos, true)


func _handle_use(block_pos: Vector3i, place_pos: Vector3i, has_target: bool) -> void:
	if Input.is_action_pressed("use") and _place_cd <= 0.0:
		_place_cd = PLACE_REPEAT
		_use(block_pos, place_pos, has_target)


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
		elif block_id == BlockDB.LEAVES:
			# Mit der Axt gibt es Laub (Werkstoff fuer Bett/Bogen/Pfeile),
			# sonst nur ab und zu einen Apfel
			if ItemDB.get_def(held).get("tool", "") == "axe":
				ItemEntity.spawn_id("leaves", 1, center)
			elif randf() < 0.08:
				ItemEntity.spawn_id("apple", 1, center)
	# Werkzeug abnutzen (nicht im Kreativmodus)
	if not player.creative and ItemDB.is_tool(held):
		if player.inventory.damage_selected():
			Game.hud.toast("Werkzeug zerbrochen!")
	# Reifer Weizen gibt Weizen + Samen; junger nur Samen (via drop-Def)
	if block_id == BlockDB.WHEAT_2:
		ItemEntity.spawn_id("wheat", 1, center)
		ItemEntity.spawn_id("seeds", 1 + randi() % 2, center)
	if block_id >= BlockDB.WHEAT_0 and block_id <= BlockDB.WHEAT_2:
		Game.crops.erase(pos)
	# Tueren: die zweite Haelfte still mit entfernen
	if block_id >= BlockDB.DOOR_C_N and block_id <= BlockDB.DOOR_O_W:
		for off in [Vector3i(0, -1, 0), Vector3i(0, 1, 0)]:
			if Game.chunk_manager.get_block(pos + off) == block_id:
				Game.chunk_manager.set_block(pos + off, BlockDB.AIR)
				break
	# Inhalt von Block-Entities fallen lassen, bevor der Block verschwindet
	if block_id == BlockDB.FURNACE:
		for stack in Game.remove_furnace(pos):
			ItemEntity.spawn_stack(stack, center)
	elif block_id == BlockDB.CHEST:
		if not Game.chests.has(pos):
			Game.create_chest_with_loot(pos)  # ungeoeffnete Dungeon-Truhe
		for stack in Game.remove_chest(pos):
			ItemEntity.spawn_stack(stack, center)
	Game.chunk_manager.set_block(pos, BlockDB.AIR)
	Game.stats.blocks_mined += 1
	_pop_supported_above(pos)
	_spawn_break_particles(pos, block_id)
	Sfx.play_at("break", center)
	_dig_progress = 0.0
	Game.hud.set_dig_progress(-1.0)


## Pflanzen/Fackeln/Kakteen/Weizen ueber einem entfernten Block "abknicken".
func _pop_supported_above(pos: Vector3i) -> void:
	var above := pos + Vector3i(0, 1, 0)
	while true:
		var id: int = Game.chunk_manager.get_block(above)
		if id != BlockDB.TORCH and id != BlockDB.FLOWER_RED \
				and id != BlockDB.FLOWER_YELLOW and id != BlockDB.TALL_GRASS \
				and id != BlockDB.CACTUS \
				and not (id >= BlockDB.WHEAT_0 and id <= BlockDB.WHEAT_2):
			break
		var drop: String = BlockDB.get_def(id).drop
		if drop != "":
			ItemEntity.spawn_id(drop, 1, Vector3(above) + Vector3(0.5, 0.4, 0.5))
		if id >= BlockDB.WHEAT_0 and id <= BlockDB.WHEAT_2:
			Game.crops.erase(above)
		Game.chunk_manager.set_block(above, BlockDB.AIR)
		above += Vector3i(0, 1, 0)


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

func _use(block_pos: Vector3i, place_pos: Vector3i, has_target: bool) -> void:
	var held := player.inventory.selected_id()
	if has_target:
		var target_id: int = Game.chunk_manager.get_block(block_pos)
		# Interaktive Bloecke haben Vorrang
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
				# Truhe ohne Zustand = vom Weltgenerator (Dungeon) -> Loot!
				Game.create_chest_with_loot(block_pos)
			Game.open_container(ContainerUI.Mode.CHEST, block_pos)
			return
		if target_id == BlockDB.BED:
			_try_sleep(block_pos)
			return
		if target_id == BlockDB.C4:
			# Zuenden: Block raus, tickende Entity rein
			Game.chunk_manager.set_block(block_pos, BlockDB.AIR)
			C4Entity.ignite(block_pos)
			return
		if target_id >= BlockDB.DOOR_C_N and target_id <= BlockDB.DOOR_O_W:
			_toggle_door(block_pos, target_id)
			return
		# Hacke auf Gras/Erde -> Ackerboden
		if ItemDB.get_def(held).get("tool", "") == "hoe" \
				and (target_id == BlockDB.GRASS or target_id == BlockDB.DIRT) \
				and Game.chunk_manager.get_block(block_pos + Vector3i(0, 1, 0)) == BlockDB.AIR:
			Game.chunk_manager.set_block(block_pos, BlockDB.FARMLAND)
			if player.inventory.damage_selected():
				Game.hud.toast("Werkzeug zerbrochen!")
			Sfx.play_at("place", Vector3(block_pos) + Vector3(0.5, 1, 0.5))
			return
		# Samen auf Ackerboden -> Weizen
		if held == "seeds" and target_id == BlockDB.FARMLAND:
			var crop_pos := block_pos + Vector3i(0, 1, 0)
			if Game.chunk_manager.get_block(crop_pos) == BlockDB.AIR:
				Game.chunk_manager.set_block(crop_pos, BlockDB.WHEAT_0)
				Game.crops[crop_pos] = 0.0
				player.inventory.consume_selected()
				Sfx.play_at("place", Vector3(crop_pos))
			return

	# Bogen schiessen (braucht kein Blockziel)
	if held == "bow":
		_place_cd = 1.0  # Nachspann-Zeit
		_shoot_bow()
		return
	# Angeln (braucht Wasser in Blickrichtung)
	if held == "fishing_rod":
		_place_cd = 0.5
		_handle_fishing()
		return
	# Essen (braucht ebenfalls kein Blockziel)
	if ItemDB.food_value(held) > 0:
		if player.stats.hunger < PlayerStats.MAX_HUNGER:
			player.stats.eat(ItemDB.food_value(held))
			player.inventory.consume_selected()
			Sfx.play("eat")
		return

	if not has_target or held == "":
		return
	# Tuer: belegt zwei Zellen, Ausrichtung nach Blickrichtung
	if held == "door":
		var below_door: int = Game.chunk_manager.get_block(place_pos + Vector3i(0, -1, 0))
		if Game.chunk_manager.get_block(place_pos) == BlockDB.AIR \
				and Game.chunk_manager.get_block(place_pos + Vector3i(0, 1, 0)) == BlockDB.AIR \
				and BlockDB.is_solid(below_door):
			var door_id: int = BlockDB.DOOR_C_N + _facing_index()
			Game.chunk_manager.set_block(place_pos, door_id)
			Game.chunk_manager.set_block(place_pos + Vector3i(0, 1, 0), door_id)
			player.inventory.consume_selected()
			Sfx.play_at("place", Vector3(place_pos) + Vector3(0.5, 1, 0.5))
		return
	# Block platzieren
	var block := ItemDB.block_of(held)
	if block < 0:
		return
	# Stufen: Variante nach Blickrichtung (Aufstieg vom Spieler weg)
	if block == BlockDB.STAIR_PLANK_N or block == BlockDB.STAIR_STONE_N:
		block += _facing_index()
	var cell: int = Game.chunk_manager.get_block(place_pos)
	# Hohes Gras darf ueberbaut werden (wie in Minecraft)
	if cell != BlockDB.AIR and cell != BlockDB.WATER and cell != BlockDB.TALL_GRASS:
		return
	# Untergrund-Regeln: Fackel/Bett auf Festem, Pflanzen auf Gras/Erde,
	# Kakteen auf Sand (oder Kaktus) - jeweils nicht im Wasser
	var below: int = Game.chunk_manager.get_block(place_pos + Vector3i(0, -1, 0))
	match block:
		BlockDB.TORCH, BlockDB.BED:
			if cell == BlockDB.WATER or not BlockDB.is_solid(below):
				return
		BlockDB.FLOWER_RED, BlockDB.FLOWER_YELLOW, BlockDB.TALL_GRASS:
			if cell == BlockDB.WATER or (below != BlockDB.GRASS and below != BlockDB.DIRT):
				return
		BlockDB.MUSHROOM_BROWN, BlockDB.MUSHROOM_RED:
			# Pilze wachsen auch auf Stein (Hoehlen), brauchen kein Licht
			if cell == BlockDB.WATER or not BlockDB.is_solid(below):
				return
		BlockDB.CACTUS:
			if cell == BlockDB.WATER or (below != BlockDB.SAND and below != BlockDB.CACTUS):
				return
		BlockDB.LADDER:
			# Leitern brauchen eine feste Wand daneben
			if cell == BlockDB.WATER:
				return
			var wall := false
			for off in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0),
					Vector3i(0, 0, 1), Vector3i(0, 0, -1)]:
				if BlockDB.is_solid(Game.chunk_manager.get_block(place_pos + off)):
					wall = true
					break
			if not wall:
				return
	# Nicht im eigenen Koerper platzieren (durchlaufbare Bloecke sind ok)
	var block_box := AABB(Vector3(place_pos), Vector3.ONE)
	var player_box := AABB(player.global_position - Vector3(0.4, 0.0, 0.4),
		Vector3(0.8, 1.85, 0.8))
	if BlockDB.is_solid(block) and block_box.intersects(player_box):
		return
	Game.chunk_manager.set_block(place_pos, block)
	if block == BlockDB.FURNACE:
		Game.create_furnace(place_pos)
	elif block == BlockDB.CHEST:
		Game.create_chest(place_pos)
	player.inventory.consume_selected()
	Game.stats.blocks_placed += 1
	Sfx.play_at("place", Vector3(place_pos) + Vector3(0.5, 0.5, 0.5))


# ------------------------------------------------------------------ Angeln ---

func _handle_fishing() -> void:
	if _fishing:
		# Einholen: Biss erwischt?
		if _bite_window > 0.0:
			var r := randf()
			var loot := "fish_raw"
			if r > 0.95:
				loot = "iron_ingot"
			elif r > 0.85:
				loot = "string"
			elif r > 0.7:
				loot = "stick"
			player.inventory.add_item(loot)
			Game.hud.toast("Gefangen: %s!" % ItemDB.display_name(loot))
			Sfx.play("pop")
			if player.inventory.damage_selected():
				Game.hud.toast("Angel zerbrochen!")
		_stop_fishing()
		return
	# Auswerfen: Wasser in Blickrichtung suchen
	var dir := -player.camera.global_transform.basis.z
	var hit := _voxel_raycast(player.camera.global_position, dir, 8.0, true)
	if hit.is_empty() or not hit.has("water"):
		Game.hud.toast("Kein Wasser in Reichweite.")
		return
	_fishing = true
	_bite_timer = randf_range(3.0, 8.0)
	_bite_window = 0.0
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.18, 0.18, 0.18)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.9, 0.25, 0.2)
	mesh.material = mat
	_bobber = MeshInstance3D.new()
	_bobber.mesh = mesh
	Game.world.add_child(_bobber)
	_bobber.global_position = Vector3(hit.pos as Vector3i) + Vector3(0.5, 0.95, 0.5)


func _stop_fishing() -> void:
	_fishing = false
	if _bobber != null:
		_bobber.queue_free()
		_bobber = null


func _tick_fishing(delta: float) -> void:
	if not _fishing:
		return
	# Angel weggelegt? -> einholen ohne Fang
	if player.inventory.selected_id() != "fishing_rod":
		_stop_fishing()
		return
	if _bite_window > 0.0:
		_bite_window -= delta
		if _bite_window <= 0.0:
			_bobber.position.y += 0.25  # Fisch wieder weg
			_bite_timer = randf_range(3.0, 8.0)
	else:
		_bobber.position.y += sin(Time.get_ticks_msec() / 300.0) * 0.0015
		_bite_timer -= delta
		if _bite_timer <= 0.0:
			_bite_window = 1.5  # Biss! Kurz Zeit zum Einholen
			_bobber.position.y -= 0.25
			Sfx.play_at("pop", _bobber.global_position)


## Blickrichtung als Index 0=N(-z) 1=O(+x) 2=S(+z) 3=W(-x).
func _facing_index() -> int:
	var f := -player.transform.basis.z
	if absf(f.x) > absf(f.z):
		return 1 if f.x > 0.0 else 3
	return 2 if f.z > 0.0 else 0


## Tuer oeffnen/schliessen: beide Zellhaelften gemeinsam umschalten.
func _toggle_door(pos: Vector3i, id: int) -> void:
	var toggled: int = id + 4 if id < BlockDB.DOOR_O_N else id - 4
	var partner := pos + Vector3i(0, -1, 0)
	if Game.chunk_manager.get_block(partner) != id:
		partner = pos + Vector3i(0, 1, 0)
	Game.chunk_manager.set_block(pos, toggled)
	if Game.chunk_manager.get_block(partner) == id:
		Game.chunk_manager.set_block(partner, toggled)
	Sfx.play_at("place", Vector3(pos) + Vector3(0.5, 0.5, 0.5))


## Rechtsklick auf ein Bett: nachts schlafen -> Morgen + neuer Spawnpunkt.
func _try_sleep(bed_pos: Vector3i) -> void:
	if not Game.day_night.is_night():
		Game.hud.toast("Schlafen geht nur nachts.")
		return
	for m in get_tree().get_nodes_in_group("monsters"):
		if m.global_position.distance_to(player.global_position) < 14.0:
			Game.hud.toast("Du kannst nicht schlafen - Monster in der Naehe!")
			return
	Game.day_night.time = 0.0  # Sonnenaufgang
	Game.spawn_point = Vector3(bed_pos) + Vector3(0.5, 0.7, 0.5)
	Game.hud.toast("Guten Morgen! Spawnpunkt gesetzt.")
	Sfx.play("pop")


func _shoot_bow() -> void:
	if not player.creative and player.inventory.count_of("arrow") <= 0:
		Game.hud.toast("Keine Pfeile!")
		return
	var dir := -player.camera.global_transform.basis.z
	Arrow.shoot(player.camera.global_position + dir * 0.4, dir * 26.0, 5.0, player)
	Sfx.play("shoot")
	if not player.creative:
		player.inventory.remove_id("arrow", 1)
		if player.inventory.damage_selected():
			Game.hud.toast("Bogen zerbrochen!")
