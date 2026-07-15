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

	container = ContainerUI.new()
	add_child(container)

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
		_water_tint.visible = _player.is_head_in_water()
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
