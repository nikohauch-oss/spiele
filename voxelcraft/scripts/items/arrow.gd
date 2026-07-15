class_name Arrow
extends Node3D
## Pfeil-Projektil (Skelette und Spieler-Bogen): fliegt mit Schwerkraft-Bogen,
## prueft die Flugstrecke pro Physik-Frame per Raycast (Welt, Spieler und
## Kreaturen) und bleibt in Bloecken stecken. Der Schuetze selbst wird
## vom Raycast ausgenommen.

const GRAVITY := 18.0
const STUCK_LIFETIME := 8.0
const MAX_LIFETIME := 15.0

var velocity := Vector3.ZERO
var damage := 3.0

var _exclude: Array[RID] = []
var _stuck := false
var _age := 0.0


static func shoot(from: Vector3, vel: Vector3, dmg: float, shooter: PhysicsBody3D) -> void:
	if Game.world == null:
		return
	var a := Arrow.new()
	a.velocity = vel
	a.damage = dmg
	if shooter != null:
		a._exclude = [shooter.get_rid()]
	Game.world.add_child(a)
	a.global_position = from
	a._orient()


func _ready() -> void:
	# Schaft + Spitze aus zwei Boxen (lokales -Z = Flugrichtung)
	var shaft := MeshInstance3D.new()
	var shaft_mesh := BoxMesh.new()
	shaft_mesh.size = Vector3(0.035, 0.035, 0.45)
	var shaft_mat := StandardMaterial3D.new()
	shaft_mat.albedo_color = Color(0.65, 0.5, 0.3)
	shaft_mesh.material = shaft_mat
	shaft.mesh = shaft_mesh
	add_child(shaft)
	var tip := MeshInstance3D.new()
	var tip_mesh := BoxMesh.new()
	tip_mesh.size = Vector3(0.06, 0.06, 0.08)
	var tip_mat := StandardMaterial3D.new()
	tip_mat.albedo_color = Color(0.6, 0.6, 0.62)
	tip_mesh.material = tip_mat
	tip.mesh = tip_mesh
	tip.position.z = -0.24
	add_child(tip)


func _physics_process(delta: float) -> void:
	_age += delta
	if _age > MAX_LIFETIME or global_position.y < -30.0:
		queue_free()
		return
	if _stuck:
		if _age > STUCK_LIFETIME:
			queue_free()
		return

	velocity.y -= GRAVITY * delta
	var next := global_position + velocity * delta
	# Flugstrecke auf Treffer pruefen (Welt | Spieler | Kreaturen)
	var query := PhysicsRayQueryParameters3D.create(global_position, next, 1 | 2 | 4)
	query.exclude = _exclude
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		global_position = next
		_orient()
		return

	var body = hit.get("collider")
	if body is PlayerController:
		(body as PlayerController).stats.damage(damage)
		queue_free()
	elif body is Mob:
		(body as Mob).take_damage(damage, velocity.normalized())
		queue_free()
	else:
		# In der Wand stecken bleiben
		global_position = hit.get("position", next)
		_stuck = true
		Sfx.play_at("hit", global_position, -8.0)


func _orient() -> void:
	var dir := velocity.normalized()
	if absf(dir.y) < 0.98:  # look_at vertraegt keine Richtung parallel zur Up-Achse
		look_at(global_position + dir, Vector3.UP)
