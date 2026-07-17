-- ============================================================
-- Baut die komplette Welt per Code - im VOXEL-STIL:
-- Wuerfel-Baeume, Ziegelwege, Backstein-Haeuser mit
-- Stufen-Daechern, leuchtenden Fenstern und Neon-Schildern,
-- Lattenzaeune, Routen mit hohem Gras, See mit Bruecke,
-- Tag/Nacht-Wechsel und moderne Licht-Effekte.
-- ============================================================

local Lighting = game:GetService("Lighting")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local MonsterFactory = require(Shared:WaitForChild("MonsterFactory"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local WorldBuilder = {}

local MAP_HALF = 450
local DAY_LENGTH = 480
local MUSIC_ID = 0 -- Eigene Musik? Audio-ID eintragen (0 = aus)

local rng = Random.new(1234567)
local folder = nil
local lamps = {}
local healRing = nil
local healLight = nil

WorldBuilder.PlazaSpawn = Vector3.new(10, 4, 20)

-- ---------- Helfer ----------

local function part(props, parent)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		p[k] = v
	end
	p.Parent = parent or folder
	return p
end

local function wedge(props, parent)
	local p = Instance.new("WedgePart")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		p[k] = v
	end
	p.Parent = parent or folder
	return p
end

local function uprightCyl(x, y, z)
	return CFrame.new(x, y, z) * CFrame.Angles(0, 0, math.rad(90))
end

local function c3(r, g, b)
	return Color3.fromRGB(r, g, b)
end

local function shade(color, amount)
	if amount >= 0 then
		return color:Lerp(Color3.new(1, 1, 1), amount)
	end
	return color:Lerp(Color3.new(0, 0, 0), -amount)
end

-- ---------- NPC-Figur ----------

function WorldBuilder.MakeNpc(opts)
	local model = Instance.new("Model")
	model.Name = opts.name
	local pos = opts.pos
	local face = opts.faceTo or Vector3.new(0, 0, 0)
	local base = CFrame.lookAt(Vector3.new(pos.X, 3.1, pos.Z), Vector3.new(face.X, 3.1, face.Z))

	local function np(props, cf)
		local p = part(props, model)
		p.CFrame = base * cf
		p.CanQuery = false
		return p
	end

	local shirt = opts.shirt or { 90, 120, 200 }
	local pants = c3(60, 60, 80)
	local skin = c3(245, 215, 180)

	np({ Size = Vector3.new(0.9, 2.0, 0.9), Color = pants, Name = "BeinL" }, CFrame.new(-0.55, -2.1, 0))
	np({ Size = Vector3.new(0.9, 2.0, 0.9), Color = pants, Name = "BeinR" }, CFrame.new(0.55, -2.1, 0))
	local torso = np({ Size = Vector3.new(2.2, 2.2, 1.1), Color = c3(shirt[1], shirt[2], shirt[3]), Name = "Torso" }, CFrame.new(0, 0, 0))
	np({ Size = Vector3.new(0.8, 2.0, 0.8), Color = c3(shirt[1], shirt[2], shirt[3]), Name = "ArmL" }, CFrame.new(-1.5, -0.1, 0))
	np({ Size = Vector3.new(0.8, 2.0, 0.8), Color = c3(shirt[1], shirt[2], shirt[3]), Name = "ArmR" }, CFrame.new(1.5, -0.1, 0))
	local head = np({ Shape = Enum.PartType.Ball, Size = Vector3.new(1.7, 1.7, 1.7), Color = skin, Name = "Kopf" }, CFrame.new(0, 1.95, 0))
	np({ Shape = Enum.PartType.Ball, Size = Vector3.new(1.75, 0.8, 1.75), Color = opts.hair and c3(opts.hair[1], opts.hair[2], opts.hair[3]) or c3(90, 60, 40), Name = "Haare" }, CFrame.new(0, 2.5, 0.1))
	np({ Shape = Enum.PartType.Ball, Size = Vector3.new(0.22, 0.22, 0.22), Color = c3(25, 25, 30), Name = "AugeL" }, CFrame.new(-0.32, 2.05, -0.75))
	np({ Shape = Enum.PartType.Ball, Size = Vector3.new(0.22, 0.22, 0.22), Color = c3(25, 25, 30), Name = "AugeR" }, CFrame.new(0.32, 2.05, -0.75))

	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromOffset(220, 40)
	billboard.StudsOffset = Vector3.new(0, 2.4, 0)
	billboard.MaxDistance = 90
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.Arcade
	label.TextScaled = true
	label.Text = opts.name
	label.TextColor3 = c3(255, 255, 255)
	label.TextStrokeTransparency = 0.15
	label.Parent = billboard
	billboard.Parent = head

	if opts.prompt then
		local prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = opts.prompt.action
		prompt.ObjectText = opts.name
		prompt.HoldDuration = 0.25
		prompt.MaxActivationDistance = 12
		prompt.RequiresLineOfSight = false
		prompt.Parent = torso
		prompt.Triggered:Connect(opts.prompt.callback)
	end

	model.Parent = folder
	return model
end

-- ---------- Ziegelwege ----------

local TAN = c3(206, 152, 96)

local function pathTile(x, z, size)
	part({
		Size = Vector3.new(size, 0.3, size),
		Color = shade(TAN, rng:NextNumber(-0.09, 0.06)),
		Material = Enum.Material.Brick,
		CanCollide = false, CanQuery = false, CanTouch = false,
		CFrame = CFrame.new(x, 0.1, z),
	})
end

-- Gerader Ziegelweg (Achse X oder Z), mit verstreuten Rand-Ziegeln
local function brickPath(x1, z1, x2, z2, width)
	local step = 4
	local tile = 3.7
	local alongX = math.abs(x2 - x1) >= math.abs(z2 - z1)
	local a1 = alongX and math.min(x1, x2) or math.min(z1, z2)
	local a2 = alongX and math.max(x1, x2) or math.max(z1, z2)
	local rows = math.max(1, math.floor(width / step))
	local mid = alongX and z1 or x1
	for a = a1, a2, step do
		for r = 0, rows - 1 do
			local off = mid + (r - (rows - 1) / 2) * step
			if alongX then
				pathTile(a, off, tile)
			else
				pathTile(off, a, tile)
			end
		end
		-- Verstreute Ziegel am Rand (wie im Vorbild)
		if rng:NextNumber() < 0.3 then
			local side = (rng:NextInteger(0, 1) * 2 - 1) * (rows / 2 + 0.7) * step
			if alongX then
				pathTile(a, mid + side, tile * 0.65)
			else
				pathTile(mid + side, a, tile * 0.65)
			end
		end
	end
end

-- ---------- Voxel-Deko ----------

local function makeTree(x, z)
	part({ Size = Vector3.new(1.8, 3.2, 1.8), Color = c3(122, 82, 52), CFrame = CFrame.new(x, 1.6, z) })
	part({ Size = Vector3.new(1.5, 2.6, 1.5), Color = c3(102, 68, 44), CanCollide = false, CanQuery = false, CFrame = CFrame.new(x, 4.4, z) })
	local baseGreen = c3(58 + rng:NextInteger(0, 26), 148 + rng:NextInteger(0, 42), 58 + rng:NextInteger(0, 22))
	local blocks = {
		{ 0, 7.2, 0, 5.6 },
		{ 2.4, 6.4, 1.0, 3.8 },
		{ -2.3, 6.7, -1.2, 3.4 },
		{ 1.0, 8.8, -0.6, 3.6 },
		{ -1.2, 6.2, 2.1, 3.1 },
		{ 0.4, 9.6, 1.2, 2.6 },
	}
	for _, o in ipairs(blocks) do
		local s = o[4] * rng:NextNumber(0.85, 1.1)
		part({
			Size = Vector3.new(s, s * 0.85, s),
			Color = shade(baseGreen, rng:NextNumber(-0.1, 0.09)),
			CanCollide = false, CanQuery = false, CanTouch = false,
			CFrame = CFrame.new(x + o[1] * rng:NextNumber(0.75, 1.2), o[2], z + o[3] * rng:NextNumber(0.75, 1.2)),
		})
	end
end

local function makeBush(x, z)
	local green = c3(66, 150, 70)
	part({ Size = Vector3.new(3, 2.2, 3), Color = shade(green, rng:NextNumber(-0.06, 0.06)), CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(x, 1, z) })
	part({ Size = Vector3.new(2, 1.6, 2), Color = shade(green, 0.08), CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(x + 1.2, 0.8, z + 0.8) })
end

local function makeRock(x, z, size)
	part({
		Size = Vector3.new(size, size * 0.7, size * 0.9),
		Color = c3(138, 138, 144), Material = Enum.Material.Slate,
		CFrame = CFrame.new(x, size * 0.3, z) * CFrame.Angles(0, rng:NextNumber(0, 3), 0),
	})
	part({
		Size = Vector3.new(size * 0.5, size * 0.4, size * 0.5),
		Color = c3(120, 120, 126), Material = Enum.Material.Slate,
		CFrame = CFrame.new(x + size * 0.4, size * 0.55, z - size * 0.2) * CFrame.Angles(0, rng:NextNumber(0, 3), 0),
	})
end

local function picketFence(x, z, length, alongX)
	local white = c3(242, 242, 242)
	local count = math.floor(length / 2.2)
	for i = 0, count do
		local off = -length / 2 + i * 2.2
		local px = alongX and (x + off) or x
		local pz = alongX and z or (z + off)
		part({ Size = Vector3.new(0.35, 1.9, 0.35), Color = white, CFrame = CFrame.new(px, 0.95, pz) })
	end
	local railSize = alongX and Vector3.new(length, 0.3, 0.22) or Vector3.new(0.22, 0.3, length)
	part({ Size = railSize, Color = white, CFrame = CFrame.new(x, 1.3, z) })
end

local function makeLamp(x, z)
	part({ Size = Vector3.new(0.45, 8, 0.45), Color = c3(48, 50, 56), Material = Enum.Material.Metal, CFrame = CFrame.new(x, 4, z) })
	part({ Size = Vector3.new(2.2, 0.3, 1.0), Color = c3(48, 50, 56), Material = Enum.Material.Metal, CFrame = CFrame.new(x, 8.15, z) })
	local bulb = part({ Size = Vector3.new(1.9, 0.18, 0.8), Color = c3(255, 235, 170), Material = Enum.Material.Neon, CFrame = CFrame.new(x, 7.9, z) })
	local light = Instance.new("PointLight")
	light.Color = c3(255, 225, 150)
	light.Range = 24
	light.Brightness = 1.6
	light.Enabled = false
	light.Parent = bulb
	table.insert(lamps, { bulb = bulb, light = light })
end

local function makeBench(x, z, yaw)
	local base = CFrame.new(x, 0, z) * CFrame.Angles(0, math.rad(yaw), 0)
	part({ Size = Vector3.new(5, 0.4, 1.6), Color = c3(160, 110, 65), Material = Enum.Material.Wood, CFrame = base * CFrame.new(0, 1.4, 0) })
	part({ Size = Vector3.new(5, 1.4, 0.35), Color = c3(160, 110, 65), Material = Enum.Material.Wood, CFrame = base * CFrame.new(0, 2.4, 0.75) })
	part({ Size = Vector3.new(0.4, 1.4, 1.4), Color = c3(70, 70, 80), CFrame = base * CFrame.new(-2.1, 0.7, 0) })
	part({ Size = Vector3.new(0.4, 1.4, 1.4), Color = c3(70, 70, 80), CFrame = base * CFrame.new(2.1, 0.7, 0) })
end

local function makeFlowerbed(x, z)
	part({ Size = Vector3.new(7, 0.6, 4), Color = c3(105, 75, 50), Material = Enum.Material.Ground, CFrame = CFrame.new(x, 0.3, z) })
	local colors = { c3(245, 120, 140), c3(255, 205, 80), c3(160, 130, 240), c3(255, 255, 255) }
	for i = 1, 8 do
		part({
			Size = Vector3.new(0.6, 0.6, 0.6),
			Color = colors[(i % #colors) + 1], CanCollide = false, CanQuery = false, CanTouch = false,
			CFrame = CFrame.new(x + rng:NextNumber(-2.8, 2.8), 0.9, z + rng:NextNumber(-1.4, 1.4)),
		})
	end
end

local function makeFountain()
	part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 16, 16), Color = c3(185, 190, 200), Material = Enum.Material.Marble, CFrame = uprightCyl(0, 1, 0) })
	part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 13, 13), Color = c3(90, 170, 250), Material = Enum.Material.Glass, Transparency = 0.3, CanCollide = false, CFrame = uprightCyl(0, 2, 0) })
	part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(4.5, 1.6, 1.6), Color = c3(185, 190, 200), Material = Enum.Material.Marble, CFrame = uprightCyl(0, 4.2, 0) })
	local top = part({ Shape = Enum.PartType.Ball, Size = Vector3.new(3, 3, 3), Color = c3(120, 200, 255), Material = Enum.Material.Neon, Transparency = 0.2, CanCollide = false, CFrame = CFrame.new(0, 7, 0) })
	local light = Instance.new("PointLight")
	light.Color = c3(120, 200, 255)
	light.Range = 20
	light.Parent = top
end

-- ---------- Voxel-Backstein-Gebaeude ----------
-- Front = lokale -Z-Richtung. opts: pos, w, d, h, yaw,
-- wallColor (Backstein), roofColor, name, signColor,
-- enterable, furnish

local function makeBuilding(opts)
	local w, d, h = opts.w, opts.d, opts.h
	local base = CFrame.new(opts.pos.X, 0, opts.pos.Z) * CFrame.Angles(0, math.rad(opts.yaw or 0), 0)
	local wall = opts.wallColor or c3(198, 148, 104)
	local roofColor = opts.roofColor
	local dark = c3(45, 47, 53)
	local glow = c3(150, 222, 255)
	local wt = 0.8
	local doorW, doorH = 6, 7

	local function bp(props, cf)
		local p = part(props)
		p.CFrame = base * cf
		return p
	end

	-- Sockel + Innenboden
	bp({ Size = Vector3.new(w + 1.4, 0.5, d + 1.4), Color = c3(150, 150, 155), Material = Enum.Material.Concrete }, CFrame.new(0, 0.25, 0))
	bp({ Size = Vector3.new(w - 1, 0.3, d - 1), Color = c3(212, 196, 168), Material = Enum.Material.WoodPlanks }, CFrame.new(0, 0.6, 0))

	-- Waende aus Backstein
	bp({ Size = Vector3.new(w, h, wt), Color = wall, Material = Enum.Material.Brick }, CFrame.new(0, h / 2, d / 2 - wt / 2))
	bp({ Size = Vector3.new(wt, h, d), Color = wall, Material = Enum.Material.Brick }, CFrame.new(-w / 2 + wt / 2, h / 2, 0))
	bp({ Size = Vector3.new(wt, h, d), Color = wall, Material = Enum.Material.Brick }, CFrame.new(w / 2 - wt / 2, h / 2, 0))
	local sideW = (w - doorW) / 2
	bp({ Size = Vector3.new(sideW, h, wt), Color = wall, Material = Enum.Material.Brick }, CFrame.new(-(doorW + sideW) / 2, h / 2, -d / 2 + wt / 2))
	bp({ Size = Vector3.new(sideW, h, wt), Color = wall, Material = Enum.Material.Brick }, CFrame.new((doorW + sideW) / 2, h / 2, -d / 2 + wt / 2))
	bp({ Size = Vector3.new(doorW, h - doorH, wt), Color = wall, Material = Enum.Material.Brick }, CFrame.new(0, doorH + (h - doorH) / 2, -d / 2 + wt / 2))

	-- Leuchtende Fenster (wie im Vorbild)
	local function glowWindow(cf, wWin, hWin)
		bp({ Size = Vector3.new(0.5, hWin + 0.6, wWin + 0.6), Color = dark }, cf)
		bp({ Size = Vector3.new(0.7, hWin, wWin), Color = glow, Material = Enum.Material.Neon }, cf)
	end
	for _, sx in ipairs({ -1, 1 }) do
		glowWindow(CFrame.new(sx * (w / 2 - wt / 2), h * 0.52, -d * 0.22), 3.2, 2.8)
		glowWindow(CFrame.new(sx * (w / 2 - wt / 2), h * 0.52, d * 0.22), 3.2, 2.8)
	end
	-- Frontfenster (gedreht, damit es in der Frontwand liegt)
	bp({ Size = Vector3.new(math.max(2.4, sideW - 2) + 0.6, 3.4, 0.5), Color = dark }, CFrame.new((doorW + sideW) / 2, h * 0.52, -d / 2 + wt / 2))
	bp({ Size = Vector3.new(math.max(2.4, sideW - 2), 2.8, 0.7), Color = glow, Material = Enum.Material.Neon }, CFrame.new((doorW + sideW) / 2, h * 0.52, -d / 2 + wt / 2))

	-- Tuerrahmen
	bp({ Size = Vector3.new(0.6, doorH, wt + 0.3), Color = c3(90, 62, 40), Material = Enum.Material.Wood }, CFrame.new(-doorW / 2, doorH / 2, -d / 2 + wt / 2))
	bp({ Size = Vector3.new(0.6, doorH, wt + 0.3), Color = c3(90, 62, 40), Material = Enum.Material.Wood }, CFrame.new(doorW / 2, doorH / 2, -d / 2 + wt / 2))
	bp({ Size = Vector3.new(doorW + 1.2, 0.6, wt + 0.3), Color = c3(90, 62, 40), Material = Enum.Material.Wood }, CFrame.new(0, doorH, -d / 2 + wt / 2))
	if not opts.enterable then
		bp({ Size = Vector3.new(doorW - 0.4, doorH - 0.2, 0.4), Color = c3(110, 72, 46), Material = Enum.Material.Wood }, CFrame.new(0, doorH / 2, -d / 2 + wt / 2))
	end

	-- Stufen-Dach im Voxel-Look
	local depths = { d + 2.6, math.max(3, d * 0.6), math.max(2.4, d * 0.28) }
	for i, depth in ipairs(depths) do
		bp({
			Size = Vector3.new(w + 2.6, 1.1, depth),
			Color = shade(roofColor, -(i - 1) * 0.07),
			Material = Enum.Material.SmoothPlastic,
		}, CFrame.new(0, h + 0.55 + (i - 1) * 1.05, 0))
	end

	-- Neon-Schild ueber der Tuer
	if opts.name then
		local signColor = opts.signColor and c3(opts.signColor[1], opts.signColor[2], opts.signColor[3]) or c3(255, 255, 255)
		local board = bp({ Size = Vector3.new(math.min(w, 12), 2.4, 0.5), Color = c3(24, 25, 30) }, CFrame.new(0, doorH + 2.1, -d / 2 - 0.3))
		bp({ Size = Vector3.new(math.min(w, 12) + 0.4, 0.25, 0.55), Color = signColor, Material = Enum.Material.Neon }, CFrame.new(0, doorH + 0.85, -d / 2 - 0.3))
		local gui = Instance.new("SurfaceGui")
		gui.Face = Enum.NormalId.Front
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 45
		local label = Instance.new("TextLabel")
		label.Size = UDim2.new(1, 0, 1, 0)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.Arcade
		label.TextScaled = true
		label.Text = opts.name
		label.TextColor3 = signColor
		label.Parent = gui
		gui.Parent = board
	end

	-- Moebel
	if opts.furnish then
		bp({ Size = Vector3.new(4, 1, 6.5), Color = c3(150, 100, 60), Material = Enum.Material.Wood }, CFrame.new(-w / 2 + 3, 1.2, d / 2 - 4.5))
		bp({ Size = Vector3.new(3.6, 0.6, 6.1), Color = c3(230, 230, 240) }, CFrame.new(-w / 2 + 3, 1.9, d / 2 - 4.5))
		bp({ Size = Vector3.new(3, 0.5, 1.6), Color = c3(255, 150, 160) }, CFrame.new(-w / 2 + 3, 2.35, d / 2 - 2.4))
		bp({ Size = Vector3.new(4, 0.4, 4), Color = c3(170, 120, 70), Material = Enum.Material.Wood }, CFrame.new(w / 2 - 4.5, 2.7, d / 2 - 5))
		bp({ Size = Vector3.new(0.5, 2.2, 0.5), Color = c3(140, 95, 55) }, CFrame.new(w / 2 - 4.5, 1.4, d / 2 - 5))
		for _, off in ipairs({ { -3, 0 }, { 3, 0 } }) do
			bp({ Size = Vector3.new(1.8, 0.4, 1.8), Color = c3(190, 140, 90) }, CFrame.new(w / 2 - 4.5 + off[1], 1.7, d / 2 - 5 + off[2]))
			bp({ Size = Vector3.new(0.4, 1.4, 0.4), Color = c3(160, 115, 70) }, CFrame.new(w / 2 - 4.5 + off[1], 1, d / 2 - 5 + off[2]))
		end
		bp({ Size = Vector3.new(6, 0.12, 5), Color = c3(200, 90, 90), Material = Enum.Material.Fabric }, CFrame.new(0, 0.82, -d * 0.1))
		bp({ Size = Vector3.new(3.5, 4.5, 1), Color = c3(150, 105, 65), Material = Enum.Material.Wood }, CFrame.new(w / 2 - 2.6, 2.95, -d / 2 + 3))
	end

	return base
end

-- ---------- Spezialgebaeude ----------

local function buildMonsterCenter()
	local base = makeBuilding({
		pos = Vector3.new(-48, 0, -12), yaw = -90, w = 26, d = 20, h = 10,
		wallColor = c3(228, 130, 145), roofColor = c3(185, 45, 60),
		name = "MONSTER-CENTER", signColor = { 255, 90, 110 }, enterable = true,
	})
	local function bp(props, cf)
		local p = part(props)
		p.CFrame = base * cf
		return p
	end
	bp({ Size = Vector3.new(10, 3, 2), Color = c3(225, 120, 130) }, CFrame.new(0, 1.5, 5))
	local counterTop = bp({ Size = Vector3.new(10.6, 0.4, 2.6), Color = c3(250, 250, 250) }, CFrame.new(0, 3.2, 5))
	healRing = bp({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.6, 6, 6), Color = c3(140, 230, 170), Material = Enum.Material.Neon, Transparency = 0.85, CanCollide = false }, CFrame.new(0, 6.5, 4) * CFrame.Angles(0, 0, math.rad(90)))
	healLight = Instance.new("PointLight")
	healLight.Color = c3(140, 230, 170)
	healLight.Range = 18
	healLight.Brightness = 0
	healLight.Parent = healRing
	local counterWorld = base * CFrame.new(0, 0, 7.5)
	local frontWorld = base * CFrame.new(0, 0, -5)
	WorldBuilder.MakeNpc({
		name = "Schwester Amara", shirt = { 245, 160, 180 }, hair = { 250, 190, 120 },
		pos = counterWorld.Position, faceTo = frontWorld.Position,
	})
	local healPrompt = Instance.new("ProximityPrompt")
	healPrompt.ActionText = "Heilen"
	healPrompt.ObjectText = "Team heilen (kostenlos)"
	healPrompt.HoldDuration = 0.3
	healPrompt.MaxActivationDistance = 10
	healPrompt.RequiresLineOfSight = false
	healPrompt.Parent = counterTop
	local lastHeal = {}
	healPrompt.Triggered:Connect(function(player)
		local now = os.clock()
		if lastHeal[player] and now - lastHeal[player] < 4 then return end
		lastHeal[player] = now
		PlayerData.HealAll(player)
		PlayerData.Notify(player, "Dein Team wurde vollständig geheilt!", "heal")
		WorldBuilder.PlayHealEffect()
	end)
	local pc = bp({ Size = Vector3.new(3, 4.5, 2), Color = c3(120, 125, 140), Material = Enum.Material.Metal }, CFrame.new(-9, 2.25, 6.5))
	bp({ Size = Vector3.new(2.4, 1.8, 0.3), Color = c3(120, 230, 255), Material = Enum.Material.Neon }, CFrame.new(-9, 3.4, 5.4))
	local pcPrompt = Instance.new("ProximityPrompt")
	pcPrompt.ActionText = "Box öffnen"
	pcPrompt.ObjectText = "Monster-PC"
	pcPrompt.HoldDuration = 0.25
	pcPrompt.MaxActivationDistance = 8
	pcPrompt.RequiresLineOfSight = false
	pcPrompt.Parent = pc
	local OpenUi = Remotes.Get("OpenUi")
	pcPrompt.Triggered:Connect(function(player)
		OpenUi:FireClient(player, "box")
	end)
	bp({ Size = Vector3.new(2, 2.4, 2), Color = c3(80, 170, 90), CanCollide = false }, CFrame.new(9, 2.6, 7))
	bp({ Size = Vector3.new(1.4, 1.4, 1.4), Color = c3(200, 120, 80) }, CFrame.new(9, 0.9, 7))
end

local function buildLab()
	local base = makeBuilding({
		pos = Vector3.new(46, 0, -16), yaw = 90, w = 26, d = 20, h = 10,
		wallColor = c3(205, 170, 120), roofColor = c3(230, 180, 60),
		name = "LABOR", signColor = { 255, 210, 80 }, enterable = true,
	})
	local function bp(props, cf)
		local p = part(props)
		p.CFrame = base * cf
		return p
	end
	local profWorld = base * CFrame.new(0, 0, 7)
	local frontWorld = base * CFrame.new(0, 0, -6)
	WorldBuilder.MakeNpc({
		name = "Professorin Eiche", shirt = { 250, 250, 250 }, hair = { 130, 130, 140 },
		pos = profWorld.Position, faceTo = frontWorld.Position,
		prompt = {
			action = "Reden",
			callback = function(player)
				local session = PlayerData.SessionOf(player)
				if session and session.starter then
					PlayerData.Notify(player, "Professorin Eiche: Wie läuft dein Abenteuer? Fang viele Monster!", "info")
				else
					PlayerData.Notify(player, "Professorin Eiche: Such dir eines der drei Monster auf den Tischen aus!", "info")
				end
			end,
		},
	})
	local StarterAsk = Remotes.Get("StarterAsk")
	local xOffsets = { -7, 0, 7 }
	for i, speciesId in ipairs(GameData.Starters) do
		local tableCf = CFrame.new(xOffsets[i], 0, 1)
		bp({ Size = Vector3.new(4.5, 2.6, 4.5), Color = c3(200, 205, 215) }, tableCf * CFrame.new(0, 1.3, 0))
		local top = bp({ Size = Vector3.new(5, 0.4, 5), Color = c3(240, 240, 245) }, tableCf * CFrame.new(0, 2.8, 0))
		local figure = MonsterFactory.Create(speciesId, 0.55)
		local worldTop = (base * tableCf * CFrame.new(0, 3, 0)).Position
		local lookWorld = (base * CFrame.new(xOffsets[i], 0, -10)).Position
		MonsterFactory.PlaceOnGround(figure, worldTop, lookWorld)
		figure.Parent = folder
		local prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "Wählen"
		prompt.ObjectText = GameData.Species[speciesId].name
		prompt.HoldDuration = 0.25
		prompt.MaxActivationDistance = 9
		prompt.RequiresLineOfSight = false
		prompt.Parent = top
		prompt.Triggered:Connect(function(player)
			local session = PlayerData.SessionOf(player)
			if not session then return end
			if session.starter then
				PlayerData.Notify(player, "Du hast schon ein Partner-Monster!", "bad")
			else
				StarterAsk:FireClient(player, speciesId)
			end
		end)
	end
end

local function buildShop()
	local base = makeBuilding({
		pos = Vector3.new(-44, 0, 36), yaw = -90, w = 22, d = 18, h = 9,
		wallColor = c3(150, 185, 235), roofColor = c3(50, 95, 205),
		name = "MARKT", signColor = { 110, 190, 255 }, enterable = true,
	})
	local function bp(props, cf)
		local p = part(props)
		p.CFrame = base * cf
		return p
	end
	local counter = bp({ Size = Vector3.new(9, 3, 2), Color = c3(120, 150, 220) }, CFrame.new(0, 1.5, 4.5))
	bp({ Size = Vector3.new(9.6, 0.4, 2.6), Color = c3(250, 250, 250) }, CFrame.new(0, 3.2, 4.5))
	for _, sx in ipairs({ -8, 8 }) do
		bp({ Size = Vector3.new(3, 5, 1.2), Color = c3(150, 105, 65), Material = Enum.Material.Wood }, CFrame.new(sx, 2.9, 6.5))
		for i = 1, 3 do
			bp({ Size = Vector3.new(0.9, 0.9, 0.9), Color = c3(100 + i * 40, 80 + i * 30, 200 - i * 30), CanCollide = false }, CFrame.new(sx - 1 + i * 0.7, 1.6 + i, 6.2))
		end
	end
	local counterWorld = base * CFrame.new(0, 0, 6.5)
	local frontWorld = base * CFrame.new(0, 0, -5)
	WorldBuilder.MakeNpc({
		name = "Händler Bodo", shirt = { 90, 160, 240 }, hair = { 60, 45, 35 },
		pos = counterWorld.Position, faceTo = frontWorld.Position,
	})
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Einkaufen"
	prompt.ObjectText = "Markt"
	prompt.HoldDuration = 0.25
	prompt.MaxActivationDistance = 10
	prompt.RequiresLineOfSight = false
	prompt.Parent = counter
	local OpenUi = Remotes.Get("OpenUi")
	prompt.Triggered:Connect(function(player)
		OpenUi:FireClient(player, "shop")
	end)
end

-- ---------- Gras, See ----------

local function buildGrassPatches()
	for _, patch in ipairs(GameData.GrassPatches) do
		local x1, z1, x2, z2 = patch[1], patch[2], patch[3], patch[4]
		local w, d = x2 - x1, z2 - z1
		local cx, cz = (x1 + x2) / 2, (z1 + z2) / 2
		part({
			Size = Vector3.new(w, 0.24, d), Color = c3(62, 128, 58),
			Material = Enum.Material.Grass, CanCollide = false, CanQuery = false, CanTouch = false,
			CFrame = CFrame.new(cx, 0.06, cz),
		})
		local count = math.floor(w * d / 42)
		for _ = 1, count do
			local gx = rng:NextNumber(x1 + 1, x2 - 1)
			local gz = rng:NextNumber(z1 + 1, z2 - 1)
			local height = rng:NextNumber(2.2, 3)
			local green = shade(c3(52, 118, 48), rng:NextNumber(-0.08, 0.1))
			local tuftBase = CFrame.new(gx, height / 2, gz) * CFrame.Angles(0, rng:NextNumber(0, 3.14), 0)
			for i = 0, 1 do
				part({
					Size = Vector3.new(1.7, height, 0.2), Color = green,
					Material = Enum.Material.Grass, CanCollide = false, CanQuery = false, CanTouch = false,
					CFrame = tuftBase * CFrame.Angles(0, math.rad(i * 90), 0),
				})
			end
		end
	end
end

local function buildLake()
	part({
		Size = Vector3.new(86, 1.6, 64), Color = c3(70, 150, 230),
		Material = Enum.Material.Glass, Transparency = 0.35, CanCollide = false, CanQuery = false, CanTouch = false,
		CFrame = CFrame.new(32, -0.5, -330),
	})
	part({ Size = Vector3.new(92, 0.2, 70), Color = c3(225, 205, 150), Material = Enum.Material.Sand, CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(32, 0.04, -330) })
	local function rail(x, z, w, d)
		part({ Size = Vector3.new(w, 2.4, d), Color = c3(150, 105, 65), Material = Enum.Material.Wood, Transparency = 0.1, CFrame = CFrame.new(x, 1.2, z) })
	end
	rail(6, -298, 40, 0.6)
	rail(59, -298, 32, 0.6)
	rail(6, -362, 40, 0.6)
	rail(59, -362, 32, 0.6)
	rail(-11, -330, 0.6, 65)
	rail(75, -330, 0.6, 65)
	part({ Size = Vector3.new(8, 0.6, 74), Color = c3(180, 130, 80), Material = Enum.Material.WoodPlanks, CFrame = CFrame.new(32, 1.0, -330) })
	wedge({ Size = Vector3.new(8, 1.3, 4), Color = c3(180, 130, 80), Material = Enum.Material.WoodPlanks, CFrame = CFrame.new(32, 0.65, -295) * CFrame.Angles(0, math.rad(180), 0) })
	wedge({ Size = Vector3.new(8, 1.3, 4), Color = c3(180, 130, 80), Material = Enum.Material.WoodPlanks, CFrame = CFrame.new(32, 0.65, -365) })
	part({ Size = Vector3.new(0.5, 2.2, 74), Color = c3(150, 105, 65), Material = Enum.Material.Wood, CFrame = CFrame.new(28.2, 2.1, -330) })
	part({ Size = Vector3.new(0.5, 2.2, 74), Color = c3(150, 105, 65), Material = Enum.Material.Wood, CFrame = CFrame.new(35.8, 2.1, -330) })
end

-- ---------- Effekte, Tag/Nacht ----------

function WorldBuilder.PlayHealEffect()
	if not healRing then return end
	healRing.Transparency = 0.1
	healLight.Brightness = 3
	TweenService:Create(healRing, TweenInfo.new(1.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Transparency = 0.85 }):Play()
	TweenService:Create(healLight, TweenInfo.new(1.6), { Brightness = 0 }):Play()
end

local function startDayNight()
	local t0 = os.clock()
	task.spawn(function()
		while true do
			local elapsed = os.clock() - t0
			local clockTime = (8 + (elapsed / DAY_LENGTH) * 24) % 24
			Lighting.ClockTime = clockTime
			local night = clockTime >= 18.5 or clockTime < 6
			for _, lamp in ipairs(lamps) do
				lamp.light.Enabled = night
				lamp.bulb.Material = night and Enum.Material.Neon or Enum.Material.SmoothPlastic
			end
			task.wait(3)
		end
	end)
end

-- ---------- Hauptaufbau ----------

function WorldBuilder.Build()
	folder = Instance.new("Folder")
	folder.Name = "MonsterweltMap"

	-- Boden + Grenzen
	part({ Size = Vector3.new(MAP_HALF * 2, 2, MAP_HALF * 2), Color = c3(96, 168, 74), Material = Enum.Material.Grass, CFrame = CFrame.new(0, -1, 0) })
	for _, def in ipairs({
		{ Vector3.new(MAP_HALF * 2, 80, 4), CFrame.new(0, 40, -MAP_HALF) },
		{ Vector3.new(MAP_HALF * 2, 80, 4), CFrame.new(0, 40, MAP_HALF) },
		{ Vector3.new(4, 80, MAP_HALF * 2), CFrame.new(-MAP_HALF, 40, 0) },
		{ Vector3.new(4, 80, MAP_HALF * 2), CFrame.new(MAP_HALF, 40, 0) },
	}) do
		part({ Size = def[1], CFrame = def[2], Transparency = 1 })
	end

	-- Spawn
	local spawnLoc = Instance.new("SpawnLocation")
	spawnLoc.Size = Vector3.new(12, 1, 12)
	spawnLoc.CFrame = CFrame.new(10, 0.5, 20)
	spawnLoc.Anchored = true
	spawnLoc.Duration = 0
	spawnLoc.Color = c3(226, 224, 214)
	spawnLoc.Material = Enum.Material.Brick
	spawnLoc.TopSurface = Enum.SurfaceType.Smooth
	spawnLoc.Parent = folder

	-- Stadtplatz + Ziegelwege
	part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.3, 46, 46), Color = shade(TAN, 0.04), Material = Enum.Material.Brick, CanCollide = false, CanQuery = false, CanTouch = false, CFrame = uprightCyl(0, 0.04, 0) })
	brickPath(-95, 0, 95, 0, 8)
	brickPath(0, -95, 0, 75, 8)
	brickPath(95, 0, 360, 0, 8) -- Route 1 nach Osten
	brickPath(0, -95, 0, -290, 8) -- Route 2 nach Norden

	makeFountain()

	-- Gebaeude
	buildMonsterCenter()
	buildLab()
	buildShop()
	makeBuilding({ pos = Vector3.new(28, 0, 62), yaw = 0, w = 16, d = 14, h = 8, wallColor = c3(200, 150, 106), roofColor = c3(190, 60, 55), enterable = true, furnish = true })
	makeBuilding({ pos = Vector3.new(68, 0, 24), yaw = 90, w = 15, d = 13, h = 8, wallColor = c3(190, 142, 100), roofColor = c3(70, 140, 80), enterable = false })
	makeBuilding({ pos = Vector3.new(-20, 0, -74), yaw = 180, w = 16, d = 14, h = 8, wallColor = c3(205, 155, 110), roofColor = c3(80, 125, 200), enterable = true, furnish = true })
	makeBuilding({ pos = Vector3.new(26, 0, -72), yaw = 180, w = 14, d = 12, h = 7, wallColor = c3(196, 146, 102), roofColor = c3(150, 90, 180), enterable = false })
	makeBuilding({ pos = Vector3.new(-80, 0, 62), yaw = -90, w = 16, d = 14, h = 8, wallColor = c3(198, 148, 104), roofColor = c3(220, 150, 50), enterable = true, furnish = true })
	makeBuilding({ pos = Vector3.new(-76, 0, -60), yaw = -90, w = 14, d = 12, h = 7, wallColor = c3(192, 144, 100), roofColor = c3(60, 150, 150), enterable = false })

	-- Lattenzaeune vor den Haeusern (wie im Vorbild)
	picketFence(28, 52, 18, true)
	picketFence(-20, -64, 18, true)
	picketFence(-70, 62, 16, false)

	-- Laternen
	for _, p in ipairs({
		{ -80, 6 }, { -50, -6 }, { 50, 6 }, { 80, -6 },
		{ 6, -80 }, { -6, -50 }, { 6, 50 }, { -6, 75 },
		{ 18, 14 }, { -18, -14 }, { 130, 6 }, { 200, -6 }, { 6, -130 },
	}) do
		makeLamp(p[1], p[2])
	end

	-- Baenke, Beete
	makeBench(0, 16, 180)
	makeBench(-16, -4, 90)
	makeBench(16, -6, -90)
	makeFlowerbed(-14, 14)
	makeFlowerbed(16, -18)
	makeFlowerbed(40, 8)

	-- Baeume & Buesche in der Stadt
	for _, p in ipairs({ { 42, 40 }, { -30, 55 }, { 55, -40 }, { -58, 20 }, { -40, -40 }, { 12, 78 }, { 80, 42 } }) do
		makeTree(p[1], p[2])
	end
	for _, p in ipairs({ { 24, 30 }, { -26, 24 }, { 34, -30 }, { -34, -24 }, { 60, 50 } }) do
		makeBush(p[1], p[2])
	end

	-- Dichte Waldraender um die Routen (Voxel-Wald wie im Vorbild)
	for _ = 1, 170 do
		local x = rng:NextNumber(-MAP_HALF + 18, MAP_HALF - 18)
		local z = rng:NextNumber(-MAP_HALF + 18, MAP_HALF - 18)
		local inTown = math.abs(x) < 100 and math.abs(z) < 100
		local onRoute1 = x > 95 and x < 380 and math.abs(z) < 48
		local onRoute2 = z < -95 and z > -390 and math.abs(x - 15) < 70
		if not inTown and not onRoute1 and not onRoute2 then
			makeTree(x, z)
		end
	end
	for _ = 1, 45 do
		local x = rng:NextNumber(-MAP_HALF + 20, MAP_HALF - 20)
		local z = rng:NextNumber(-MAP_HALF + 20, MAP_HALF - 20)
		if not (math.abs(x) < 60 and math.abs(z) < 60) then
			makeBush(x, z)
		end
	end

	-- Felsen auf den Routen
	for _, p in ipairs({ { 190, 30, 4 }, { 240, -24, 5 }, { 320, 20, 4 }, { -30, -170, 5 }, { 40, -210, 4 }, { -10, -260, 6 }, { 60, -380, 5 } }) do
		makeRock(p[1], p[2], p[3])
	end

	buildGrassPatches()
	buildLake()

	folder.Parent = workspace

	-- Moderne Grafik: Licht, Atmosphaere, Post-Effekte
	Lighting.Brightness = 3
	Lighting.Ambient = c3(95, 100, 110)
	Lighting.OutdoorAmbient = c3(140, 150, 165)
	Lighting.EnvironmentDiffuseScale = 1
	Lighting.EnvironmentSpecularScale = 1
	Lighting.ShadowSoftness = 0.2

	local atmo = Instance.new("Atmosphere")
	atmo.Density = 0.3
	atmo.Offset = 0.25
	atmo.Color = c3(199, 199, 214)
	atmo.Decay = c3(106, 112, 125)
	atmo.Glare = 0.2
	atmo.Haze = 1.5
	atmo.Parent = Lighting

	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.4
	bloom.Size = 24
	bloom.Threshold = 1.1
	bloom.Parent = Lighting

	local sunRays = Instance.new("SunRaysEffect")
	sunRays.Intensity = 0.12
	sunRays.Spread = 0.6
	sunRays.Parent = Lighting

	local colorCorrection = Instance.new("ColorCorrectionEffect")
	colorCorrection.Saturation = 0.12
	colorCorrection.Contrast = 0.06
	colorCorrection.TintColor = c3(255, 250, 244)
	colorCorrection.Parent = Lighting

	startDayNight()

	if MUSIC_ID ~= 0 then
		pcall(function()
			local music = Instance.new("Sound")
			music.SoundId = "rbxassetid://" .. MUSIC_ID
			music.Looped = true
			music.Volume = 0.25
			music.Name = "Hintergrundmusik"
			music.Parent = SoundService
			music:Play()
		end)
	end
end

return WorldBuilder
