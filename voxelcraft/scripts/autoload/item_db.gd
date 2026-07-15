extends Node
## ItemDB (Autoload): Registry aller Items.
##  - Bloecke als platzierbare Items (Icon = Atlas-Kachel der Blockseite)
##  - Materialien (Stock, Kohle, Eisenbarren, Apfel)
##  - Werkzeuge (Holz/Stein/Eisen x Spitzhacke/Axt/Schaufel/Schwert)
##  - Abbau-Regeln: Zeit und Drop-Berechtigung je Block/Werkzeug
##
## Item-Definition (Dictionary):
##   name       : Anzeigename (deutsch)
##   max_stack  : Stapelgroesse (Werkzeuge: 1)
##   block      : BlockDB-Id, wenn platzierbar (-1 sonst)
##   tool/tier  : Werkzeugtyp + Stufe (1=Holz, 2=Stein, 3=Eisen)
##   speed      : Abbau-Multiplikator bei passendem Blocktyp
##   damage     : Nahkampfschaden
##   durability : Haltbarkeit (Abnutzungen bis Bruch)
##   fuel       : Brenndauer im Ofen in Sekunden (0 = kein Brennstoff)
##   food       : Hungerpunkte beim Essen (0 = nicht essbar)

var defs := {}
var _icons := {}


func _ready() -> void:
	# --- Bloecke als Items (Wasser/Grundgestein sind nicht erhaeltlich) ---
	for b in range(1, BlockDB.BLOCK_COUNT):
		if b == BlockDB.WATER or b == BlockDB.BEDROCK:
			continue
		var bd := BlockDB.get_def(b)
		_reg({"id": bd.id, "name": bd.name, "block": b})
	defs["log"].fuel = 15.0
	defs["planks"].fuel = 15.0

	# --- Materialien ---
	_reg({"id": "stick", "name": "Stock", "fuel": 5.0})
	_reg({"id": "coal", "name": "Kohle", "fuel": 80.0})
	_reg({"id": "iron_ingot", "name": "Eisenbarren"})
	_reg({"id": "diamond", "name": "Diamant"})
	_reg({"id": "apple", "name": "Apfel", "food": 4})
	_reg({"id": "porkchop_raw", "name": "Rohes Schweinefleisch", "food": 3})
	_reg({"id": "porkchop_cooked", "name": "Gebratenes Schweinefleisch", "food": 8})
	_reg({"id": "rotten_flesh", "name": "Verrottetes Fleisch", "food": 2})

	# --- Fernkampf ---
	_reg({"id": "bow", "name": "Bogen", "durability": 120, "max_stack": 1})
	_reg({"id": "arrow", "name": "Pfeil"})

	# --- Werkzeuge: [Prefix, Anzeigename, Stufe, Tempo, Haltbarkeit, Bonus-Schaden] ---
	for m in [["wooden", "Holz", 1, 4.0, 60, 0], ["stone", "Stein", 2, 8.0, 132, 1],
			["iron", "Eisen", 3, 12.0, 251, 2], ["diamond", "Diamant", 4, 16.0, 800, 3]]:
		_reg({"id": "%s_pickaxe" % m[0], "name": "%s-Spitzhacke" % m[1], "tool": "pickaxe",
			"tier": m[2], "speed": m[3], "durability": m[4], "damage": 2 + m[5], "max_stack": 1})
		_reg({"id": "%s_axe" % m[0], "name": "%s-Axt" % m[1], "tool": "axe",
			"tier": m[2], "speed": m[3], "durability": m[4], "damage": 3 + m[5], "max_stack": 1})
		_reg({"id": "%s_shovel" % m[0], "name": "%s-Schaufel" % m[1], "tool": "shovel",
			"tier": m[2], "speed": m[3], "durability": m[4], "damage": 1 + m[5], "max_stack": 1})
		_reg({"id": "%s_sword" % m[0], "name": "%s-Schwert" % m[1], "tool": "sword",
			"tier": m[2], "speed": 1.0, "durability": m[4], "damage": 4 + m[5], "max_stack": 1})

	_build_icons()


func _reg(d: Dictionary) -> void:
	# Defaults ergaenzen
	if not d.has("max_stack"):
		d.max_stack = 64
	if not d.has("block"):
		d.block = -1
	if not d.has("tool"):
		d.tool = ""
	if not d.has("tier"):
		d.tier = 0
	if not d.has("speed"):
		d.speed = 1.0
	if not d.has("damage"):
		d.damage = 1
	if not d.has("durability"):
		d.durability = 0
	if not d.has("fuel"):
		d.fuel = 0.0
	if not d.has("food"):
		d.food = 0
	defs[d.id] = d


# ------------------------------------------------------------------ Lookups ---

func get_def(id: String) -> Dictionary:
	return defs.get(id, {})


func icon(id: String) -> Texture2D:
	return _icons.get(id)


func display_name(id: String) -> String:
	return defs.get(id, {}).get("name", id)


func max_stack(id: String) -> int:
	return defs.get(id, {}).get("max_stack", 64)


func block_of(id: String) -> int:
	return defs.get(id, {}).get("block", -1)


func is_tool(id: String) -> bool:
	return defs.get(id, {}).get("durability", 0) > 0


func fuel_time(id: String) -> float:
	return defs.get(id, {}).get("fuel", 0.0)


func food_value(id: String) -> int:
	return defs.get(id, {}).get("food", 0)


func attack_damage(id: String) -> int:
	return defs.get(id, {}).get("damage", 1)


# -------------------------------------------------------------- Abbau-Regeln ---

## Abbauzeit in Sekunden fuer Block block_id mit Item item_id ("" = Hand).
func dig_time(block_id: int, item_id: String) -> float:
	var bd := BlockDB.get_def(block_id)
	var h: float = bd.hardness
	if h < 0.0:
		return INF  # unzerstoerbar (Wasser, Grundgestein)
	var t := h
	var d := get_def(item_id)
	if bd.tool != "" and not d.is_empty() and d.tool == bd.tool:
		t /= d.speed  # passendes Werkzeug beschleunigt
	if bd.min_tier > _tier_for(item_id, bd.tool):
		t *= 3.0      # falsches/zu schwaches Werkzeug: langsam (und kein Drop)
	return maxf(t, 0.05)


## Gibt es beim Abbau einen Drop? (z. B. Stein nur mit Spitzhacke)
func yields_drops(block_id: int, item_id: String) -> bool:
	var bd := BlockDB.get_def(block_id)
	return bd.min_tier <= _tier_for(item_id, bd.tool)


func _tier_for(item_id: String, required_tool: String) -> int:
	var d := get_def(item_id)
	if d.is_empty() or required_tool == "" or d.tool != required_tool:
		return 0
	return d.tier


# --------------------------------------------------------------------- Icons ---

func _build_icons() -> void:
	for id: String in defs:
		var d: Dictionary = defs[id]
		if d.block >= 0:
			# Blockseite direkt aus dem Textur-Atlas ausschneiden
			var at := AtlasTexture.new()
			at.atlas = BlockDB.atlas_texture
			at.region = BlockDB.tile_region(d.block, 1)
			_icons[id] = at
		else:
			_icons[id] = ImageTexture.create_from_image(_paint_icon(id, d))


## Einfache 16x16-Pixel-Icons fuer Nicht-Block-Items, per Code gemalt.
func _paint_icon(id: String, d: Dictionary) -> Image:
	var img := Image.create_empty(16, 16, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var wood := Color(0.55, 0.4, 0.22)
	var head := wood
	if id.begins_with("stone_"):
		head = Color(0.55, 0.55, 0.57)
	elif id.begins_with("iron_") and d.tool != "":
		head = Color(0.85, 0.85, 0.9)
	elif id.begins_with("diamond_") and d.tool != "":
		head = Color(0.35, 0.9, 0.88)

	if d.tool != "":
		# Stiel diagonal von unten links zur Mitte
		for i in 8:
			_px(img, 4 + i, 13 - i, wood)
			_px(img, 5 + i, 13 - i, wood.darkened(0.2))
		match d.tool:
			"pickaxe":  # Bogen oben
				for x in range(4, 12):
					_px(img, x, 2, head)
				for p in [[3, 3], [12, 3], [2, 4], [13, 4], [2, 5], [13, 5]]:
					_px(img, p[0], p[1], head)
			"axe":      # Blatt seitlich am Kopf
				for y in range(2, 6):
					for x in range(8, 12):
						_px(img, x, y, head)
				_px(img, 7, 3, head)
				_px(img, 7, 4, head)
			"shovel":   # Blatt am oberen Ende
				for y in range(1, 5):
					for x in range(10, 13):
						_px(img, x, y, head)
			"sword":    # lange Klinge + Parierstange
				for i in 9:
					_px(img, 5 + i, 11 - i, head)
					_px(img, 6 + i, 11 - i, head.lightened(0.2))
				_px(img, 5, 9, wood.darkened(0.2))
				_px(img, 7, 11, wood.darkened(0.2))
		return img

	match id:
		"stick":
			for i in 10:
				_px(img, 3 + i, 12 - i, wood)
				_px(img, 4 + i, 12 - i, wood.darkened(0.15))
		"coal":
			_blob(img, Color(0.12, 0.12, 0.14), 5)
		"diamond":
			_blob(img, Color(0.35, 0.9, 0.88), 4)
		"iron_ingot":
			for y in range(6, 11):
				var inset := (10 - y) >> 1  # trapezfoermiger Barren
				for x in range(3 + inset, 13 - inset):
					_px(img, x, y, Color(0.82, 0.82, 0.88) if y > 6 else Color(0.92, 0.92, 0.97))
		"apple":
			_blob(img, Color(0.8, 0.12, 0.1), 4)
			_px(img, 8, 3, wood)
			_px(img, 8, 4, wood)
			_px(img, 9, 3, Color(0.3, 0.6, 0.2))
		"porkchop_raw", "porkchop_cooked":
			var meat := Color(0.92, 0.5, 0.55) if id == "porkchop_raw" else Color(0.62, 0.38, 0.2)
			_blob(img, meat, 4)
			# Knochenansatz unten links
			_px(img, 4, 11, Color(0.95, 0.93, 0.85))
			_px(img, 3, 12, Color(0.95, 0.93, 0.85))
			_px(img, 4, 12, Color(0.88, 0.85, 0.78))
		"rotten_flesh":
			_blob(img, Color(0.45, 0.4, 0.18), 5)
			_px(img, 7, 8, Color(0.3, 0.5, 0.2))
			_px(img, 10, 10, Color(0.3, 0.5, 0.2))
		"bow":
			var string_c := Color(0.85, 0.85, 0.78)
			for pt in [[5, 2], [4, 3], [3, 4], [3, 6], [3, 8], [3, 10], [4, 11], [5, 12]]:
				_px(img, pt[0], pt[1], wood.darkened(0.1))
				_px(img, pt[0] + 1, pt[1], wood)
			for y in range(2, 13):
				_px(img, 7, y, string_c)  # Sehne
		"arrow":
			for i in 8:
				_px(img, 3 + i, 12 - i, wood)  # Schaft diagonal
			_px(img, 11, 3, Color(0.6, 0.6, 0.62))  # Spitze
			_px(img, 12, 3, Color(0.6, 0.6, 0.62))
			_px(img, 11, 4, Color(0.6, 0.6, 0.62))
			_px(img, 3, 11, Color(0.9, 0.9, 0.85))  # Federn
			_px(img, 4, 13, Color(0.9, 0.9, 0.85))
	return img


func _px(img: Image, x: int, y: int, c: Color) -> void:
	if x >= 0 and x < 16 and y >= 0 and y < 16:
		img.set_pixel(x, y, c)


func _blob(img: Image, c: Color, radius: int) -> void:
	for y in 16:
		for x in 16:
			if Vector2(x - 8, y - 9).length() <= radius:
				img.set_pixel(x, y, c if (x + y) % 3 != 0 else c.lightened(0.15))
