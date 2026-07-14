extends Node
## Game (Autoload): zentraler Spielzustand und Service-Locator.
##  - registriert die Input-Actions per Code (keine fehleranfaellige project.godot-Serialisierung)
##  - haelt Referenzen auf Spieler, Welt, HUD, Tag/Nacht
##  - verwaltet Block-Entities (Oefen) und tickt sie
##  - Speichern/Laden der Welt (user://voxelcraft_save.dat, Godot-Binaerformat)
##  - oeffnet/schliesst Container-UIs (Inventar, Werkbank, Ofen)

const SAVE_PATH := "user://voxelcraft_save.dat"
const SAVE_VERSION := 1

var player = null          # PlayerController
var chunk_manager = null   # ChunkManager
var hud = null             # HUD
var day_night = null       # DayNightCycle

var world_seed := 0
var spawn_point := Vector3.ZERO
var ui_open := false
var furnaces := {}         # Vector3i -> FurnaceState
var loaded_save := {}      # von Main beim Start konsumiert


func _ready() -> void:
	_setup_input()


func _process(delta: float) -> void:
	# Oefen schmelzen auch, wenn kein UI offen ist
	for f in furnaces.values():
		f.tick(delta)


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
	if event.is_action_pressed("ui_cancel"):
		if ui_open:
			close_container()
		elif Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event.is_action_pressed("inventory"):
		if ui_open:
			close_container()
		elif player and not player.frozen:
			open_container(ContainerUI.Mode.PLAYER)
	elif event.is_action_pressed("save_world"):
		save_world()
	elif event.is_action_pressed("load_world"):
		if FileAccess.file_exists(SAVE_PATH):
			get_tree().reload_current_scene()
	elif event.is_action_pressed("new_world"):
		if FileAccess.file_exists(SAVE_PATH):
			DirAccess.remove_absolute(SAVE_PATH)
		get_tree().reload_current_scene()
	elif event.is_action_pressed("debug") and hud:
		hud.toggle_debug()


# ----------------------------------------------------------- Container-UI ---

func open_container(mode: int, world_pos := Vector3i.ZERO) -> void:
	if hud == null:
		return
	ui_open = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var furnace = furnaces.get(world_pos) if mode == ContainerUI.Mode.FURNACE else null
	hud.container.open(mode, furnace)


func close_container() -> void:
	if hud:
		hud.container.close()
	ui_open = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# ------------------------------------------------------------ Ofen-Registry ---

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


# --------------------------------------------------------- Speichern/Laden ---

## Beim Szenenstart aufrufen: laedt den Spielstand (falls vorhanden) in loaded_save.
func try_load_save() -> Dictionary:
	loaded_save = {}
	if FileAccess.file_exists(SAVE_PATH):
		var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
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
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
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
