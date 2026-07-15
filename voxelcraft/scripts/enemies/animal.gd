class_name Animal
extends Mob
## Passive Tiere (Schwein, Kuh, Huhn): wandern tagsueber ueber die Wiesen,
## fliehen ein paar Sekunden, wenn sie getroffen werden, und droppen ihre
## Produkte (Fleisch, Leder, Federn). Gespawnt vom MobSpawner auf Gras.

enum Species { PIG, COW, CHICKEN, SHEEP }

const JUMP_VELOCITY := 8.0
const DESPAWN_RANGE := 80.0
const GROW_TIME := 120.0  # Sekunden, bis ein Jungtier ausgewachsen ist

var species := Species.PIG
var is_baby := false

var _walk_speed := 1.4
var _flee_speed := 3.8
var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _flee_timer := 0.0
var _flee_dir := Vector3.ZERO
var _breed_cd := 0.0
var _grow_timer := 0.0


static func create(s: int) -> Animal:
	var a := Animal.new()
	a.species = s as Species
	return a


func _ready() -> void:
	match species:
		Species.PIG:
			health = 10.0
			add_capsule(0.4, 1.0)
			var pink := Color(0.93, 0.62, 0.65)
			add_box(Vector3(0.6, 0.5, 0.95), Vector3(0, 0.55, 0.05), pink)
			add_box(Vector3(0.42, 0.4, 0.3), Vector3(0, 0.68, -0.55), pink.lightened(0.1))
			add_box(Vector3(0.16, 0.12, 0.08), Vector3(0, 0.6, -0.72), Color(0.85, 0.5, 0.55))
			add_box(Vector3(0.5, 0.3, 0.16), Vector3(0, 0.15, 0.32), pink.darkened(0.15))
			add_box(Vector3(0.5, 0.3, 0.16), Vector3(0, 0.15, -0.28), pink.darkened(0.15))
		Species.COW:
			health = 12.0
			add_capsule(0.45, 1.3)
			var brown := Color(0.42, 0.28, 0.18)
			add_box(Vector3(0.7, 0.6, 1.1), Vector3(0, 0.85, 0.05), brown)
			add_box(Vector3(0.45, 0.45, 0.35), Vector3(0, 1.05, -0.7), brown.lightened(0.15))
			add_box(Vector3(0.3, 0.1, 0.1), Vector3(0, 1.25, -0.75), Color(0.85, 0.85, 0.8))  # Hoerner
			add_box(Vector3(0.55, 0.55, 0.18), Vector3(0, 0.28, 0.45), brown.darkened(0.2))
			add_box(Vector3(0.55, 0.55, 0.18), Vector3(0, 0.28, -0.35), brown.darkened(0.2))
			_walk_speed = 1.2
			_flee_speed = 3.4
		Species.CHICKEN:
			health = 6.0
			add_capsule(0.25, 0.7)
			var white := Color(0.92, 0.92, 0.9)
			add_box(Vector3(0.4, 0.35, 0.5), Vector3(0, 0.35, 0.02), white)
			add_box(Vector3(0.25, 0.28, 0.22), Vector3(0, 0.62, -0.3), white)
			add_box(Vector3(0.1, 0.06, 0.12), Vector3(0, 0.58, -0.45), Color(0.95, 0.75, 0.2))  # Schnabel
			add_box(Vector3(0.24, 0.18, 0.06), Vector3(0, 0.1, 0), Color(0.95, 0.75, 0.2))      # Beine
			_walk_speed = 1.2
			_flee_speed = 3.0
		Species.SHEEP:
			health = 8.0
			add_capsule(0.4, 1.1)
			var fleece := Color(0.9, 0.9, 0.88)
			add_box(Vector3(0.65, 0.55, 1.0), Vector3(0, 0.65, 0.05), fleece)              # Wollkoerper
			add_box(Vector3(0.35, 0.35, 0.3), Vector3(0, 0.8, -0.6), Color(0.75, 0.72, 0.68))  # Kopf
			add_box(Vector3(0.5, 0.35, 0.16), Vector3(0, 0.18, 0.3), Color(0.7, 0.68, 0.65))
			add_box(Vector3(0.5, 0.35, 0.16), Vector3(0, 0.18, -0.3), Color(0.7, 0.68, 0.65))
			_walk_speed = 1.2
			_flee_speed = 3.2
	if is_baby:
		scale = Vector3.ONE * 0.45
		_grow_timer = GROW_TIME


func _physics_process(delta: float) -> void:
	velocity.y -= GRAVITY * delta
	# Huehner flattern: nie schneller als 3 m/s fallen
	if species == Species.CHICKEN and velocity.y < -3.0:
		velocity.y = -3.0
	_flee_timer = maxf(_flee_timer - delta, 0.0)
	_breed_cd = maxf(_breed_cd - delta, 0.0)
	# Jungtiere wachsen mit der Zeit
	if is_baby:
		_grow_timer -= delta
		if _grow_timer <= 0.0:
			is_baby = false
			scale = Vector3.ONE

	# Weit weg vom Spieler? Still despawnen (wie Monster)
	if Game.player == null \
			or global_position.distance_to(Game.player.global_position) > DESPAWN_RANGE:
		queue_free()
		return

	var move_dir := Vector3.ZERO
	var speed := _walk_speed
	if _flee_timer > 0.0:
		move_dir = _flee_dir
		speed = _flee_speed
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


## Mit Weizen gefuettert: einmal pro Minute gibt es ein Jungtier.
func try_feed() -> bool:
	if is_baby or _breed_cd > 0.0:
		return false
	_breed_cd = 60.0
	var baby := Animal.create(species)
	baby.is_baby = true
	get_parent().add_child(baby)
	baby.global_position = global_position + Vector3(randf_range(-0.5, 0.5), 0.2,
		randf_range(-0.5, 0.5))
	return true


func _on_death() -> void:
	var pos := global_position + Vector3(0, 0.6, 0)
	if is_baby:
		return  # Jungtiere droppen nichts
	match species:
		Species.PIG:
			ItemEntity.spawn_id("porkchop_raw", 1 + randi() % 2, pos)
		Species.COW:
			ItemEntity.spawn_id("beef_raw", 1 + randi() % 2, pos)
			ItemEntity.spawn_id("leather", 1 + randi() % 2, pos)
		Species.CHICKEN:
			ItemEntity.spawn_id("chicken_raw", 1, pos)
			ItemEntity.spawn_id("feather", 1 + randi() % 2, pos)
		Species.SHEEP:
			ItemEntity.spawn_id("wool", 1 + randi() % 2, pos)
