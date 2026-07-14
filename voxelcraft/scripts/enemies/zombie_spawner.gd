class_name ZombieSpawner
extends Node3D
## Spawnt nachts Zombies in einem Ring um den Spieler (12-28 Bloecke Abstand)
## auf der Oberflaeche geladener Chunks. Begrenzte Gesamtzahl; tagsueber
## despawnen die Zombies von selbst (siehe Zombie.gd).

const MAX_ZOMBIES := 8
const SPAWN_INTERVAL := 4.0
const MIN_DIST := 12.0
const MAX_DIST := 28.0

var _timer := 0.0


func _process(delta: float) -> void:
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = SPAWN_INTERVAL
	if Game.player == null or Game.player.frozen or Game.day_night == null \
			or not Game.day_night.is_night() or get_child_count() >= MAX_ZOMBIES:
		return

	var ang := randf() * TAU
	var dist := randf_range(MIN_DIST, MAX_DIST)
	var p := Game.player.global_position
	var wx := int(floor(p.x + cos(ang) * dist))
	var wz := int(floor(p.z + sin(ang) * dist))
	var ground := Game.chunk_manager.get_ground_y(wx, wz)
	if ground < 0 or ground + 3 >= Chunk.HEIGHT:
		return  # Chunk nicht geladen
	# Platz frei? (2 Bloecke Luft, kein Wasser)
	var head := Vector3i(wx, ground + 2, wz)
	var feet := Vector3i(wx, ground + 1, wz)
	if Game.chunk_manager.get_block(feet) != BlockDB.AIR \
			or Game.chunk_manager.get_block(head) != BlockDB.AIR:
		return

	var z := Zombie.new()
	add_child(z)
	z.global_position = Vector3(wx + 0.5, ground + 1.05, wz + 0.5)
