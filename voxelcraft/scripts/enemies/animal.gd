class_name Animal
extends Mob
## Passives Tier (Schwein): wandert tagsueber ueber die Wiesen, flieht ein
## paar Sekunden lang, wenn es getroffen wird, und droppt rohes
## Schweinefleisch - die Hauptnahrungsquelle neben Aepfeln.
## Gespawnt vom MobSpawner auf Grasbloecken.

const WALK_SPEED := 1.4
const FLEE_SPEED := 3.8
const JUMP_VELOCITY := 8.0
const DESPAWN_RANGE := 80.0

var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _flee_timer := 0.0
var _flee_dir := Vector3.ZERO


func _ready() -> void:
	health = 10.0
	add_capsule(0.4, 1.0)
	var pink := Color(0.93, 0.62, 0.65)
	add_box(Vector3(0.6, 0.5, 0.95), Vector3(0, 0.55, 0.05), pink)                     # Rumpf
	add_box(Vector3(0.42, 0.4, 0.3), Vector3(0, 0.68, -0.55), pink.lightened(0.1))     # Kopf
	add_box(Vector3(0.16, 0.12, 0.08), Vector3(0, 0.6, -0.72), Color(0.85, 0.5, 0.55)) # Ruessel
	add_box(Vector3(0.5, 0.3, 0.16), Vector3(0, 0.15, 0.32), pink.darkened(0.15))      # Beine hinten
	add_box(Vector3(0.5, 0.3, 0.16), Vector3(0, 0.15, -0.28), pink.darkened(0.15))     # Beine vorn


func _physics_process(delta: float) -> void:
	velocity.y -= GRAVITY * delta
	_flee_timer = maxf(_flee_timer - delta, 0.0)

	# Weit weg vom Spieler? Still despawnen (wie Zombies)
	if Game.player == null \
			or global_position.distance_to(Game.player.global_position) > DESPAWN_RANGE:
		queue_free()
		return

	var move_dir := Vector3.ZERO
	var speed := WALK_SPEED
	if _flee_timer > 0.0:
		move_dir = _flee_dir
		speed = FLEE_SPEED
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 6.0)
			# Meistens grasen, manchmal weiterziehen
			_wander_dir = Vector3.ZERO if randf() < 0.4 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
	velocity.x = move_dir.x * speed
	velocity.z = move_dir.z * speed

	# Kopf (lokales -Z) in Laufrichtung drehen
	if move_dir.length_squared() > 0.01:
		look_at(global_position + move_dir, Vector3.UP)
		if is_on_floor() and is_on_wall():
			velocity.y = JUMP_VELOCITY

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


## Getroffen: in Schlagrichtung davonlaufen
func _on_damaged(from_dir: Vector3) -> void:
	_flee_timer = 5.0
	_flee_dir = Vector3(from_dir.x, 0, from_dir.z).normalized()


func _on_death() -> void:
	ItemEntity.spawn_id("porkchop_raw", 1 + randi() % 2, global_position + Vector3(0, 0.6, 0))
