-- ============================================================
-- BRAIN WORDS - Zentrale Spieldaten
-- Typen, Attacken, alle Brain Words, Zonen und Balancing.
-- Hier kannst du eigene Brain Words hinzufuegen!
-- ============================================================

local GameData = {}

GameData.MAX_LEVEL = 50
GameData.TEAM_SIZE = 6
GameData.BOX_SIZE = 60

-- ========== TYPEN ==========
-- Jeder Typ schlaegt genau einen anderen Typ (doppelter Schaden)
-- und ist schwach gegen den Typ, der ihn schlaegt (halber Schaden).
-- Kreis: Laut > Schlau > Cool > Chaos > Suess > Gruselig > Laut

local BEATS = {
	["Laut"] = "Schlau",
	["Schlau"] = "Cool",
	["Cool"] = "Chaos",
	["Chaos"] = "Süß",
	["Süß"] = "Gruselig",
	["Gruselig"] = "Laut",
}

GameData.Types = { "Laut", "Schlau", "Cool", "Chaos", "Süß", "Gruselig" }

GameData.TypeColors = {
	["Laut"] = Color3.fromRGB(255, 130, 50),
	["Schlau"] = Color3.fromRGB(70, 140, 255),
	["Cool"] = Color3.fromRGB(0, 195, 215),
	["Chaos"] = Color3.fromRGB(215, 70, 220),
	["Süß"] = Color3.fromRGB(255, 115, 185),
	["Gruselig"] = Color3.fromRGB(125, 105, 170),
}

function GameData.TypeMultiplier(attackType, defenderType)
	if BEATS[attackType] == defenderType then
		return 2
	end
	if BEATS[defenderType] == attackType then
		return 0.5
	end
	return 1
end

-- ========== SELTENHEIT ==========
GameData.Rarities = {
	["Häufig"] = { order = 1, color = Color3.fromRGB(200, 200, 200), catchBase = 0.55, xpMult = 1.0 },
	["Mittel"] = { order = 2, color = Color3.fromRGB(110, 220, 110), catchBase = 0.40, xpMult = 1.2 },
	["Selten"] = { order = 3, color = Color3.fromRGB(90, 170, 255), catchBase = 0.25, xpMult = 1.5 },
	["Episch"] = { order = 4, color = Color3.fromRGB(205, 100, 255), catchBase = 0.15, xpMult = 2.0 },
	["Legendär"] = { order = 5, color = Color3.fromRGB(255, 200, 40), catchBase = 0.08, xpMult = 3.0 },
}

-- ========== ATTACKEN ==========
-- power 40 = Basis, 65 = mittel, 90 = stark
GameData.Moves = {
	-- Chaos
	memewurf = { name = "Meme-Wurf", typ = "Chaos", power = 40 },
	skibidisturm = { name = "Skibidi-Sturm", typ = "Chaos", power = 65 },
	totaleschaos = { name = "Totales Chaos", typ = "Chaos", power = 90 },
	-- Laut
	bruhruf = { name = "Bruh-Ruf", typ = "Laut", power = 40 },
	ohrenbetaeuber = { name = "Ohrenbetäuber", typ = "Laut", power = 65 },
	megaschrei = { name = "Mega-Schrei", typ = "Laut", power = 90 },
	-- Cool
	augenrollen = { name = "Augenrollen", typ = "Cool", power = 40 },
	eiskalterblick = { name = "Eiskalter Blick", typ = "Cool", power = 65 },
	sigmaschlag = { name = "Sigma-Schlag", typ = "Cool", power = 90 },
	-- Suess
	knuddelattacke = { name = "Knuddel-Attacke", typ = "Süß", power = 40 },
	zuckerschock = { name = "Zuckerschock", typ = "Süß", power = 65 },
	herzhurrikan = { name = "Herz-Hurrikan", typ = "Süß", power = 90 },
	-- Gruselig
	buh = { name = "Buh!", typ = "Gruselig", power = 40 },
	albtraum = { name = "Albtraum", typ = "Gruselig", power = 65 },
	ohioschock = { name = "Ohio-Schock", typ = "Gruselig", power = 90 },
	-- Schlau
	faktencheck = { name = "Faktencheck", typ = "Schlau", power = 40 },
	galaxybrain = { name = "Galaxy-Brain", typ = "Schlau", power = 65 },
	iqblitz = { name = "1000-IQ-Blitz", typ = "Schlau", power = 90 },
}

-- ========== BRAIN WORDS ==========
-- base = Grundwerte (hp, atk, def, spd), ca. 40 (schwach) bis 105 (legendaer)
-- learnset = { {Level, AttackenId}, ... } - die letzten 4 werden gekonnt
-- evolveLevel/evolveTo = Entwicklung
-- noWild = erscheint nicht in freier Wildbahn (Starter & Entwicklungen)
GameData.Species = {
	-- ===== STARTER =====
	sigma = {
		name = "Sigma", typ = "Cool", rarity = "Selten", noWild = true,
		desc = "Steht einfach nur cool rum und gewinnt trotzdem.",
		base = { hp = 58, atk = 60, def = 55, spd = 65 },
		learnset = { { 1, "augenrollen" }, { 1, "bruhruf" }, { 8, "eiskalterblick" }, { 16, "sigmaschlag" } },
		evolveLevel = 18, evolveTo = "gigasigma",
	},
	gigasigma = {
		name = "Giga-Sigma", typ = "Cool", rarity = "Episch", noWild = true,
		desc = "Das ultimative Vorbild. Grindset: aktiviert.",
		base = { hp = 80, atk = 84, def = 74, spd = 82 },
		learnset = { { 1, "augenrollen" }, { 1, "eiskalterblick" }, { 16, "sigmaschlag" }, { 24, "iqblitz" } },
	},
	skibidi = {
		name = "Skibidi", typ = "Chaos", rarity = "Selten", noWild = true,
		desc = "Singt ohne Pause dasselbe Lied. Niemand weiß, warum.",
		base = { hp = 62, atk = 62, def = 50, spd = 60 },
		learnset = { { 1, "memewurf" }, { 1, "buh" }, { 8, "skibidisturm" }, { 16, "totaleschaos" } },
		evolveLevel = 18, evolveTo = "megaskibidi",
	},
	megaskibidi = {
		name = "Mega-Skibidi", typ = "Chaos", rarity = "Episch", noWild = true,
		desc = "Jetzt mit noch mehr Ohrwurm. Hilfe.",
		base = { hp = 86, atk = 82, def = 66, spd = 76 },
		learnset = { { 1, "memewurf" }, { 1, "skibidisturm" }, { 16, "totaleschaos" }, { 24, "megaschrei" } },
	},
	slay = {
		name = "Slay", typ = "Süß", rarity = "Selten", noWild = true,
		desc = "Sieht immer perfekt aus. Immer. Sogar im Kampf.",
		base = { hp = 60, atk = 58, def = 58, spd = 62 },
		learnset = { { 1, "knuddelattacke" }, { 1, "augenrollen" }, { 8, "zuckerschock" }, { 16, "herzhurrikan" } },
		evolveLevel = 18, evolveTo = "slayqueen",
	},
	slayqueen = {
		name = "Slay-Queen", typ = "Süß", rarity = "Episch", noWild = true,
		desc = "Regiert den Laufsteg UND das Schlachtfeld.",
		base = { hp = 82, atk = 78, def = 78, spd = 78 },
		learnset = { { 1, "knuddelattacke" }, { 1, "zuckerschock" }, { 16, "herzhurrikan" }, { 24, "sigmaschlag" } },
	},

	-- ===== HAEUFIG =====
	bruh = {
		name = "Bruh", typ = "Laut", rarity = "Häufig",
		desc = "Sagt nur ein einziges Wort. Das reicht völlig.",
		base = { hp = 45, atk = 50, def = 40, spd = 50 },
		learnset = { { 1, "bruhruf" }, { 6, "memewurf" }, { 12, "ohrenbetaeuber" } },
		evolveLevel = 14, evolveTo = "megabruh",
	},
	megabruh = {
		name = "Mega-Bruh", typ = "Laut", rarity = "Mittel", noWild = true,
		desc = "BRUH. In Großbuchstaben.",
		base = { hp = 66, atk = 70, def = 55, spd = 62 },
		learnset = { { 1, "bruhruf" }, { 1, "ohrenbetaeuber" }, { 20, "megaschrei" } },
	},
	sus = {
		name = "Sus", typ = "Gruselig", rarity = "Häufig",
		desc = "Verhält sich extrem verdächtig. Extrem.",
		base = { hp = 45, atk = 46, def = 46, spd = 52 },
		learnset = { { 1, "buh" }, { 6, "memewurf" }, { 12, "albtraum" } },
		evolveLevel = 16, evolveTo = "extremsus",
	},
	extremsus = {
		name = "Extrem-Sus", typ = "Gruselig", rarity = "Mittel", noWild = true,
		desc = "War definitiv nicht in der Lüftung. Definitiv.",
		base = { hp = 66, atk = 66, def = 62, spd = 66 },
		learnset = { { 1, "buh" }, { 1, "albtraum" }, { 20, "ohioschock" } },
	},
	yeet = {
		name = "Yeet", typ = "Laut", rarity = "Häufig",
		desc = "Wirft alles durch die Gegend. Auch sich selbst.",
		base = { hp = 42, atk = 55, def = 38, spd = 58 },
		learnset = { { 1, "bruhruf" }, { 8, "ohrenbetaeuber" }, { 18, "megaschrei" } },
	},
	npc = {
		name = "NPC", typ = "Schlau", rarity = "Häufig",
		desc = "Wiederholt denselben Satz. Für immer.",
		base = { hp = 50, atk = 42, def = 50, spd = 40 },
		learnset = { { 1, "faktencheck" }, { 8, "galaxybrain" }, { 14, "memewurf" } },
		evolveLevel = 20, evolveTo = "bossnpc",
	},
	bossnpc = {
		name = "Boss-NPC", typ = "Schlau", rarity = "Selten", noWild = true,
		desc = "Hat plötzlich einen eigenen Willen. Oh oh.",
		base = { hp = 76, atk = 70, def = 76, spd = 55 },
		learnset = { { 1, "faktencheck" }, { 1, "galaxybrain" }, { 22, "iqblitz" } },
	},

	-- ===== MITTEL =====
	cringe = {
		name = "Cringe", typ = "Gruselig", rarity = "Mittel",
		desc = "Tut weh, wenn man hinschaut. Bitte nicht hinschauen.",
		base = { hp = 55, atk = 60, def = 48, spd = 55 },
		learnset = { { 1, "buh" }, { 9, "albtraum" }, { 17, "ohioschock" } },
	},
	delulu = {
		name = "Delulu", typ = "Schlau", rarity = "Mittel",
		desc = "Lebt in seiner eigenen Welt. Und ist sehr glücklich dort.",
		base = { hp = 58, atk = 60, def = 50, spd = 55 },
		learnset = { { 1, "faktencheck" }, { 9, "galaxybrain" }, { 17, "iqblitz" } },
	},
	bussin = {
		name = "Bussin", typ = "Süß", rarity = "Mittel",
		desc = "Schmeckt angeblich unfassbar gut. Angeblich.",
		base = { hp = 62, atk = 55, def = 58, spd = 48 },
		learnset = { { 1, "knuddelattacke" }, { 9, "zuckerschock" }, { 17, "herzhurrikan" } },
	},
	mewing = {
		name = "Mewing", typ = "Cool", rarity = "Mittel",
		desc = "Redet nicht. Zeigt nur schweigend auf sein Kinn.",
		base = { hp = 56, atk = 58, def = 56, spd = 58 },
		learnset = { { 1, "augenrollen" }, { 9, "eiskalterblick" }, { 17, "sigmaschlag" } },
	},
	fanum = {
		name = "Fanum", typ = "Chaos", rarity = "Mittel",
		desc = "Nimmt sich einfach deine Pommes. Das ist die Steuer!",
		base = { hp = 58, atk = 62, def = 50, spd = 60 },
		learnset = { { 1, "memewurf" }, { 9, "skibidisturm" }, { 17, "totaleschaos" } },
	},

	-- ===== SELTEN =====
	tralalero = {
		name = "Tralalero", typ = "Chaos", rarity = "Selten",
		desc = "Trägt Turnschuhe und schwimmt trotzdem super schnell.",
		base = { hp = 70, atk = 72, def = 60, spd = 72 },
		learnset = { { 1, "memewurf" }, { 1, "augenrollen" }, { 10, "skibidisturm" }, { 18, "totaleschaos" } },
	},
	bombardiro = {
		name = "Bombardiro", typ = "Laut", rarity = "Selten",
		desc = "Fliegt vorbei und macht dabei SEHR viel Lärm.",
		base = { hp = 68, atk = 78, def = 58, spd = 66 },
		learnset = { { 1, "bruhruf" }, { 10, "ohrenbetaeuber" }, { 18, "megaschrei" } },
	},
	sahur = {
		name = "Tung-Sahur", typ = "Gruselig", rarity = "Selten",
		desc = "Klopft dreimal. Öffne niemals die Tür.",
		base = { hp = 72, atk = 70, def = 64, spd = 60 },
		learnset = { { 1, "buh" }, { 10, "albtraum" }, { 18, "ohioschock" } },
	},
	cappuccina = {
		name = "Cappuccina", typ = "Süß", rarity = "Selten",
		desc = "Tanzt Ballett und ist immer perfekt aufgeschäumt.",
		base = { hp = 66, atk = 64, def = 66, spd = 70 },
		learnset = { { 1, "knuddelattacke" }, { 10, "zuckerschock" }, { 18, "herzhurrikan" } },
	},
	rizzler = {
		name = "Rizzler", typ = "Cool", rarity = "Selten",
		desc = "Überzeugt jeden von allem. Einfach so.",
		base = { hp = 64, atk = 70, def = 58, spd = 76 },
		learnset = { { 1, "augenrollen" }, { 10, "eiskalterblick" }, { 18, "sigmaschlag" } },
	},

	-- ===== EPISCH =====
	ohio = {
		name = "Ohio", typ = "Gruselig", rarity = "Episch",
		desc = "Dort ist alles möglich. Leider wirklich ALLES.",
		base = { hp = 80, atk = 84, def = 70, spd = 68 },
		learnset = { { 1, "buh" }, { 1, "albtraum" }, { 14, "ohioschock" }, { 22, "totaleschaos" } },
	},
	goofy = {
		name = "Goofy", typ = "Chaos", rarity = "Episch",
		desc = "Zu albern, um besiegt zu werden.",
		base = { hp = 84, atk = 78, def = 72, spd = 64 },
		learnset = { { 1, "memewurf" }, { 1, "skibidisturm" }, { 14, "totaleschaos" }, { 22, "megaschrei" } },
	},

	-- ===== LEGENDAER =====
	aura = {
		name = "Aura", typ = "Cool", rarity = "Legendär",
		desc = "+10.000 Aura, nur weil es aufgetaucht ist.",
		base = { hp = 95, atk = 95, def = 85, spd = 95 },
		learnset = { { 1, "eiskalterblick" }, { 1, "galaxybrain" }, { 12, "sigmaschlag" }, { 20, "iqblitz" } },
	},
	lordbrainrot = {
		name = "Lord Brainrot", typ = "Chaos", rarity = "Legendär",
		desc = "Der König aller Brain Words. Fast unaufhaltbar.",
		base = { hp = 105, atk = 100, def = 90, spd = 85 },
		learnset = { { 1, "skibidisturm" }, { 1, "albtraum" }, { 12, "totaleschaos" }, { 20, "megaschrei" } },
	},
}

-- Starter zur Auswahl am Anfang
GameData.Starters = { "sigma", "skibidi", "slay" }

-- Reihenfolge im Brain-Dex
GameData.DexOrder = {
	"sigma", "gigasigma", "skibidi", "megaskibidi", "slay", "slayqueen",
	"bruh", "megabruh", "yeet", "sus", "extremsus", "npc", "bossnpc",
	"cringe", "delulu", "bussin", "mewing", "fanum",
	"tralalero", "bombardiro", "sahur", "cappuccina", "rizzler",
	"ohio", "goofy", "aura", "lordbrainrot",
}

-- ========== ZONEN ==========
GameData.Zones = {
	{
		id = "wiese", name = "Meme-Wiese",
		center = Vector3.new(120, 0, 0), radius = 70,
		levelMin = 2, levelMax = 6, maxActive = 7,
		color = Color3.fromRGB(140, 215, 100),
		pool = {
			{ "bruh", 28 }, { "yeet", 24 }, { "sus", 24 }, { "npc", 18 },
			{ "bussin", 7 }, { "mewing", 7 }, { "fanum", 5 }, { "rizzler", 2 },
		},
	},
	{
		id = "wald", name = "Chaos-Wald",
		center = Vector3.new(-120, 0, -50), radius = 75,
		levelMin = 5, levelMax = 12, maxActive = 7,
		color = Color3.fromRGB(70, 150, 90),
		pool = {
			{ "fanum", 20 }, { "mewing", 17 }, { "delulu", 17 }, { "bussin", 15 },
			{ "yeet", 12 }, { "cringe", 10 }, { "tralalero", 5 }, { "cappuccina", 4 }, { "goofy", 1 },
		},
	},
	{
		id = "grube", name = "Gruselgrube",
		center = Vector3.new(10, 0, -160), radius = 65,
		levelMin = 9, levelMax = 16, maxActive = 6,
		color = Color3.fromRGB(110, 90, 150),
		pool = {
			{ "sus", 16 }, { "cringe", 22 }, { "sahur", 14 }, { "delulu", 12 },
			{ "bombardiro", 12 }, { "npc", 10 }, { "ohio", 4 }, { "goofy", 2 },
		},
	},
	{
		id = "gipfel", name = "Legenden-Gipfel",
		center = Vector3.new(-40, 0, 170), radius = 62,
		levelMin = 14, levelMax = 24, maxActive = 5,
		color = Color3.fromRGB(235, 205, 120),
		pool = {
			{ "rizzler", 15 }, { "tralalero", 13 }, { "bombardiro", 13 }, { "sahur", 12 },
			{ "cappuccina", 12 }, { "cringe", 9 }, { "ohio", 7 }, { "goofy", 7 },
			{ "aura", 2 }, { "lordbrainrot", 1 },
		},
	},
}

-- ========== FORMELN ==========

-- Kampfwerte eines Brain Words auf einem bestimmten Level
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

-- Benoetigte EP fuer das naechste Level
function GameData.XpToNext(level)
	return 25 * level + 25
end

-- EP-Belohnung fuer einen besiegten/gefangenen Gegner
function GameData.XpGain(enemyLevel, rarityName)
	local r = GameData.Rarities[rarityName]
	return math.floor(enemyLevel * 10 * r.xpMult)
end

-- Fangchance (0..1): je weniger HP der Gegner hat, desto besser
function GameData.CatchChance(rarityName, hpFrac)
	local r = GameData.Rarities[rarityName]
	local c = r.catchBase * (1.65 - 1.3 * hpFrac)
	if c < 0.03 then c = 0.03 end
	if c > 0.95 then c = 0.95 end
	return c
end

-- Die (bis zu 4) Attacken, die ein Brain Word auf diesem Level kann
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

-- Neue Attacke, die GENAU auf diesem Level gelernt wird (oder nil)
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
