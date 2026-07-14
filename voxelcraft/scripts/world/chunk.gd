class_name Chunk
extends Node3D
## Ein Chunk der Welt als Node: haelt MeshInstance3D + StaticBody3D-Kollision.
## Die Blockdaten selbst liegen zentral im ChunkManager (auch fuer entladene,
## aber editierte Chunks). Diese Node ist reine Darstellung.

const SIZE := 16     # Blocks in X/Z
const HEIGHT := 256  # Blocks in Y

var mesh_instance: MeshInstance3D
var body: StaticBody3D
var collider: CollisionShape3D


## Index in die flachen Chunk-Daten (PackedByteArray).
## Eine (x,z)-Saeule liegt zusammenhaengend im Speicher (schnelle Hoehen-Scans).
static func index(x: int, y: int, z: int) -> int:
	return (x * SIZE + z) * HEIGHT + y


func _init() -> void:
	mesh_instance = MeshInstance3D.new()
	add_child(mesh_instance)
	body = StaticBody3D.new()
	body.collision_layer = 1  # Layer 1 = Welt
	body.collision_mask = 0
	add_child(body)
	collider = CollisionShape3D.new()
	body.add_child(collider)


## Uebernimmt ein im Worker-Thread gebautes Mesh + Kollisionsform.
func apply_mesh(result: Dictionary) -> void:
	mesh_instance.mesh = result.get("mesh")
	collider.shape = result.get("shape")
