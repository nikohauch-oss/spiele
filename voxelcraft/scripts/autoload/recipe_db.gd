extends Node
## RecipeDB (Autoload): Crafting- und Schmelzrezepte + Matching-Logik.
##
## Geformte Rezepte ("shaped"): pattern = Zeilen-Strings, key = Zeichen -> Item-Id,
## Leerzeichen = leer. Das Muster wird positionsunabhaengig (Bounding-Box) und
## auch gespiegelt verglichen. Formlose Rezepte ("shapeless") vergleichen nur
## die Menge der eingesetzten Items.

# Schmelzrezepte: Eingabe-Item -> {result, time}
var smelting := {
	"iron_ore": {"result": "iron_ingot", "time": 8.0},
	"log": {"result": "coal", "time": 8.0},  # Holzkohle
	"porkchop_raw": {"result": "porkchop_cooked", "time": 6.0},
	"beef_raw": {"result": "steak", "time": 6.0},
	"chicken_raw": {"result": "chicken_cooked", "time": 6.0},
	"sand": {"result": "glass", "time": 6.0},
}

var shapeless := [
	{"items": ["log"], "result": "planks", "count": 4},
]

var shaped := [
	{"pattern": ["P", "P"], "key": {"P": "planks"}, "result": "stick", "count": 4},
	{"pattern": ["PP", "PP"], "key": {"P": "planks"}, "result": "crafting_table", "count": 1},
	{"pattern": ["SSS", "S S", "SSS"], "key": {"S": "stone"}, "result": "furnace", "count": 1},
	{"pattern": ["PPP", "P P", "PPP"], "key": {"P": "planks"}, "result": "chest", "count": 1},
	{"pattern": ["K", "S"], "key": {"K": "coal", "S": "stick"}, "result": "torch", "count": 4},
	# Blaetter ersetzen Wolle/Faden (mit der Axt von Baeumen ernten)
	{"pattern": ["LLL", "PPP"], "key": {"L": "leaves", "P": "planks"}, "result": "bed", "count": 1},
	{"pattern": [" SL", "S L", " SL"], "key": {"S": "stick", "L": "leaves"}, "result": "bow", "count": 1},
	{"pattern": ["F", "S", "L"], "key": {"F": "stone", "S": "stick", "L": "leaves"},
		"result": "arrow", "count": 4},
	# Mit echter Feder (Huhn) gibt es mehr Pfeile
	{"pattern": ["F", "S", "E"], "key": {"F": "stone", "S": "stick", "E": "feather"},
		"result": "arrow", "count": 8},
	# --- Bauen & Sprengen ---
	{"pattern": ["GSG", "SGS", "GSG"], "key": {"G": "gunpowder", "S": "sand"},
		"result": "c4", "count": 1},
	{"pattern": ["S S", "SSS", "S S"], "key": {"S": "stick"}, "result": "ladder", "count": 3},
	{"pattern": ["PP", "PP", "PP"], "key": {"P": "planks"}, "result": "door", "count": 1},
	{"pattern": ["PSP", "PSP"], "key": {"P": "planks", "S": "stick"},
		"result": "fence", "count": 3},
	{"pattern": ["PPP"], "key": {"P": "planks"}, "result": "slab_plank", "count": 6},
	{"pattern": ["SSS"], "key": {"S": "stone"}, "result": "slab_stone", "count": 6},
	{"pattern": ["P  ", "PP ", "PPP"], "key": {"P": "planks"},
		"result": "stair_plank", "count": 4},
	{"pattern": ["S  ", "SS ", "SSS"], "key": {"S": "stone"},
		"result": "stair_stone", "count": 4},
	# --- Farming & Werkzeuge ---
	{"pattern": ["WWW"], "key": {"W": "wheat"}, "result": "bread", "count": 1},
	# Bett auch klassisch mit Wolle (von Schafen)
	{"pattern": ["WWW", "PPP"], "key": {"W": "wool", "P": "planks"}, "result": "bed", "count": 1},
	{"pattern": [" I ", "ICI", " I "], "key": {"I": "iron_ingot", "C": "coal"},
		"result": "compass", "count": 1},
	{"pattern": [" S ", "SIS", " S "], "key": {"S": "stone", "I": "iron_ingot"},
		"result": "clock", "count": 1},
]


func _ready() -> void:
	# Werkzeugrezepte fuer alle Material-Stufen generieren
	for m in [["wooden", "planks"], ["stone", "stone"], ["iron", "iron_ingot"],
			["diamond", "diamond"]]:
		var key := {"M": m[1], "S": "stick"}
		shaped.append({"pattern": ["MMM", " S ", " S "], "key": key,
			"result": "%s_pickaxe" % m[0], "count": 1})
		shaped.append({"pattern": ["MM", "MS", " S"], "key": key,
			"result": "%s_axe" % m[0], "count": 1})
		shaped.append({"pattern": ["M", "S", "S"], "key": key,
			"result": "%s_shovel" % m[0], "count": 1})
		shaped.append({"pattern": ["M", "M", "S"], "key": key,
			"result": "%s_sword" % m[0], "count": 1})
		shaped.append({"pattern": ["MM", " S", " S"], "key": key,
			"result": "%s_hoe" % m[0], "count": 1})
	# Ruestung fuer Leder/Eisen/Diamant
	for m in [["leather", "leather"], ["iron", "iron_ingot"], ["diamond", "diamond"]]:
		var key := {"M": m[1]}
		shaped.append({"pattern": ["MMM", "M M"], "key": key,
			"result": "%s_helmet" % m[0], "count": 1})
		shaped.append({"pattern": ["M M", "MMM", "MMM"], "key": key,
			"result": "%s_chestplate" % m[0], "count": 1})
		shaped.append({"pattern": ["MMM", "M M", "M M"], "key": key,
			"result": "%s_leggings" % m[0], "count": 1})
		shaped.append({"pattern": ["M M", "M M"], "key": key,
			"result": "%s_boots" % m[0], "count": 1})


## grid: Array aus w*w Item-Ids ("" = leer, zeilenweise).
## Rueckgabe: {"result": id, "count": n} oder {} wenn kein Rezept passt.
func match_grid(grid: Array, w: int) -> Dictionary:
	# Bounding-Box der belegten Zellen bestimmen
	var min_x := w
	var min_y := w
	var max_x := -1
	var max_y := -1
	var used: Array[String] = []
	for y in w:
		for x in w:
			if grid[y * w + x] != "":
				min_x = mini(min_x, x)
				min_y = mini(min_y, y)
				max_x = maxi(max_x, x)
				max_y = maxi(max_y, y)
				used.append(grid[y * w + x])
	if max_x < 0:
		return {}
	var bw := max_x - min_x + 1
	var bh := max_y - min_y + 1

	for r: Dictionary in shaped:
		var pattern: Array = r.pattern
		if pattern.size() != bh or (pattern[0] as String).length() != bw:
			continue
		if _matches_shaped(grid, w, min_x, min_y, r, false) \
				or _matches_shaped(grid, w, min_x, min_y, r, true):
			return {"result": r.result, "count": r.count}

	used.sort()
	for r: Dictionary in shapeless:
		var items: Array = (r.items as Array).duplicate()
		items.sort()
		if items == used:
			return {"result": r.result, "count": r.count}
	return {}


func _matches_shaped(grid: Array, w: int, ox: int, oy: int, r: Dictionary, mirrored: bool) -> bool:
	var pattern: Array = r.pattern
	var bh := pattern.size()
	var bw := (pattern[0] as String).length()
	for py in bh:
		var row: String = pattern[py]
		for px in bw:
			var ch := row[bw - 1 - px] if mirrored else row[px]
			var expected: String = r.key.get(ch, "") if ch != " " else ""
			if grid[(oy + py) * w + (ox + px)] != expected:
				return false
	return true
