-- ============================================================
-- VOXEL-MONSTERFABRIK
-- Baut Monster im Kloetzchen-Stil (wie aus Bausteinen):
-- viele kleine Wuerfel, leuchtende Augen, Flammen/Kristalle/
-- Blitze als Neon-Teile. Jede Art sieht immer gleich aus
-- (fester Zufalls-Seed pro Art).
--
-- Bauplan (GameData.Species[x].build):
--   archetype = "quad" / "biped" / "blob" / "serpent" / "bird"
--   size      = Gesamtgroesse (1 = normal)
--   primary/secondary/accent/eyes = Farben {r,g,b}
--   ears = "spitz"/"rund"/"lang", horns = 0/1/2, mane = true,
--   snout = true, hut = {r,g,b} (Pilzkappe),
--   tail = "keule"/"flamme"/"blitz"/"flosse"/"kristall",
--   wings = "brick"/"flamme"/"kristall",
--   back = "spikes"/"kristalle"/"flammen"/"blaetter",
--   tentakel = true, translucent = 0..1, material = "Slate",
--   groundClearance = Studs ueber dem Boden
-- ============================================================

local GameData = require(script.Parent:WaitForChild("GameData"))

local MonsterFactory = {}

local GRID = 0.35 -- Kloetzchen-Rastermass

local function c3(rgb)
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

local function seedFor(speciesId)
	local seed = 0
	for i = 1, #speciesId do
		seed = seed + string.byte(speciesId, i) * i * 31
	end
	return seed
end

-- Groesse auf das Kloetzchen-Raster runden
local function qsize(size)
	local function q(v)
		return math.max(GRID, math.floor(v / GRID + 0.5) * GRID)
	end
	return Vector3.new(q(size.X), q(size.Y), q(size.Z))
end

-- Farbe leicht variieren (verschiedene "Steine")
local function vary(color, rng, amount)
	local f = rng:NextNumber(-amount, amount)
	if f >= 0 then
		return color:Lerp(Color3.new(1, 1, 1), f)
	end
	return color:Lerp(Color3.new(0, 0, 0), -f)
end

-- ---------- Grundbausteine ----------

local function brick(ctx, cf, size, color, material, transparency)
	local part = Instance.new("Part")
	part.Size = qsize(size)
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.Transparency = transparency or 0
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CanCollide = false
	part.CanQuery = false
	part.CastShadow = true
	part.Name = "Stein"
	part.CFrame = cf
	part.Parent = ctx.model
	part.Anchored = false
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = ctx.root
	weld.Part1 = part
	weld.Parent = ctx.root
	return part
end

-- Klotz: Kernblock + "Noppen"-Wuerfel fuer den Baustein-Look
local function chunk(ctx, offset, size, color, opts)
	opts = opts or {}
	local rng = ctx.rng
	local material = opts.material or ctx.material
	local transparency = opts.transparency or ctx.translucent
	local core = brick(ctx, CFrame.new(offset), size, color, material, transparency)
	local s = qsize(size)
	local area = s.X * s.Y + s.Y * s.Z + s.X * s.Z
	local bumps = opts.bumps or math.min(12, math.max(4, math.floor(area * 0.5)))
	for _ = 1, bumps do
		local bs = GRID * rng:NextInteger(1, 2)
		local axis = rng:NextInteger(1, 3)
		local sign = rng:NextInteger(0, 1) * 2 - 1
		local half = Vector3.new(s.X / 2, s.Y / 2, s.Z / 2)
		local function grid(v)
			return math.floor(v / GRID + 0.5) * GRID
		end
		local px, py, pz
		if axis == 1 then
			px = sign * (half.X + bs * 0.2)
			py = grid(rng:NextNumber(-half.Y + bs / 2, half.Y - bs / 2))
			pz = grid(rng:NextNumber(-half.Z + bs / 2, half.Z - bs / 2))
		elseif axis == 2 then
			px = grid(rng:NextNumber(-half.X + bs / 2, half.X - bs / 2))
			py = sign * (half.Y + bs * 0.2)
			pz = grid(rng:NextNumber(-half.Z + bs / 2, half.Z - bs / 2))
		else
			px = grid(rng:NextNumber(-half.X + bs / 2, half.X - bs / 2))
			py = grid(rng:NextNumber(-half.Y + bs / 2, half.Y - bs / 2))
			pz = sign * (half.Z + bs * 0.2)
		end
		brick(ctx, CFrame.new(offset + Vector3.new(px, py, pz)), Vector3.new(bs, bs, bs), vary(color, rng, 0.09), material, transparency)
	end
	return core
end

-- Kette aus kleiner werdenden Wuerfeln (Schwaenze, Flammen)
local function cubeChain(ctx, startOffset, dir, sizes, color, material, zigzag)
	local pos = startOffset
	for i, cs in ipairs(sizes) do
		local wobble = Vector3.new(0, 0, 0)
		if zigzag then
			wobble = Vector3.new(0, (i % 2 == 0) and cs * 0.6 or -cs * 0.2, 0)
		end
		brick(ctx, CFrame.new(pos + wobble), Vector3.new(cs, cs, cs), color, material)
		pos = pos + dir * (cs * 0.95)
	end
end

-- ---------- Gesicht ----------

local function addFace(ctx, p, headOffset, headSize)
	local eyeSize = math.max(GRID, headSize * 0.22)
	local eyeColor = p.eyes and c3(p.eyes) or Color3.fromRGB(255, 255, 255)
	for _, side in ipairs({ -1, 1 }) do
		brick(ctx,
			CFrame.new(headOffset + Vector3.new(side * headSize * 0.26, headSize * 0.12, -(headSize / 2 + eyeSize * 0.15))),
			Vector3.new(eyeSize, eyeSize, eyeSize), eyeColor, Enum.Material.Neon)
	end
	if p.snout then
		brick(ctx,
			CFrame.new(headOffset + Vector3.new(0, -headSize * 0.18, -(headSize / 2 + headSize * 0.2))),
			Vector3.new(headSize * 0.5, headSize * 0.32, headSize * 0.42),
			vary(c3(p.primary), ctx.rng, -0.12), ctx.material)
	end
end

-- ---------- Extras (Ohren, Hoerner, Schwaenze, ...) ----------

local function addEars(ctx, p, headOffset, headSize)
	if not p.ears then return end
	local color = c3(p.secondary or p.primary)
	for _, side in ipairs({ -1, 1 }) do
		local x = side * headSize * 0.32
		if p.ears == "spitz" then
			brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.58, 0)), Vector3.new(GRID * 2, GRID * 2, GRID * 2), color, ctx.material)
			brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.58 + GRID * 1.8, 0)), Vector3.new(GRID, GRID, GRID), color, ctx.material)
		elseif p.ears == "rund" then
			brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.6, 0)), Vector3.new(GRID * 2, GRID * 2, GRID), color, ctx.material)
		elseif p.ears == "lang" then
			for i = 0, 2 do
				local shrink = (i == 2) and GRID or GRID * 2
				brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.55 + i * GRID * 1.9, 0)), Vector3.new(shrink, GRID * 2, shrink), color, ctx.material)
			end
		end
	end
end

local function addHorns(ctx, p, headOffset, headSize)
	local n = p.horns or 0
	if n <= 0 then return end
	local accent = c3(p.accent or p.primary)
	local positions = (n == 1) and { 0 } or { -headSize * 0.28, headSize * 0.28 }
	for _, x in ipairs(positions) do
		brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.62, -headSize * 0.1)), Vector3.new(GRID * 1.6, GRID * 2, GRID * 1.6), accent, Enum.Material.Neon)
		brick(ctx, CFrame.new(headOffset + Vector3.new(x, headSize * 0.62 + GRID * 1.9, -headSize * 0.1)), Vector3.new(GRID, GRID * 1.4, GRID), accent, Enum.Material.Neon)
	end
end

local function addHut(ctx, p, headOffset, headSize)
	if not p.hut then return end
	local hutColor = c3(p.hut)
	chunk(ctx, headOffset + Vector3.new(0, headSize * 0.62, 0), Vector3.new(headSize * 1.9, headSize * 0.45, headSize * 1.9), hutColor, { bumps = 6 })
	local rng = ctx.rng
	for _ = 1, 3 do
		brick(ctx,
			CFrame.new(headOffset + Vector3.new(rng:NextNumber(-headSize * 0.6, headSize * 0.6), headSize * 0.88, rng:NextNumber(-headSize * 0.6, headSize * 0.6))),
			Vector3.new(GRID * 1.5, GRID, GRID * 1.5), Color3.fromRGB(250, 245, 235))
	end
end

local function addMane(ctx, p, neckOffset, radius)
	if not p.mane then return end
	local color = c3(p.secondary or p.primary)
	for i = 0, 7 do
		local ang = i / 8 * math.pi * 2
		brick(ctx,
			CFrame.new(neckOffset + Vector3.new(math.cos(ang) * radius, math.sin(ang) * radius * 0.8, 0)),
			Vector3.new(GRID * 2, GRID * 2, GRID * 1.4), vary(color, ctx.rng, 0.08), ctx.material)
	end
end

local function addBack(ctx, p, bodyTopY, bodyLen)
	if not p.back then return end
	local accent = c3(p.accent or p.primary)
	local secondary = c3(p.secondary or p.primary)
	for i = -1, 1 do
		local z = i * bodyLen * 0.26
		if p.back == "spikes" then
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID, z)), Vector3.new(GRID * 2, GRID * 2, GRID * 2), secondary, ctx.material)
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID * 2.8, z)), Vector3.new(GRID, GRID * 1.6, GRID), secondary, ctx.material)
		elseif p.back == "kristalle" then
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID * 1.6, z)) * CFrame.Angles(0, math.rad(45), math.rad(45)),
				Vector3.new(GRID * 2, GRID * 3, GRID * 2), accent, Enum.Material.Neon, 0.15)
		elseif p.back == "flammen" then
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID * 1.4, z)), Vector3.new(GRID * 2, GRID * 2.4, GRID * 2), accent, Enum.Material.Neon)
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID * 3.4, z)), Vector3.new(GRID, GRID * 1.4, GRID), vary(accent, ctx.rng, 0.15), Enum.Material.Neon)
		elseif p.back == "blaetter" then
			brick(ctx, CFrame.new(Vector3.new(0, bodyTopY + GRID, z)), Vector3.new(GRID * 4, GRID, GRID * 3), secondary, Enum.Material.Grass)
		end
	end
end

local function addWings(ctx, p, bodyTopY, bodyW)
	if not p.wings then return end
	local color, material, transparency
	if p.wings == "flamme" then
		color = c3(p.accent or p.primary)
		material = Enum.Material.Neon
	elseif p.wings == "kristall" then
		color = c3(p.accent or p.primary)
		material = Enum.Material.Neon
		transparency = 0.35
	else
		color = c3(p.secondary or p.primary)
		material = ctx.material
	end
	for _, side in ipairs({ -1, 1 }) do
		local x = side * (bodyW / 2 + GRID)
		brick(ctx, CFrame.new(Vector3.new(x + side * 0.5, bodyTopY - GRID, 0)) * CFrame.Angles(0, 0, side * math.rad(-20)),
			Vector3.new(GRID * 5, GRID, GRID * 3.4), color, material, transparency)
		brick(ctx, CFrame.new(Vector3.new(x + side * 1.5, bodyTopY + GRID * 1.2, 0.2)) * CFrame.Angles(0, 0, side * math.rad(-32)),
			Vector3.new(GRID * 3.4, GRID, GRID * 2.4), vary(color, ctx.rng, 0.1), material, transparency)
	end
end

local function addTail(ctx, p, backZ, tailY)
	if not p.tail then return end
	local accent = c3(p.accent or p.primary)
	local secondary = c3(p.secondary or p.primary)
	local start = Vector3.new(0, tailY, backZ + GRID)
	if p.tail == "flamme" then
		cubeChain(ctx, start, Vector3.new(0, 0.35, 1).Unit, { GRID * 2.4, GRID * 1.8, GRID * 1.2 }, accent, Enum.Material.Neon)
	elseif p.tail == "blitz" then
		cubeChain(ctx, start, Vector3.new(0, 0.2, 1).Unit, { GRID * 2, GRID * 1.6, GRID * 1.4 }, accent, Enum.Material.Neon, true)
	elseif p.tail == "keule" then
		cubeChain(ctx, start, Vector3.new(0, 0.15, 1).Unit, { GRID * 2, GRID * 1.6, GRID * 2.2 }, secondary, ctx.material)
	elseif p.tail == "flosse" then
		brick(ctx, CFrame.new(start + Vector3.new(0, 0, GRID * 1.4)), Vector3.new(GRID, GRID * 3.4, GRID * 2.6), secondary, ctx.material)
	elseif p.tail == "kristall" then
		brick(ctx, CFrame.new(start + Vector3.new(0, 0.1, GRID * 1.2)) * CFrame.Angles(math.rad(35), 0, math.rad(45)),
			Vector3.new(GRID * 2, GRID * 3, GRID * 2), accent, Enum.Material.Neon, 0.15)
	end
end

local function addTentakel(ctx, p, bodyBottomY, bodyW)
	if not p.tentakel then return end
	local color = vary(c3(p.primary), ctx.rng, -0.05)
	for _, pos in ipairs({ { -bodyW * 0.3, -bodyW * 0.25 }, { bodyW * 0.3, -bodyW * 0.25 }, { -bodyW * 0.3, bodyW * 0.25 }, { bodyW * 0.3, bodyW * 0.25 } }) do
		for i = 0, 2 do
			brick(ctx, CFrame.new(Vector3.new(pos[1], bodyBottomY - GRID - i * GRID * 1.7, pos[2])),
				Vector3.new(GRID * (2 - i * 0.4), GRID * 1.8, GRID * (2 - i * 0.4)), color, ctx.material, ctx.translucent)
		end
	end
end

-- Legendaere: schwebende Leucht-Wuerfel + Licht
local function addAura(ctx, p, bodyTopY, radius)
	local accent = c3(p.accent or p.primary)
	for i = 0, 5 do
		local ang = i / 6 * math.pi * 2
		brick(ctx,
			CFrame.new(Vector3.new(math.cos(ang) * radius, bodyTopY + 0.4 + math.sin(ang * 2) * 0.5, math.sin(ang) * radius)) * CFrame.Angles(0, ang, math.rad(45)),
			Vector3.new(GRID * 1.4, GRID * 1.4, GRID * 1.4), accent, Enum.Material.Neon, 0.3)
	end
	local light = Instance.new("PointLight")
	light.Color = accent
	light.Range = 14
	light.Brightness = 1.4
	light.Parent = ctx.root
end

-- ---------- Koerperbau-Typen ----------

local function buildQuad(ctx, p, s)
	local bodyLen, bodyH, bodyW = 2.7 * s, 1.6 * s, 1.7 * s
	local legH = 0.85 * s
	chunk(ctx, Vector3.new(0, 0, 0), Vector3.new(bodyW, bodyH, bodyLen), c3(p.primary))
	local legColor = vary(c3(p.secondary or p.primary), ctx.rng, -0.1)
	for _, pos in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		chunk(ctx, Vector3.new(pos[1] * bodyW * 0.33, -(bodyH / 2 + legH / 2 - 0.1 * s), pos[2] * bodyLen * 0.32),
			Vector3.new(0.55 * s, legH, 0.55 * s), legColor, { bumps = 2 })
	end
	local headSize = 1.35 * s
	local headOffset = Vector3.new(0, bodyH * 0.42 + headSize * 0.2, -(bodyLen / 2 + headSize * 0.28))
	chunk(ctx, headOffset, Vector3.new(headSize, headSize, headSize), vary(c3(p.primary), ctx.rng, 0.05), { bumps = 6 })
	addFace(ctx, p, headOffset, headSize)
	addEars(ctx, p, headOffset, headSize)
	addHorns(ctx, p, headOffset, headSize)
	addHut(ctx, p, headOffset, headSize)
	addMane(ctx, p, Vector3.new(0, bodyH * 0.3, -(bodyLen / 2 - 0.15 * s)), bodyW * 0.6)
	addBack(ctx, p, bodyH / 2, bodyLen)
	addWings(ctx, p, bodyH / 2, bodyW)
	addTail(ctx, p, bodyLen / 2, bodyH * 0.15)
	return Vector3.new(bodyW, bodyH, bodyLen), bodyH / 2 + legH - 0.1 * s
end

local function buildBiped(ctx, p, s)
	local bodyW, bodyH, bodyD = 1.6 * s, 2.0 * s, 1.3 * s
	local legH = 0.6 * s
	chunk(ctx, Vector3.new(0, 0, 0), Vector3.new(bodyW, bodyH, bodyD), c3(p.primary))
	local legColor = vary(c3(p.secondary or p.primary), ctx.rng, -0.1)
	for _, side in ipairs({ -1, 1 }) do
		chunk(ctx, Vector3.new(side * bodyW * 0.28, -(bodyH / 2 + legH / 2 - 0.08 * s), 0), Vector3.new(0.5 * s, legH, 0.5 * s), legColor, { bumps = 1 })
		brick(ctx, CFrame.new(Vector3.new(side * (bodyW / 2 + GRID * 0.8), bodyH * 0.12, 0)), Vector3.new(GRID * 1.6, GRID * 2.6, GRID * 1.6), legColor, ctx.material)
	end
	local headSize = 1.25 * s
	local headOffset = Vector3.new(0, bodyH / 2 + headSize * 0.42, -bodyD * 0.1)
	chunk(ctx, headOffset, Vector3.new(headSize, headSize, headSize), vary(c3(p.primary), ctx.rng, 0.05), { bumps = 5 })
	addFace(ctx, p, headOffset, headSize)
	addEars(ctx, p, headOffset, headSize)
	addHorns(ctx, p, headOffset, headSize)
	addHut(ctx, p, headOffset, headSize)
	addBack(ctx, p, bodyH / 2 + headSize * 0.1, bodyD * 1.4)
	addWings(ctx, p, bodyH * 0.25, bodyW)
	addTail(ctx, p, bodyD / 2, -bodyH * 0.2)
	return Vector3.new(bodyW, bodyH, bodyD), bodyH / 2 + legH - 0.08 * s
end

local function buildBlob(ctx, p, s)
	local bodyW, bodyH, bodyD = 2.1 * s, 1.7 * s, 2.1 * s
	chunk(ctx, Vector3.new(0, 0, 0), Vector3.new(bodyW, bodyH, bodyD), c3(p.primary), { bumps = 12 })
	if not p.tentakel then
		local footColor = vary(c3(p.secondary or p.primary), ctx.rng, -0.1)
		for _, side in ipairs({ -1, 1 }) do
			brick(ctx, CFrame.new(Vector3.new(side * bodyW * 0.3, -(bodyH / 2), -bodyD * 0.2)), Vector3.new(GRID * 2, GRID, GRID * 2.4), footColor, ctx.material)
		end
	end
	local faceOffset = Vector3.new(0, bodyH * 0.12, 0)
	addFace(ctx, p, faceOffset, bodyW * 0.9)
	addEars(ctx, p, Vector3.new(0, bodyH * 0.2, 0), bodyW * 0.75)
	addHorns(ctx, p, Vector3.new(0, bodyH * 0.2, 0), bodyW * 0.75)
	addHut(ctx, p, Vector3.new(0, bodyH * 0.18, 0), bodyW * 0.72)
	addBack(ctx, p, bodyH / 2, bodyD)
	addWings(ctx, p, bodyH * 0.3, bodyW)
	addTail(ctx, p, bodyD / 2, 0)
	addTentakel(ctx, p, -bodyH / 2, bodyW)
	local clearance = p.tentakel and (GRID * 6) or 0
	return Vector3.new(bodyW, bodyH, bodyD), bodyH / 2 + GRID + clearance
end

local function buildSerpent(ctx, p, s)
	local segs = {
		{ Vector3.new(1.7 * s, 1.5 * s, 1.8 * s), Vector3.new(0, 0, 0) },
		{ Vector3.new(1.5 * s, 1.3 * s, 1.6 * s), Vector3.new(0, -0.05 * s, 1.6 * s) },
		{ Vector3.new(1.2 * s, 1.05 * s, 1.4 * s), Vector3.new(0, -0.15 * s, 3.0 * s) },
		{ Vector3.new(0.9 * s, 0.8 * s, 1.2 * s), Vector3.new(0, -0.25 * s, 4.2 * s) },
	}
	for _, seg in ipairs(segs) do
		chunk(ctx, seg[2], seg[1], c3(p.primary), { bumps = 6 })
	end
	local headSize = 1.5 * s
	local headOffset = Vector3.new(0, 0.75 * s, -(1.8 * s / 2 + headSize * 0.3))
	chunk(ctx, headOffset, Vector3.new(headSize, headSize, headSize), vary(c3(p.primary), ctx.rng, 0.06), { bumps = 6 })
	addFace(ctx, p, headOffset, headSize)
	addEars(ctx, p, headOffset, headSize)
	addHorns(ctx, p, headOffset, headSize)
	addMane(ctx, p, Vector3.new(0, 0.5 * s, -0.9 * s), 1.0 * s)
	addBack(ctx, p, 0.75 * s, 3.4 * s)
	addWings(ctx, p, 0.6 * s, 1.7 * s)
	addTail(ctx, p, 4.8 * s, -0.25 * s)
	return Vector3.new(1.7 * s, 1.5 * s, 5.4 * s), 0.75 * s
end

local function buildBird(ctx, p, s)
	local bodyW, bodyH, bodyD = 1.6 * s, 1.5 * s, 2.0 * s
	local legH = 0.55 * s
	chunk(ctx, Vector3.new(0, 0, 0), Vector3.new(bodyW, bodyH, bodyD), c3(p.primary), { bumps = 8 })
	local legColor = Color3.fromRGB(90, 75, 55)
	for _, side in ipairs({ -1, 1 }) do
		brick(ctx, CFrame.new(Vector3.new(side * bodyW * 0.25, -(bodyH / 2 + legH / 2), 0)), Vector3.new(GRID, legH, GRID), legColor)
		brick(ctx, CFrame.new(Vector3.new(side * bodyW * 0.25, -(bodyH / 2 + legH), -GRID)), Vector3.new(GRID * 1.6, GRID * 0.8, GRID * 2), legColor)
	end
	local headSize = 1.1 * s
	local headOffset = Vector3.new(0, bodyH / 2 + headSize * 0.3, -(bodyD / 2 - headSize * 0.1))
	chunk(ctx, headOffset, Vector3.new(headSize, headSize, headSize), vary(c3(p.primary), ctx.rng, 0.06), { bumps = 4 })
	addFace(ctx, p, headOffset, headSize)
	-- Schnabel
	brick(ctx, CFrame.new(headOffset + Vector3.new(0, -headSize * 0.05, -(headSize / 2 + GRID))),
		Vector3.new(GRID * 1.4, GRID, GRID * 2), c3(p.accent or { 255, 190, 60 }), ctx.material)
	addHorns(ctx, p, headOffset, headSize)
	-- Fluegel gibt es bei Voegeln immer
	if not p.wings then
		p = setmetatable({ wings = "brick" }, { __index = p })
	end
	addWings(ctx, p, bodyH * 0.3, bodyW)
	addBack(ctx, p, bodyH / 2, bodyD)
	-- Schwanzfedern
	local featherColor = c3(p.secondary or p.primary)
	for i = -1, 1 do
		brick(ctx, CFrame.new(Vector3.new(i * GRID * 1.3, bodyH * 0.1, bodyD / 2 + GRID * 1.4)) * CFrame.Angles(math.rad(-18), 0, 0),
			Vector3.new(GRID, GRID * 0.8, GRID * 3), vary(featherColor, ctx.rng, 0.1), ctx.material)
	end
	addTail(ctx, p, bodyD / 2, bodyH * 0.1)
	return Vector3.new(bodyW, bodyH, bodyD), bodyH / 2 + legH + GRID * 0.8
end

local ARCHETYPES = {
	quad = buildQuad,
	biped = buildBiped,
	blob = buildBlob,
	serpent = buildSerpent,
	bird = buildBird,
}

-- ---------- Oeffentliche API ----------

function MonsterFactory.Create(speciesId, scaleMul)
	local sp = GameData.Species[speciesId]
	local p = sp.build
	local s = (p.size or 1) * (scaleMul or 1)

	local model = Instance.new("Model")
	model.Name = sp.name

	-- Unsichtbare Wurzel (wird nach dem Bau passend dimensioniert)
	local root = Instance.new("Part")
	root.Name = "Rumpf"
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = true
	root.Size = Vector3.new(1, 1, 1)
	root.CFrame = CFrame.new(0, 0, 0)
	root.Parent = model
	model.PrimaryPart = root

	local ctx = {
		model = model,
		root = root,
		rng = Random.new(seedFor(speciesId)),
		material = p.material and Enum.Material[p.material] or Enum.Material.SmoothPlastic,
		translucent = p.translucent,
	}

	local builder = ARCHETYPES[p.archetype] or buildQuad
	local bodySize, rootHeight = builder(ctx, p, s)

	root.Size = qsize(bodySize)

	if sp.legendary then
		addAura(ctx, p, bodySize.Y / 2, math.max(bodySize.X, bodySize.Z) * 0.75)
	end

	if p.groundClearance then
		rootHeight = rootHeight + p.groundClearance * s
	end
	model:SetAttribute("RootHeight", rootHeight)
	model:SetAttribute("SpeciesId", speciesId)
	return model
end

-- Stellt das Monster auf den Boden, Blick Richtung "lookAt"
function MonsterFactory.PlaceOnGround(model, position, lookAt)
	local h = model:GetAttribute("RootHeight") or 1.5
	local pos = Vector3.new(position.X, position.Y + h, position.Z)
	local target = Vector3.new(lookAt.X, pos.Y, lookAt.Z)
	if (target - pos).Magnitude < 0.05 then
		target = pos + Vector3.new(0, 0, -1)
	end
	model:PivotTo(CFrame.lookAt(pos, target))
end

return MonsterFactory
