class_name C4Entity
extends Node3D
## Gezuendetes C4: blinkender Block, der nach Ablauf der Zuendschnur explodiert.
## Entsteht per Rechtsklick auf einen platzierten C4-Block (der Block wird
## dabei aus der Welt genommen) oder durch Kettenzuendung einer Explosion.

const RADIUS := 4.0
const MAX_DAMAGE := 30.0

var fuse := 3.0

var _mesh: MeshInstance3D
var _mat: StandardMaterial3D
var _flash := 0.0


static func ignite(pos: Vector3i, fuse_time := 3.0) -> void:
	if Game.world == null:
		return
	var e := C4Entity.new()
	e.fuse = fuse_time
	Game.world.add_child(e)
	e.global_position = Vector3(pos) + Vector3(0.5, 0.5, 0.5)


func _ready() -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.98, 0.98, 0.98)
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.85, 0.8, 0.6)  # C4-beige
	mesh.material = _mat
	_mesh = MeshInstance3D.new()
	_mesh.mesh = mesh
	add_child(_mesh)
	Sfx.play_at("hiss", global_position)


func _process(delta: float) -> void:
	fuse -= delta
	_flash -= delta
	if _flash <= 0.0:
		_flash = 0.18
		# immer schnelleres weisses Blinken kurz vor der Explosion
		_mat.albedo_color = Color.WHITE if _mat.albedo_color != Color.WHITE \
			else Color(0.85, 0.8, 0.6)
	if fuse <= 0.0:
		var center := global_position
		queue_free()
		Explosion.explode(center, RADIUS, MAX_DAMAGE)
