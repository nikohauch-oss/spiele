class_name FurnaceState
extends RefCounted
## Zustand eines platzierten Ofens (Block-Entity): Eingabe-, Brennstoff- und
## Ausgabe-Slot plus Brenn-/Schmelzfortschritt. Wird von Game pro Frame getickt,
## auch wenn kein UI offen ist. Rezepte/Brennwerte kommen aus RecipeDB/ItemDB.

var input = null    # Stack oder null
var fuel = null
var output = null
var burn_left := 0.0    # Restbrenndauer des aktuellen Brennstoffs
var burn_total := 0.0   # fuer die Flammen-Anzeige
var progress := 0.0     # Schmelzfortschritt des aktuellen Items


func tick(delta: float) -> void:
	var recipe: Dictionary = RecipeDB.smelting.get(input.id, {}) if input != null else {}
	var can_smelt := not recipe.is_empty() and (output == null
		or (output.id == recipe.result and output.count < ItemDB.max_stack(recipe.result)))

	# Neuen Brennstoff zuenden, wenn noetig und moeglich
	if burn_left <= 0.0 and can_smelt and fuel != null:
		var ft := ItemDB.fuel_time(fuel.id)
		if ft > 0.0:
			burn_left = ft
			burn_total = ft
			fuel.count -= 1
			if fuel.count <= 0:
				fuel = null

	if burn_left > 0.0:
		burn_left -= delta
		if can_smelt:
			progress += delta
			if progress >= recipe.time:
				progress = 0.0
				if output == null:
					output = {"id": recipe.result, "count": 1}
				else:
					output.count += 1
				input.count -= 1
				if input.count <= 0:
					input = null
		else:
			progress = 0.0
	else:
		burn_left = 0.0
		progress = 0.0


func is_burning() -> bool:
	return burn_left > 0.0


## Fortschritt 0..1 fuer die UI-Balken
func burn_fraction() -> float:
	return burn_left / burn_total if burn_total > 0.0 else 0.0


func progress_fraction() -> float:
	if input == null:
		return 0.0
	var recipe: Dictionary = RecipeDB.smelting.get(input.id, {})
	return progress / recipe.time if not recipe.is_empty() else 0.0


func serialize() -> Dictionary:
	return {"input": input, "fuel": fuel, "output": output,
		"burn_left": burn_left, "burn_total": burn_total, "progress": progress}


static func deserialize(d: Dictionary) -> FurnaceState:
	var f := FurnaceState.new()
	f.input = d.get("input")
	f.fuel = d.get("fuel")
	f.output = d.get("output")
	f.burn_left = d.get("burn_left", 0.0)
	f.burn_total = d.get("burn_total", 0.0)
	f.progress = d.get("progress", 0.0)
	return f
