extends Node
## Sfx (Autoload): prozedural synthetisierte Sound-Effekte - keine Audio-Assets
## noetig. Alle Klaenge werden beim Start als kleine 16-Bit-Mono-WAVs erzeugt
## (Rauschimpulse, Sinus-Chirps, Rechteck-Toene mit Huellkurven).

const MIX_RATE := 22050

var _streams := {}


var _rain_player: AudioStreamPlayer


func _ready() -> void:
	for kind in ["break", "place", "pop", "eat", "hurt", "hit", "shoot", "click",
			"hiss", "explosion", "step_grass", "step_stone", "step_wood", "step_sand"]:
		_streams[kind] = _synthesize(kind)
	# Dauerhafter Regen-Loop (Lautstaerke wird ein-/ausgeblendet)
	_rain_player = AudioStreamPlayer.new()
	_rain_player.stream = _make_rain_loop()
	_rain_player.volume_db = -60.0
	add_child(_rain_player)


## Regen ein-/ausblenden (weicher Uebergang).
func set_rain(on: bool) -> void:
	if on and not _rain_player.playing:
		_rain_player.play()
	create_tween().tween_property(_rain_player, "volume_db", -16.0 if on else -60.0, 2.0)


## 2-Sekunden-Rauschschleife als Regen (nahtlos geloopt).
func _make_rain_loop() -> AudioStreamWAV:
	var count := MIX_RATE * 2
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var data := PackedByteArray()
	data.resize(count * 2)
	var last := 0.0
	for i in count:
		# leicht gefiltertes Rauschen (Tiefpass ueber Mittelung)
		last = last * 0.6 + rng.randf_range(-1, 1) * 0.4
		var v := int(clampf(last * 0.5, -1.0, 1.0) * 32000.0)
		data[i * 2] = v & 0xFF
		data[i * 2 + 1] = (v >> 8) & 0xFF
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = count
	return stream


## Nicht-positional (UI, eigener Spieler)
func play(kind: String, volume_db := -6.0) -> void:
	var p := AudioStreamPlayer.new()
	p.stream = _streams[kind]
	p.volume_db = volume_db
	p.pitch_scale = randf_range(0.92, 1.08)  # leichte Variation gegen Monotonie
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()


## Positional in der 3D-Welt
func play_at(kind: String, pos: Vector3, volume_db := 0.0) -> void:
	if Game.world == null:
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = _streams[kind]
	p.volume_db = volume_db
	p.pitch_scale = randf_range(0.92, 1.08)
	p.max_distance = 40.0
	Game.world.add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()


func _synthesize(kind: String) -> AudioStreamWAV:
	var dur := 0.2
	match kind:
		"break":
			dur = 0.25
		"place":
			dur = 0.12
		"pop":
			dur = 0.12
		"eat":
			dur = 0.3
		"hurt":
			dur = 0.35
		"hit":
			dur = 0.18
		"shoot":
			dur = 0.2
		"click":
			dur = 0.06
		"hiss":
			dur = 1.4
		"explosion":
			dur = 0.8
		"step_grass", "step_stone", "step_wood", "step_sand":
			dur = 0.1

	var count := int(MIX_RATE * dur)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(kind)
	var phase := 0.0
	var data := PackedByteArray()
	data.resize(count * 2)

	for i in count:
		var t := float(i) / MIX_RATE
		var s := 0.0
		match kind:
			"break":    # dumpfer Schlag: Rauschen + tiefer Sinus
				s = (rng.randf_range(-1, 1) * 0.6 + sin(TAU * 85.0 * t) * 0.5) * exp(-14.0 * t)
			"place":    # kurzer Klick mit Ton
				s = (rng.randf_range(-1, 1) * 0.5 + sin(TAU * 190.0 * t) * 0.4) * exp(-35.0 * t)
			"pop":      # aufsteigender Chirp (Item einsammeln)
				phase += (500.0 + 2600.0 * t) / MIX_RATE
				s = sin(TAU * phase) * exp(-16.0 * t) * 0.8
			"eat":      # zwei Knusper-Impulse
				s = rng.randf_range(-1, 1) * 0.55 * exp(-30.0 * fmod(t, 0.11))
			"hurt":     # fallender Rechteck-Ton
				phase += maxf(260.0 - 320.0 * t, 60.0) / MIX_RATE
				s = signf(sin(TAU * phase)) * 0.3 * exp(-6.0 * t)
			"hit":      # kurzer Treffer-Impact
				s = (rng.randf_range(-1, 1) * 0.7 + sin(TAU * 130.0 * t) * 0.35) * exp(-22.0 * t)
			"shoot":    # Pfeil-Wusch: Rauschen mit An-/Abschwellen
				s = rng.randf_range(-1, 1) * sin(PI * t / dur) * 0.55
			"click":    # UI-Tick
				s = sin(TAU * 900.0 * t) * exp(-70.0 * t)
			"hiss":     # Creeper-Zischen: anschwellendes Rauschen
				s = rng.randf_range(-1, 1) * 0.4 * minf(t / dur * 1.6, 1.0)
			"explosion":  # tiefer Knall mit langem Ausklang
				s = (rng.randf_range(-1, 1) * 0.7 + sin(TAU * 55.0 * t) * 0.8) * exp(-5.0 * t)
			"step_grass":
				s = rng.randf_range(-1, 1) * 0.3 * exp(-28.0 * t)
			"step_stone":
				s = (rng.randf_range(-1, 1) * 0.3 + sin(TAU * 500.0 * t) * 0.1) * exp(-48.0 * t)
			"step_wood":
				s = (sin(TAU * 160.0 * t) * 0.3 + rng.randf_range(-1, 1) * 0.18) * exp(-32.0 * t)
			"step_sand":
				s = rng.randf_range(-1, 1) * 0.26 * exp(-16.0 * t)
		var v := int(clampf(s, -1.0, 1.0) * 32000.0)
		data[i * 2] = v & 0xFF
		data[i * 2 + 1] = (v >> 8) & 0xFF

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.data = data
	return stream
