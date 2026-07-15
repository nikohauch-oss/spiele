class_name DayNightCycle
extends Node3D
## Tag-Nacht-Zyklus: rotiert eine DirectionalLight3D als Sonne und blendet
## Himmel-, Nebel- und Umgebungslicht-Farben im Environment ueber.
## time laeuft von 0..DAY_LENGTH; 0 = Sonnenaufgang, 25% = Mittag, 50% = Sonnenuntergang.

const DAY_LENGTH := 600.0  # Sekunden pro Spieltag

const SKY_DAY := Color(0.45, 0.68, 0.95)
const SKY_NIGHT := Color(0.02, 0.03, 0.08)
const AMBIENT_DAY := Color(0.75, 0.8, 0.9)
const AMBIENT_NIGHT := Color(0.25, 0.3, 0.45)
const SUNSET_TINT := Color(1.0, 0.72, 0.45)

signal weather_changed(raining: bool)

var time := DAY_LENGTH * 0.2  # Start am Vormittag
var sun: DirectionalLight3D
var environment: Environment  # wird von Main gesetzt

# Wetter: wechselt zufaellig zwischen klar und Regen
var raining := false
var _weather_timer := randf_range(90.0, 200.0)
var _rain_amount := 0.0  # weicher Uebergang 0..1


func _ready() -> void:
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	add_child(sun)


func _process(delta: float) -> void:
	time = fmod(time + delta, DAY_LENGTH)
	var frac := time / DAY_LENGTH
	# Sonnenstand: sin > 0 = Tag, Maximum 1 am Mittag
	var elevation := sin(frac * TAU)
	var daylight := clampf(elevation, 0.0, 1.0)

	# Wetter umschalten + weich ueberblenden
	_weather_timer -= delta
	if _weather_timer <= 0.0:
		raining = not raining
		_weather_timer = randf_range(50.0, 110.0) if raining else randf_range(120.0, 300.0)
		weather_changed.emit(raining)
		Sfx.set_rain(raining)
	_rain_amount = move_toward(_rain_amount, 1.0 if raining else 0.0, delta / 3.0)

	sun.rotation = Vector3(-frac * TAU, deg_to_rad(20.0), 0.0)
	sun.light_energy = daylight * 1.25 * lerpf(1.0, 0.45, _rain_amount)
	# Bei sehr tiefem Sonnenstand Schatten/Licht abschalten (sonst Artefakte)
	sun.visible = elevation > 0.02
	# Orange Faerbung um Auf-/Untergang
	var sunset := clampf(1.0 - absf(elevation) / 0.25, 0.0, 1.0)
	sun.light_color = Color.WHITE.lerp(SUNSET_TINT, sunset)

	if environment:
		var sky := SKY_NIGHT.lerp(SKY_DAY, daylight)
		sky = sky.lerp(Color(0.45, 0.48, 0.52) * maxf(daylight, 0.15), _rain_amount * 0.7)
		environment.background_color = sky
		environment.fog_light_color = sky
		environment.fog_density = lerpf(0.016, 0.03, _rain_amount)
		environment.ambient_light_color = AMBIENT_NIGHT.lerp(AMBIENT_DAY, daylight)
		environment.ambient_light_energy = lerpf(0.35, 0.6, daylight)

	# Chunk-Shader: dimmt nur das Himmelslicht - Fackeln leuchten nachts weiter.
	# Minimum 0.22 = "Mondlicht", damit die Oberflaeche nachts spielbar bleibt.
	var sun_uniform := lerpf(0.22, 1.0, daylight) * lerpf(1.0, 0.7, _rain_amount)
	BlockDB.opaque_material.set_shader_parameter("sun_light", sun_uniform)
	BlockDB.water_material.set_shader_parameter("sun_light", sun_uniform)


func is_night() -> bool:
	return sin(time / DAY_LENGTH * TAU) < 0.0
