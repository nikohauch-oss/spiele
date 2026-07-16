class_name ZombieKing
extends Mob
## Boss: der Zombie-Koenig. Erwacht manchmal, wenn eine Dungeon-Truhe
## geoeffnet wird ("Grabraeuber!"). Gross, zaeh, schlaegt hart und ruft bei
## 2/3 und 1/3 Leben je zwei Diener. Droppt Diamanten. Despawnt nicht am Tag.

const CHASE_SPEED := 3.1
const ATTACK_RANGE := 2.2
const ATTACK_DAMAGE := 6.0
const DESPAWN_RANGE := 90.0

var _attack_cd := 0.0
var _minions_spawned := 0


func _ready() -> void:
	health = 60.0
	add_to_group("monsters")
	add_capsule(0.5, 2.4)
	var green := Color(0.15, 0.4, 0.2)
	add_box(Vector3(0.8, 1.7, 0.45), Vector3(0, 0.9, 0), green)                  # Rumpf
	add_box(Vector3(0.65, 0.65, 0.65), Vector3(0, 2.1, 0), green.lightened(0.1)) # Kopf
	add_box(Vector3(0.75, 0.18, 0.75), Vector3(0, 2.5, 0), Color(0.9, 0.75, 0.2))  # Krone
	add_box(Vector3(0.12, 0.2, 0.12), Vector3(0, 2.62, 0), Color(0.9, 0.75, 0.2))


func _physics_process(delta: float) -> void:
	_attack_cd = maxf(_attack_cd - delta, 0.0)
	velocity.y -= GRAVITY * delta

	var player = Game.player
	if player == null or player.frozen \
			or global_position.distance_to(player.global_position) > DESPAWN_RANGE:
		if player == null or player.frozen:
			move_and_slide()
			return
		queue_free()
		return

	var to_player: Vector3 = player.global_position - global_position
	var dist := to_player.length()
	var move_dir := Vector3(to_player.x, 0, to_player.z).normalized()
	velocity.x = move_dir.x * CHASE_SPEED
	velocity.z = move_dir.z * CHASE_SPEED
	rotation.y = atan2(-move_dir.x, -move_dir.z) + PI
	if dist < ATTACK_RANGE and absf(to_player.y) < 2.5 and _attack_cd <= 0.0:
		_attack_cd = 1.4
		player.stats.damage(ATTACK_DAMAGE)
	if is_on_floor() and is_on_wall():
		velocity.y = 9.0

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


## Bei 2/3 und 1/3 Leben je zwei Zombie-Diener rufen.
func _on_damaged(_from_dir: Vector3) -> void:
	var stage := 0
	if health <= 20.0:
		stage = 2
	elif health <= 40.0:
		stage = 1
	while _minions_spawned < stage:
		_minions_spawned += 1
		for i in 2:
			var minion := Zombie.new()
			get_parent().add_child(minion)
			minion.global_position = global_position \
				+ Vector3(randf_range(-2, 2), 0.5, randf_range(-2, 2))
		if Game.hud:
			Game.hud.toast("Der Zombie-Koenig ruft Verstaerkung!")


func _on_death() -> void:
	var pos := global_position + Vector3(0, 1, 0)
	ItemEntity.spawn_id("diamond", 2 + randi() % 2, pos)
	ItemEntity.spawn_id("iron_ingot", 2 + randi() % 3, pos)
	ItemEntity.spawn_id("gunpowder", 2, pos)
	Game.achieve("boss", "Erfolg: Zombie-Koenig besiegt!")
