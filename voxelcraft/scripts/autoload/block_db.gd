extends Node
## BlockDB (Autoload): Registry aller Blocktypen.
## Erzeugt den Textur-Atlas komplett prozedural (keine externen Assets noetig)
## und stellt Materialien sowie Abbau-Infos fuer Meshing und Mining bereit.

# Block-IDs (Index in den Chunk-Daten, 1 Byte pro Block)
enum {
	AIR, GRASS, DIRT, STONE, SAND, LOG, LEAVES, WATER,
	COAL_ORE, IRON_ORE, PLANKS, CRAFTING_TABLE, FURNACE, BEDROCK,
	TORCH, CHEST, DIAMOND_ORE, BED,
	BLOCK_COUNT,
}

const TILE := 16          # Pixelgroesse einer Atlas-Kachel
const ATLAS_TILES := 8    # Kacheln pro Atlas-Zeile/-Spalte
const UV_STEP := 1.0 / ATLAS_TILES
# Halber Pixel Einzug gegen Textur-Bleeding an Kachelraendern
const UV_INSET := 0.5 / (TILE * ATLAS_TILES)

# Blockdefinitionen:
#   id          : String-Id (identisch mit der Item-Id des Blocks)
#   tiles       : [oben, seite, unten] als Kachel-Name im Atlas
#   hardness    : Basis-Abbauzeit in Sekunden mit der Hand (-1 = unzerstoerbar)
#   tool        : effektiver Werkzeugtyp ("pickaxe" / "axe" / "shovel" / "")
#   min_tier    : benoetigte Werkzeugstufe fuer Drops (0=Hand, 1=Holz, 2=Stein, 3=Eisen)
#   drop        : Item-Id des Drops ("" = kein Drop; fehlt = eigene Id)
#   solid       : hat Kollision
#   see_through : Nachbarflaechen werden trotzdem gerendert (Luft/Wasser)
var defs := {
	AIR: {"id": "air", "name": "Luft", "solid": false, "see_through": true},
	GRASS: {"id": "grass", "name": "Grasblock", "tiles": ["grass_top", "grass_side", "dirt"],
		"hardness": 0.9, "tool": "shovel", "drop": "dirt"},
	DIRT: {"id": "dirt", "name": "Erde", "tiles": ["dirt", "dirt", "dirt"],
		"hardness": 0.75, "tool": "shovel"},
	STONE: {"id": "stone", "name": "Stein", "tiles": ["stone", "stone", "stone"],
		"hardness": 6.0, "tool": "pickaxe", "min_tier": 1},
	SAND: {"id": "sand", "name": "Sand", "tiles": ["sand", "sand", "sand"],
		"hardness": 0.75, "tool": "shovel"},
	LOG: {"id": "log", "name": "Holzstamm", "tiles": ["log_top", "log_side", "log_top"],
		"hardness": 3.0, "tool": "axe"},
	LEAVES: {"id": "leaves", "name": "Blaetter", "tiles": ["leaves", "leaves", "leaves"],
		"hardness": 0.35, "drop": ""},
	WATER: {"id": "water", "name": "Wasser", "tiles": ["water", "water", "water"],
		"hardness": -1.0, "solid": false, "see_through": true},
	COAL_ORE: {"id": "coal_ore", "name": "Kohle-Erz", "tiles": ["coal_ore", "coal_ore", "coal_ore"],
		"hardness": 9.0, "tool": "pickaxe", "min_tier": 1, "drop": "coal"},
	IRON_ORE: {"id": "iron_ore", "name": "Eisen-Erz", "tiles": ["iron_ore", "iron_ore", "iron_ore"],
		"hardness": 9.0, "tool": "pickaxe", "min_tier": 2},
	PLANKS: {"id": "planks", "name": "Holzbretter", "tiles": ["planks", "planks", "planks"],
		"hardness": 3.0, "tool": "axe"},
	CRAFTING_TABLE: {"id": "crafting_table", "name": "Werkbank",
		"tiles": ["table_top", "table_side", "planks"], "hardness": 3.5, "tool": "axe"},
	FURNACE: {"id": "furnace", "name": "Ofen", "tiles": ["stone", "furnace_front", "stone"],
		"hardness": 7.0, "tool": "pickaxe", "min_tier": 1},
	BEDROCK: {"id": "bedrock", "name": "Grundgestein", "tiles": ["bedrock", "bedrock", "bedrock"],
		"hardness": -1.0},
	TORCH: {"id": "torch", "name": "Fackel", "tiles": ["torch", "torch", "torch"],
		"hardness": 0.05, "solid": false, "see_through": true},
	CHEST: {"id": "chest", "name": "Truhe", "tiles": ["chest_top", "chest_side", "planks"],
		"hardness": 3.5, "tool": "axe"},
	DIAMOND_ORE: {"id": "diamond_ore", "name": "Diamant-Erz",
		"tiles": ["diamond_ore", "diamond_ore", "diamond_ore"],
		"hardness": 9.0, "tool": "pickaxe", "min_tier": 3, "drop": "diamond"},
	BED: {"id": "bed", "name": "Bett", "tiles": ["bed_top", "bed_side", "planks"],
		"hardness": 1.2, "tool": "axe", "see_through": true},
}

var atlas_texture: ImageTexture
var opaque_material: ShaderMaterial
var water_material: ShaderMaterial

var _tile_index := {}       # Kachel-Name -> Index im Atlas
var _tile_avg := {}         # Kachel-Name -> Durchschnittsfarbe (Abbau-Partikel)
var _avg_colors := []       # Block-Id -> Durchschnittsfarbe der Seitenkachel
var _by_string_id := {}     # "grass" -> GRASS
# Schnelle Lookups fuer den Mesher-Thread (nur lesend -> threadsicher)
var _see_through := PackedByteArray()
var _solid := PackedByteArray()
var _uv_base := []          # [block][slot 0..2] -> Vector2 (linke obere UV-Ecke)


func _ready() -> void:
	_build_atlas()
	_build_materials()
	_finalize_defs()


func get_def(block_id: int) -> Dictionary:
	return defs[block_id]


func block_by_string(id: String) -> int:
	return _by_string_id.get(id, -1)


func is_solid(block_id: int) -> bool:
	return _solid[block_id] == 1


func is_see_through(block_id: int) -> bool:
	return _see_through[block_id] == 1


## Linke obere UV-Ecke der Kachel fuer eine Blockflaeche (slot: 0=oben, 1=seite, 2=unten)
func uv_base(block_id: int, slot: int) -> Vector2:
	return _uv_base[block_id][slot]


## Rect2 (in Pixeln) einer Blockseite im Atlas - fuer Item-Icons (AtlasTexture)
func tile_region(block_id: int, slot: int) -> Rect2:
	var base: Vector2 = _uv_base[block_id][slot]
	var px := base / UV_STEP * float(TILE)
	return Rect2(px, Vector2(TILE, TILE))


func _finalize_defs() -> void:
	_see_through.resize(BLOCK_COUNT)
	_solid.resize(BLOCK_COUNT)
	_uv_base.resize(BLOCK_COUNT)
	_avg_colors.resize(BLOCK_COUNT)
	for b in BLOCK_COUNT:
		var d: Dictionary = defs[b]
		# Defaults ergaenzen, damit alle Zugriffe ohne has()-Checks auskommen
		if not d.has("solid"):
			d.solid = true
		if not d.has("see_through"):
			d.see_through = false
		if not d.has("tool"):
			d.tool = ""
		if not d.has("min_tier"):
			d.min_tier = 0
		if not d.has("drop"):
			d.drop = d.id
		if not d.has("hardness"):
			d.hardness = 1.0
		_solid[b] = 1 if d.solid else 0
		_see_through[b] = 1 if d.see_through else 0
		var uvs := []
		if d.has("tiles"):
			for slot in 3:
				var idx: int = _tile_index[d.tiles[slot]]
				@warning_ignore("integer_division")
				uvs.append(Vector2(idx % ATLAS_TILES, idx / ATLAS_TILES) * UV_STEP)
			_avg_colors[b] = _tile_avg.get(d.tiles[1], Color.WHITE)
		else:
			uvs = [Vector2.ZERO, Vector2.ZERO, Vector2.ZERO]
			_avg_colors[b] = Color.WHITE
		_uv_base[b] = uvs


## Durchschnittsfarbe der Seitenkachel eines Blocks (Abbau-Partikel).
func avg_color(block_id: int) -> Color:
	return _avg_colors[block_id]


# ------------------------------------------------------------------ Atlas ---

func _build_atlas() -> void:
	var kinds := ["grass_top", "grass_side", "dirt", "stone", "sand", "log_side",
		"log_top", "leaves", "water", "coal_ore", "iron_ore", "planks",
		"table_top", "table_side", "furnace_front", "bedrock",
		"torch", "chest_top", "chest_side", "diamond_ore", "bed_top", "bed_side"]
	var img := Image.create_empty(ATLAS_TILES * TILE, ATLAS_TILES * TILE, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 0, 1))  # Magenta = "fehlende Kachel"
	for i in kinds.size():
		_tile_index[kinds[i]] = i
		var ox := (i % ATLAS_TILES) * TILE
		@warning_ignore("integer_division")
		var oy := (i / ATLAS_TILES) * TILE
		_paint_tile(img, ox, oy, kinds[i])
		_tile_avg[kinds[i]] = _average_tile(img, ox, oy)
	atlas_texture = ImageTexture.create_from_image(img)


## Durchschnittsfarbe einer Kachel (fuer Abbau-Partikel).
func _average_tile(img: Image, ox: int, oy: int) -> Color:
	var sum := Vector3.ZERO
	for py in TILE:
		for px in TILE:
			var c := img.get_pixel(ox + px, oy + py)
			sum += Vector3(c.r, c.g, c.b)
	sum /= float(TILE * TILE)
	return Color(sum.x, sum.y, sum.z)


## Chunk-Shader: Vertex-Farbe traegt das gebackene Voxel-Licht
## (R = Blocklicht, G = Himmelslicht, B = Flaechen-Schattierung).
## "sun_light" wird vom Tag-Nacht-Zyklus gesetzt und dimmt nur das
## Himmelslicht - Fackellicht bleibt nachts voll erhalten. Unshaded,
## damit die Voxel-Beleuchtung nicht mit der Sonnen-Light3D kollidiert;
## Environment-Nebel wirkt weiterhin.
const _CHUNK_SHADER := """
shader_type spatial;
render_mode unshaded%s;
uniform sampler2D atlas : source_color, filter_nearest;
uniform float sun_light : hint_range(0.0, 1.0) = 1.0;
void fragment() {
	vec4 tex = texture(atlas, UV);
	float l = max(COLOR.r, COLOR.g * sun_light);
	l = max(l, 0.04) * COLOR.b;
	ALBEDO = tex.rgb * l;
%s
}
"""


func _build_materials() -> void:
	opaque_material = _make_chunk_material("", "")
	water_material = _make_chunk_material(", cull_disabled", "\tALPHA = 0.72;")


func _make_chunk_material(modes: String, extra: String) -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = _CHUNK_SHADER % [modes, extra]
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("atlas", atlas_texture)
	mat.set_shader_parameter("sun_light", 1.0)
	return mat


## Malt eine 16x16-Kachel: Grundfarbe mit deterministischem Pixelrauschen,
## plus einfache Muster (Rinde, Erz-Sprenkel, Brett-Fugen, ...).
func _paint_tile(img: Image, ox: int, oy: int, kind: String) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(kind)
	for py in TILE:
		for px in TILE:
			var c := Color.MAGENTA
			match kind:
				"grass_top":
					c = _vary(Color(0.33, 0.62, 0.22), rng, 0.05)
				"grass_side":
					c = _vary(Color(0.55, 0.4, 0.26), rng, 0.05)
					if py < 3 or (py == 3 and rng.randf() < 0.5):
						c = _vary(Color(0.33, 0.62, 0.22), rng, 0.05)
				"dirt":
					c = _vary(Color(0.55, 0.4, 0.26), rng, 0.06)
				"stone":
					c = _vary(Color(0.52, 0.52, 0.54), rng, 0.05)
					if rng.randf() < 0.06:
						c = c.darkened(0.25)
				"sand":
					c = _vary(Color(0.87, 0.8, 0.56), rng, 0.04)
				"log_side":
					c = _vary(Color(0.42, 0.31, 0.18), rng, 0.04)
					if px % 4 == 0:
						c = c.darkened(0.28)
				"log_top":
					var d := maxi(absi(px - 8), absi(py - 8))
					c = _vary(Color(0.62, 0.49, 0.3), rng, 0.03)
					if d % 3 == 0:
						c = c.darkened(0.3)
				"leaves":
					c = _vary(Color(0.18, 0.45, 0.14), rng, 0.09)
				"water":
					c = _vary(Color(0.22, 0.42, 0.82), rng, 0.04)
				"coal_ore", "iron_ore", "diamond_ore":
					c = _vary(Color(0.52, 0.52, 0.54), rng, 0.05)
				"torch":
					# Holzstab mit gluehender Spitze (die Flaechen der kleinen
					# Fackel-Box zeigen diese Kachel komplett)
					c = _vary(Color(0.5, 0.37, 0.2), rng, 0.05)
					if py <= 3:
						c = _vary(Color(0.98, 0.78, 0.25), rng, 0.06)
				"chest_top", "chest_side":
					c = _vary(Color(0.55, 0.4, 0.21), rng, 0.04)
					if px == 0 or px == 15 or py == 0 or py == 15:
						c = c.darkened(0.35)  # dunkler Rahmen
					elif kind == "chest_side" and py == 6:
						c = c.darkened(0.4)   # Deckelfuge
					if kind == "chest_side" and py >= 5 and py <= 8 and px >= 7 and px <= 8:
						c = Color(0.45, 0.45, 0.48)  # Schloss
				"planks", "table_side":
					c = _vary(Color(0.66, 0.51, 0.3), rng, 0.04)
					if py % 4 == 3:
						c = c.darkened(0.3)  # horizontale Fugen
					elif (px + (py >> 2) * 8) % 16 == 0:
						c = c.darkened(0.25)  # versetzte Stossfugen
				"table_top":
					c = _vary(Color(0.6, 0.45, 0.27), rng, 0.04)
					if px < 2 or px > 13 or py < 2 or py > 13:
						c = _vary(Color(0.45, 0.32, 0.18), rng, 0.03)
				"furnace_front":
					c = _vary(Color(0.45, 0.45, 0.47), rng, 0.05)
					if py >= 9 and py <= 13 and px >= 5 and px <= 10:
						c = Color(0.08, 0.06, 0.05) if rng.randf() > 0.25 else Color(0.9, 0.45, 0.1)
				"bedrock":
					c = _vary(Color(0.25, 0.25, 0.27), rng, 0.14)
				"bed_top":
					# Kissen oben (helles Ende), Rest rote Decke
					if py < 5:
						c = _vary(Color(0.92, 0.92, 0.88), rng, 0.03)
					else:
						c = _vary(Color(0.72, 0.14, 0.14), rng, 0.04)
					if px == 0 or px == 15:
						c = c.darkened(0.3)
				"bed_side":
					# oben rote Decke, unten Holzrahmen
					if py < 6:
						c = _vary(Color(0.72, 0.14, 0.14), rng, 0.04)
					else:
						c = _vary(Color(0.55, 0.4, 0.22), rng, 0.05)
						if py % 4 == 3:
							c = c.darkened(0.3)
			img.set_pixel(ox + px, oy + py, c)
	# Erz-Sprenkel als 2x2-Kluempchen nachtraeglich aufmalen
	if kind.ends_with("_ore"):
		var ore_c := Color(0.12, 0.12, 0.12)
		if kind == "iron_ore":
			ore_c = Color(0.82, 0.65, 0.5)
		elif kind == "diamond_ore":
			ore_c = Color(0.35, 0.85, 0.85)
		for i in 5:
			var sx := 1 + rng.randi() % (TILE - 3)
			var sy := 1 + rng.randi() % (TILE - 3)
			for dy in 2:
				for dx in 2:
					img.set_pixel(ox + sx + dx, oy + sy + dy, _vary(ore_c, rng, 0.05))


func _vary(base: Color, rng: RandomNumberGenerator, amount: float) -> Color:
	var f := 1.0 + rng.randf_range(-amount, amount) * 2.0
	return Color(clampf(base.r * f, 0, 1), clampf(base.g * f, 0, 1), clampf(base.b * f, 0, 1))
