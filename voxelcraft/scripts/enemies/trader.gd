class_name Trader
extends Mob
## Haendler-NPC: steht bei seiner Dorfhuette, wandert ein paar Schritte
## umher und oeffnet per Rechtsklick das Tausch-Menue (ContainerUI.TRADE).
## Friedlich und unverwundbar - Handel statt Kampf.

var home := Vector3.ZERO

var _wander_timer := 0.0
var _wander_dir := Vector3.ZERO


func _ready() -> void:
	health = 9999.0
	add_capsule(0.35, 1.9)
	var robe := Color(0.5, 0.35, 0.5)
	add_box(Vector3(0.55, 1.35, 0.35), Vector3(0, 0.7, 0), robe)                   # Robe
	add_box(Vector3(0.45, 0.5, 0.45), Vector3(0, 1.65, 0), Color(0.85, 0.68, 0.5)) # Kopf
	add_box(Vector3(0.12, 0.25, 0.12), Vector3(0, 1.5, -0.26), Color(0.75, 0.55, 0.4))  # Nase


func take_damage(_amount: float, _from_dir: Vector3) -> void:
	if Game.hud:
		Game.hud.toast("Der Haendler moechte handeln, nicht kaempfen!")


func _physics_process(delta: float) -> void:
	velocity.y -= GRAVITY * delta
	# bleibt in der Naehe seiner Huette
	var from_home := global_position - home
	_wander_timer -= delta
	if _wander_timer <= 0.0:
		_wander_timer = randf_range(3.0, 7.0)
		if Vector2(from_home.x, from_home.z).length() > 6.0:
			_wander_dir = -Vector3(from_home.x, 0, from_home.z).normalized()
		else:
			_wander_dir = Vector3.ZERO if randf() < 0.6 \
				else Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
	velocity.x = _wander_dir.x * 1.0
	velocity.z = _wander_dir.z * 1.0
	if _wander_dir.length_squared() > 0.01:
		rotation.y = atan2(-_wander_dir.x, -_wander_dir.z) + PI
		if is_on_floor() and is_on_wall():
			velocity.y = 8.0
	move_and_slide()
