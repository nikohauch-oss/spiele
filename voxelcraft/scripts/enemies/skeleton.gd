class_name SkeletonMob
extends Mob
## Skelett-Bogenschuetze: haelt Abstand zum Spieler (Wohlfuehlzone 6-12 m)
## und schiesst Pfeile, sobald es freie Sicht hat. Spawnt nachts (MobSpawner),
## verschwindet am Tag, droppt Pfeile und mit etwas Glueck einen Bogen.

const WALK_SPEED := 1.2
const MOVE_SPEED := 2.4
const JUMP_VELOCITY := 8.0
const AGGRO_RANGE := 17.0
const SHOOT_RANGE := 15.0
const KEEP_MIN := 6.0     # zu nah -> zurueckweichen
const KEEP_MAX := 12.0    # zu weit -> aufschliessen
const SHOOT_COOLDOWN := 2.2
const ARROW_SPEED := 20.0
const DESPAWN_RANGE := 64.0

var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _shoot_cd := 1.0


func _ready() -> void:
	health = 20.0
	add_to_group("monsters")
	add_capsule(0.3, 1.9)
	var bone := Color(0.88, 0.88, 0.82)
	add_box(Vector3(0.4, 1.3, 0.22), Vector3(0, 0.65, 0), bone)          # Rumpf
	add_box(Vector3(0.42, 0.42, 0.42), Vector3(0, 1.6, 0), bone.lightened(0.05))  # Kopf
	add_box(Vector3(0.07, 0.55, 0.07), Vector3(0.28, 1.1, -0.12), Color(0.5, 0.37, 0.2))  # Bogen


func _physics_process(delta: float) -> void:
	_shoot_cd = maxf(_shoot_cd - delta, 0.0)
	velocity.y -= GRAVITY * delta

	var player = Game.player
	var to_player := Vector3.ZERO
	var dist := INF
	if player and not player.frozen:
		to_player = player.global_position - global_position
		dist = to_player.length()

	# Despawn: tagsueber oder ausser Reichweite
	if dist > DESPAWN_RANGE or (Game.day_night and not Game.day_night.is_night()):
		queue_free()
		return

	var move_dir := Vector3.ZERO
	if dist < AGGRO_RANGE:
		var flat := Vector3(to_player.x, 0, to_player.z).normalized()
		# Abstand halten: zu nah -> weg, zu weit -> hin, sonst stehen und schiessen
		if dist < KEEP_MIN:
			move_dir = -flat
		elif dist > KEEP_MAX:
			move_dir = flat
		velocity.x = move_dir.x * MOVE_SPEED
		velocity.z = move_dir.z * MOVE_SPEED
		rotation.y = atan2(-flat.x, -flat.z) + PI  # Spieler anschauen
		if _shoot_cd <= 0.0 and dist <= SHOOT_RANGE and _sees_player(player):
			_shoot_cd = SHOOT_COOLDOWN
			_shoot_at(player, dist)
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 5.0)
			_wander_dir = Vector3.ZERO if randf() < 0.35 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
		velocity.x = move_dir.x * WALK_SPEED
		velocity.z = move_dir.z * WALK_SPEED
		if move_dir.length_squared() > 0.01:
			rotation.y = atan2(-move_dir.x, -move_dir.z) + PI

	if is_on_floor() and is_on_wall() and move_dir.length_squared() > 0.01:
		velocity.y = JUMP_VELOCITY

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


## Freie Sicht? (Raycast nur gegen die Welt)
func _sees_player(player) -> bool:
	var eye := global_position + Vector3(0, 1.6, 0)
	var target: Vector3 = player.global_position + Vector3(0, 1.4, 0)
	var query := PhysicsRayQueryParameters3D.create(eye, target, 1)
	return get_world_3d().direct_space_state.intersect_ray(query).is_empty()


func _shoot_at(player, dist: float) -> void:
	var eye := global_position + Vector3(0, 1.6, 0)
	var target: Vector3 = player.global_position + Vector3(0, 1.2, 0)
	# Bogenschuss: leicht ueberhoehen (Schwerkraft) + kleine Streuung
	var dir := (target - eye + Vector3(0, dist * 0.05, 0)).normalized()
	dir += Vector3(randf_range(-0.04, 0.04), randf_range(-0.02, 0.04), randf_range(-0.04, 0.04))
	Arrow.shoot(eye + dir * 0.5, dir.normalized() * ARROW_SPEED, 3.0, self)
	Sfx.play_at("shoot", eye)


func _on_death() -> void:
	var pos := global_position + Vector3(0, 0.8, 0)
	ItemEntity.spawn_id("arrow", 1 + randi() % 3, pos)
	if randf() < 0.25:
		ItemEntity.spawn_id("bow", 1, pos)
