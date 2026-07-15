class_name Creeper
extends Mob
## Creeper: schleicht sich lautlos an, zuendet in der Naehe des Spielers
## (Zischen + weisses Blinken) und explodiert - reisst Bloecke aus der Welt
## und verursacht Distanz-Schaden. Entfernt sich der Spieler waehrend der
## Zuendung, bricht sie ab. Droppt beim normalen Tod Schwarzpulver.

const CHASE_SPEED := 2.6
const JUMP_VELOCITY := 8.0
const AGGRO_RANGE := 16.0
const FUSE_TRIGGER := 3.0    # Zuendabstand
const FUSE_ABORT := 6.0      # Abbruchabstand
const FUSE_TIME := 1.5
const EXPLOSION_RADIUS := 2.5
const DESPAWN_RANGE := 64.0

var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _fuse := -1.0  # < 0 = nicht gezuendet
var _flash_timer := 0.0


func _ready() -> void:
	health = 20.0
	add_to_group("monsters")
	add_capsule(0.35, 1.7)
	var green := Color(0.3, 0.65, 0.3)
	add_box(Vector3(0.5, 1.0, 0.3), Vector3(0, 0.85, 0), green)                    # Rumpf
	add_box(Vector3(0.5, 0.5, 0.5), Vector3(0, 1.6, 0), green.darkened(0.1))       # Kopf
	add_box(Vector3(0.5, 0.35, 0.24), Vector3(0, 0.17, 0.2), green.darkened(0.2))  # Fuesse
	add_box(Vector3(0.5, 0.35, 0.24), Vector3(0, 0.17, -0.2), green.darkened(0.2))


func _physics_process(delta: float) -> void:
	velocity.y -= GRAVITY * delta

	var player = Game.player
	var dist := INF
	var to_player := Vector3.ZERO
	if player and not player.frozen:
		to_player = player.global_position - global_position
		dist = to_player.length()

	if dist > DESPAWN_RANGE or (Game.day_night and not Game.day_night.is_night()):
		queue_free()
		return

	# ------------------------------------------------------- Zuendung ---
	if _fuse >= 0.0:
		velocity.x = 0.0
		velocity.z = 0.0
		if dist > FUSE_ABORT:
			_fuse = -1.0  # Spieler entkommen -> abbrechen
			_set_flash(false)
		else:
			_fuse -= delta
			_flash_timer -= delta
			if _flash_timer <= 0.0:  # weisses Blinken
				_flash_timer = 0.15
				_set_flash(int(_fuse / 0.15) % 2 == 0)
			if _fuse <= 0.0:
				_explode()
				return
		move_and_slide()
		return

	# ------------------------------------------------------ Verfolgen ---
	var move_dir := Vector3.ZERO
	if dist < AGGRO_RANGE:
		move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
		velocity.x = move_dir.x * CHASE_SPEED
		velocity.z = move_dir.z * CHASE_SPEED
		if dist < FUSE_TRIGGER:
			_fuse = FUSE_TIME
			Sfx.play_at("hiss", global_position)
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 5.0)
			_wander_dir = Vector3.ZERO if randf() < 0.35 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
		velocity.x = move_dir.x * 1.1
		velocity.z = move_dir.z * 1.1

	if move_dir.length_squared() > 0.01:
		rotation.y = atan2(-move_dir.x, -move_dir.z) + PI
		if is_on_floor() and is_on_wall():
			velocity.y = JUMP_VELOCITY

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


func _set_flash(on: bool) -> void:
	for part in _body_parts:
		var box := part.mesh as BoxMesh
		var mat := box.material as StandardMaterial3D
		var base: Color = part.get_meta("base_color")
		mat.albedo_color = Color(1, 1, 1) if on else base


func _explode() -> void:
	var center := global_position + Vector3(0, 0.9, 0)
	queue_free()
	Explosion.explode(center, EXPLOSION_RADIUS, 18.0)


func _on_death() -> void:
	ItemEntity.spawn_id("gunpowder", 1 + randi() % 2, global_position + Vector3(0, 0.8, 0))
