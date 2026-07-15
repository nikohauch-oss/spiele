extends Node3D
## Einstiegspunkt: baut die Spielszene per Code zusammen (Environment, Tag/Nacht,
## ChunkManager, Spieler, HUD, Zombie-Spawner), wendet einen vorhandenen
## Spielstand an und steuert Spielstart (Spawn erst auf fertigem Chunk) + Respawn.

const START_ITEMS := []  # z. B. [["wooden_pickaxe", 1]] fuer Debug-Starts

var player: PlayerController
var _started := false


func _ready() -> void:
	randomize()
	var save := Game.try_load_save()
	Game.world_seed = save.get("seed", randi() & 0x7FFFFFFF)
	Game.world = self
	Game.furnaces.clear()
	Game.chests.clear()
	Game.ui_open = false

	# --- Environment: Himmel, Nebel (kaschiert die Sichtweite), Umgebungslicht ---
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.fog_enabled = true
	env.fog_density = 0.016
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	Game.day_night = DayNightCycle.new()
	Game.day_night.environment = env
	Game.day_night.time = save.get("time", DayNightCycle.DAY_LENGTH * 0.2)
	add_child(Game.day_night)

	# --- Welt ---
	Game.chunk_manager = ChunkManager.new()
	add_child(Game.chunk_manager)
	Game.chunk_manager.setup(Game.world_seed)
	if save.has("chunks"):
		Game.chunk_manager.load_edited_chunks(save.chunks)

	# --- Spieler ---
	player = PlayerController.new()
	Game.player = player
	add_child(player)
	var spawn_h: int = Game.chunk_manager.generator.surface_height(8, 8)
	Game.spawn_point = save.get("spawn", Vector3(8.5, spawn_h + 0.5, 8.5))
	player.global_position = Game.spawn_point
	player.frozen = true
	player.stats.died.connect(_on_player_died)

	# --- HUD ---
	Game.hud = HUD.new()
	add_child(Game.hud)
	Game.hud.bind(player)

	# --- Gegner ---
	var spawner := ZombieSpawner.new()
	spawner.name = "Zombies"
	add_child(spawner)

	_apply_save(save)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _apply_save(save: Dictionary) -> void:
	for pos: Vector3i in save.get("furnaces", {}):
		Game.furnaces[pos] = FurnaceState.deserialize(save.furnaces[pos])
	for pos: Vector3i in save.get("chests", {}):
		Game.chests[pos] = ChestState.deserialize(save.chests[pos])
	var pdata: Dictionary = save.get("player", {})
	if pdata.is_empty():
		for entry in START_ITEMS:
			player.inventory.add_item(entry[0], entry[1])
		return
	player.global_position = pdata.get("pos", Game.spawn_point)
	player.rotation.y = pdata.get("rot_y", 0.0)
	player.camera.rotation.x = pdata.get("cam_x", 0.0)
	player.creative = pdata.get("creative", false)
	player.inventory.load_from(pdata.get("inv", []))
	player.inventory.selected = pdata.get("selected", 0)
	player.stats.load_values(pdata.get("health", 20.0), pdata.get("hunger", 20.0))


func _process(_delta: float) -> void:
	# Spieler erst loslassen, wenn der Chunk unter ihm fertig gemesht ist
	if not _started:
		var cpos := ChunkManager.world_to_chunk(Vector3i(player.global_position.floor()))
		if Game.chunk_manager.is_chunk_meshed(cpos):
			_started = true
			player.frozen = false
			Game.hud.toast("Willkommen in VoxelCraft! (F3 = Debug, E = Inventar)")


func _on_player_died() -> void:
	player.frozen = true
	Game.hud.show_death(true)
	if Game.ui_open:
		Game.close_container()
	await get_tree().create_timer(3.0).timeout
	Game.hud.show_death(false)
	player.respawn()  # Inventar bleibt erhalten
