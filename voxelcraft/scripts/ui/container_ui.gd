class_name ContainerUI
extends Control
## Gemeinsames Fenster fuer alle Container:
##  - PLAYER : Inventar mit 2x2-Craftingfeld (Taste E)
##  - TABLE  : Werkbank mit 3x3-Craftingfeld (Rechtsklick auf Werkbank)
##  - FURNACE: Ofen mit Eingabe/Brennstoff/Ausgabe + Fortschrittsbalken
##
## Bedienung wie in Minecraft: Linksklick nimmt/legt ganze Stapel (bzw. tauscht),
## Rechtsklick legt 1 Item ab oder nimmt die halbe Menge. Der "Cursor-Stack"
## haengt an der Maus. Beim Schliessen wandern Reste zurueck ins Inventar.

enum Mode { PLAYER, TABLE, FURNACE, CHEST }
# Slot-Herkunft fuer die Klick-Logik
enum Area { INV, CRAFT, RESULT, F_IN, F_FUEL, F_OUT, CHEST }

var inv: Inventory  # wird von HUD.bind gesetzt
var mode := Mode.PLAYER
var furnace: FurnaceState
var chest: ChestState

var craft_w := 2
var craft_grid: Array = []   # w*w Stacks (physisch aus dem Inventar entnommen)
var cursor = null            # Stack an der Maus

var _panel_box: VBoxContainer
var _top_area: VBoxContainer
var _inv_slots: Array[SlotUI] = []
var _craft_slots: Array[SlotUI] = []
var _chest_slots: Array[SlotUI] = []
var _result_slot: SlotUI
var _f_in: SlotUI
var _f_fuel: SlotUI
var _f_out: SlotUI
var _burn_fill: ColorRect
var _prog_fill: ColorRect
var _cursor_icon: TextureRect
var _cursor_count: Label


func _ready() -> void:
	visible = false
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.45)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.1, 0.13, 0.96)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(14)
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)

	_panel_box = VBoxContainer.new()
	_panel_box.add_theme_constant_override("separation", 10)
	panel.add_child(_panel_box)

	_top_area = VBoxContainer.new()
	_panel_box.add_child(_top_area)

	_panel_box.add_child(_label("Inventar"))
	var grid := GridContainer.new()
	grid.columns = 9
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	_panel_box.add_child(grid)
	for i in range(Inventory.HOTBAR, Inventory.SIZE):  # Hauptinventar 9..35
		grid.add_child(_make_slot(Area.INV, i))
	var hotbar := HBoxContainer.new()
	hotbar.add_theme_constant_override("separation", 4)
	_panel_box.add_child(hotbar)
	for i in Inventory.HOTBAR:                          # Hotbar 0..8
		hotbar.add_child(_make_slot(Area.INV, i))

	# Cursor-Stack (haengt an der Maus, ueber allem)
	_cursor_icon = TextureRect.new()
	_cursor_icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_cursor_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_cursor_icon.custom_minimum_size = Vector2(36, 36)
	_cursor_icon.size = Vector2(36, 36)
	_cursor_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cursor_icon)
	_cursor_count = Label.new()
	_cursor_count.add_theme_font_size_override("font_size", 13)
	_cursor_count.add_theme_color_override("font_outline_color", Color.BLACK)
	_cursor_count.add_theme_constant_override("outline_size", 4)
	_cursor_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cursor_icon.add_child(_cursor_count)


func _process(_delta: float) -> void:
	if not visible:
		return
	_cursor_icon.global_position = get_global_mouse_position() - Vector2(18, 18)
	if mode == Mode.FURNACE and furnace:
		_refresh_furnace()  # Ofen laeuft im Hintergrund weiter


# ------------------------------------------------------------ Oeffnen/Schliessen ---

func open(new_mode: int, state = null) -> void:
	mode = new_mode as Mode
	furnace = state if mode == Mode.FURNACE else null
	chest = state if mode == Mode.CHEST else null
	craft_w = 3 if mode == Mode.TABLE else 2
	craft_grid.clear()
	craft_grid.resize(craft_w * craft_w)
	_build_top_area()
	visible = true
	_refresh_all()


func close() -> void:
	# Crafting-Reste und Cursor-Stack zurueck ins Inventar;
	# was nicht mehr passt, faellt als Item-Entity zu Boden
	for i in craft_grid.size():
		craft_grid[i] = _return_stack(craft_grid[i])
	cursor = _return_stack(cursor)
	_update_cursor()
	visible = false
	furnace = null
	chest = null


func _return_stack(stack) -> Variant:
	var rest = inv.add_stack(stack)
	if rest != null and Game.player:
		ItemEntity.spawn_stack(rest, Game.player.global_position + Vector3(0, 0.5, 0))
	return null


## Baut den oberen Bereich passend zum Modus neu auf.
func _build_top_area() -> void:
	for c in _top_area.get_children():
		c.queue_free()
	_craft_slots.clear()
	_chest_slots.clear()
	var titles := {Mode.PLAYER: "Crafting", Mode.TABLE: "Werkbank",
		Mode.FURNACE: "Ofen", Mode.CHEST: "Truhe"}
	_top_area.add_child(_label(titles[mode]))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_top_area.add_child(row)

	if mode == Mode.FURNACE:
		var left := VBoxContainer.new()
		left.add_theme_constant_override("separation", 6)
		row.add_child(left)
		_f_in = _make_slot(Area.F_IN, 0)
		left.add_child(_f_in)
		_burn_fill = _bar(left, Color(0.95, 0.5, 0.1))       # Flamme
		_f_fuel = _make_slot(Area.F_FUEL, 0)
		left.add_child(_f_fuel)
		var mid := VBoxContainer.new()
		mid.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_child(mid)
		_prog_fill = _bar(mid, Color(0.85, 0.85, 0.9))       # Schmelzfortschritt
		_f_out = _make_slot(Area.F_OUT, 0)
		row.add_child(_f_out)
	elif mode == Mode.CHEST:
		var grid := GridContainer.new()
		grid.columns = 9
		grid.add_theme_constant_override("h_separation", 4)
		grid.add_theme_constant_override("v_separation", 4)
		row.add_child(grid)
		for i in ChestState.SIZE:
			var s := _make_slot(Area.CHEST, i)
			_chest_slots.append(s)
			grid.add_child(s)
	else:
		var grid := GridContainer.new()
		grid.columns = craft_w
		grid.add_theme_constant_override("h_separation", 4)
		grid.add_theme_constant_override("v_separation", 4)
		row.add_child(grid)
		for i in craft_w * craft_w:
			var s := _make_slot(Area.CRAFT, i)
			_craft_slots.append(s)
			grid.add_child(s)
		var arrow := _label("->")
		arrow.add_theme_font_size_override("font_size", 24)
		row.add_child(arrow)
		_result_slot = _make_slot(Area.RESULT, 0)
		row.add_child(_result_slot)


# ------------------------------------------------------------------ Klick-Logik ---

func _on_slot_clicked(area: int, index: int, button: int) -> void:
	match area:
		Area.INV:
			inv.slots[index] = _click_stack(inv.slots[index], button)
			inv.notify_changed()
		Area.CRAFT:
			craft_grid[index] = _click_stack(craft_grid[index], button)
		Area.RESULT:
			_take_result()
		Area.F_IN:
			furnace.input = _click_stack(furnace.input, button)
		Area.F_FUEL:
			# Nur Brennstoffe ablegen (Entnehmen geht immer)
			if cursor == null or ItemDB.fuel_time(cursor.id) > 0.0:
				furnace.fuel = _click_stack(furnace.fuel, button)
		Area.F_OUT:
			furnace.output = _take_only(furnace.output)
		Area.CHEST:
			chest.slots[index] = _click_stack(chest.slots[index], button)
	_refresh_all()


## Shift-Linksklick: Stack direkt verschieben (wie in Minecraft) -
## Inventar <-> Truhe/Ofen/Craftingfeld bzw. Hotbar <-> Hauptinventar.
func _shift_transfer(area: int, index: int) -> void:
	match area:
		Area.INV:
			var stack = inv.slots[index]
			if stack == null:
				return
			if mode == Mode.CHEST:
				inv.slots[index] = _add_to_slots(stack, chest.slots, range(ChestState.SIZE))
			elif mode == Mode.FURNACE:
				# Brennstoffe in den Brennstoff-Slot, alles andere in die Eingabe
				if ItemDB.fuel_time(stack.id) > 0.0:
					inv.slots[index] = _merge_into_single(stack, furnace, "fuel")
				else:
					inv.slots[index] = _merge_into_single(stack, furnace, "input")
			else:
				# zwischen Hotbar und Hauptinventar wechseln
				var target := range(Inventory.HOTBAR, Inventory.SIZE) if index < Inventory.HOTBAR \
					else range(0, Inventory.HOTBAR)
				inv.slots[index] = _add_to_slots(stack, inv.slots, target)
			inv.notify_changed()
		Area.CHEST:
			chest.slots[index] = inv.add_stack(chest.slots[index])
		Area.CRAFT:
			craft_grid[index] = inv.add_stack(craft_grid[index])
		Area.F_IN:
			furnace.input = inv.add_stack(furnace.input)
		Area.F_FUEL:
			furnace.fuel = inv.add_stack(furnace.fuel)
		Area.F_OUT:
			furnace.output = inv.add_stack(furnace.output)
		Area.RESULT:
			# So oft craften, wie Zutaten und Rezept es hergeben
			for _round in 64:
				var recipe := _current_recipe()
				if recipe.is_empty():
					break
				var rest: int = inv.add_item(recipe.result, recipe.count)
				if rest > 0 and Game.player:
					ItemEntity.spawn_id(recipe.result, rest,
						Game.player.global_position + Vector3(0, 0.5, 0))
				for i in craft_grid.size():
					if craft_grid[i] != null:
						craft_grid[i].count -= 1
						if craft_grid[i].count <= 0:
							craft_grid[i] = null
				if rest > 0:
					break  # Inventar voll


## Stack in eine Slot-Liste einsortieren (erst stapeln, dann leere Slots).
## Rueckgabe: Rest-Stack oder null.
func _add_to_slots(stack, slots: Array, indices) -> Variant:
	if not stack.has("durability"):
		var maxs: int = ItemDB.max_stack(stack.id)
		for i: int in indices:
			var s = slots[i]
			if s != null and s.id == stack.id and s.count < maxs:
				var take: int = mini(maxs - s.count, stack.count)
				s.count += take
				stack.count -= take
				if stack.count <= 0:
					return null
	for i: int in indices:
		if slots[i] == null:
			slots[i] = stack
			return null
	return stack


## Stack mit einem Einzel-Slot (Ofen-Eingabe/-Brennstoff) zusammenfuehren.
func _merge_into_single(stack, obj, prop: String) -> Variant:
	var cur = obj.get(prop)
	if cur == null:
		obj.set(prop, stack)
		return null
	if cur.id == stack.id and not stack.has("durability"):
		var maxs: int = ItemDB.max_stack(stack.id)
		var take: int = mini(maxs - cur.count, stack.count)
		cur.count += take
		stack.count -= take
		if stack.count <= 0:
			return null
	return stack


## Standard-Klickverhalten zwischen Cursor und Slot. Gibt den neuen Slot-Inhalt zurueck.
func _click_stack(slot, button: int):
	if button == MOUSE_BUTTON_LEFT:
		if cursor != null and slot != null and cursor.id == slot.id \
				and not cursor.has("durability"):
			# Stapel zusammenfuehren
			var maxs := ItemDB.max_stack(slot.id)
			var take: int = mini(maxs - slot.count, cursor.count)
			slot.count += take
			cursor.count -= take
			if cursor.count <= 0:
				cursor = null
		else:
			var tmp = slot
			slot = cursor
			cursor = tmp
	elif button == MOUSE_BUTTON_RIGHT:
		if cursor == null:
			if slot != null:  # halbe Menge aufnehmen
				var take_half: int = ceili(slot.count / 2.0)
				cursor = slot.duplicate()
				cursor.count = take_half
				slot.count -= take_half
				if slot.count <= 0:
					slot = null
		elif slot == null:    # 1 Item ablegen
			slot = cursor.duplicate()
			slot.count = 1
			cursor.count -= 1
			if cursor.count <= 0:
				cursor = null
		elif slot.id == cursor.id and slot.count < ItemDB.max_stack(slot.id) \
				and not cursor.has("durability"):
			slot.count += 1
			cursor.count -= 1
			if cursor.count <= 0:
				cursor = null
	return slot


func _take_only(slot):
	if slot == null:
		return null
	if cursor == null:
		cursor = slot
		return null
	if cursor.id == slot.id and not cursor.has("durability"):
		var take: int = mini(ItemDB.max_stack(slot.id) - cursor.count, slot.count)
		cursor.count += take
		slot.count -= take
		if slot.count <= 0:
			return null
	return slot


## Craft-Ergebnis entnehmen: verbraucht 1 Item aus jeder belegten Zelle.
func _take_result() -> void:
	var recipe := _current_recipe()
	if recipe.is_empty():
		return
	var result_id: String = recipe.result
	var count: int = recipe.count
	if cursor != null and (cursor.id != result_id
			or cursor.count + count > ItemDB.max_stack(result_id)):
		return
	if cursor == null:
		cursor = Inventory.make_stack(result_id, count)
	else:
		cursor.count += count
	for i in craft_grid.size():
		if craft_grid[i] != null:
			craft_grid[i].count -= 1
			if craft_grid[i].count <= 0:
				craft_grid[i] = null


func _current_recipe() -> Dictionary:
	var ids: Array = []
	for s in craft_grid:
		ids.append(s.id if s != null else "")
	return RecipeDB.match_grid(ids, craft_w)


# ---------------------------------------------------------------- Darstellung ---

func _refresh_all() -> void:
	for s in _inv_slots:
		s.set_stack(inv.slots[s.index])
	if mode == Mode.FURNACE:
		_refresh_furnace()
	elif mode == Mode.CHEST:
		for i in _chest_slots.size():
			_chest_slots[i].set_stack(chest.slots[i])
	else:
		for i in _craft_slots.size():
			_craft_slots[i].set_stack(craft_grid[i])
		var recipe := _current_recipe()
		_result_slot.set_stack(null if recipe.is_empty()
			else {"id": recipe.result, "count": recipe.count})
	_update_cursor()


func _refresh_furnace() -> void:
	if _f_in == null or furnace == null:
		return
	_f_in.set_stack(furnace.input)
	_f_fuel.set_stack(furnace.fuel)
	_f_out.set_stack(furnace.output)
	_burn_fill.size.x = 40.0 * furnace.burn_fraction()
	_prog_fill.size.x = 40.0 * furnace.progress_fraction()


func _update_cursor() -> void:
	_cursor_icon.visible = cursor != null
	if cursor != null:
		_cursor_icon.texture = ItemDB.icon(cursor.id)
		_cursor_count.text = str(cursor.count) if cursor.count > 1 else ""
		_cursor_count.position = Vector2(22, 22)


# ------------------------------------------------------------------- Helfer ---

func _make_slot(area: int, index: int) -> SlotUI:
	var s := SlotUI.new(index)
	s.clicked.connect(func(idx: int, button: int, shift: bool) -> void:
		if shift and button == MOUSE_BUTTON_LEFT:
			_shift_transfer(area, idx)
			_refresh_all()
		else:
			_on_slot_clicked(area, idx, button))
	if area == Area.INV:
		_inv_slots.append(s)
	return s


func _label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 16)
	return l


## Schmaler Fortschrittsbalken (Hintergrund + Fuellung), gibt die Fuellung zurueck.
func _bar(parent: Control, color: Color) -> ColorRect:
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(44, 8)
	parent.add_child(holder)
	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.6)
	bg.position = Vector2(1, 0)
	bg.size = Vector2(42, 8)
	holder.add_child(bg)
	var fill := ColorRect.new()
	fill.color = color
	fill.position = Vector2(2, 1)
	fill.size = Vector2(0, 6)
	holder.add_child(fill)
	return fill
