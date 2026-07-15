class_name Explosion
## Gemeinsame Explosionslogik (Creeper, C4): entfernt Bloecke in einer Kugel,
## verletzt Spieler und Kreaturen nach Distanz, zuendet weiteres C4 in
## Reichweite (Kettenreaktion) und spielt Partikel + Knall.


static func explode(center: Vector3, radius: float, max_damage: float) -> void:
	if Game.world == null:
		return
	var r := int(ceil(radius))
	var cpos := Vector3i(center.floor())
	for dx in range(-r, r + 1):
		for dy in range(-r, r + 1):
			for dz in range(-r, r + 1):
				if Vector3(dx, dy, dz).length() > radius:
					continue
				var p := cpos + Vector3i(dx, dy, dz)
				var id: int = Game.chunk_manager.get_block(p)
				if id == BlockDB.AIR or id == BlockDB.WATER:
					continue
				if BlockDB.get_def(id).hardness < 0.0:
					continue  # Grundgestein bleibt
				Game.chunk_manager.set_block(p, BlockDB.AIR)
				if id == BlockDB.C4:
					C4Entity.ignite(p, randf_range(0.3, 0.8))  # Kettenreaktion
	# Distanz-Schaden: Spieler + alle Kreaturen
	if Game.player:
		var d: float = Game.player.global_position.distance_to(center)
		if d < radius * 2.0:
			Game.player.stats.damage(maxf(max_damage * (1.0 - d / (radius * 2.0)), 1.0))
	for mob in Game.world.get_tree().get_nodes_in_group("mobs"):
		if mob.is_queued_for_deletion():
			continue  # z. B. der explodierende Creeper selbst
		var md: float = mob.global_position.distance_to(center)
		if md < radius * 2.0:
			mob.take_damage(maxf(max_damage * (1.0 - md / (radius * 2.0)), 1.0),
				(mob.global_position - center).normalized())
	Sfx.play_at("explosion", center, 6.0)
	_particles(center, radius)


static func _particles(center: Vector3, radius: float) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = 40
	p.lifetime = 0.7
	p.explosiveness = 1.0
	p.spread = 180.0
	p.initial_velocity_min = radius * 1.8
	p.initial_velocity_max = radius * 3.5
	p.gravity = Vector3(0, -8, 0)
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.14, 0.14, 0.14)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.4, 0.38, 0.35)
	mesh.material = mat
	p.mesh = mesh
	Game.world.add_child(p)
	p.global_position = center
	p.emitting = true
	p.finished.connect(p.queue_free)
