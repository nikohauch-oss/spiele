class_name PlayerStats
extends Node
## Gesundheit + Hunger des Spielers.
##  - Hunger sinkt langsam passiv, schneller beim Sprinten
##  - Hunger >= 18: Regeneration; Hunger == 0: Verhungern (bis 1 HP)
##  - Essen fuellt Hunger auf; Tod loest ein Signal aus (Respawn macht Main)

signal changed
signal died

const MAX_HEALTH := 20.0
const MAX_HUNGER := 20.0

var health := MAX_HEALTH
var hunger := MAX_HUNGER

var _drain_accu := 0.0   # angesammelte "Anstrengung"
var _regen_timer := 0.0
var _dead := false


func _process(delta: float) -> void:
	if _dead:
		return
	# Passiver Hungerabbau: 1 Punkt pro 45 s
	_drain_accu += delta / 45.0
	if _drain_accu >= 1.0:
		_drain_accu -= 1.0
		_set_hunger(hunger - 1.0)

	_regen_timer += delta
	if _regen_timer >= 4.0:
		_regen_timer = 0.0
		if hunger >= 18.0 and health < MAX_HEALTH:
			health = minf(health + 1.0, MAX_HEALTH)
			_set_hunger(hunger - 0.5)  # Regeneration kostet Saettigung
			changed.emit()
		elif hunger <= 0.0 and health > 1.0:
			damage(1.0, true)  # Verhungern (nie unter 1 HP, Ruestung egal)


## Vom Controller pro Physik-Frame gemeldet: Sprinten kostet extra Hunger.
func on_moved(vel: Vector3, sprinting: bool) -> void:
	if sprinting and Vector2(vel.x, vel.z).length() > 1.0:
		_drain_accu += get_physics_process_delta_time() / 12.0


## bypass_armor: true fuer Fallschaden/Verhungern (Ruestung hilft da nicht).
func damage(amount: float, bypass_armor := false) -> void:
	if _dead or amount <= 0.0:
		return
	if not bypass_armor and Game.player:
		# Minecraft-Formel: 4 % Reduktion pro Ruestungspunkt (max. 80 %)
		var pts: int = Game.player.inventory.armor_points()
		amount *= 1.0 - 0.04 * clampf(pts, 0, 20)
		Game.player.inventory.damage_armor()
	health = maxf(health - amount, 0.0)
	changed.emit()
	if Game.hud:
		Game.hud.flash_damage()
	Sfx.play("hurt")
	if health <= 0.0:
		_dead = true
		died.emit()


func eat(food: int) -> void:
	_set_hunger(hunger + food)


func reset() -> void:
	health = MAX_HEALTH
	hunger = MAX_HUNGER
	_dead = false
	_drain_accu = 0.0
	changed.emit()


func load_values(h: float, hu: float) -> void:
	health = clampf(h, 1.0, MAX_HEALTH)
	hunger = clampf(hu, 0.0, MAX_HUNGER)
	changed.emit()


func _set_hunger(v: float) -> void:
	var new_val := clampf(v, 0.0, MAX_HUNGER)
	if not is_equal_approx(new_val, hunger):
		hunger = new_val
		changed.emit()
