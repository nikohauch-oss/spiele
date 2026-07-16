-- ============================================================
-- MONSTERWELT - Zentrale Spieldaten
-- Typen, Attacken, alle 18 Monster (mit 3D-Bauplan!),
-- Items, Routen, Trainer und Balancing.
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

-- Effektivitaet: Wasser > Feuer > Pflanze > Wasser, Elektro > Wasser
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
-- effect = { status = "brand"/"schock", chance = 0..1 }
GameData.Moves = {
	-- Normal
	tackle = { name = "Tackle", typ = "Normal", power = 40 },
	kratzer = { name = "Kratzer", typ = "Normal", power = 40 },
	koerperwurf = { name = "Körperwurf", typ = "Normal", power = 65 },
	hyperschlag = { name = "Hyperschlag", typ = "Normal", power = 90 },
	-- Feuer
	funkenregen = { name = "Funkenregen", typ = "Feuer", power = 40 },
	glutbiss = { name = "Glutbiss", typ = "Feuer", power = 55, effect = { status = "brand", chance = 0.2 } },
	flammenwerfer = { name = "Flammenwerfer", typ = "Feuer", power = 80, effect = { status = "brand", chance = 0.15 } },
	feuersturm = { name = "Feuersturm", typ = "Feuer", power = 100, effect = { status = "brand", chance = 0.2 } },
	-- Wasser
	wasserspritzer = { name = "Wasserspritzer", typ = "Wasser", power = 40 },
	blubbstrahl = { name = "Blubbstrahl", typ = "Wasser", power = 55 },
	aquawelle = { name = "Aquawelle", typ = "Wasser", power = 80 },
	hydrokanone = { name = "Hydrokanone", typ = "Wasser", power = 100 },
	-- Pflanze
	blattschuss = { name = "Blattschuss", typ = "Pflanze", power = 40 },
	rankenschlag = { name = "Rankenschlag", typ = "Pflanze", power = 55 },
	blattklinge = { name = "Blattklinge", typ = "Pflanze", power = 80 },
	solarblitz = { name = "Solarblitz", typ = "Pflanze", power = 100 },
	-- Elektro
	blitzfunke = { name = "Blitzfunke", typ = "Elektro", power = 40, effect = { status = "schock", chance = 0.1 } },
	stromstoss = { name = "Stromstoß", typ = "Elektro", power = 55, effect = { status = "schock", chance = 0.15 } },
	blitzhammer = { name = "Blitzhammer", typ = "Elektro", power = 80, effect = { status = "schock", chance = 0.2 } },
	megavolt = { name = "Megavolt", typ = "Elektro", power = 100, effect = { status = "schock", chance = 0.25 } },
}

GameData.StatusNames = { brand = "Brand", schock = "Schock" }

-- ========== MONSTER ==========
-- build = Bauplan fuer die 3D-Figur (MonsterFactory):
--   body  = Rumpf (shape Ball/Block/Cylinder, size {b,h,t}, color {r,g,b})
--   head  = Kopf-Kugel (size, offset {x,y,z}), -z ist VORNE
--   legs  = Anzahl Beine (0/2/4), legHeight
--   parts = weitere Teile (Ohren, Schwanz, Flossen, Fluegel, ...)
GameData.Species = {
	-- ===== STARTER: FEUER =====
	flarix = {
		name = "Flarix", typ = "Feuer", starter = true,
		desc = "Ein hitziges Energiebündel mit Flammenschweif.",
		base = { hp = 58, atk = 62, def = 50, spd = 62 },
		learnset = { { 1, "kratzer" }, { 1, "funkenregen" }, { 7, "glutbiss" }, { 13, "flammenwerfer" } },
		evolveLevel = 16, evolveTo = "flammgor",
		build = {
			body = { shape = "Ball", size = { 2.4, 2.0, 2.8 }, color = { 235, 90, 45 } },
			head = { size = 1.6, offset = { 0, 1.0, -1.3 }, color = { 240, 105, 55 } },
			legs = 4, legHeight = 0.7,
			parts = {
				{ shape = "Wedge", size = { 0.5, 0.7, 0.5 }, offset = { -0.5, 1.8, -1.3 }, color = { 200, 60, 30 }, name = "OhrL" },
				{ shape = "Wedge", size = { 0.5, 0.7, 0.5 }, offset = { 0.5, 1.8, -1.3 }, color = { 200, 60, 30 }, name = "OhrR" },
				{ shape = "Ball", size = { 0.9, 0.9, 0.9 }, offset = { 0, 0.9, 1.7 }, color = { 255, 140, 30 }, material = "Neon", name = "Flamme1" },
				{ shape = "Ball", size = { 0.55, 0.55, 0.55 }, offset = { 0, 1.4, 2.1 }, color = { 255, 220, 80 }, material = "Neon", name = "Flamme2" },
			},
		},
	},
	flammgor = {
		name = "Flammgor", typ = "Feuer", noWild = true,
		desc = "Sein Rückenkamm lodert bei jedem Angriff auf.",
		base = { hp = 82, atk = 86, def = 68, spd = 78 },
		learnset = { { 1, "funkenregen" }, { 1, "glutbiss" }, { 13, "flammenwerfer" }, { 22, "feuersturm" } },
		build = {
			body = { shape = "Block", size = { 3.2, 2.6, 4.2 }, color = { 200, 60, 30 } },
			head = { size = 2.2, offset = { 0, 1.7, -2.1 }, color = { 215, 75, 40 } },
			legs = 4, legHeight = 1.0,
			parts = {
				{ shape = "Ball", size = { 0.6, 0.6, 0.6 }, offset = { 0, 3.0, -2.1 }, color = { 255, 220, 80 }, material = "Neon", name = "Horn" },
				{ shape = "Wedge", size = { 0.7, 1.2, 1.2 }, offset = { 0, 1.9, -0.6 }, color = { 255, 140, 30 }, material = "Neon", name = "Kamm1" },
				{ shape = "Wedge", size = { 0.7, 1.0, 1.1 }, offset = { 0, 1.8, 0.7 }, color = { 255, 140, 30 }, material = "Neon", name = "Kamm2" },
				{ shape = "Ball", size = { 1.2, 1.2, 1.2 }, offset = { 0, 1.0, 2.6 }, color = { 255, 140, 30 }, material = "Neon", name = "Flamme1" },
				{ shape = "Ball", size = { 0.7, 0.7, 0.7 }, offset = { 0, 1.6, 3.1 }, color = { 255, 220, 80 }, material = "Neon", name = "Flamme2" },
			},
		},
	},

	-- ===== STARTER: WASSER =====
	aquani = {
		name = "Aquani", typ = "Wasser", starter = true,
		desc = "Ein verspielter Wasserfloh, der nie stillsitzt.",
		base = { hp = 62, atk = 56, def = 58, spd = 56 },
		learnset = { { 1, "tackle" }, { 1, "wasserspritzer" }, { 7, "blubbstrahl" }, { 13, "aquawelle" } },
		evolveLevel = 16, evolveTo = "wellodon",
		build = {
			body = { shape = "Ball", size = { 2.3, 2.1, 2.5 }, color = { 70, 140, 230 } },
			head = { size = 1.7, offset = { 0, 1.1, -1.2 }, color = { 110, 180, 240 } },
			legs = 2, legHeight = 0.6,
			parts = {
				{ shape = "Ball", size = { 0.6, 0.6, 0.6 }, offset = { -0.9, 2.0, -1.2 }, color = { 110, 180, 240 }, name = "OhrL" },
				{ shape = "Ball", size = { 0.6, 0.6, 0.6 }, offset = { 0.9, 2.0, -1.2 }, color = { 110, 180, 240 }, name = "OhrR" },
				{ shape = "Wedge", size = { 1.6, 0.4, 1.4 }, offset = { 0, 0.1, 1.7 }, rot = { 0, 180, 0 }, color = { 50, 110, 200 }, name = "Flosse" },
			},
		},
	},
	wellodon = {
		name = "Wellodon", typ = "Wasser", noWild = true,
		desc = "Ein sanfter Riese, der Wellen mit der Flosse lenkt.",
		base = { hp = 88, atk = 76, def = 82, spd = 64 },
		learnset = { { 1, "wasserspritzer" }, { 1, "blubbstrahl" }, { 13, "aquawelle" }, { 22, "hydrokanone" } },
		build = {
			body = { shape = "Block", size = { 3.4, 2.5, 4.4 }, color = { 40, 100, 200 } },
			head = { size = 2.2, offset = { 0, 1.5, -2.3 }, color = { 70, 140, 230 } },
			legs = 4, legHeight = 0.9,
			parts = {
				{ shape = "Wedge", size = { 0.6, 1.4, 1.6 }, offset = { 0, 2.0, 0.2 }, color = { 90, 170, 250 }, name = "Rueckenflosse" },
				{ shape = "Wedge", size = { 0.4, 1.0, 1.2 }, offset = { -1.9, 0.6, -0.4 }, rot = { 0, 0, -30 }, color = { 90, 170, 250 }, name = "FlosseL" },
				{ shape = "Wedge", size = { 0.4, 1.0, 1.2 }, offset = { 1.9, 0.6, -0.4 }, rot = { 0, 0, 30 }, color = { 90, 170, 250 }, name = "FlosseR" },
				{ shape = "Wedge", size = { 2.0, 0.5, 1.8 }, offset = { 0, 0.3, 2.9 }, rot = { 0, 180, 0 }, color = { 90, 170, 250 }, name = "Schwanzflosse" },
			},
		},
	},

	-- ===== STARTER: PFLANZE =====
	sproessli = {
		name = "Sprössli", typ = "Pflanze", starter = true,
		desc = "Auf seinem Kopf wächst ein frisches Blatt.",
		base = { hp = 60, atk = 58, def = 56, spd = 58 },
		learnset = { { 1, "tackle" }, { 1, "blattschuss" }, { 7, "rankenschlag" }, { 13, "blattklinge" } },
		evolveLevel = 16, evolveTo = "florassor",
		build = {
			body = { shape = "Ball", size = { 2.1, 2.0, 2.2 }, color = { 110, 190, 90 } },
			head = { size = 1.7, offset = { 0, 1.2, -1.0 }, color = { 130, 205, 105 } },
			legs = 2, legHeight = 0.6,
			parts = {
				{ shape = "Block", size = { 0.5, 1.1, 0.5 }, offset = { -0.6, 2.3, -1.0 }, rot = { 0, 0, 12 }, color = { 80, 150, 65 }, name = "OhrL" },
				{ shape = "Block", size = { 0.5, 1.1, 0.5 }, offset = { 0.6, 2.3, -1.0 }, rot = { 0, 0, -12 }, color = { 80, 150, 65 }, name = "OhrR" },
				{ shape = "Block", size = { 0.15, 0.6, 0.15 }, offset = { 0, 2.3, -1.0 }, color = { 70, 130, 55 }, name = "Stiel" },
				{ shape = "Ball", size = { 1.1, 0.25, 1.6 }, offset = { 0, 2.7, -1.0 }, color = { 90, 200, 70 }, name = "Blatt" },
				{ shape = "Ball", size = { 0.5, 0.5, 0.5 }, offset = { 0, 0.4, 1.3 }, color = { 235, 245, 230 }, name = "Puschel" },
			},
		},
	},
	florassor = {
		name = "Florassor", typ = "Pflanze", noWild = true,
		desc = "Trägt eine ganze Blumenwiese auf dem Rücken.",
		base = { hp = 86, atk = 78, def = 80, spd = 62 },
		learnset = { { 1, "blattschuss" }, { 1, "rankenschlag" }, { 13, "blattklinge" }, { 22, "solarblitz" } },
		build = {
			body = { shape = "Block", size = { 3.3, 2.5, 4.2 }, color = { 70, 160, 80 } },
			head = { size = 2.1, offset = { 0, 1.5, -2.2 }, color = { 95, 180, 95 } },
			legs = 4, legHeight = 0.9,
			parts = {
				{ shape = "Ball", size = { 2.2, 0.5, 2.2 }, offset = { 0, 1.9, 0.4 }, color = { 90, 200, 70 }, name = "Blattkranz" },
				{ shape = "Ball", size = { 0.9, 0.9, 0.9 }, offset = { 0, 2.4, 0.4 }, color = { 255, 200, 60 }, name = "Bluete" },
				{ shape = "Ball", size = { 0.55, 0.55, 0.55 }, offset = { -0.7, 2.2, 0.4 }, color = { 245, 130, 180 }, name = "Blume1" },
				{ shape = "Ball", size = { 0.55, 0.55, 0.55 }, offset = { 0.7, 2.2, 0.4 }, color = { 245, 130, 180 }, name = "Blume2" },
				{ shape = "Block", size = { 0.6, 0.6, 1.6 }, offset = { 0, 0.6, 2.7 }, color = { 70, 160, 80 }, name = "Schwanz" },
			},
		},
	},

	-- ===== WILDE MONSTER =====
	mopsel = {
		name = "Mopsel", typ = "Normal",
		desc = "Knabbert einfach alles an. Wirklich alles.",
		base = { hp = 45, atk = 48, def = 40, spd = 55 },
		learnset = { { 1, "tackle" }, { 5, "kratzer" }, { 10, "koerperwurf" } },
		evolveLevel = 14, evolveTo = "mopsulor",
		build = {
			body = { shape = "Ball", size = { 1.9, 1.7, 2.1 }, color = { 170, 140, 110 } },
			head = { size = 1.4, offset = { 0, 0.9, -1.0 }, color = { 180, 150, 120 } },
			legs = 2, legHeight = 0.5,
			parts = {
				{ shape = "Ball", size = { 0.7, 0.7, 0.25 }, offset = { -0.6, 1.7, -1.0 }, color = { 150, 120, 95 }, name = "OhrL" },
				{ shape = "Ball", size = { 0.7, 0.7, 0.25 }, offset = { 0.6, 1.7, -1.0 }, color = { 150, 120, 95 }, name = "OhrR" },
				{ shape = "Block", size = { 0.18, 0.18, 1.6 }, offset = { 0, 0.5, 1.6 }, rot = { -20, 0, 0 }, color = { 140, 110, 90 }, name = "Schwanz" },
			},
		},
	},
	mopsulor = {
		name = "Mopsulor", typ = "Normal", noWild = true,
		desc = "Aus dem Knabbern ist Kraft geworden.",
		base = { hp = 70, atk = 72, def = 58, spd = 72 },
		learnset = { { 1, "tackle" }, { 1, "koerperwurf" }, { 18, "hyperschlag" } },
		build = {
			body = { shape = "Ball", size = { 2.9, 2.5, 3.1 }, color = { 150, 115, 85 } },
			head = { size = 2.0, offset = { 0, 1.4, -1.5 }, color = { 165, 130, 100 } },
			legs = 4, legHeight = 0.8,
			parts = {
				{ shape = "Ball", size = { 0.9, 0.9, 0.3 }, offset = { -0.85, 2.5, -1.5 }, color = { 130, 100, 75 }, name = "OhrL" },
				{ shape = "Ball", size = { 0.9, 0.9, 0.3 }, offset = { 0.85, 2.5, -1.5 }, color = { 130, 100, 75 }, name = "OhrR" },
				{ shape = "Block", size = { 0.25, 0.25, 2.2 }, offset = { 0, 0.9, 2.3 }, rot = { -25, 0, 0 }, color = { 120, 95, 70 }, name = "Schwanz" },
				{ shape = "Block", size = { 0.5, 0.5, 0.2 }, offset = { 0, 0.65, -2.42 }, color = { 250, 250, 250 }, name = "Zahn" },
			},
		},
	},
	flauschi = {
		name = "Flauschi", typ = "Normal",
		desc = "Weich wie eine Wolke, schläft am liebsten im Gras.",
		base = { hp = 55, atk = 45, def = 50, spd = 48 },
		learnset = { { 1, "tackle" }, { 6, "kratzer" }, { 12, "koerperwurf" } },
		build = {
			body = { shape = "Ball", size = { 2.3, 2.1, 2.3 }, color = { 242, 242, 242 } },
			head = { size = 1.3, offset = { 0, 1.0, -1.3 }, color = { 220, 205, 195 } },
			legs = 2, legHeight = 0.5,
			parts = {
				{ shape = "Block", size = { 1.5, 0.25, 0.9 }, offset = { -1.6, 0.9, 0 }, rot = { 0, 0, 18 }, color = { 250, 250, 250 }, name = "FluegelL" },
				{ shape = "Block", size = { 1.5, 0.25, 0.9 }, offset = { 1.6, 0.9, 0 }, rot = { 0, 0, -18 }, color = { 250, 250, 250 }, name = "FluegelR" },
				{ shape = "Ball", size = { 0.6, 0.6, 0.6 }, offset = { 0, 0.4, 1.3 }, color = { 250, 250, 250 }, name = "Puschel" },
			},
		},
	},
	zappli = {
		name = "Zappli", typ = "Elektro",
		desc = "Sein Fell knistert. Streicheln auf eigene Gefahr!",
		base = { hp = 48, atk = 55, def = 40, spd = 70 },
		learnset = { { 1, "kratzer" }, { 1, "blitzfunke" }, { 8, "stromstoss" }, { 14, "blitzhammer" } },
		evolveLevel = 18, evolveTo = "voltarex",
		build = {
			body = { shape = "Ball", size = { 2.0, 1.8, 2.2 }, color = { 250, 210, 60 } },
			head = { size = 1.5, offset = { 0, 1.0, -1.1 }, color = { 252, 220, 80 } },
			legs = 4, legHeight = 0.6,
			parts = {
				{ shape = "Wedge", size = { 0.45, 0.8, 0.45 }, offset = { -0.55, 1.9, -1.1 }, color = { 60, 60, 60 }, name = "OhrL" },
				{ shape = "Wedge", size = { 0.45, 0.8, 0.45 }, offset = { 0.55, 1.9, -1.1 }, color = { 60, 60, 60 }, name = "OhrR" },
				{ shape = "Block", size = { 0.3, 0.3, 1.0 }, offset = { 0, 0.9, 1.5 }, rot = { -35, 0, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "Blitz1" },
				{ shape = "Block", size = { 0.3, 0.3, 0.8 }, offset = { 0, 1.5, 2.0 }, rot = { 35, 0, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "Blitz2" },
			},
		},
	},
	voltarex = {
		name = "Voltarex", typ = "Elektro", noWild = true,
		desc = "Ein Gewitter auf vier Beinen.",
		base = { hp = 74, atk = 82, def = 60, spd = 95 },
		learnset = { { 1, "blitzfunke" }, { 1, "stromstoss" }, { 14, "blitzhammer" }, { 22, "megavolt" } },
		build = {
			body = { shape = "Block", size = { 2.9, 2.3, 3.9 }, color = { 240, 190, 40 } },
			head = { size = 2.0, offset = { 0, 1.5, -2.0 }, color = { 248, 205, 60 } },
			legs = 4, legHeight = 1.0,
			parts = {
				{ shape = "Ball", size = { 0.5, 0.5, 0.5 }, offset = { 0, 2.7, -2.0 }, color = { 120, 240, 255 }, material = "Neon", name = "Horn" },
				{ shape = "Ball", size = { 0.45, 0.45, 0.45 }, offset = { -1.5, 1.6, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "FunkeL" },
				{ shape = "Ball", size = { 0.45, 0.45, 0.45 }, offset = { 1.5, 1.6, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "FunkeR" },
				{ shape = "Block", size = { 0.35, 0.35, 1.4 }, offset = { 0, 1.2, 2.4 }, rot = { -30, 0, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "Blitz1" },
				{ shape = "Block", size = { 0.35, 0.35, 1.0 }, offset = { 0, 2.0, 3.0 }, rot = { 30, 0, 0 }, color = { 255, 230, 90 }, material = "Neon", name = "Blitz2" },
			},
		},
	},
	blinki = {
		name = "Blinki", typ = "Elektro",
		desc = "Nachts leuchtet sein Hinterteil wie eine Laterne.",
		base = { hp = 50, atk = 52, def = 42, spd = 66 },
		learnset = { { 1, "blitzfunke" }, { 8, "stromstoss" }, { 15, "blitzhammer" } },
		build = {
			body = { shape = "Ball", size = { 1.7, 1.5, 1.9 }, color = { 90, 90, 120 } },
			head = { size = 1.3, offset = { 0, 0.8, -1.0 }, color = { 105, 105, 135 }, eyeScale = 1.4 },
			legs = 2, legHeight = 0.45,
			parts = {
				{ shape = "Ball", size = { 1.2, 1.2, 1.2 }, offset = { 0, 0.3, 1.3 }, color = { 200, 255, 120 }, material = "Neon", name = "Leuchte" },
				{ shape = "Block", size = { 1.2, 0.15, 0.7 }, offset = { -1.2, 1.1, 0 }, rot = { 0, 0, 25 }, color = { 200, 220, 255 }, transparency = 0.4, name = "FluegelL" },
				{ shape = "Block", size = { 1.2, 0.15, 0.7 }, offset = { 1.2, 1.1, 0 }, rot = { 0, 0, -25 }, color = { 200, 220, 255 }, transparency = 0.4, name = "FluegelR" },
			},
		},
	},
	quallino = {
		name = "Quallino", typ = "Wasser",
		desc = "Schwebt gemütlich umher und wabbelt freundlich.",
		base = { hp = 58, atk = 50, def = 60, spd = 45 },
		learnset = { { 1, "wasserspritzer" }, { 8, "blubbstrahl" }, { 15, "aquawelle" } },
		build = {
			body = { shape = "Ball", size = { 2.5, 1.7, 2.5 }, color = { 150, 120, 230 }, transparency = 0.2 },
			legs = 0, groundClearance = 1.4,
			parts = {
				{ shape = "Cylinder", size = { 1.3, 0.3, 0.3 }, offset = { -0.7, -1.2, -0.5 }, rot = { 0, 0, 90 }, color = { 170, 140, 240 }, transparency = 0.2, name = "Tentakel1" },
				{ shape = "Cylinder", size = { 1.3, 0.3, 0.3 }, offset = { 0.7, -1.2, -0.5 }, rot = { 0, 0, 90 }, color = { 170, 140, 240 }, transparency = 0.2, name = "Tentakel2" },
				{ shape = "Cylinder", size = { 1.3, 0.3, 0.3 }, offset = { -0.7, -1.2, 0.6 }, rot = { 0, 0, 90 }, color = { 170, 140, 240 }, transparency = 0.2, name = "Tentakel3" },
				{ shape = "Cylinder", size = { 1.3, 0.3, 0.3 }, offset = { 0.7, -1.2, 0.6 }, rot = { 0, 0, 90 }, color = { 170, 140, 240 }, transparency = 0.2, name = "Tentakel4" },
			},
		},
	},
	flossi = {
		name = "Flossi", typ = "Wasser",
		desc = "Hüpft erstaunlich weit für einen Fisch.",
		base = { hp = 46, atk = 52, def = 42, spd = 60 },
		learnset = { { 1, "tackle" }, { 1, "wasserspritzer" }, { 9, "blubbstrahl" }, { 16, "aquawelle" } },
		build = {
			body = { shape = "Ball", size = { 1.7, 1.6, 2.5 }, color = { 240, 140, 60 } },
			legs = 0,
			parts = {
				{ shape = "Wedge", size = { 0.4, 1.1, 1.0 }, offset = { 0, 1.2, 0.3 }, color = { 250, 170, 90 }, name = "Rueckenflosse" },
				{ shape = "Wedge", size = { 0.35, 1.3, 1.1 }, offset = { 0, 0.2, 1.7 }, rot = { 0, 180, 0 }, color = { 250, 170, 90 }, name = "Schwanzflosse" },
				{ shape = "Wedge", size = { 0.25, 0.6, 0.7 }, offset = { -1.0, -0.2, -0.3 }, rot = { 0, 0, -40 }, color = { 250, 170, 90 }, name = "FlosseL" },
				{ shape = "Wedge", size = { 0.25, 0.6, 0.7 }, offset = { 1.0, -0.2, -0.3 }, rot = { 0, 0, 40 }, color = { 250, 170, 90 }, name = "FlosseR" },
			},
		},
	},
	pilzli = {
		name = "Pilzli", typ = "Pflanze",
		desc = "Versteckt sich gern zwischen echten Pilzen.",
		base = { hp = 56, atk = 54, def = 56, spd = 38 },
		learnset = { { 1, "blattschuss" }, { 8, "rankenschlag" }, { 15, "blattklinge" } },
		build = {
			body = { shape = "Cylinder", size = { 1.4, 1.5, 1.5 }, rot = { 0, 0, 90 }, color = { 235, 220, 190 } },
			legs = 2, legHeight = 0.4,
			parts = {
				{ shape = "Ball", size = { 2.6, 1.2, 2.6 }, offset = { 0, 1.1, 0 }, color = { 200, 60, 60 }, name = "Kappe" },
				{ shape = "Ball", size = { 0.5, 0.3, 0.5 }, offset = { -0.7, 1.6, -0.5 }, color = { 250, 245, 235 }, name = "Punkt1" },
				{ shape = "Ball", size = { 0.5, 0.3, 0.5 }, offset = { 0.6, 1.6, 0.4 }, color = { 250, 245, 235 }, name = "Punkt2" },
				{ shape = "Ball", size = { 0.4, 0.25, 0.4 }, offset = { 0.1, 1.75, -0.2 }, color = { 250, 245, 235 }, name = "Punkt3" },
			},
		},
	},
	dorni = {
		name = "Dorni", typ = "Pflanze",
		desc = "Ein wandelnder Kaktus. Bitte nicht umarmen.",
		base = { hp = 55, atk = 60, def = 62, spd = 35 },
		learnset = { { 1, "kratzer" }, { 1, "blattschuss" }, { 9, "rankenschlag" }, { 16, "blattklinge" } },
		build = {
			body = { shape = "Cylinder", size = { 2.0, 1.7, 1.7 }, rot = { 0, 0, 90 }, color = { 90, 170, 70 } },
			legs = 2, legHeight = 0.45,
			parts = {
				{ shape = "Cylinder", size = { 1.0, 0.55, 0.55 }, offset = { -1.1, 0.5, 0 }, rot = { 0, 0, 60 }, color = { 90, 170, 70 }, name = "ArmL" },
				{ shape = "Cylinder", size = { 1.0, 0.55, 0.55 }, offset = { 1.1, 0.5, 0 }, rot = { 0, 0, -60 }, color = { 90, 170, 70 }, name = "ArmR" },
				{ shape = "Ball", size = { 0.7, 0.5, 0.7 }, offset = { 0, 1.3, 0 }, color = { 245, 130, 180 }, name = "Bluete" },
				{ shape = "Wedge", size = { 0.2, 0.4, 0.2 }, offset = { -0.6, 0.9, -0.6 }, color = { 240, 245, 230 }, name = "Dorn1" },
				{ shape = "Wedge", size = { 0.2, 0.4, 0.2 }, offset = { 0.6, 0.9, 0.5 }, color = { 240, 245, 230 }, name = "Dorn2" },
			},
		},
	},
	glutmops = {
		name = "Glutmops", typ = "Feuer",
		desc = "Schnauft kleine Rauchwölkchen, wenn er rennt.",
		base = { hp = 60, atk = 64, def = 48, spd = 55 },
		learnset = { { 1, "tackle" }, { 1, "funkenregen" }, { 9, "glutbiss" }, { 16, "flammenwerfer" } },
		build = {
			body = { shape = "Ball", size = { 2.1, 1.8, 2.3 }, color = { 130, 75, 50 } },
			head = { size = 1.6, offset = { 0, 0.9, -1.2 }, color = { 145, 85, 60 } },
			legs = 4, legHeight = 0.6,
			parts = {
				{ shape = "Ball", size = { 0.6, 0.6, 0.3 }, offset = { -0.65, 1.7, -1.2 }, color = { 110, 60, 40 }, name = "OhrL" },
				{ shape = "Ball", size = { 0.6, 0.6, 0.3 }, offset = { 0.65, 1.7, -1.2 }, color = { 110, 60, 40 }, name = "OhrR" },
				{ shape = "Ball", size = { 0.8, 0.7, 0.7 }, offset = { 0, 0.5, -2.0 }, color = { 90, 50, 35 }, name = "Schnauze" },
				{ shape = "Ball", size = { 0.55, 0.55, 0.55 }, offset = { 0, 0.8, 1.5 }, color = { 255, 140, 30 }, material = "Neon", name = "Glutschwanz" },
			},
		},
	},
	brockel = {
		name = "Brockel", typ = "Normal",
		desc = "Sieht aus wie ein Stein. Ist auch fast einer.",
		base = { hp = 62, atk = 55, def = 75, spd = 30 },
		learnset = { { 1, "tackle" }, { 7, "kratzer" }, { 12, "koerperwurf" }, { 18, "hyperschlag" } },
		build = {
			body = { shape = "Block", size = { 2.3, 1.9, 2.3 }, color = { 135, 135, 135 }, material = "Slate" },
			legs = 4, legHeight = 0.5,
			parts = {
				{ shape = "Ball", size = { 1.4, 0.4, 1.4 }, offset = { 0, 1.05, 0.2 }, color = { 100, 160, 80 }, name = "Moos" },
				{ shape = "Block", size = { 0.7, 0.5, 0.6 }, offset = { -0.9, 1.05, -0.6 }, rot = { 15, 20, 0 }, color = { 120, 120, 120 }, material = "Slate", name = "Brocken" },
			},
		},
	},
}

GameData.Starters = { "flarix", "aquani", "sproessli" }

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

-- Hohes Gras: { x1, z1, x2, z2, route }
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

function GameData.XpGain(enemyLevel, isTrainer)
	local gain = enemyLevel * 12
	if isTrainer then
		gain = math.floor(gain * 1.3)
	end
	return gain
end

-- Fangchance: besser bei wenig KP, etwas schwerer bei hohem Level
function GameData.CatchChance(level, hpFrac)
	local c = (0.8 - 0.62 * hpFrac) * (1.05 - level * 0.008)
	if c < 0.05 then c = 0.05 end
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
