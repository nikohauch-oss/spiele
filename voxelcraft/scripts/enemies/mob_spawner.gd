class_name MobSpawner
extends Node3D
## Spawnt Kreaturen in einem Ring (12-28 m) um den Spieler auf der Oberflaeche
## geladener Chunks: nachts Zombies (nicht in fackelbeleuchteten Bereichen),
## tagsueber Schweine auf Grasbloecken. Getrennte Obergrenzen; das Despawnen
## regeln die Kreaturen selbst (Distanz bzw. Tagesanbruch).

const INTERVAL := 4.0
const MAX_ZOMBIES := 8
const MAX_ANIMALS := 8
const MIN_DIST := 12.0
const MAX_DIST := 28.0

var _zombies := Node3D.new()
var _animals := Node3D.new()
var _timer := 0.0


func _ready() -> void:
	_zombies.name = "Zombies"
	_animals.name = "Tiere"
	add_child(_zombies)
	add_child(_animals)


func _process(delta: float) -> void:
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = INTERVAL
	if Game.player == null or Game.player.frozen or Game.day_night == null:
		return
	if Game.day_night.is_night():
		_try_spawn_zombie()
	else:
		_try_spawn_animal()


## Zufaelligen Bodenplatz im Spawn-Ring suchen; {} wenn nichts Passendes.
func _find_spot() -> Dictionary:
	var ang := randf() * TAU
	var dist := randf_range(MIN_DIST, MAX_DIST)
	var p: Vector3 = Game.player.global_position
	var wx := int(floor(p.x + cos(ang) * dist))
	var wz := int(floor(p.z + sin(ang) * dist))
	var ground: int = Game.chunk_manager.get_ground_y(wx, wz)
	if ground < 0 or ground + 3 >= Chunk.HEIGHT:
		return {}  # Chunk (noch) nicht geladen
	# 2 Bloecke Platz ueber dem Boden noetig (Pflanzen/Gras stoeren nicht)
	var feet: int = Game.chunk_manager.get_block(Vector3i(wx, ground + 1, wz))
	var head: int = Game.chunk_manager.get_block(Vector3i(wx, ground + 2, wz))
	if BlockDB.is_solid(feet) or feet == BlockDB.WATER or BlockDB.is_solid(head):
		return {}
	return {"wx": wx, "wz": wz, "ground": ground}


func _try_spawn_zombie() -> void:
	if _zombies.get_child_count() >= MAX_ZOMBIES:
		return
	var spot := _find_spot()
	if spot.is_empty():
		return
	# Fackelschutz: in beleuchteten Bereichen (Blocklicht >= 8) spawnt nichts
	if Game.chunk_manager.light_get(Vector3i(spot.wx, spot.ground + 1, spot.wz), false) >= 8:
		return
	# Monster-Mix: 18 % Creeper, 27 % Skelette, 20 % Spinnen, 35 % Zombies
	var r := randf()
	var monster: Mob
	if r < 0.18:
		monster = Creeper.new()
	elif r < 0.45:
		monster = SkeletonMob.new()
	elif r < 0.65:
		monster = Spider.new()
	else:
		monster = Zombie.new()
	_spawn(monster, _zombies, spot)


func _try_spawn_animal() -> void:
	if _animals.get_child_count() >= MAX_ANIMALS:
		return
	var spot := _find_spot()
	if spot.is_empty():
		return
	# Tiere gibt es nur auf Gras (Wiese/Wald)
	if Game.chunk_manager.get_block(Vector3i(spot.wx, spot.ground, spot.wz)) != BlockDB.GRASS:
		return
	# Im Wald streifen wilde Woelfe umher (zaehmbar!)
	if randf() < 0.15 and Game.chunk_manager.generator.biome_at(spot.wx, spot.wz) \
			== TerrainGenerator.Biome.FOREST:
		_spawn(Wolf.new(), _animals, spot)
		return
	# Arten-Mix: 30 % Schwein, 25 % Kuh, 25 % Huhn, 20 % Schaf
	var r := randf()
	var s := Animal.Species.PIG
	if r > 0.8:
		s = Animal.Species.SHEEP
	elif r > 0.55:
		s = Animal.Species.CHICKEN
	elif r > 0.3:
		s = Animal.Species.COW
	_spawn(Animal.create(s), _animals, spot)


func _spawn(mob: Mob, parent: Node3D, spot: Dictionary) -> void:
	parent.add_child(mob)
	mob.global_position = Vector3(spot.wx + 0.5, spot.ground + 1.05, spot.wz + 0.5)
