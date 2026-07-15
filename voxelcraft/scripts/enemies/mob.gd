class_name Mob
extends CharacterBody3D
## Basisklasse fuer alle Kreaturen (Zombie, Tiere): Klotz-Koerper aus farbigen
## Boxen (keine Assets noetig), Lebenspunkte, Treffer mit Rueckstoss und rotem
## Aufblitzen sowie Hooks fuer Unterklassen (_on_damaged / _on_death).

const GRAVITY := 27.0

var health := 10.0
var _body_parts: Array[MeshInstance3D] = []


func _init() -> void:
	collision_layer = 4  # Layer 3 = Kreaturen (Spieler-Raycast trifft sie)
	collision_mask = 1   # kollidiert nur mit der Welt
	add_to_group("mobs")  # fuer Explosions-Flaechenschaden


func add_capsule(radius: float, height: float) -> void:
	var shape := CapsuleShape3D.new()
	shape.radius = radius
	shape.height = height
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position.y = height / 2.0  # Node-Ursprung = Fuesse
	add_child(cs)


func add_box(size: Vector3, pos: Vector3, color: Color) -> void:
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


func take_damage(amount: float, from_dir: Vector3) -> void:
	health -= amount
	Sfx.play_at("hit", global_position)
	# Rueckstoss + kurzes rotes Aufblitzen aller Koerperteile
	velocity += Vector3(from_dir.x, 0, from_dir.z).normalized() * 7.0 + Vector3(0, 4.5, 0)
	for part in _body_parts:
		var box := part.mesh as BoxMesh
		var mat := box.material as StandardMaterial3D
		var base: Color = part.get_meta("base_color")
		mat.albedo_color = base.lerp(Color.RED, 0.7)
		create_tween().tween_property(mat, "albedo_color", base, 0.25)
	_on_damaged(from_dir)
	if health <= 0.0:
		_on_death()
		queue_free()


## Hooks fuer Unterklassen
func _on_damaged(_from_dir: Vector3) -> void:
	pass


func _on_death() -> void:
	pass
