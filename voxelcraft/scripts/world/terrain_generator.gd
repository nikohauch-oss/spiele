class_name TerrainGenerator
extends RefCounted
## Prozedurale Weltgenerierung mit FastNoiseLite:
## Hoehenkarte + Biome (Wiese/Wueste/Wald) + Hoehlen + Erze + Baeume + Wasser.
## Wird ausschliesslich vom Worker-Thread des ChunkManagers benutzt.

const SEA_LEVEL := 62
const DIRT_DEPTH := 4  # Erd-/Sandschicht ueber dem Stein

enum Biome { PLAINS, DESERT, FOREST, SNOWY }

var world_seed: int
var height_noise := FastNoiseLite.new()  # grosse Landschaftsformen
var detail_noise := FastNoiseLite.new()  # feine Unebenheiten
var biome_noise := FastNoiseLite.new()   # "Temperatur" -> Biomwahl
var cave_noise := FastNoiseLite.new()    # 3D-Rauschen fuer Hoehlen
var ore_noise := FastNoiseLite.new()     # 3D-Rauschen fuer Erz-Adern
var cavern_noise := FastNoiseLite.new()  # grosse Kavernen in der Tiefe


func _init(s: int) -> void:
	world_seed = s
	height_noise.seed = s
	height_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	height_noise.frequency = 0.0035
	height_noise.fractal_octaves = 4
	detail_noise.seed = s + 101
	detail_noise.frequency = 0.02
	detail_noise.fractal_octaves = 2
	biome_noise.seed = s + 202
	biome_noise.frequency = 0.0016
	biome_noise.fractal_octaves = 2
	cave_noise.seed = s + 303
	cave_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	cave_noise.frequency = 0.05
	ore_noise.seed = s + 404
	ore_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	ore_noise.frequency = 0.11
	cavern_noise.seed = s + 505
	cavern_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	cavern_noise.frequency = 0.018


func biome_at(wx: int, wz: int) -> int:
	var t := biome_noise.get_noise_2d(wx, wz)
	if t > 0.32:
		return Biome.DESERT
	if t < -0.52:
		return Biome.SNOWY
	if t < -0.18:
		return Biome.FOREST
	return Biome.PLAINS


func height_at(wx: int, wz: int) -> int:
	var h := 64.0 + height_noise.get_noise_2d(wx, wz) * 26.0 \
		+ detail_noise.get_noise_2d(wx, wz) * 5.0
	if biome_at(wx, wz) == Biome.DESERT:
		h = 63.0 + (h - 63.0) * 0.5  # Wuesten sind flacher
	return clampi(int(round(h)), 8, Chunk.HEIGHT - 40)


## Sichere Spawn-Hoehe (Fuesse) an einer Weltposition.
func surface_height(wx: int, wz: int) -> int:
	return maxi(height_at(wx, wz), SEA_LEVEL) + 1


## Erzeugt die Blockdaten eines Chunks. Deterministisch pro (Seed, Position),
## dadurch reicht es, nur vom Spieler veraenderte Chunks zu speichern.
func generate_chunk(cpos: Vector2i) -> Dictionary:
	var data := PackedByteArray()
	data.resize(Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT)  # mit 0 (=AIR) gefuellt
	var max_y := 0

	for x in Chunk.SIZE:
		for z in Chunk.SIZE:
			var wx := cpos.x * Chunk.SIZE + x
			var wz := cpos.y * Chunk.SIZE + z
			var h := height_at(wx, wz)
			var biome := biome_at(wx, wz)
			var col := (x * Chunk.SIZE + z) * Chunk.HEIGHT
			var rng := RandomNumberGenerator.new()
			rng.seed = _hash2(wx, wz)
			var bedrock_top := 1 + rng.randi() % 2
			# Sand statt Gras in der Wueste und an/unter der Wasserlinie (Straende)
			var sandy := biome == Biome.DESERT or h <= SEA_LEVEL + 1

			var snowy := biome == Biome.SNOWY
			for y in h + 1:
				var id := BlockDB.STONE
				if y <= bedrock_top:
					id = BlockDB.BEDROCK
				elif y > h - DIRT_DEPTH:
					if sandy:
						id = BlockDB.SAND
					elif y == h:
						id = BlockDB.SNOW if snowy else BlockDB.GRASS
					else:
						id = BlockDB.DIRT
				elif id == BlockDB.STONE:
					# Erze als zusammenhaengende Adern (3D-Rauschen)
					# + seltene Einzel-Diamanten in der Tiefe
					var ore := ore_noise.get_noise_3d(wx, y, wz)
					if y < 14 and rng.randf() < 0.003:
						id = BlockDB.DIAMOND_ORE
					elif y < 48 and ore < -0.62:
						id = BlockDB.IRON_ORE
					elif y >= 8 and ore > 0.6:
						id = BlockDB.COAL_ORE
				# Hoehlen + grosse Kavernen ausgraben (nicht durch Grundgestein);
				# tief unten sammelt sich Lava in den Hohlraeumen
				if id != BlockDB.BEDROCK and y > bedrock_top and y < h - 1:
					if cave_noise.get_noise_3d(wx, y, wz) > 0.58 \
							or (y < 40 and cavern_noise.get_noise_3d(wx, y, wz) > 0.66):
						id = BlockDB.LAVA if y < 13 else BlockDB.AIR
				data[col + y] = id

			# Wasser bis zur Meereshoehe auffuellen
			for y in range(h + 1, SEA_LEVEL + 1):
				data[col + y] = BlockDB.WATER
			max_y = maxi(max_y, maxi(h, SEA_LEVEL))

	max_y = maxi(max_y, _plant_trees(cpos, data))
	max_y = maxi(max_y, _plant_vegetation(cpos, data))
	_carve_dungeon(cpos, data)
	var village := _build_village_hut(cpos, data)
	if village.y > 0:
		max_y = maxi(max_y, village.y + 6)
	return {"data": data, "max_y": max_y, "village": village,
		"light": LightEngine.compute_skylight(data, max_y)}


## Selten auf flachen Wiesen: kleine Holzhuette mit Fenster, Fackel und
## (manchmal) Loot-Truhe. Rueckgabe: Position vor der Tuer fuer den Haendler,
## Vector3i.ZERO wenn kein Dorf entstand.
func _build_village_hut(cpos: Vector2i, data: PackedByteArray) -> Vector3i:
	var rng := RandomNumberGenerator.new()
	rng.seed = _hash2(cpos.x * 73 + 11, cpos.y * 97 + 3)
	if rng.randf() > 0.015:
		return Vector3i.ZERO
	var ox := 3 + rng.randi() % 6
	var oz := 3 + rng.randi() % 6
	var wx := cpos.x * Chunk.SIZE + ox
	var wz := cpos.y * Chunk.SIZE + oz
	if biome_at(wx, wz) != Biome.PLAINS:
		return Vector3i.ZERO
	# Gelaende muss halbwegs eben sein
	var h := height_at(wx, wz)
	if h <= SEA_LEVEL + 1:
		return Vector3i.ZERO
	for dx in 5:
		for dz in 5:
			if absi(height_at(wx + dx, wz + dz) - h) > 1:
				return Vector3i.ZERO
	# Huette 5x5, 3 hoch: Boden, Waende mit Fenster + Tueroeffnung, Flachdach
	for dx in 5:
		for dz in 5:
			data[Chunk.index(ox + dx, h, oz + dz)] = BlockDB.PLANKS       # Boden
			data[Chunk.index(ox + dx, h + 4, oz + dz)] = BlockDB.SLAB_PLANK  # Dach
			for dy in range(1, 4):
				var i := Chunk.index(ox + dx, h + dy, oz + dz)
				var wall := dx == 0 or dx == 4 or dz == 0 or dz == 4
				if not wall:
					data[i] = BlockDB.AIR
				elif (dx == 0 or dx == 4) and (dz == 0 or dz == 4):
					data[i] = BlockDB.LOG                                 # Eckpfosten
				elif dz == 0 and dx == 2 and dy < 3:
					data[i] = BlockDB.AIR                                 # Tueroeffnung
				elif dy == 2 and (dx == 2 or dz == 2):
					data[i] = BlockDB.GLASS                               # Fenster
				else:
					data[i] = BlockDB.PLANKS
	data[Chunk.index(ox + 3, h + 2, oz + 3)] = BlockDB.TORCH  # Licht innen
	if rng.randf() < 0.5:
		data[Chunk.index(ox + 1, h + 1, oz + 3)] = BlockDB.CHEST  # Loot beim Oeffnen
	return Vector3i(cpos.x * Chunk.SIZE + ox + 2, h + 1, cpos.y * Chunk.SIZE + oz - 1)


## Deko-Vegetation: hohes Gras + Blumen auf Wiesen, Kakteen in der Wueste.
func _plant_vegetation(cpos: Vector2i, data: PackedByteArray) -> int:
	var max_y := 0
	for x in Chunk.SIZE:
		for z in Chunk.SIZE:
			var wx := cpos.x * Chunk.SIZE + x
			var wz := cpos.y * Chunk.SIZE + z
			var rng := RandomNumberGenerator.new()
			rng.seed = _hash2(wx ^ 0x2545F491, wz)
			var r := rng.randf()
			var h := height_at(wx, wz)
			if h <= SEA_LEVEL or h + 4 >= Chunk.HEIGHT:
				continue
			var surface := data[Chunk.index(x, h, z)]
			var above := Chunk.index(x, h + 1, z)
			if surface == BlockDB.GRASS and data[above] == BlockDB.AIR:
				if r < 0.08:
					data[above] = BlockDB.TALL_GRASS
				elif r < 0.095:
					data[above] = BlockDB.FLOWER_RED if rng.randf() < 0.5 else BlockDB.FLOWER_YELLOW
				elif r < 0.099:
					data[above] = BlockDB.MUSHROOM_BROWN if rng.randf() < 0.6 else BlockDB.MUSHROOM_RED
				elif r < 0.101 and biome_at(wx, wz) == Biome.PLAINS:
					data[above] = BlockDB.PUMPKIN
				else:
					continue
				max_y = maxi(max_y, h + 1)
			elif surface == BlockDB.SAND and data[above] == BlockDB.AIR \
					and biome_at(wx, wz) == Biome.DESERT and r < 0.006:
				var cactus_h := 1 + rng.randi() % 3
				for dy in cactus_h:
					data[Chunk.index(x, h + 1 + dy, z)] = BlockDB.CACTUS
				max_y = maxi(max_y, h + cactus_h)
	return max_y


## Selten: unterirdischer Raum mit Loot-Truhe. Die Truhe bekommt ihren Inhalt
## beim ersten Oeffnen (Game.create_chest_with_loot) - platzierte Spieler-
## Truhen haben immer schon einen Zustand und sind davon nicht betroffen.
func _carve_dungeon(cpos: Vector2i, data: PackedByteArray) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = _hash2(cpos.x * 31 + 17, cpos.y * 53 + 29)
	if rng.randf() > 0.22:
		return
	var w := 5 + rng.randi() % 3
	var d := 5 + rng.randi() % 3
	var h := 3 + rng.randi() % 2
	var ox := 2 + rng.randi() % (Chunk.SIZE - w - 4)
	var oz := 2 + rng.randi() % (Chunk.SIZE - d - 4)
	var oy := 10 + rng.randi() % 30
	for dx in w:
		for dz in d:
			# Boden unter dem Raum verfestigen (falls eine Hoehle darunter liegt)
			var floor_i := Chunk.index(ox + dx, oy - 1, oz + dz)
			if data[floor_i] == BlockDB.AIR or data[floor_i] == BlockDB.WATER:
				data[floor_i] = BlockDB.STONE
			for dy in h:
				data[Chunk.index(ox + dx, oy + dy, oz + dz)] = BlockDB.AIR
	data[Chunk.index(ox + (w >> 1), oy, oz + (d >> 1))] = BlockDB.CHEST


## Baeume: deterministisch pro Weltposition. Stamm nur mit 2 Block Rand zum
## Chunkrand, damit die Blaetterkrone komplett im selben Chunk liegt.
func _plant_trees(cpos: Vector2i, data: PackedByteArray) -> int:
	var max_y := 0
	for x in range(2, Chunk.SIZE - 2):
		for z in range(2, Chunk.SIZE - 2):
			var wx := cpos.x * Chunk.SIZE + x
			var wz := cpos.y * Chunk.SIZE + z
			var biome := biome_at(wx, wz)
			var chance := 0.0
			if biome == Biome.FOREST:
				chance = 0.03
			elif biome == Biome.PLAINS:
				chance = 0.003
			elif biome == Biome.SNOWY:
				chance = 0.008
			if chance <= 0.0:
				continue
			var rng := RandomNumberGenerator.new()
			rng.seed = _hash2(wx ^ 0x5F3759DF, wz)
			if rng.randf() >= chance:
				continue
			var h := height_at(wx, wz)
			var surface := data[Chunk.index(x, h, z)]
			if h <= SEA_LEVEL or (surface != BlockDB.GRASS and surface != BlockDB.SNOW):
				continue
			var trunk_h := 4 + rng.randi() % 2
			if h + trunk_h + 2 >= Chunk.HEIGHT:
				continue
			# Stamm
			for dy in range(1, trunk_h + 1):
				data[Chunk.index(x, h + dy, z)] = BlockDB.LOG
			# Blaetterkrone: zwei breite Ringe + Kappe
			for dy in range(trunk_h - 1, trunk_h + 2):
				var radius := 2 if dy < trunk_h + 1 else 1
				for dx in range(-radius, radius + 1):
					for dz in range(-radius, radius + 1):
						if dx == 0 and dz == 0 and dy <= trunk_h:
							continue  # Stamm nicht ueberschreiben
						if absi(dx) == radius and absi(dz) == radius and rng.randf() < 0.4:
							continue  # Ecken ausduennen
						var i := Chunk.index(x + dx, h + dy, z + dz)
						if data[i] == BlockDB.AIR:
							data[i] = BlockDB.LEAVES
			data[Chunk.index(x, h + trunk_h + 2, z)] = BlockDB.LEAVES
			max_y = maxi(max_y, h + trunk_h + 2)
	return max_y


## Deterministischer Integer-Hash (unabhaengig von Godots hash()-Implementierung,
## damit Welten ueber Engine-Versionen hinweg reproduzierbar bleiben).
func _hash2(x: int, z: int) -> int:
	var h := x * 374761393 + z * 668265263 + world_seed * 1442695041
	h = (h ^ (h >> 13)) * 1274126177
	return (h ^ (h >> 16)) & 0x7FFFFFFF
