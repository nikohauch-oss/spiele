extends Control
## Hauptmenue: drei Welt-Slots (Spielen/Loeschen), Einstellungen
## (Sichtweite, Maus-Empfindlichkeit, Lautstaerke) und Beenden.
## Komplett per Code aufgebaut; Einstellungen landen in user://settings.cfg.

var _slot_labels: Array[Label] = []
var _delete_buttons: Array[Button] = []


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.07, 0.09, 0.13)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)

	var title := Label.new()
	title.text = "VoxelCraft"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 42)
	box.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Voxel-Sandbox in Godot"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.modulate.a = 0.7
	box.add_child(subtitle)
	box.add_child(HSeparator.new())

	# --- Welt-Slots ---
	for slot in range(1, 4):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		box.add_child(row)
		var lbl := Label.new()
		lbl.custom_minimum_size = Vector2(220, 0)
		_slot_labels.append(lbl)
		row.add_child(lbl)
		var play := Button.new()
		play.custom_minimum_size = Vector2(110, 36)
		play.pressed.connect(_start_world.bind(slot))
		play.name = "Play%d" % slot
		row.add_child(play)
		var del := Button.new()
		del.text = "Loeschen"
		del.custom_minimum_size = Vector2(90, 36)
		del.pressed.connect(_delete_world.bind(slot))
		_delete_buttons.append(del)
		row.add_child(del)

	box.add_child(HSeparator.new())
	var settings_title := Label.new()
	settings_title.text = "Einstellungen"
	settings_title.add_theme_font_size_override("font_size", 20)
	box.add_child(settings_title)

	_add_slider(box, "Sichtweite (Chunks)", 3, 8, 1, "view_distance")
	_add_slider(box, "Maus-Empfindlichkeit", 0.4, 2.0, 0.1, "sensitivity")
	_add_slider(box, "Lautstaerke", 0.0, 1.0, 0.05, "volume")

	box.add_child(HSeparator.new())
	var quit := Button.new()
	quit.text = "Beenden"
	quit.custom_minimum_size = Vector2(0, 36)
	quit.pressed.connect(func() -> void:
		Game.save_settings()
		get_tree().quit())
	box.add_child(quit)

	_refresh_slots()


func _refresh_slots() -> void:
	for i in 3:
		var exists := Game.slot_exists(i + 1)
		_slot_labels[i].text = "Welt %d  %s" % [i + 1, "(gespeichert)" if exists else "(leer)"]
		_delete_buttons[i].disabled = not exists
		var play := find_child("Play%d" % (i + 1), true, false) as Button
		if play:
			play.text = "Weiterspielen" if exists else "Neue Welt"


func _start_world(slot: int) -> void:
	Game.save_settings()
	Game.save_slot = slot
	get_tree().change_scene_to_file("res://scenes/Main.tscn")


func _delete_world(slot: int) -> void:
	Game.delete_slot(slot)
	_refresh_slots()


func _add_slider(parent: Control, text: String, minv: float, maxv: float,
		step: float, key: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	parent.add_child(row)
	var lbl := Label.new()
	lbl.custom_minimum_size = Vector2(220, 0)
	row.add_child(lbl)
	var slider := HSlider.new()
	slider.min_value = minv
	slider.max_value = maxv
	slider.step = step
	slider.custom_minimum_size = Vector2(200, 24)
	slider.value = Game.settings.get(key, minv)
	row.add_child(slider)
	var update := func(v: float) -> void:
		Game.settings[key] = int(v) if key == "view_distance" else v
		lbl.text = "%s: %s" % [text, str(int(v)) if key == "view_distance" else "%.2f" % v]
		if key == "volume":
			Game.apply_volume()
	slider.value_changed.connect(update)
	update.call(slider.value)
