-- ============================================================
-- MONSTERWELT - Zentrale Spieldaten
-- 35 Monster im Voxel-Kloetzchen-Stil: normale Monster haben
-- Entwicklungen, LEGENDÄRE haben keine (und sind extrem selten).
-- Eigene Monster hinzufuegen? Einfach hier eintragen!
-- ============================================================

local GameData = {}

GameData.MAX_LEVEL = 50
GameData.TEAM_SIZE = 6
GameData.BOX_SIZE = 60
GameData.START_COINS = 300

-- ========== TYPEN ==========
GameData.TypeColors = {
	["Feuer"] = Color3.fromRGB(240, 110, 50),
	["Wasser"] = Color3.fromRGB(70, 140, 240),
	["Pflanze"] = Color3.fromRGB(100, 190, 80),
	["Elektro"] = Color3.fromRGB(250, 205, 50),
	["Normal"] = Color3.fromRGB(180, 170, 160),
}

local EFFECT = {
	["Feuer"] = { ["Pflanze"] = 2, ["Wasser"] = 0.5, ["Feuer"] = 0.5 },
	["Wasser"] = { ["Feuer"] = 2, ["Pflanze"] = 0.5, ["Wasser"] = 0.5 },
	["Pflanze"] = { ["Wasser"] = 2, ["Feuer"] = 0.5, ["Pflanze"] = 0.5 },
	["Elektro"] = { ["Wasser"] = 2, ["Pflanze"] = 0.5, ["Elektro"] = 0.5 },
	["Normal"] = {},
}

function GameData.TypeMultiplier(attackType, defenderType)
	local row = EFFECT[attackType]
	if row and row[defenderType] then
		return row[defenderType]
	end
	return 1
end

-- ========== ATTACKEN ==========
GameData.Moves = {
	tackle = { name = "Tackle", typ = "Normal", power = 40 },
	kratzer = { name = "Kratzer", typ = "Normal", power = 40 },
	koerperwurf = { name = "Körperwurf", typ = "Normal", power = 65 },
	hyperschlag = { name = "Hyperschlag", typ = "Normal", power = 90 },
	funkenregen = { name = "Funkenregen", typ = "Feuer", power = 40 },
	glutbiss = { name = "Glutbiss", typ = "Feuer", power = 55, effect = { status = "brand", chance = 0.2 } },
	flammenwerfer = { name = "Flammenwerfer", typ = "Feuer", power = 80, effect = { status = "brand", chance = 0.15 } },
	feuersturm = { name = "Feuersturm", typ = "Feuer", power = 100, effect = { status = "brand", chance = 0.2 } },
	wasserspritzer = { name = "Wasserspritzer", typ = "Wasser", power = 40 },
	blubbstrahl = { name = "Blubbstrahl", typ = "Wasser", power = 55 },
	aquawelle = { name = "Aquawelle", typ = "Wasser", power = 80 },
	hydrokanone = { name = "Hydrokanone", typ = "Wasser", power = 100 },
	blattschuss = { name = "Blattschuss", typ = "Pflanze", power = 40 },
	rankenschlag = { name = "Rankenschlag", typ = "Pflanze", power = 55 },
	blattklinge = { name = "Blattklinge", typ = "Pflanze", power = 80 },
	solarblitz = { name = "Solarblitz", typ = "Pflanze", power = 100 },
	blitzfunke = { name = "Blitzfunke", typ = "Elektro", power = 40, effect = { status = "schock", chance = 0.1 } },
	stromstoss = { name = "Stromstoß", typ = "Elektro", power = 55, effect = { status = "schock", chance = 0.15 } },
	blitzhammer = { name = "Blitzhammer", typ = "Elektro", power = 80, effect = { status = "schock", chance = 0.2 } },
	megavolt = { name = "Megavolt", typ = "Elektro", power = 100, effect = { status = "schock", chance = 0.25 } },
}

GameData.StatusNames = { brand = "Brand", schock = "Schock" }

-- ========== MONSTER ==========
-- build = Voxel-Bauplan (siehe MonsterFactory)
GameData.Species = {
	-- ===== FEUER-STARTER: Flarix -> Flammgor -> Vulkarion =====
	flarix = {
		name = "Flarix", typ = "Feuer", starter = true,
		desc = "Ein hitziges Energiebündel mit Flammenschweif.",
		base = { hp = 58, atk = 62, def = 50, spd = 62 },
		learnset = { { 1, "kratzer" }, { 1, "funkenregen" }, { 7, "glutbiss" }, { 13, "flammenwerfer" } },
		evolveLevel = 16, evolveTo = "flammgor",
		build = {
			archetype = "quad", size = 0.85,
			primary = { 235, 90, 45 }, secondary = { 190, 55, 30 }, accent = { 255, 160, 40 }, eyes = { 255, 230, 130 },
			ears = "spitz", tail = "flamme", snout = true,
		},
	},
	flammgor = {
		name = "Flammgor", typ = "Feuer", noWild = true,
		desc = "Sein Rückenkamm lodert bei jedem Angriff auf.",
		base = { hp = 82, atk = 86, def = 68, spd = 78 },
		learnset = { { 1, "funkenregen" }, { 1, "glutbiss" }, { 13, "flammenwerfer" }, { 22, "feuersturm" } },
		evolveLevel = 32, evolveTo = "vulkarion",
		build = {
			archetype = "quad", size = 1.25,
			primary = { 205, 65, 30 }, secondary = { 150, 45, 25 }, accent = { 255, 150, 35 }, eyes = { 255, 220, 100 },
			ears = "spitz", horns = 1, tail = "flamme", back = "flammen", snout = true,
		},
	},
	vulkarion = {
		name = "Vulkarion", typ = "Feuer", noWild = true,
		desc = "Ein wandelnder Vulkan mit Flügeln aus Feuer.",
		base = { hp = 100, atk = 106, def = 84, spd = 94 },
		learnset = { { 1, "glutbiss" }, { 1, "flammenwerfer" }, { 22, "feuersturm" }, { 34, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.6,
			primary = { 90, 45, 40 }, secondary = { 60, 35, 35 }, accent = { 255, 130, 30 }, eyes = { 255, 210, 80 },
			horns = 2, tail = "flamme", back = "flammen", wings = "flamme", snout = true, mane = true,
		},
	},

	-- ===== WASSER-STARTER: Aquani -> Wellodon -> Ozeandon =====
	aquani = {
		name = "Aquani", typ = "Wasser", starter = true,
		desc = "Ein verspielter Wasserfloh, der nie stillsitzt.",
		base = { hp = 62, atk = 56, def = 58, spd = 56 },
		learnset = { { 1, "tackle" }, { 1, "wasserspritzer" }, { 7, "blubbstrahl" }, { 13, "aquawelle" } },
		evolveLevel = 16, evolveTo = "wellodon",
		build = {
			archetype = "quad", size = 0.85,
			primary = { 70, 140, 230 }, secondary = { 45, 105, 195 }, accent = { 130, 210, 255 }, eyes = { 200, 245, 255 },
			ears = "rund", tail = "flosse",
		},
	},
	wellodon = {
		name = "Wellodon", typ = "Wasser", noWild = true,
		desc = "Ein sanfter Riese, der Wellen mit der Flosse lenkt.",
		base = { hp = 88, atk = 76, def = 82, spd = 64 },
		learnset = { { 1, "wasserspritzer" }, { 1, "blubbstrahl" }, { 13, "aquawelle" }, { 22, "hydrokanone" } },
		evolveLevel = 32, evolveTo = "ozeandon",
		build = {
			archetype = "quad", size = 1.3,
			primary = { 45, 105, 200 }, secondary = { 90, 170, 250 }, accent = { 140, 220, 255 }, eyes = { 210, 245, 255 },
			tail = "flosse", back = "spikes", snout = true,
		},
	},
	ozeandon = {
		name = "Ozeandon", typ = "Wasser", noWild = true,
		desc = "Die Urgewalt des Meeres in Monsterform.",
		base = { hp = 108, atk = 92, def = 100, spd = 78 },
		learnset = { { 1, "blubbstrahl" }, { 1, "aquawelle" }, { 22, "hydrokanone" }, { 34, "hyperschlag" } },
		build = {
			archetype = "serpent", size = 1.35,
			primary = { 35, 90, 185 }, secondary = { 80, 160, 245 }, accent = { 150, 225, 255 }, eyes = { 220, 250, 255 },
			horns = 2, tail = "flosse", back = "kristalle", snout = true,
		},
	},

	-- ===== PFLANZEN-STARTER: Sproessli -> Florassor -> Florakron =====
	sproessli = {
		name = "Sprössli", typ = "Pflanze", starter = true,
		desc = "Auf seinem Kopf wächst ein frisches Blatt.",
		base = { hp = 60, atk = 58, def = 56, spd = 58 },
		learnset = { { 1, "tackle" }, { 1, "blattschuss" }, { 7, "rankenschlag" }, { 13, "blattklinge" } },
		evolveLevel = 16, evolveTo = "florassor",
		build = {
			archetype = "biped", size = 0.8,
			primary = { 110, 190, 90 }, secondary = { 75, 145, 65 }, accent = { 160, 230, 90 }, eyes = { 230, 255, 190 },
			ears = "lang", tail = "keule", back = "blaetter",
		},
	},
	florassor = {
		name = "Florassor", typ = "Pflanze", noWild = true,
		desc = "Trägt eine ganze Blumenwiese auf dem Rücken.",
		base = { hp = 86, atk = 78, def = 80, spd = 62 },
		learnset = { { 1, "blattschuss" }, { 1, "rankenschlag" }, { 13, "blattklinge" }, { 22, "solarblitz" } },
		evolveLevel = 32, evolveTo = "florakron",
		build = {
			archetype = "quad", size = 1.25,
			primary = { 75, 160, 85 }, secondary = { 55, 125, 60 }, accent = { 245, 130, 180 }, eyes = { 220, 255, 200 },
			horns = 1, tail = "keule", back = "blaetter", snout = true,
		},
	},
	florakron = {
		name = "Florakron", typ = "Pflanze", noWild = true,
		desc = "Der uralte Waldkönig. Sein Rücken ist ein Garten.",
		base = { hp = 104, atk = 94, def = 98, spd = 76 },
		learnset = { { 1, "rankenschlag" }, { 1, "blattklinge" }, { 22, "solarblitz" }, { 34, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.6,
			primary = { 60, 130, 70 }, secondary = { 45, 100, 55 }, accent = { 245, 130, 180 }, eyes = { 230, 255, 200 },
			horns = 2, tail = "keule", back = "blaetter", mane = true, snout = true,
		},
	},

	-- ===== NORMAL: Mopsel -> Mopsulor =====
	mopsel = {
		name = "Mopsel", typ = "Normal",
		desc = "Knabbert einfach alles an. Wirklich alles.",
		base = { hp = 45, atk = 48, def = 40, spd = 55 },
		learnset = { { 1, "tackle" }, { 5, "kratzer" }, { 10, "koerperwurf" } },
		evolveLevel = 14, evolveTo = "mopsulor",
		build = {
			archetype = "blob", size = 0.75,
			primary = { 170, 140, 110 }, secondary = { 135, 105, 80 }, eyes = { 60, 45, 35 },
			ears = "rund", tail = "keule",
		},
	},
	mopsulor = {
		name = "Mopsulor", typ = "Normal", noWild = true,
		desc = "Aus dem Knabbern ist Kraft geworden.",
		base = { hp = 70, atk = 72, def = 58, spd = 72 },
		learnset = { { 1, "tackle" }, { 1, "koerperwurf" }, { 18, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.1,
			primary = { 150, 115, 85 }, secondary = { 115, 85, 60 }, eyes = { 70, 50, 40 },
			ears = "rund", tail = "keule", snout = true,
		},
	},

	-- ===== NORMAL: Flauschi -> Wolkorin =====
	flauschi = {
		name = "Flauschi", typ = "Normal",
		desc = "Weich wie eine Wolke, schläft am liebsten im Gras.",
		base = { hp = 55, atk = 45, def = 50, spd = 48 },
		learnset = { { 1, "tackle" }, { 6, "kratzer" }, { 12, "koerperwurf" } },
		evolveLevel = 16, evolveTo = "wolkorin",
		build = {
			archetype = "blob", size = 0.85,
			primary = { 242, 242, 242 }, secondary = { 210, 205, 200 }, accent = { 160, 200, 255 }, eyes = { 80, 90, 110 },
			ears = "rund", wings = "brick",
		},
	},
	wolkorin = {
		name = "Wolkorin", typ = "Normal", noWild = true,
		desc = "Reitet auf dem Wind wie auf einer Wolke.",
		base = { hp = 78, atk = 68, def = 72, spd = 74 },
		learnset = { { 1, "tackle" }, { 1, "koerperwurf" }, { 20, "hyperschlag" } },
		build = {
			archetype = "bird", size = 1.2,
			primary = { 245, 245, 250 }, secondary = { 200, 215, 235 }, accent = { 150, 195, 255 }, eyes = { 90, 130, 200 },
			horns = 1,
		},
	},

	-- ===== ELEKTRO: Zappli -> Voltarex =====
	zappli = {
		name = "Zappli", typ = "Elektro",
		desc = "Sein Fell knistert. Streicheln auf eigene Gefahr!",
		base = { hp = 48, atk = 55, def = 40, spd = 70 },
		learnset = { { 1, "kratzer" }, { 1, "blitzfunke" }, { 8, "stromstoss" }, { 14, "blitzhammer" } },
		evolveLevel = 18, evolveTo = "voltarex",
		build = {
			archetype = "quad", size = 0.8,
			primary = { 250, 210, 60 }, secondary = { 60, 60, 60 }, accent = { 255, 235, 100 }, eyes = { 130, 240, 255 },
			ears = "spitz", tail = "blitz",
		},
	},
	voltarex = {
		name = "Voltarex", typ = "Elektro", noWild = true,
		desc = "Ein Gewitter auf vier Beinen.",
		base = { hp = 74, atk = 82, def = 60, spd = 95 },
		learnset = { { 1, "blitzfunke" }, { 1, "stromstoss" }, { 14, "blitzhammer" }, { 22, "megavolt" } },
		build = {
			archetype = "quad", size = 1.3,
			primary = { 240, 190, 40 }, secondary = { 50, 50, 55 }, accent = { 130, 240, 255 }, eyes = { 150, 245, 255 },
			ears = "spitz", horns = 1, tail = "blitz", back = "spikes", mane = true,
		},
	},

	-- ===== ELEKTRO: Blinki -> Funkelfalter =====
	blinki = {
		name = "Blinki", typ = "Elektro",
		desc = "Nachts leuchtet sein Hinterteil wie eine Laterne.",
		base = { hp = 50, atk = 52, def = 42, spd = 66 },
		learnset = { { 1, "blitzfunke" }, { 8, "stromstoss" }, { 15, "blitzhammer" } },
		evolveLevel = 17, evolveTo = "funkelfalter",
		build = {
			archetype = "blob", size = 0.7,
			primary = { 90, 90, 120 }, secondary = { 70, 70, 100 }, accent = { 200, 255, 120 }, eyes = { 220, 255, 160 },
			horns = 1, wings = "kristall", tail = "blitz",
		},
	},
	funkelfalter = {
		name = "Funkelfalter", typ = "Elektro", noWild = true,
		desc = "Seine Flügel sprühen bei jedem Schlag Funken.",
		base = { hp = 72, atk = 78, def = 62, spd = 92 },
		learnset = { { 1, "blitzfunke" }, { 1, "stromstoss" }, { 17, "blitzhammer" }, { 24, "megavolt" } },
		build = {
			archetype = "bird", size = 1.1,
			primary = { 110, 90, 160 }, secondary = { 80, 65, 120 }, accent = { 220, 255, 130 }, eyes = { 230, 255, 170 },
			wings = "kristall", horns = 2, back = "kristalle",
		},
	},

	-- ===== WASSER: Quallino -> Quallodon =====
	quallino = {
		name = "Quallino", typ = "Wasser",
		desc = "Schwebt gemütlich umher und wabbelt freundlich.",
		base = { hp = 58, atk = 50, def = 60, spd = 45 },
		learnset = { { 1, "wasserspritzer" }, { 8, "blubbstrahl" }, { 15, "aquawelle" } },
		evolveLevel = 18, evolveTo = "quallodon",
		build = {
			archetype = "blob", size = 0.85,
			primary = { 150, 120, 230 }, secondary = { 120, 95, 200 }, accent = { 200, 170, 255 }, eyes = { 235, 220, 255 },
			tentakel = true, translucent = 0.2,
		},
	},
	quallodon = {
		name = "Quallodon", typ = "Wasser", noWild = true,
		desc = "Die Königsqualle. Ihr Leuchten hypnotisiert.",
		base = { hp = 86, atk = 72, def = 88, spd = 60 },
		learnset = { { 1, "wasserspritzer" }, { 1, "blubbstrahl" }, { 18, "aquawelle" }, { 26, "hydrokanone" } },
		build = {
			archetype = "blob", size = 1.3,
			primary = { 130, 100, 220 }, secondary = { 100, 80, 190 }, accent = { 150, 240, 255 }, eyes = { 220, 250, 255 },
			tentakel = true, translucent = 0.2, horns = 1, back = "kristalle",
		},
	},

	-- ===== WASSER: Flossi -> Flossaros =====
	flossi = {
		name = "Flossi", typ = "Wasser",
		desc = "Hüpft erstaunlich weit für einen Fisch.",
		base = { hp = 46, atk = 52, def = 42, spd = 60 },
		learnset = { { 1, "tackle" }, { 1, "wasserspritzer" }, { 9, "blubbstrahl" }, { 16, "aquawelle" } },
		evolveLevel = 17, evolveTo = "flossaros",
		build = {
			archetype = "blob", size = 0.72,
			primary = { 240, 140, 60 }, secondary = { 250, 175, 95 }, accent = { 255, 210, 130 }, eyes = { 255, 250, 230 },
			tail = "flosse", back = "spikes",
		},
	},
	flossaros = {
		name = "Flossaros", typ = "Wasser", noWild = true,
		desc = "Der fliegende Fisch-Drache der Flüsse.",
		base = { hp = 70, atk = 78, def = 64, spd = 84 },
		learnset = { { 1, "wasserspritzer" }, { 1, "blubbstrahl" }, { 17, "aquawelle" }, { 25, "hydrokanone" } },
		build = {
			archetype = "serpent", size = 1.0,
			primary = { 235, 125, 50 }, secondary = { 250, 180, 100 }, accent = { 130, 210, 255 }, eyes = { 220, 245, 255 },
			tail = "flosse", back = "spikes", horns = 1,
		},
	},

	-- ===== PFLANZE: Pilzli -> Pilzomant =====
	pilzli = {
		name = "Pilzli", typ = "Pflanze",
		desc = "Versteckt sich gern zwischen echten Pilzen.",
		base = { hp = 56, atk = 54, def = 56, spd = 38 },
		learnset = { { 1, "blattschuss" }, { 8, "rankenschlag" }, { 15, "blattklinge" } },
		evolveLevel = 17, evolveTo = "pilzomant",
		build = {
			archetype = "biped", size = 0.72,
			primary = { 235, 220, 190 }, secondary = { 200, 180, 150 }, eyes = { 90, 70, 55 },
			hut = { 200, 60, 60 },
		},
	},
	pilzomant = {
		name = "Pilzomant", typ = "Pflanze", noWild = true,
		desc = "Ein weiser Pilz-Magier mit Sporenzauber.",
		base = { hp = 80, atk = 78, def = 80, spd = 54 },
		learnset = { { 1, "blattschuss" }, { 1, "rankenschlag" }, { 17, "blattklinge" }, { 25, "solarblitz" } },
		build = {
			archetype = "biped", size = 1.15,
			primary = { 225, 205, 175 }, secondary = { 185, 160, 130 }, accent = { 200, 255, 140 }, eyes = { 190, 255, 150 },
			hut = { 170, 50, 90 }, back = "blaetter",
		},
	},

	-- ===== PFLANZE: Dorni -> Dornassor =====
	dorni = {
		name = "Dorni", typ = "Pflanze",
		desc = "Ein wandelnder Kaktus. Bitte nicht umarmen.",
		base = { hp = 55, atk = 60, def = 62, spd = 35 },
		learnset = { { 1, "kratzer" }, { 1, "blattschuss" }, { 9, "rankenschlag" }, { 16, "blattklinge" } },
		evolveLevel = 18, evolveTo = "dornassor",
		build = {
			archetype = "biped", size = 0.78,
			primary = { 90, 170, 70 }, secondary = { 65, 135, 55 }, accent = { 245, 130, 180 }, eyes = { 230, 255, 200 },
			back = "spikes", horns = 1,
		},
	},
	dornassor = {
		name = "Dornassor", typ = "Pflanze", noWild = true,
		desc = "Ein Wüstenkoloss voller Stacheln und Blüten.",
		base = { hp = 79, atk = 86, def = 86, spd = 48 },
		learnset = { { 1, "blattschuss" }, { 1, "rankenschlag" }, { 18, "blattklinge" }, { 26, "solarblitz" } },
		build = {
			archetype = "quad", size = 1.25,
			primary = { 75, 150, 60 }, secondary = { 55, 115, 45 }, accent = { 245, 130, 180 }, eyes = { 235, 255, 205 },
			back = "spikes", horns = 2, tail = "keule", snout = true,
		},
	},

	-- ===== FEUER: Glutmops -> Magmops =====
	glutmops = {
		name = "Glutmops", typ = "Feuer",
		desc = "Schnauft kleine Rauchwölkchen, wenn er rennt.",
		base = { hp = 60, atk = 64, def = 48, spd = 55 },
		learnset = { { 1, "tackle" }, { 1, "funkenregen" }, { 9, "glutbiss" }, { 16, "flammenwerfer" } },
		evolveLevel = 18, evolveTo = "magmops",
		build = {
			archetype = "quad", size = 0.82,
			primary = { 130, 75, 50 }, secondary = { 100, 55, 40 }, accent = { 255, 150, 40 }, eyes = { 255, 200, 120 },
			ears = "rund", tail = "flamme", snout = true,
		},
	},
	magmops = {
		name = "Magmops", typ = "Feuer", noWild = true,
		desc = "In seinen Fugen glüht flüssiges Magma.",
		base = { hp = 84, atk = 88, def = 70, spd = 72 },
		learnset = { { 1, "funkenregen" }, { 1, "glutbiss" }, { 16, "flammenwerfer" }, { 24, "feuersturm" } },
		build = {
			archetype = "quad", size = 1.25,
			primary = { 80, 50, 45 }, secondary = { 55, 40, 40 }, accent = { 255, 120, 30 }, eyes = { 255, 190, 90 },
			ears = "rund", horns = 1, tail = "flamme", back = "flammen", snout = true,
		},
	},

	-- ===== NORMAL: Brockel -> Brockolith =====
	brockel = {
		name = "Brockel", typ = "Normal",
		desc = "Sieht aus wie ein Stein. Ist auch fast einer.",
		base = { hp = 62, atk = 55, def = 75, spd = 30 },
		learnset = { { 1, "tackle" }, { 7, "kratzer" }, { 12, "koerperwurf" }, { 18, "hyperschlag" } },
		evolveLevel = 20, evolveTo = "brockolith",
		build = {
			archetype = "blob", size = 0.85,
			primary = { 135, 135, 135 }, secondary = { 110, 110, 110 }, accent = { 120, 200, 120 }, eyes = { 200, 255, 200 },
			material = "Slate", back = "blaetter",
		},
	},
	brockolith = {
		name = "Brockolith", typ = "Normal", noWild = true,
		desc = "Ein uralter Fels, erwacht mit Kristallkraft.",
		base = { hp = 88, atk = 78, def = 104, spd = 42 },
		learnset = { { 1, "tackle" }, { 1, "kratzer" }, { 12, "koerperwurf" }, { 20, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.35,
			primary = { 120, 120, 125 }, secondary = { 95, 95, 100 }, accent = { 255, 200, 90 }, eyes = { 255, 220, 130 },
			material = "Slate", back = "kristalle", horns = 1, tail = "kristall",
		},
	},

	-- ============================================================
	-- ===== LEGENDÄRE (keine Entwicklung, extrem selten!) =====
	-- ============================================================
	flarephoenix = {
		name = "Flarephoenix", typ = "Feuer", legendary = true, noWild = true,
		desc = "Wiedergeboren aus Asche und Feuer. Seine Flügel verbrennen die Finsternis.",
		base = { hp = 100, atk = 108, def = 84, spd = 102 },
		learnset = { { 1, "glutbiss" }, { 1, "flammenwerfer" }, { 10, "feuersturm" }, { 18, "hyperschlag" } },
		build = {
			archetype = "bird", size = 1.5,
			primary = { 220, 80, 30 }, secondary = { 255, 150, 40 }, accent = { 255, 200, 60 }, eyes = { 255, 240, 150 },
			wings = "flamme", back = "flammen", tail = "flamme", horns = 1,
		},
	},
	oceanos = {
		name = "Oceanos", typ = "Wasser", legendary = true, noWild = true,
		desc = "Der Tiefsee-Gigant, der alle Ozeane kontrolliert. Sein Ruf erzeugt Tsunamis.",
		base = { hp = 122, atk = 96, def = 102, spd = 76 },
		learnset = { { 1, "blubbstrahl" }, { 1, "aquawelle" }, { 10, "hydrokanone" }, { 18, "hyperschlag" } },
		build = {
			archetype = "serpent", size = 1.6,
			primary = { 30, 85, 190 }, secondary = { 70, 150, 240 }, accent = { 140, 230, 255 }, eyes = { 220, 250, 255 },
			back = "kristalle", tail = "flosse", snout = true, horns = 2,
		},
	},
	terralith = {
		name = "Terralith", typ = "Pflanze", legendary = true, noWild = true,
		desc = "Das lebende Land selbst. Er formt Berge und Täler nach seinem Willen.",
		base = { hp = 118, atk = 92, def = 112, spd = 62 },
		learnset = { { 1, "rankenschlag" }, { 1, "blattklinge" }, { 10, "solarblitz" }, { 18, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.6,
			primary = { 115, 95, 65 }, secondary = { 85, 140, 70 }, accent = { 160, 230, 100 }, eyes = { 190, 255, 140 },
			material = "Slate", back = "blaetter", horns = 2, mane = true, tail = "keule", snout = true,
		},
	},
	thunderox = {
		name = "Thunderox", typ = "Elektro", legendary = true, noWild = true,
		desc = "Der Donnerschlächter. Seine Blitze treffen schneller, als das Auge sieht.",
		base = { hp = 96, atk = 112, def = 86, spd = 118 },
		learnset = { { 1, "stromstoss" }, { 1, "blitzhammer" }, { 10, "megavolt" }, { 18, "hyperschlag" } },
		build = {
			archetype = "quad", size = 1.5,
			primary = { 245, 195, 45 }, secondary = { 45, 45, 55 }, accent = { 140, 245, 255 }, eyes = { 170, 250, 255 },
			mane = true, horns = 2, tail = "blitz", back = "spikes",
		},
	},
	aurorael = {
		name = "Aurorael", typ = "Normal", legendary = true, noWild = true,
		desc = "Ein strahlendes Wesen aus Licht und Eis. Bringt Hoffnung in die Welt.",
		base = { hp = 106, atk = 96, def = 96, spd = 106 },
		learnset = { { 1, "koerperwurf" }, { 1, "aquawelle" }, { 10, "hyperschlag" }, { 18, "megavolt" } },
		build = {
			archetype = "bird", size = 1.45,
			primary = { 245, 248, 255 }, secondary = { 190, 220, 255 }, accent = { 150, 230, 255 }, eyes = { 120, 220, 255 },
			wings = "kristall", back = "kristalle", tail = "keule", horns = 1,
		},
	},
	supremion = {
		name = "Supremion", typ = "Normal", legendary = true, noWild = true,
		desc = "Das erste Wesen der Schöpfung. Nur die Balance hält es in Schach.",
		base = { hp = 126, atk = 116, def = 106, spd = 106 },
		learnset = { { 1, "hyperschlag" }, { 1, "feuersturm" }, { 10, "hydrokanone" }, { 18, "megavolt" } },
		build = {
			archetype = "quad", size = 1.75,
			primary = { 235, 215, 160 }, secondary = { 250, 245, 235 }, accent = { 255, 215, 90 }, eyes = { 255, 235, 150 },
			wings = "brick", horns = 2, mane = true, back = "kristalle", tail = "kristall", snout = true,
		},
	},
}

GameData.Starters = { "flarix", "aquani", "sproessli" }

-- Diese Legendaeren tauchen ab und zu in der Wildnis auf
GameData.Legendaries = { "flarephoenix", "oceanos", "terralith", "thunderox", "aurorael", "supremion" }

-- ========== ITEMS ==========
GameData.Items = {
	fangkugel = { name = "Fangkugel", desc = "Fängt wilde Monster. Besser bei wenig KP!", price = 150, ball = true },
	trank = { name = "Trank", desc = "Heilt 30 KP.", price = 200, heal = 30 },
	rotebeere = { name = "Rote Beere", desc = "Heilt 20 KP.", price = 80, heal = 20 },
	blaubeere = { name = "Blaubeere", desc = "Heilt Statusprobleme (Brand/Schock).", price = 100, cure = true },
	goldapfel = { name = "Goldapfel", desc = "Füllt KP komplett und heilt Status.", price = 600, heal = "full", cure = true },
}
GameData.ItemOrder = { "fangkugel", "trank", "rotebeere", "blaubeere", "goldapfel" }
GameData.StartItems = { fangkugel = 5, trank = 2 }

-- ========== ROUTEN & GRAS ==========
GameData.Routes = {
	route1 = {
		name = "Route 1", levelMin = 3, levelMax = 7,
		pool = { { "mopsel", 30 }, { "flauschi", 22 }, { "zappli", 16 }, { "pilzli", 14 }, { "flossi", 12 }, { "glutmops", 6 } },
	},
	route2 = {
		name = "Route 2", levelMin = 8, levelMax = 14,
		pool = { { "blinki", 18 }, { "quallino", 16 }, { "dorni", 16 }, { "glutmops", 14 }, { "brockel", 14 }, { "flossi", 10 }, { "mopsel", 8 }, { "zappli", 4 } },
	},
}

GameData.GrassPatches = {
	{ 110, -25, 175, 25, "route1" },
	{ 205, -32, 268, 14, "route1" },
	{ 295, -18, 355, 32, "route1" },
	{ -42, -205, 25, -140, "route2" },
	{ -18, -296, 55, -238, "route2" },
}

-- ========== TRAINER ==========
GameData.Trainers = {
	{
		id = "timo", name = "Trainer Timo", pos = { 185, 4 },
		greeting = "Hey! Zeig mir, was dein Team kann!",
		team = { { "mopsel", 6 }, { "flauschi", 7 } },
		reward = 150, shirt = { 220, 80, 80 },
	},
	{
		id = "lena", name = "Trainerin Lena", pos = { 278, -8 },
		greeting = "Meine Monster sind blitzschnell!",
		team = { { "zappli", 8 }, { "pilzli", 8 } },
		reward = 200, shirt = { 240, 200, 70 },
	},
	{
		id = "rocko", name = "Ranger Rocko", pos = { 8, -222 },
		greeting = "Niemand kommt an mir vorbei!",
		team = { { "glutmops", 12 }, { "quallino", 12 }, { "brockel", 13 } },
		reward = 350, shirt = { 90, 140, 90 },
	},
}

-- ========== FORMELN ==========

function GameData.StatsFor(speciesId, level)
	local sp = GameData.Species[speciesId]
	local b = sp.base
	return {
		maxHp = math.floor(b.hp * (0.5 + level * 0.07)) + 12,
		atk = math.floor(b.atk * (0.36 + level * 0.055)) + 4,
		def = math.floor(b.def * (0.36 + level * 0.055)) + 4,
		spd = math.floor(b.spd * (0.36 + level * 0.055)) + 4,
	}
end

function GameData.XpToNext(level)
	return 15 * level + 20
end

function GameData.XpGain(enemyLevel, isTrainer, isLegendary)
	local gain = enemyLevel * 12
	if isTrainer then
		gain = math.floor(gain * 1.3)
	end
	if isLegendary then
		gain = math.floor(gain * 1.6)
	end
	return gain
end

-- Fangchance: besser bei wenig KP, Legendaere sind viel schwerer
function GameData.CatchChance(level, hpFrac, isLegendary)
	local c = (0.8 - 0.62 * hpFrac) * (1.05 - level * 0.008)
	if isLegendary then
		c = c * 0.35
	end
	if c < 0.02 then c = 0.02 end
	if c > 0.95 then c = 0.95 end
	return c
end

function GameData.MovesFor(speciesId, level)
	local sp = GameData.Species[speciesId]
	local known = {}
	for _, entry in ipairs(sp.learnset) do
		if level >= entry[1] then
			table.insert(known, entry[2])
		end
	end
	while #known > 4 do
		table.remove(known, 1)
	end
	return known
end

function GameData.MoveLearnedAt(speciesId, level)
	local sp = GameData.Species[speciesId]
	for _, entry in ipairs(sp.learnset) do
		if entry[1] == level then
			return entry[2]
		end
	end
	return nil
end

return GameData
