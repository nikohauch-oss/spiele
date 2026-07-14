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

var camera: Camera3D
var interaction: PlayerInteraction
var stats: PlayerStats
var inventory := Inventory.new()

var _fall_peak := 0.0  # hoechster Punkt seit Verlassen des Bodens (Fallschaden)


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
		rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		camera.rotation.x = clampf(camera.rotation.x - event.relative.y * MOUSE_SENSITIVITY,
			-PI / 2.0, PI / 2.0)
	elif event.is_action_pressed("toggle_creative"):
		creative = not creative
		if Game.hud:
			Game.hud.toast("Kreativmodus AN" if creative else "Kreativmodus AUS")
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
	var sprinting := Input.is_action_pressed("sprint") and not Game.ui_open

	if flying:
		_fly(delta, wish, sprinting)
	else:
		_walk(delta, wish, sprinting)

	move_and_slide()
	stats.on_moved(velocity, sprinting and input_dir != Vector2.ZERO)

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

	if in_water:
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
				stats.damage(floorf(fall - 3.0))
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


## Ist die Kamera unter Wasser? (fuer den HUD-Blaufilter)
func is_head_in_water() -> bool:
	return Game.chunk_manager.get_block(Vector3i(camera.global_position.floor())) == BlockDB.WATER


func respawn() -> void:
	global_position = Game.spawn_point
	velocity = Vector3.ZERO
	_fall_peak = global_position.y
	stats.reset()
	frozen = false
