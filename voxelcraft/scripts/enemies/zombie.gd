class_name Zombie
extends CharacterBody3D
## Einfacher Zombie-Gegner:
##  - wandert ziellos, verfolgt den Spieler in Sichtweite (direktes Steering)
##  - springt automatisch, wenn ein Block im Weg steht (Minecraft-Verhalten)
##  - Nahkampfangriff mit Cooldown, Rueckstoss beim Getroffenwerden
##  - verschwindet am Tag oder bei zu grosser Entfernung
##
## Hinweis: bewusst ohne NavigationAgent3D - ein Navmesh laesst sich auf einer
## staendig veraenderlichen Voxelwelt nicht sinnvoll aktuell halten. Direktes
## Steering + Auto-Sprung entspricht ausserdem dem Minecraft-Original.

const WALK_SPEED := 1.2
const CHASE_SPEED := 2.8
const GRAVITY := 27.0
const JUMP_VELOCITY := 8.0
const AGGRO_RANGE := 18.0
const ATTACK_RANGE := 1.7
const ATTACK_DAMAGE := 3.0
const DESPAWN_RANGE := 64.0

var health := 20.0

var _wander_dir := Vector3.ZERO
var _wander_timer := 0.0
var _attack_cd := 0.0
var _body_parts: Array[MeshInstance3D] = []


func _ready() -> void:
	collision_layer = 4  # Layer 3 = Gegner (vom Spieler-Raycast getroffen)
	collision_mask = 1

	var shape := CapsuleShape3D.new()
	shape.radius = 0.35
	shape.height = 1.9
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position.y = 0.95
	add_child(cs)

	# Klotz-Koerper aus zwei Boxen (keine Assets noetig)
	_add_box(Vector3(0.55, 1.4, 0.32), Vector3(0, 0.7, 0), Color(0.2, 0.5, 0.25))
	_add_box(Vector3(0.5, 0.5, 0.5), Vector3(0, 1.7, 0), Color(0.3, 0.65, 0.3))


func _add_box(size: Vector3, pos: Vector3, color: Color) -> void:
	var mesh := BoxMesh.new()
	mesh.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 1.0
	mesh.material = mat
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.set_meta("base_color", color)
	add_child(mi)
	_body_parts.append(mi)


func _physics_process(delta: float) -> void:
	_attack_cd = maxf(_attack_cd - delta, 0.0)
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
		move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
		velocity.x = move_dir.x * CHASE_SPEED
		velocity.z = move_dir.z * CHASE_SPEED
		if dist < ATTACK_RANGE and absf(to_player.y) < 2.0 and _attack_cd <= 0.0:
			_attack_cd = 1.2
			player.stats.damage(ATTACK_DAMAGE)
	else:
		_wander_timer -= delta
		if _wander_timer <= 0.0:
			_wander_timer = randf_range(2.0, 5.0)
			# Zufaellig stehenbleiben oder neue Richtung waehlen
			_wander_dir = Vector3.ZERO if randf() < 0.35 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
		move_dir = _wander_dir
		velocity.x = move_dir.x * WALK_SPEED
		velocity.z = move_dir.z * WALK_SPEED

	# Blickrichtung
	if move_dir.length_squared() > 0.01:
		rotation.y = atan2(-move_dir.x, -move_dir.z) + PI
	# Block im Weg? -> springen
	if is_on_floor() and is_on_wall() and move_dir.length_squared() > 0.01:
		velocity.y = JUMP_VELOCITY

	move_and_slide()
	if global_position.y < -20.0:
		queue_free()


func take_damage(amount: float, from_dir: Vector3) -> void:
	health -= amount
	# Rueckstoss + kurzes rotes Aufblitzen
	velocity += Vector3(from_dir.x, 0, from_dir.z).normalized() * 7.0 + Vector3(0, 4.5, 0)
	for part in _body_parts:
		var box := part.mesh as BoxMesh
		var mat := box.material as StandardMaterial3D
		var base: Color = part.get_meta("base_color")
		mat.albedo_color = base.lerp(Color.RED, 0.7)
		create_tween().tween_property(mat, "albedo_color", base, 0.25)
	if health <= 0.0:
		queue_free()
