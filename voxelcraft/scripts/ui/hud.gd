class_name HUD
extends CanvasLayer
## Spiel-HUD, komplett per Code aufgebaut:
## Fadenkreuz, Hotbar (9 Slots), Herzen/Hunger, Abbau-Fortschritt,
## Schadens-Blitz, Unterwasser-Filter, Toast-Meldungen, F3-Debug,
## Todesbildschirm - plus das Container-UI (Inventar/Werkbank/Ofen).

var container: ContainerUI

var _hotbar: Array[SlotUI] = []
var _hearts: Array[ColorRect] = []
var _food: Array[ColorRect] = []
var _armor_pips: Array[ColorRect] = []
var _pause_panel: Control
var _pause_stats: Label
var _info: Label            # Kompass-/Uhr-Zeile ueber der Hotbar
var _map_panel: Control
var _map_texrect: TextureRect
var _map_img: Image
var _map_tex: ImageTexture
var _map_row := 0

const MAP_SIZE := 64   # Pixel (1 Pixel = 2 Bloecke -> 128 m Kartenbreite)
var _dig_fill: ColorRect
var _dig_bar: Control
var _toast: Label
var _debug: Label
var _flash: ColorRect
var _water_tint: ColorRect
var _death_panel: Control
var _player: PlayerController


func _ready() -> void:
	_water_tint = ColorRect.new()
	_water_tint.color = Color(0.1, 0.25, 0.7, 0.3)
	_water_tint.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_water_tint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_water_tint.visible = false
	add_child(_water_tint)

	_flash = ColorRect.new()
	_flash.color = Color(0.9, 0.1, 0.1, 0.0)
	_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_flash)

	_build_crosshair()
	_build_dig_bar()
	_build_bottom_bar()
	_build_labels()

	_build_minimap()

	container = ContainerUI.new()
	add_child(container)

	_pause_panel = _build_pause_panel()
	add_child(_pause_panel)

	_death_panel = _build_death_panel()
	add_child(_death_panel)


## Verbindet das HUD mit dem Spieler (Signale fuer Inventar + Stats).
func bind(player: PlayerController) -> void:
	_player = player
	container.inv = player.inventory
	player.inventory.changed.connect(_refresh_hotbar)
	player.stats.changed.connect(_refresh_stats)
	_refresh_hotbar()
	_refresh_stats()


func _process(_delta: float) -> void:
	if _player:
		# Blaufilter unter Wasser, Orangefilter in Lava
		if _player.is_in_lava():
			_water_tint.color = Color(0.9, 0.3, 0.05, 0.4)
			_water_tint.visible = true
		else:
			_water_tint.color = Color(0.1, 0.25, 0.7, 0.3)
			_water_tint.visible = _player.is_head_in_water()
		_update_info_line()
		if _map_panel.visible:
			_update_minimap()
	if _debug.visible and _player:
		var p := _player.global_position
		var cell := Vector3i((p + Vector3(0, 0.9, 0)).floor())
		_debug.text = "FPS: %d\nPosition: %.1f / %.1f / %.1f\nChunk: %s\nChunks geladen: %d\nLicht: Himmel %d / Block %d\nSeed: %d" % [
			Engine.get_frames_per_second(), p.x, p.y, p.z,
			str(ChunkManager.world_to_chunk(Vector3i(p.floor()))),
			Game.chunk_manager.chunks.size(),
			Game.chunk_manager.light_get(cell, true),
			Game.chunk_manager.light_get(cell, false), Game.world_seed]


# ------------------------------------------------------------------- Aufbau ---

func _build_crosshair() -> void:
	var center := Control.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	for s in [Vector2(14, 2), Vector2(2, 14)]:
		var r := ColorRect.new()
		r.color = Color(1, 1, 1, 0.8)
		r.size = s
		r.position = -s / 2.0
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		center.add_child(r)


func _build_dig_bar() -> void:
	_dig_bar = Control.new()
	_dig_bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_dig_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dig_bar.visible = false
	add_child(_dig_bar)
	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.55)
	bg.position = Vector2(-31, 24)
	bg.size = Vector2(62, 8)
	_dig_bar.add_child(bg)
	_dig_fill = ColorRect.new()
	_dig_fill.color = Color(0.95, 0.95, 0.95)
	_dig_fill.position = Vector2(-30, 25)
	_dig_fill.size = Vector2(0, 6)
	_dig_bar.add_child(_dig_fill)


## Hotbar + Herz-/Hungerreihen unten mittig
func _build_bottom_bar() -> void:
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	root.grow_horizontal = Control.GROW_DIRECTION_BOTH
	root.grow_vertical = Control.GROW_DIRECTION_BEGIN
	root.offset_bottom = -8
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# Info-Zeile (Kompass/Uhr, wenn in der Hand)
	_info = Label.new()
	_info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_info.add_theme_font_size_override("font_size", 15)
	_info.add_theme_color_override("font_outline_color", Color.BLACK)
	_info.add_theme_constant_override("outline_size", 5)
	_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_info)

	# Ruestungs-Reihe (nur sichtbar, wenn etwas getragen wird)
	var armor_row := HBoxContainer.new()
	armor_row.add_theme_constant_override("separation", 3)
	armor_row.alignment = BoxContainer.ALIGNMENT_CENTER
	armor_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(armor_row)
	for i in 10:
		_armor_pips.append(_stat_pip(armor_row))

	var stats_row := HBoxContainer.new()
	stats_row.add_theme_constant_override("separation", 40)
	stats_row.alignment = BoxContainer.ALIGNMENT_CENTER
	stats_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(stats_row)
	var hearts_row := HBoxContainer.new()
	var food_row := HBoxContainer.new()
	for row in [hearts_row, food_row]:
		row.add_theme_constant_override("separation", 3)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stats_row.add_child(hearts_row)
	stats_row.add_child(food_row)
	for i in 10:
		_hearts.append(_stat_pip(hearts_row))
		_food.append(_stat_pip(food_row))

	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 4)
	root.add_child(bar)
	for i in Inventory.HOTBAR:
		var slot := SlotUI.new(i)
		slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_hotbar.append(slot)
		bar.add_child(slot)


func _stat_pip(parent: Control) -> ColorRect:
	var r := ColorRect.new()
	r.custom_minimum_size = Vector2(13, 13)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


func _build_labels() -> void:
	_toast = Label.new()
	_toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.offset_top = 80
	_toast.add_theme_font_size_override("font_size", 18)
	_toast.add_theme_color_override("font_outline_color", Color.BLACK)
	_toast.add_theme_constant_override("outline_size", 6)
	_toast.modulate.a = 0.0
	add_child(_toast)

	_debug = Label.new()
	_debug.position = Vector2(10, 10)
	_debug.add_theme_font_size_override("font_size", 14)
	_debug.add_theme_color_override("font_outline_color", Color.BLACK)
	_debug.add_theme_constant_override("outline_size", 4)
	_debug.visible = false
	add_child(_debug)


## Minimap oben rechts (Taste M): Draufsicht aus den Chunk-Daten,
## amortisiert aktualisiert (4 Zeilen pro Frame -> kein Ruckeln).
func _build_minimap() -> void:
	_map_img = Image.create_empty(MAP_SIZE, MAP_SIZE, false, Image.FORMAT_RGBA8)
	_map_img.fill(Color(0, 0, 0, 0.6))
	_map_tex = ImageTexture.create_from_image(_map_img)
	_map_panel = PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.1, 0.13, 0.9)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(6)
	_map_panel.add_theme_stylebox_override("panel", style)
	_map_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_map_panel.offset_left = -216
	_map_panel.offset_top = 12
	_map_panel.offset_right = -12
	_map_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_map_panel.visible = false
	_map_texrect = TextureRect.new()
	_map_texrect.texture = _map_tex
	_map_texrect.custom_minimum_size = Vector2(192, 192)
	_map_texrect.stretch_mode = TextureRect.STRETCH_SCALE
	_map_texrect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_map_texrect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_map_panel.add_child(_map_texrect)
	add_child(_map_panel)


func toggle_map() -> void:
	_map_panel.visible = not _map_panel.visible


## 4 Kartenzeilen pro Frame neu einlesen (1 Pixel = 2x2 Bloecke).
func _update_minimap() -> void:
	var center := Vector3i(_player.global_position.floor())
	for _r in 4:
		var py := _map_row
		_map_row = (_map_row + 1) % MAP_SIZE
		var wz := center.z + (py - (MAP_SIZE >> 1)) * 2
		for px in MAP_SIZE:
			var wx := center.x + (px - (MAP_SIZE >> 1)) * 2
			var g: int = Game.chunk_manager.get_ground_y(wx, wz)
			var c := Color(0, 0, 0, 0.6)
			if g >= 0:
				var top: int = Game.chunk_manager.get_block(Vector3i(wx, g, wz))
				c = BlockDB.avg_color(top)
				if Game.chunk_manager.get_block(Vector3i(wx, g + 1, wz)) == BlockDB.WATER:
					c = Color(0.22, 0.42, 0.82)
				# Hoehen-Schattierung fuer Relief
				c = c.darkened(clampf((70.0 - g) * 0.012, -0.15, 0.35))
			_map_img.set_pixel(px, py, c)
	# Spieler-Markierung in der Mitte
	for dx in range(-1, 2):
		for dy in range(-1, 2):
			_map_img.set_pixel((MAP_SIZE >> 1) + dx, (MAP_SIZE >> 1) + dy, Color.WHITE)
	_map_tex.update(_map_img)


func _build_pause_panel() -> Control:
	var root := ColorRect.new()
	root.color = Color(0, 0, 0, 0.55)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)
	var title := Label.new()
	title.text = "Pause"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	box.add_child(title)
	var entries := [["Fortsetzen", func() -> void: Game.set_pause(false)],
		["Speichern", func() -> void: Game.save_world()],
		["Speichern & Hauptmenue", func() -> void: Game.return_to_menu()]]
	for e: Array in entries:
		var b := Button.new()
		b.text = e[0]
		b.custom_minimum_size = Vector2(240, 40)
		b.pressed.connect(e[1])
		box.add_child(b)
	_pause_stats = Label.new()
	_pause_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pause_stats.add_theme_font_size_override("font_size", 14)
	_pause_stats.modulate.a = 0.85
	box.add_child(_pause_stats)
	return root


func set_paused(on: bool) -> void:
	_pause_panel.visible = on
	if on:
		var s: Dictionary = Game.stats
		_pause_stats.text = "Statistik\nAbgebaut: %d   Platziert: %d\nMonster besiegt: %d   Tode: %d\nSpielzeit: %d min" % [
			s.blocks_mined, s.blocks_placed, s.mobs_killed, s.deaths, int(s.playtime / 60.0)]


func _build_death_panel() -> Control:
	var panel := ColorRect.new()
	panel.color = Color(0.4, 0.0, 0.0, 0.55)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.visible = false
	var lbl := Label.new()
	lbl.text = "Du bist gestorben!\nRespawn ..."
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size", 32)
	lbl.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	lbl.grow_horizontal = Control.GROW_DIRECTION_BOTH
	lbl.grow_vertical = Control.GROW_DIRECTION_BOTH
	panel.add_child(lbl)
	return panel


# ------------------------------------------------------------------ Updates ---

func _refresh_hotbar() -> void:
	for i in _hotbar.size():
		_hotbar[i].set_stack(_player.inventory.slots[i])
		_hotbar[i].set_selected(i == _player.inventory.selected)
	# Ruestungsanzeige (1 Pip = 2 Punkte)
	var pts := _player.inventory.armor_points()
	for i in 10:
		_armor_pips[i].visible = pts > 0
		var a := clampf(pts / 2.0 - i, 0.0, 1.0)
		_armor_pips[i].color = Color(0.75, 0.75, 0.8) if a >= 1.0 \
			else (Color(0.5, 0.5, 0.55) if a > 0.0 else Color(0.2, 0.2, 0.2, 0.7))


func _refresh_stats() -> void:
	var s := _player.stats
	for i in 10:
		# 1 Pip = 2 Punkte; halbe Stufen werden abgedunkelt dargestellt
		var h := clampf(s.health / 2.0 - i, 0.0, 1.0)
		_hearts[i].color = Color(0.85, 0.1, 0.1) if h >= 1.0 \
			else (Color(0.55, 0.08, 0.08) if h > 0.0 else Color(0.2, 0.2, 0.2, 0.7))
		var f := clampf(s.hunger / 2.0 - i, 0.0, 1.0)
		_food[i].color = Color(0.85, 0.55, 0.15) if f >= 1.0 \
			else (Color(0.55, 0.35, 0.1) if f > 0.0 else Color(0.2, 0.2, 0.2, 0.7))


## Kompass zeigt Richtung + Distanz zum Spawnpunkt, Uhr die Tageszeit.
func _update_info_line() -> void:
	var held: String = _player.inventory.selected_id()
	if held == "compass":
		var to_spawn: Vector3 = Game.spawn_point - _player.global_position
		var dist := int(Vector2(to_spawn.x, to_spawn.z).length())
		# Winkel relativ zur Blickrichtung -> 8 Pfeilrichtungen
		var ang := atan2(to_spawn.x, to_spawn.z) - _player.rotation.y - PI
		var arrows := ["^", "/^", ">", "\\v", "v", "v/", "<", "^\\"]
		var idx := posmod(roundi(ang / (PI / 4.0)), 8)
		_info.text = "Spawn: %s %d m" % [arrows[idx], dist]
	elif held == "clock":
		var frac: float = Game.day_night.time / DayNightCycle.DAY_LENGTH
		var hours := fmod(frac * 24.0 + 6.0, 24.0)  # 0 % = 06:00 Sonnenaufgang
		_info.text = "Zeit: %02d:%02d %s" % [int(hours), int(fmod(hours, 1.0) * 60.0),
			"(Nacht)" if Game.day_night.is_night() else "(Tag)"]
	else:
		_info.text = ""


## Abbau-Fortschritt 0..1 anzeigen; negativ = ausblenden
func set_dig_progress(frac: float) -> void:
	_dig_bar.visible = frac >= 0.0
	if frac >= 0.0:
		_dig_fill.size.x = 60.0 * clampf(frac, 0.0, 1.0)


func flash_damage() -> void:
	_flash.color.a = 0.35
	var tw := create_tween()
	tw.tween_property(_flash, "color:a", 0.0, 0.4)


func toast(text: String) -> void:
	_toast.text = text
	_toast.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(1.6)
	tw.tween_property(_toast, "modulate:a", 0.0, 0.6)


func toggle_debug() -> void:
	_debug.visible = not _debug.visible


func show_death(on: bool) -> void:
	_death_panel.visible = on
