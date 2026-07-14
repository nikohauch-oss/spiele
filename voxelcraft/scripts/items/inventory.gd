class_name Inventory
extends RefCounted
## Spieler-Inventar: 36 Slots (0-8 = Hotbar, 9-35 = Hauptinventar).
## Ein Stack ist ein Dictionary {"id": String, "count": int [, "durability": int]}
## oder null fuer leere Slots. Werkzeuge stapeln nicht und tragen Haltbarkeit.

signal changed

const SIZE := 36
const HOTBAR := 9

var slots: Array = []
var selected := 0:
	set(v):
		selected = posmod(v, HOTBAR)
		changed.emit()


func _init() -> void:
	slots.resize(SIZE)


static func make_stack(id: String, count: int) -> Dictionary:
	var s := {"id": id, "count": count}
	var dura: int = ItemDB.get_def(id).get("durability", 0)
	if dura > 0:
		s.durability = dura
	return s


## Fuegt Items ein (erst auffuellen, dann leere Slots; Hotbar zuerst).
## Rueckgabe: Rest, der nicht mehr passte.
func add_item(id: String, count := 1) -> int:
	var maxs := ItemDB.max_stack(id)
	if maxs > 1:
		for s in slots:
			if count <= 0:
				break
			if s != null and s.id == id and s.count < maxs:
				var take := mini(maxs - s.count, count)
				s.count += take
				count -= take
	for i in SIZE:
		if count <= 0:
			break
		if slots[i] == null:
			var put := mini(maxs, count)
			slots[i] = make_stack(id, put)
			count -= put
	changed.emit()
	return count


## Kompletten Stack einfuegen (behaelt Haltbarkeit). Rueckgabe: Rest-Stack oder null.
func add_stack(stack) -> Variant:
	if stack == null:
		return null
	if stack.has("durability"):
		for i in SIZE:
			if slots[i] == null:
				slots[i] = stack
				changed.emit()
				return null
		return stack
	var rest := add_item(stack.id, stack.count)
	if rest <= 0:
		return null
	stack.count = rest
	return stack


func selected_stack() -> Variant:
	return slots[selected]


func selected_id() -> String:
	var s = slots[selected]
	return s.id if s != null else ""


func consume_selected(n := 1) -> void:
	var s = slots[selected]
	if s == null:
		return
	s.count -= n
	if s.count <= 0:
		slots[selected] = null
	changed.emit()


## Nutzt das gehaltene Werkzeug ab. Rueckgabe: true, wenn es zerbrochen ist.
func damage_selected(amount := 1) -> bool:
	var s = slots[selected]
	if s == null or not s.has("durability"):
		return false
	s.durability -= amount
	if s.durability <= 0:
		slots[selected] = null
		changed.emit()
		return true
	changed.emit()
	return false


func notify_changed() -> void:
	changed.emit()


# --------------------------------------------------------- Serialisierung ---

func serialize() -> Array:
	var out := []
	for s in slots:
		out.append(null if s == null else s.duplicate())
	return out


func load_from(arr: Array) -> void:
	slots.clear()
	slots.resize(SIZE)
	for i in mini(arr.size(), SIZE):
		var s = arr[i]
		if s is Dictionary and ItemDB.defs.has(s.get("id", "")):
			slots[i] = s
	changed.emit()
