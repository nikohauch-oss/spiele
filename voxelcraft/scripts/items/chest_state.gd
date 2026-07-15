class_name ChestState
extends RefCounted
## Zustand einer platzierten Truhe (Block-Entity): 27 Lager-Slots.
## Die Bedienung uebernimmt das ContainerUI (Modus CHEST).

const SIZE := 27

var slots: Array = []


func _init() -> void:
	slots.resize(SIZE)


## Alle belegten Stacks (fuer Drops beim Abbau der Truhe).
func contents() -> Array:
	var out: Array = []
	for s in slots:
		if s != null:
			out.append(s)
	return out


func serialize() -> Dictionary:
	return {"slots": slots.duplicate(true)}


static func deserialize(d: Dictionary) -> ChestState:
	var c := ChestState.new()
	var arr: Array = d.get("slots", [])
	for i in mini(arr.size(), SIZE):
		if arr[i] is Dictionary:
			c.slots[i] = arr[i]
	return c
