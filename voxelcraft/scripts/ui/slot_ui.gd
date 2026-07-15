class_name SlotUI
extends Panel
## Ein Item-Slot (Hotbar, Inventar, Crafting, Ofen):
## zeigt Icon, Stapelzahl und Haltbarkeitsbalken; meldet Klicks per Signal.

signal clicked(index: int, button: int, shift: bool)

const SLOT_SIZE := 44.0

var index := 0

var _icon: TextureRect
var _count: Label
var _dura: ColorRect
var _style: StyleBoxFlat


func _init(idx := 0) -> void:
	index = idx
	custom_minimum_size = Vector2(SLOT_SIZE, SLOT_SIZE)

	_style = StyleBoxFlat.new()
	_style.bg_color = Color(0.14, 0.15, 0.18, 0.95)
	_style.set_corner_radius_all(4)
	_style.set_border_width_all(2)
	_style.border_color = Color(0.35, 0.37, 0.42)
	add_theme_stylebox_override("panel", _style)

	_icon = TextureRect.new()
	_icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # Pixel-Look
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_icon.offset_left = 5
	_icon.offset_top = 5
	_icon.offset_right = -5
	_icon.offset_bottom = -5
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_icon)

	_count = Label.new()
	_count.add_theme_font_size_override("font_size", 13)
	_count.add_theme_color_override("font_outline_color", Color.BLACK)
	_count.add_theme_constant_override("outline_size", 4)
	_count.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	_count.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_count.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_count.offset_right = -4
	_count.offset_bottom = -2
	_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_count)

	_dura = ColorRect.new()
	_dura.visible = false
	_dura.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dura)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed \
			and (event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT):
		clicked.emit(index, event.button_index, event.shift_pressed)
		accept_event()


## stack: {"id", "count"[, "durability"]} oder null
func set_stack(stack) -> void:
	if stack == null:
		_icon.texture = null
		_count.text = ""
		_dura.visible = false
		tooltip_text = ""
		return
	_icon.texture = ItemDB.icon(stack.id)
	_count.text = str(stack.count) if stack.count > 1 else ""
	tooltip_text = ItemDB.display_name(stack.id)
	# Haltbarkeitsbalken fuer angeschlagene Werkzeuge
	var max_dura: int = ItemDB.get_def(stack.id).get("durability", 0)
	if stack.has("durability") and max_dura > 0 and stack.durability < max_dura:
		var frac := float(stack.durability) / float(max_dura)
		_dura.visible = true
		_dura.color = Color(1.0 - frac, frac, 0.1)
		_dura.position = Vector2(6, SLOT_SIZE - 7)
		_dura.size = Vector2((SLOT_SIZE - 12) * frac, 3)
	else:
		_dura.visible = false


## Hervorhebung des aktiven Hotbar-Slots
func set_selected(on: bool) -> void:
	_style.border_color = Color(0.95, 0.95, 0.98) if on else Color(0.35, 0.37, 0.42)
	_style.set_border_width_all(3 if on else 2)
