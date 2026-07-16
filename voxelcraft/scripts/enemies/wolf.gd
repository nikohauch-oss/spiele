class_name Wolf
extends Mob
## Wolf: wild in Waeldern unterwegs; mit Fleisch zaehmbar (rotes Halsband).
## Gezaehmt folgt er dem Spieler, teleportiert bei zu grossem Abstand nach
## und greift selbststaendig Monster in der Naehe an. Gezaehmte Woelfe
## werden im Spielstand gespeichert.

const FOLLOW_SPEED := 3.4
const ATTACK_DAMAGE := 3.0
const DESPAWN_RANGE := 80.0
const MEAT := ["porkchop_raw", "porkchop_cooked", "beef_raw", "steak",
	"chicken_raw", "chicken_cooked", "rotten_flesh"]

var tamed := false

var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _attack_cd := 0.0
var _target: Mob = null


func _ready() -> void:
	health = 14.0
	add_to_group("wolves")
	add_capsule(0.35, 0.9)
	var fur := Color(0.75, 0.73, 0.7)
	add_box(Vector3(0.45, 0.45, 0.85), Vector3(0, 0.5, 0.1), fur)                # Rumpf
	add_box(Vector3(0.35, 0.32, 0.35), Vector3(0, 0.62, -0.5), fur.lightened(0.08))  # Kopf
	add_box(Vector3(0.12, 0.1, 0.18), Vector3(0, 0.52, -0.72), Color(0.35, 0.32, 0.3))  # Schnauze
	add_box(Vector3(0.4, 0.3, 0.14), Vector3(0, 0.15, 0.25), fur.darkened(0.15))
	add_box(Vector3(0.4, 0.3, 0.14), Vector3(0, 0.15, -0.25), fur.darkened(0.15))


func try_tame() -> bool:
	if tamed:
		if health < 14.0:
			health = 14.0  # Fuettern heilt
			return true
		return false
	make_tamed()
	Game.hud.toast("Wolf gezaehmt! Er folgt dir jetzt.")
	Game.achieve("wolf", "Erfolg: Bester Freund!")
	return true


## Zaehmt ohne Toast (auch fuers Wiederherstellen aus dem Spielstand).
func make_tamed() -> void:
	tamed = true
	add_box(Vector3(0.4, 0.12, 0.4), Vector3(0, 0.44, -0.42), Color(0.85, 0.15, 0.1))  # Halsband


func _physics_process(delta: float) -> void:
	_attack_cd = maxf(_attack_cd - delta, 0.0)
	velocity.y -= GRAVITY * delta

	var player = Game.player
	if player == null or player.frozen:
		move_and_slide()
		return
	var to_player: Vector3 = player.global_position - global_position
	var pdist := to_player.length()
	if not tamed and pdist > DESPAWN_RANGE:
		queue_free()
		return

	var move_dir := Vector3.ZERO
	if tamed:
		# Wachhund: naechstes Monster im Umkreis angreifen
		if _target == null or not is_instance_valid(_target) or _target.is_queued_for_deletion():
			_target = _find_monster()
		if _target != null and pdist < 14.0:
			var to_t: Vector3 = _target.global_position - global_position
			move_dir = Vector3(to_t.x, 0, to_t.z).normalized()
			velocity.x = move_dir.x * FOLLOW_SPEED
			velocity.z = move_dir.z * FOLLOW_SPEED
			if to_t.length() < 1.5 and _attack_cd <= 0.0:
				_attack_cd = 1.0
				_target.take_damage(ATTACK_DAMAGE, to_t.normalized())
		elif pdist > 3.0:
			move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
			velocity.x = move_dir.x * FOLLOW_SPEED
			velocity.z = move_dir.z * FOLLOW_SPEED
			if pdist > 20.0:  # nachteleportieren
				global_position = player.global_position + Vector3(1, 0.5, 1)
		else:
			velocity.x = 0.0
			velocity.z = 0.0
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 5.0)
			_wander_dir = Vector3.ZERO if randf() < 0.4 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
		velocity.x = move_dir.x * 1.3
		velocity.z = move_dir.z * 1.3

	if move_dir.length_squared() > 0.01:
		rotation.y = atan2(-move_dir.x, -move_dir.z) + PI
		if is_on_floor() and is_on_wall():
			velocity.y = 8.0

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


func _find_monster() -> Mob:
	var best: Mob = null
	var best_d := 10.0
	for m in get_tree().get_nodes_in_group("monsters"):
		if m.is_queued_for_deletion():
			continue
		var d: float = m.global_position.distance_to(global_position)
		if d < best_d:
			best_d = d
			best = m
	return best
