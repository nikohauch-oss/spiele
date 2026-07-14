class_name TerrainGenerator
extends RefCounted
## Prozedurale Weltgenerierung mit FastNoiseLite:
## Hoehenkarte + Biome (Wiese/Wueste/Wald) + Hoehlen + Erze + Baeume + Wasser.
## Wird ausschliesslich vom Worker-Thread des ChunkManagers benutzt.

const SEA_LEVEL := 62
const DIRT_DEPTH := 4  # Erd-/Sandschicht ueber dem Stein

enum Biome { PLAINS, DESERT, FOREST }

var world_seed: int
var height_noise := FastNoiseLite.new()  # grosse Landschaftsformen
var detail_noise := FastNoiseLite.new()  # feine Unebenheiten
var biome_noise := FastNoiseLite.new()   # "Temperatur" -> Biomwahl
var cave_noise := FastNoiseLite.new()    # 3D-Rauschen fuer Hoehlen


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


func biome_at(wx: int, wz: int) -> int:
	var t := biome_noise.get_noise_2d(wx, wz)
	if t > 0.32:
		return Biome.DESERT
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

			for y in h + 1:
				var id := BlockDB.STONE
				if y <= bedrock_top:
					id = BlockDB.BEDROCK
				elif y > h - DIRT_DEPTH:
					if sandy:
						id = BlockDB.SAND
					elif y == h:
						id = BlockDB.GRASS
					else:
						id = BlockDB.DIRT
				elif id == BlockDB.STONE:
					# Erze in Stein einstreuen
					var r := rng.randf()
					if y < 48 and r < 0.008:
						id = BlockDB.IRON_ORE
					elif y >= 8 and r < 0.02:
						id = BlockDB.COAL_ORE
				# Hoehlen ausgraben (nicht durch Grundgestein)
				if id != BlockDB.BEDROCK and y > bedrock_top and y < h - 1:
					if cave_noise.get_noise_3d(wx, y, wz) > 0.58:
						id = BlockDB.AIR
				data[col + y] = id

			# Wasser bis zur Meereshoehe auffuellen
			for y in range(h + 1, SEA_LEVEL + 1):
				data[col + y] = BlockDB.WATER
			max_y = maxi(max_y, maxi(h, SEA_LEVEL))

	max_y = maxi(max_y, _plant_trees(cpos, data))
	return {"data": data, "max_y": max_y}


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
			if chance <= 0.0:
				continue
			var rng := RandomNumberGenerator.new()
			rng.seed = _hash2(wx ^ 0x5F3759DF, wz)
			if rng.randf() >= chance:
				continue
			var h := height_at(wx, wz)
			if h <= SEA_LEVEL or data[Chunk.index(x, h, z)] != BlockDB.GRASS:
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
