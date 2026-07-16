class_name Spider
extends Mob
## Spinne: verfolgt den Spieler nachts und klettert dabei Waende hoch
## (statt zu springen). Tagsueber neutral, greift nur an, wenn provoziert.
## Droppt Faden (fuer Bogen und Angel).

const CHASE_SPEED := 2.6
const AGGRO_RANGE := 14.0
const ATTACK_RANGE := 1.6
const DESPAWN_RANGE := 64.0

var _provoked := false
var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _attack_cd := 0.0


func _ready() -> void:
	health = 14.0
	add_to_group("monsters")
	add_capsule(0.5, 0.8)
	var dark := Color(0.16, 0.13, 0.15)
	add_box(Vector3(0.9, 0.42, 0.9), Vector3(0, 0.45, 0.1), dark)              # Koerper
	add_box(Vector3(0.5, 0.35, 0.4), Vector3(0, 0.42, -0.6), dark.lightened(0.08))  # Kopf
	add_box(Vector3(1.3, 0.08, 0.5), Vector3(0, 0.25, 0.1), dark.darkened(0.2))    # Beine
	add_box(Vector3(0.08, 0.08, 0.08), Vector3(-0.13, 0.5, -0.78), Color(0.9, 0.15, 0.1))  # Augen
	add_box(Vector3(0.08, 0.08, 0.08), Vector3(0.13, 0.5, -0.78), Color(0.9, 0.15, 0.1))


func _physics_process(delta: float) -> void:
	_attack_cd = maxf(_attack_cd - delta, 0.0)
	velocity.y -= GRAVITY * delta

	var player = Game.player
	var to_player := Vector3.ZERO
	var dist := INF
	if player and not player.frozen:
		to_player = player.global_position - global_position
		dist = to_player.length()
	if dist > DESPAWN_RANGE:
		queue_free()
		return

	# Nachts immer aggressiv, tagsueber nur wenn provoziert
	var aggressive: bool = _provoked or (Game.day_night and Game.day_night.is_night())
	var move_dir := Vector3.ZERO
	if aggressive and dist < AGGRO_RANGE:
		move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
		velocity.x = move_dir.x * CHASE_SPEED
		velocity.z = move_dir.z * CHASE_SPEED
		if dist < ATTACK_RANGE and absf(to_player.y) < 2.0 and _attack_cd <= 0.0:
			_attack_cd = 1.1
			player.stats.damage(2.5)
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 5.0)
			_wander_dir = Vector3.ZERO if randf() < 0.4 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
		velocity.x = move_dir.x * 1.0
		velocity.z = move_dir.z * 1.0

	if move_dir.length_squared() > 0.01:
		rotation.y = atan2(-move_dir.x, -move_dir.z) + PI
		# Klettern statt springen: an Waenden einfach hochlaufen
		if is_on_wall():
			velocity.y = 3.0

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


func _on_damaged(_from_dir: Vector3) -> void:
	_provoked = true


func _on_death() -> void:
	ItemEntity.spawn_id("string", 1 + randi() % 2, global_position + Vector3(0, 0.5, 0))
