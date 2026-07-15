extends Node
## Sfx (Autoload): prozedural synthetisierte Sound-Effekte - keine Audio-Assets
## noetig. Alle Klaenge werden beim Start als kleine 16-Bit-Mono-WAVs erzeugt
## (Rauschimpulse, Sinus-Chirps, Rechteck-Toene mit Huellkurven).

const MIX_RATE := 22050

var _streams := {}


func _ready() -> void:
	for kind in ["break", "place", "pop", "eat", "hurt", "hit", "shoot", "click"]:
		_streams[kind] = _synthesize(kind)


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
		var v := int(clampf(s, -1.0, 1.0) * 32000.0)
		data[i * 2] = v & 0xFF
		data[i * 2 + 1] = (v >> 8) & 0xFF

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.data = data
	return stream
