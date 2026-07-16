class_name PlayerController
extends CharacterBody3D
## First-Person-Spieler: Laufen, Springen, Sprinten (Strg), Schwimmen,
## Kreativmodus (F: Fliegen + Sofort-Abbau). Kamera, Kollision und die
## Interaktions-/Statuskomponenten werden per Code aufgebaut.

const WALK_SPEED := 4.3
const SPRINT_SPEED := 5.9
const FLY_SPEED := 11.0
const FLY_SPRINT_SPEED := 22.0
const JUMP_VELOCITY := 8.7   # ~1,4 Bloecke Sprunghoehe
const GRAVITY := 27.0
const ACCEL := 10.0
const MOUSE_SENSITIVITY := 0.002
const EYE_HEIGHT := 1.62

var creative := false:
	set(v):
		creative = v
		flying = v
var flying := false
var frozen := true  # bis die Welt unter dem Spieler fertig gemesht ist
var third_person := false

var camera: Camera3D
var interaction: PlayerInteraction
var stats: PlayerStats
var inventory := Inventory.new()

var _fall_peak := 0.0   # hoechster Punkt seit Verlassen des Bodens (Fallschaden)
var _step_accum := 0.0  # zurueckgelegte Strecke bis zum naechsten Schrittgeraeusch
var _body: Node3D       # Klotz-Figur, nur in der Aussenansicht sichtbar
var _wish := Vector3.ZERO
var _lava_tick := 0.0   # Verbrennungsschaden-Intervall


func _ready() -> void:
	collision_layer = 2  # Layer 2 = Spieler
	collision_mask = 1   # kollidiert nur mit der Welt

	var shape := CapsuleShape3D.new()
	shape.radius = 0.38  # passt durch 1 Block breite Luecken
	shape.height = 1.8
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position.y = 0.9  # Node-Ursprung = Fuesse
	add_child(cs)

	camera = Camera3D.new()
	camera.position.y = EYE_HEIGHT
	camera.fov = 75.0
	camera.far = 400.0
	add_child(camera)

	# Spielerfigur fuer die Aussenansicht (F4)
	_body = Node3D.new()
	_body.visible = false
	add_child(_body)
	for part in [[Vector3(0.5, 0.75, 0.28), Vector3(0, 1.05, 0), Color(0.2, 0.45, 0.75)],
			[Vector3(0.45, 0.45, 0.45), Vector3(0, 1.65, 0), Color(0.85, 0.7, 0.55)],
			[Vector3(0.45, 0.7, 0.26), Vector3(0, 0.35, 0), Color(0.25, 0.3, 0.45)]]:
		var mesh := BoxMesh.new()
		mesh.size = part[0]
		var mat := StandardMaterial3D.new()
		mat.albedo_color = part[2]
		mesh.material = mat
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.position = part[1]
		_body.add_child(mi)

	stats = PlayerStats.new()
	add_child(stats)

	interaction = PlayerInteraction.new()
	add_child(interaction)
	interaction.setup(self)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if Game.ui_open:
		return
	# Maus wieder einfangen, wenn sie per Esc freigegeben wurde
	if event is InputEventMouseButton and event.pressed \
			and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var sens: float = MOUSE_SENSITIVITY * Game.settings.get("sensitivity", 1.0)
		rotate_y(-event.relative.x * sens)
		camera.rotation.x = clampf(camera.rotation.x - event.relative.y * sens,
			-PI / 2.0, PI / 2.0)
	elif event.is_action_pressed("toggle_creative"):
		creative = not creative
		if Game.hud:
			Game.hud.toast("Kreativmodus AN" if creative else "Kreativmodus AUS")
	elif event.is_action_pressed("drop_item"):
		_drop_selected()
	elif event.is_action_pressed("perspective"):
		third_person = not third_person
		_body.visible = third_person
	elif event is InputEventMouseButton and event.pressed:
		# Mausrad: Hotbar durchschalten
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			inventory.selected += 1
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			inventory.selected -= 1
	else:
		for i in Inventory.HOTBAR:
			if event.is_action_pressed("hotbar_%d" % (i + 1)):
				inventory.selected = i


func _physics_process(delta: float) -> void:
	if frozen:
		return
	var input_dir := Vector2.ZERO
	if not Game.ui_open and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var wish := (transform.basis * Vector3(input_dir.x, 0, input_dir.y))
	_wish = wish
	var sprinting := Input.is_action_pressed("sprint") and not Game.ui_open

	if flying:
		_fly(delta, wish, sprinting)
	else:
		_walk(delta, wish, sprinting)

	move_and_slide()
	if not flying:
		_step_assist()
	_update_camera()
	stats.on_moved(velocity, sprinting and input_dir != Vector2.ZERO)

	# Sprint-Gefuehl: Sichtfeld beim Rennen leicht aufziehen
	var target_fov := 82.0 if (sprinting and input_dir != Vector2.ZERO) else 75.0
	camera.fov = lerpf(camera.fov, target_fov, minf(10.0 * delta, 1.0))

	# Schrittgeraeusche je nach Untergrund
	if not flying and is_on_floor() and not is_in_water():
		_step_accum += Vector2(velocity.x, velocity.z).length() * delta
		if _step_accum >= 2.3:
			_step_accum = 0.0
			_play_step_sound()
	else:
		_step_accum = 0.0

	# Notfall: aus der Welt gefallen (sollte dank Grundgestein nicht passieren)
	if global_position.y < -20.0:
		global_position = Game.spawn_point
		velocity = Vector3.ZERO


func _fly(delta: float, wish: Vector3, sprinting: bool) -> void:
	var speed := FLY_SPRINT_SPEED if sprinting else FLY_SPEED
	var target := wish * speed
	if not Game.ui_open:
		if Input.is_action_pressed("jump"):
			target.y = speed
		elif Input.is_action_pressed("descend"):
			target.y = -speed
	velocity = velocity.lerp(target, minf(ACCEL * delta, 1.0))
	_fall_peak = global_position.y


func _walk(delta: float, wish: Vector3, sprinting: bool) -> void:
	var in_water := is_in_water()
	var speed := SPRINT_SPEED if sprinting else WALK_SPEED
	if in_water:
		speed *= 0.6

	# Leiter-Klettern: Leertaste hoch, Umschalt runter, sonst langsames Rutschen
	var on_ladder: bool = Game.chunk_manager.get_block(Vector3i(global_position.floor())) == BlockDB.LADDER \
		or Game.chunk_manager.get_block(Vector3i((global_position + Vector3(0, 1, 0)).floor())) == BlockDB.LADDER
	if on_ladder and not in_water:
		if not Game.ui_open and Input.is_action_pressed("jump"):
			velocity.y = 3.5
		elif not Game.ui_open and Input.is_action_pressed("descend"):
			velocity.y = -3.0
		else:
			velocity.y = move_toward(velocity.y, -1.2, 30.0 * delta)
		_fall_peak = global_position.y
	elif is_in_lava():
		# Lava: zaehes Waten + Verbrennungsschaden
		speed *= 0.35
		velocity.y = move_toward(velocity.y, -1.2, 12.0 * delta)
		if not Game.ui_open and Input.is_action_pressed("jump"):
			velocity.y = 3.0
		_fall_peak = global_position.y
		_lava_tick -= delta
		if _lava_tick <= 0.0:
			_lava_tick = 0.5
			if not creative:
				stats.damage(4.0, true)
	elif in_water:
		# Schwimmen: gebremstes Sinken, Leertaste schwimmt nach oben
		velocity.y = move_toward(velocity.y, -2.0, 18.0 * delta)
		if not Game.ui_open and Input.is_action_pressed("jump"):
			velocity.y = 4.5
		_fall_peak = global_position.y
	else:
		velocity.y -= GRAVITY * delta
		if is_on_floor():
			# Fallschaden beim Aufprall
			var fall := _fall_peak - global_position.y
			if fall > 3.5 and not creative:
				stats.damage(floorf(fall - 3.0), true)  # Ruestung schuetzt nicht vor Stuerzen
			_fall_peak = global_position.y
			if not Game.ui_open and Input.is_action_pressed("jump"):
				velocity.y = JUMP_VELOCITY
		else:
			_fall_peak = maxf(_fall_peak, global_position.y)

	var target := wish * speed
	velocity.x = lerpf(velocity.x, target.x, minf(ACCEL * delta, 1.0))
	velocity.z = lerpf(velocity.z, target.z, minf(ACCEL * delta, 1.0))


## Steht der Koerper (Huefthoehe) im Wasser?
func is_in_water() -> bool:
	var p := global_position + Vector3(0, 0.9, 0)
	return Game.chunk_manager.get_block(Vector3i(p.floor())) == BlockDB.WATER


## Steht der Koerper in Lava?
func is_in_lava() -> bool:
	var p := global_position + Vector3(0, 0.5, 0)
	return Game.chunk_manager.get_block(Vector3i(p.floor())) == BlockDB.LAVA


## Ist die Kamera unter Wasser? (fuer den HUD-Blaufilter)
func is_head_in_water() -> bool:
	return Game.chunk_manager.get_block(Vector3i(camera.global_position.floor())) == BlockDB.WATER


## Automatisch auf ~0,5 Bloecke hohe Hindernisse steigen
## (Halbbloecke, Stufen, Betten) - macht Treppenbauen fluessig begehbar.
func _step_assist() -> void:
	if not is_on_floor() or not is_on_wall() or _wish.length_squared() < 0.1:
		return
	var fwd := _wish.normalized()
	var front := global_position + fwd * 0.55
	var cell := Vector3i(Vector3(front.x, global_position.y + 0.05, front.z).floor())
	var fid: int = Game.chunk_manager.get_block(cell)
	if not _is_half_step(fid):
		return
	var above1: int = Game.chunk_manager.get_block(cell + Vector3i(0, 1, 0))
	var above2: int = Game.chunk_manager.get_block(cell + Vector3i(0, 2, 0))
	if not BlockDB.is_solid(above1) and not BlockDB.is_solid(above2):
		global_position.y += 0.55


func _is_half_step(id: int) -> bool:
	return id == BlockDB.SLAB_PLANK or id == BlockDB.SLAB_STONE or id == BlockDB.BED \
		or (id >= BlockDB.STAIR_PLANK_N and id <= BlockDB.STAIR_STONE_W)


## Kameraposition: Ego-Sicht oder Aussenansicht (mit Wand-Abstandspruefung).
func _update_camera() -> void:
	if not third_person:
		camera.position = Vector3(0, EYE_HEIGHT, 0)
		return
	var eye := global_position + Vector3(0, EYE_HEIGHT, 0)
	var back: Vector3 = camera.global_transform.basis.z  # zeigt nach hinten
	var dist := 4.0
	var query := PhysicsRayQueryParameters3D.create(eye, eye + back * (dist + 0.3), 1)
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if not hit.is_empty():
		dist = maxf(eye.distance_to(hit.position) - 0.3, 0.6)
	camera.position = Vector3(0, EYE_HEIGHT, 0) + camera.transform.basis * Vector3(0, 0, dist)


func _play_step_sound() -> void:
	var below: int = Game.chunk_manager.get_block(
		Vector3i((global_position + Vector3(0, -0.1, 0)).floor()))
	var kind := ""
	match below:
		BlockDB.GRASS, BlockDB.LEAVES, BlockDB.TALL_GRASS:
			kind = "step_grass"
		BlockDB.SAND, BlockDB.DIRT:
			kind = "step_sand"
		BlockDB.PLANKS, BlockDB.LOG, BlockDB.CRAFTING_TABLE, BlockDB.CHEST, BlockDB.BED:
			kind = "step_wood"
		BlockDB.AIR, BlockDB.WATER:
			return
		_:
			kind = "step_stone"
	Sfx.play(kind, -16.0)


## Q: 1 Stueck des gewaehlten Items in Blickrichtung werfen (Werkzeuge komplett).
func _drop_selected() -> void:
	var s = inventory.selected_stack()
	if s == null:
		return
	var one := {"id": s.id, "count": 1}
	if s.has("durability"):
		one.durability = s.durability
	var dir := -camera.global_transform.basis.z
	ItemEntity.throw_stack(one, camera.global_position + dir * 0.4,
		dir * 5.0 + Vector3(0, 1.5, 0))
	inventory.consume_selected()


func respawn() -> void:
	global_position = Game.spawn_point
	velocity = Vector3.ZERO
	_fall_peak = global_position.y
	stats.reset()
	frozen = false
