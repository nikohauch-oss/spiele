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
