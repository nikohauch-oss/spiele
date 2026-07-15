class_name ItemEntity
extends Node3D
## Aufsammelbares Item in der Welt (Drop beim Blockabbau, Container-Reste).
## Bewusst ohne PhysicsBody: eigene Mini-Physik ueber ChunkManager.get_block
## (Schwerkraft + Aufsetzen auf Bloecken) - billig genug fuer viele Drops.
## Zieht zum Spieler, sobald er nah ist ("Magnet"), und wird dann eingesammelt.

const GRAVITY := 20.0
const HOVER := 0.28        # Schwebeabstand ueber dem Boden (Sprite-Mitte)
const MAGNET_RANGE := 2.6
const PICKUP_RANGE := 1.0
const LIFETIME := 300.0    # Sekunden bis zum Despawn

var stack: Dictionary  # {"id", "count"[, "durability"]}

var _velocity := Vector3.ZERO
var _age := 0.0
var _bob_phase := randf() * TAU


static func spawn_stack(s: Dictionary, pos: Vector3) -> void:
	if s == null or Game.world == null:
		return
	var e := ItemEntity.new()
	e.stack = s
	Game.world.add_child(e)
	e.global_position = pos + Vector3(randf_range(-0.1, 0.1), 0.1, randf_range(-0.1, 0.1))
	e._velocity = Vector3(randf_range(-1.2, 1.2), 3.2, randf_range(-1.2, 1.2))


static func spawn_id(id: String, count: int, pos: Vector3) -> void:
	spawn_stack(Inventory.make_stack(id, count), pos)


func _ready() -> void:
	var sprite := Sprite3D.new()
	sprite.texture = ItemDB.icon(stack.id)
	sprite.pixel_size = 0.028
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.texture_filter = SpriteBase3D.TEXTURE_FILTER_NEAREST
	sprite.name = "Sprite"
	add_child(sprite)


func _process(delta: float) -> void:
	_age += delta
	if _age > LIFETIME or global_position.y < -30.0:
		queue_free()
		return

	var player = Game.player
	if player and not player.frozen:
		var target: Vector3 = player.global_position + Vector3(0, 0.9, 0)
		var dist := global_position.distance_to(target)
		if dist < PICKUP_RANGE:
			_try_pickup(player)
			return
		if dist < MAGNET_RANGE:
			# Zum Spieler ziehen (ignoriert Bloecke - kurze Distanz)
			global_position = global_position.move_toward(target, 7.0 * delta)
			return

	# Mini-Physik: Schwerkraft, auf Blockoberflaeche aufsetzen
	_velocity.y -= GRAVITY * delta
	_velocity.x = move_toward(_velocity.x, 0.0, 4.0 * delta)
	_velocity.z = move_toward(_velocity.z, 0.0, 4.0 * delta)
	var pos := global_position + _velocity * delta
	var floor_cell := Vector3i(Vector3(pos.x, pos.y - HOVER, pos.z).floor())
	if _velocity.y <= 0.0 and BlockDB.is_solid(Game.chunk_manager.get_block(floor_cell)):
		pos.y = float(floor_cell.y + 1) + HOVER
		_velocity = Vector3.ZERO
		# leichtes Schweben/Wippen am Boden
		pos.y += 0.04 * sin(_age * 2.5 + _bob_phase)
	global_position = pos


func _try_pickup(player) -> void:
	var rest = player.inventory.add_stack(stack)
	if rest == null:
		queue_free()
	else:
		stack = rest  # Inventar voll: Rest bleibt liegen