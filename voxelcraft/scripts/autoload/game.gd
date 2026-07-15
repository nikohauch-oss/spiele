extends Node
## Game (Autoload): zentraler Spielzustand und Service-Locator.
##  - registriert die Input-Actions per Code (keine fehleranfaellige project.godot-Serialisierung)
##  - haelt Referenzen auf Spieler, Welt, HUD, Tag/Nacht
##  - verwaltet Block-Entities (Oefen) und tickt sie
##  - Speichern/Laden der Welt (user://voxelcraft_save.dat, Godot-Binaerformat)
##  - oeffnet/schliesst Container-UIs (Inventar, Werkbank, Ofen)

const SAVE_VERSION := 4
const SETTINGS_PATH := "user://settings.cfg"
const CROP_STAGE_TIME := 60.0  # Sekunden pro Weizen-Wachstumsstufe

var player = null          # PlayerController
var chunk_manager = null   # ChunkManager
var hud = null             # HUD
var day_night = null       # DayNightCycle
var world = null           # Main-Node (Parent fuer Item-Entities)

var world_seed := 0
var spawn_point := Vector3.ZERO
var ui_open := false
var paused := false
var furnaces := {}         # Vector3i -> FurnaceState
var chests := {}           # Vector3i -> ChestState
var crops := {}            # Vector3i -> Wachstumsfortschritt in Sekunden
var loaded_save := {}      # von Main beim Start konsumiert

# Welt-Slots (Hauptmenue) + Einstellungen
var save_slot := 1
var settings := {"view_distance": 4, "sensitivity": 1.0, "volume": 0.8}


func _ready() -> void:
	_setup_input()
	load_settings()


func save_path(slot := -1) -> String:
	return "user://voxelcraft_slot%d.dat" % (save_slot if slot < 0 else slot)


func slot_exists(slot: int) -> bool:
	return FileAccess.file_exists(save_path(slot))


func delete_slot(slot: int) -> void:
	if slot_exists(slot):
		DirAccess.remove_absolute(save_path(slot))


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		for k in settings.keys():
			settings[k] = cfg.get_value("settings", k, settings[k])
	apply_volume()


func save_settings() -> void:
	var cfg := ConfigFile.new()
	for k in settings.keys():
		cfg.set_value("settings", k, settings[k])
	cfg.save(SETTINGS_PATH)


func apply_volume() -> void:
	var v: float = clampf(settings.get("volume", 0.8), 0.0, 1.0)
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(v, 0.001)))
	AudioServer.set_bus_mute(0, v <= 0.001)


func _process(delta: float) -> void:
	# Oefen schmelzen auch, wenn kein UI offen ist
	for f in furnaces.values():
		f.tick(delta)
	_tick_crops(delta)


## Weizen waechst in Echtzeit ueber zwei Stufen zur reifen Pflanze.
func _tick_crops(delta: float) -> void:
	if chunk_manager == null or crops.is_empty():
		return
	var advance: Array = []
	for pos: Vector3i in crops:
		crops[pos] += delta
		if crops[pos] >= CROP_STAGE_TIME:
			advance.append(pos)
	for pos: Vector3i in advance:
		var id: int = chunk_manager.get_block(pos)
		if id == BlockDB.WHEAT_0:
			chunk_manager.set_block(pos, BlockDB.WHEAT_1)
			crops[pos] = 0.0
		elif id == BlockDB.WHEAT_1:
			chunk_manager.set_block(pos, BlockDB.WHEAT_2)
			crops.erase(pos)  # ausgewachsen
		else:
			crops.erase(pos)  # Block ist weg oder Chunk entladen


# ------------------------------------------------------------------ Input ---

func _setup_input() -> void:
	_add_key("move_forward", KEY_W)
	_add_key("move_back", KEY_S)
	_add_key("move_left", KEY_A)
	_add_key("move_right", KEY_D)
	_add_key("jump", KEY_SPACE)
	_add_key("sprint", KEY_CTRL)
	_add_key("descend", KEY_SHIFT)     # Sinken im Flugmodus
	_add_key("toggle_creative", KEY_F)
	_add_key("inventory", KEY_E)
	_add_key("drop_item", KEY_Q)
	_add_key("perspective", KEY_F4)
	_add_key("minimap", KEY_M)
	_add_key("debug", KEY_F3)
	_add_key("save_world", KEY_F5)
	_add_key("load_world", KEY_F9)
	_add_key("new_world", KEY_F10)
	for i in 9:
		_add_key("hotbar_%d" % (i + 1), KEY_1 + i)
	_add_mouse("attack", MOUSE_BUTTON_LEFT)
	_add_mouse("use", MOUSE_BUTTON_RIGHT)


func _add_key(action: String, key: Key) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	var ev := InputEventKey.new()
	ev.physical_keycode = key
	InputMap.action_add_event(action, ev)


func _add_mouse(action: String, button: MouseButton) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)


func _unhandled_input(event: InputEvent) -> void:
	if player == null:
		return  # im Hauptmenue
	if event.is_action_pressed("ui_cancel"):
		if paused:
			set_pause(false)
		elif ui_open:
			close_container()
		else:
			set_pause(true)
	elif event.is_action_pressed("inventory"):
		if paused:
			return
		if ui_open:
			close_container()
		elif not player.frozen:
			open_container(ContainerUI.Mode.PLAYER)
	elif event.is_action_pressed("save_world"):
		save_world()
	elif event.is_action_pressed("load_world"):
		if FileAccess.file_exists(save_path()):
			get_tree().reload_current_scene()
	elif event.is_action_pressed("new_world"):
		delete_slot(save_slot)
		get_tree().reload_current_scene()
	elif event.is_action_pressed("debug") and hud:
		hud.toggle_debug()
	elif event.is_action_pressed("minimap") and hud and not ui_open:
		hud.toggle_map()


# ------------------------------------------------------------- Pause-Menue ---

func set_pause(on: bool) -> void:
	paused = on
	ui_open = on
	if hud:
		hud.set_paused(on)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if on else Input.MOUSE_MODE_CAPTURED


## Speichert und wechselt zurueck ins Hauptmenue.
func return_to_menu() -> void:
	save_world()
	paused = false
	ui_open = false
	player = null
	chunk_manager = null
	hud = null
	day_night = null
	world = null
	furnaces.clear()
	chests.clear()
	crops.clear()
	Sfx.set_rain(false)
	get_tree().change_scene_to_file("res://scenes/Menu.tscn")


# ----------------------------------------------------------- Container-UI ---

func open_container(mode: int, world_pos := Vector3i.ZERO) -> void:
	if hud == null:
		return
	ui_open = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var state = null
	if mode == ContainerUI.Mode.FURNACE:
		state = furnaces.get(world_pos)
	elif mode == ContainerUI.Mode.CHEST:
		state = chests.get(world_pos)
	hud.container.open(mode, state)


func close_container() -> void:
	if hud:
		hud.container.close()
	ui_open = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# ------------------------------------------------- Block-Entity-Registries ---

func create_furnace(pos: Vector3i) -> void:
	furnaces[pos] = FurnaceState.new()


## Ofen abgebaut: Zustand entfernen, Inhalt zurueckgeben.
func remove_furnace(pos: Vector3i) -> Array:
	var f = furnaces.get(pos)
	if f == null:
		return []
	furnaces.erase(pos)
	var stacks: Array = []
	for s in [f.input, f.fuel, f.output]:
		if s != null:
			stacks.append(s)
	return stacks


func create_chest(pos: Vector3i) -> void:
	chests[pos] = ChestState.new()


## Dungeon-Truhe: wird beim ersten Oeffnen mit Zufalls-Loot gefuellt.
func create_chest_with_loot(pos: Vector3i) -> void:
	var c := ChestState.new()
	# [Item, min, max, Wahrscheinlichkeit]
	var table := [["iron_ingot", 1, 3, 0.7], ["coal", 2, 5, 0.8], ["apple", 1, 3, 0.6],
		["arrow", 3, 8, 0.6], ["torch", 2, 6, 0.7], ["diamond", 1, 2, 0.25],
		["bow", 1, 1, 0.15], ["steak", 1, 2, 0.3], ["planks", 2, 6, 0.5]]
	for e: Array in table:
		if randf() < e[3]:
			var count: int = e[1] + randi() % (e[2] - e[1] + 1)
			c.slots[randi() % ChestState.SIZE] = Inventory.make_stack(e[0], count)
	chests[pos] = c


## Truhe abgebaut: Zustand entfernen, Inhalt zurueckgeben.
func remove_chest(pos: Vector3i) -> Array:
	var c = chests.get(pos)
	if c == null:
		return []
	chests.erase(pos)
	return c.contents()


# --------------------------------------------------------- Speichern/Laden ---

## Beim Szenenstart aufrufen: laedt den Spielstand (falls vorhanden) in loaded_save.
func try_load_save() -> Dictionary:
	loaded_save = {}
	if FileAccess.file_exists(save_path()):
		var f := FileAccess.open(save_path(), FileAccess.READ)
		if f:
			var data = f.get_var()
			if data is Dictionary and data.get("version", 0) == SAVE_VERSION:
				loaded_save = data
	return loaded_save


func save_world() -> void:
	if player == null or chunk_manager == null:
		return
	var furnace_data := {}
	for pos: Vector3i in furnaces:
		furnace_data[pos] = furnaces[pos].serialize()
	var chest_data := {}
	for pos: Vector3i in chests:
		chest_data[pos] = chests[pos].serialize()
	var data := {
		"version": SAVE_VERSION,
		"seed": world_seed,
		"time": day_night.time if day_night else 0.0,
		"spawn": spawn_point,
		"player": {
			"pos": player.global_position,
			"rot_y": player.rotation.y,
			"cam_x": player.camera.rotation.x,
			"health": player.stats.health,
			"hunger": player.stats.hunger,
			"creative": player.creative,
			"selected": player.inventory.selected,
			"inv": player.inventory.serialize(),
		},
		"chunks": chunk_manager.get_edited_chunks(),
		"furnaces": furnace_data,
		"chests": chest_data,
		"crops": crops.duplicate(),
	}
	var f := FileAccess.open(save_path(), FileAccess.WRITE)
	if f:
		f.store_var(data)  # nur Godot-Basistypen -> sicher deserialisierbar
		if hud:
			hud.toast("Welt gespeichert")
	elif hud:
		hud.toast("Speichern fehlgeschlagen!")


## Beim Beenden automatisch speichern.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and player != null:
		save_world()
