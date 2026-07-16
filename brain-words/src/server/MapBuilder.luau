-- ============================================================
-- Baut die komplette Spielwelt per Code:
-- Boden, Zonen, Schilder, Heil-Brunnen, Baeume, Deko.
-- ============================================================

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local MapBuilder = {}

local MAP_HALF = 310 -- halbe Kartengroesse
local rng = Random.new(20240521)

local function part(props, parent)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		p[k] = v
	end
	p.Parent = parent
	return p
end

-- Aufrecht stehender Zylinder (Zylinder-Achse ist standardmaessig X)
local function uprightCylinderCFrame(x, y, z)
	return CFrame.new(x, y, z) * CFrame.Angles(0, 0, math.rad(90))
end

local function makeTree(folder, x, z)
	part({
		Name = "Baumstamm",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(7, 1.8, 1.8),
		CFrame = uprightCylinderCFrame(x, 3.5, z),
		Color = Color3.fromRGB(105, 70, 45),
		Material = Enum.Material.Wood,
	}, folder)
	local leafColors = {
		Color3.fromRGB(70, 155, 70),
		Color3.fromRGB(90, 175, 75),
		Color3.fromRGB(60, 140, 90),
	}
	local size = rng:NextNumber(7, 11)
	part({
		Name = "Blaetter",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(size, size, size),
		CFrame = CFrame.new(x, 7 + size * 0.25, z),
		Color = leafColors[rng:NextInteger(1, #leafColors)],
		Material = Enum.Material.Grass,
		CanCollide = false,
	}, folder)
end

local function makeSign(folder, zone)
	local flat = Vector3.new(zone.center.X, 0, zone.center.Z)
	local dir = (Vector3.new(0, 0, 0) - flat).Unit
	local pos = flat + dir * (zone.radius + 8)

	part({
		Name = "Pfosten",
		Size = Vector3.new(0.8, 5, 0.8),
		CFrame = CFrame.new(pos.X, 2.5, pos.Z),
		Color = Color3.fromRGB(120, 85, 55),
		Material = Enum.Material.Wood,
	}, folder)

	local board = part({
		Name = "Schild_" .. zone.id,
		Size = Vector3.new(9, 4, 0.5),
		CFrame = CFrame.lookAt(Vector3.new(pos.X, 5.5, pos.Z), Vector3.new(0, 5.5, 0)),
		Color = Color3.fromRGB(235, 225, 200),
		Material = Enum.Material.SmoothPlastic,
	}, folder)

	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local gui = Instance.new("SurfaceGui")
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 40
		local title = Instance.new("TextLabel")
		title.Size = UDim2.new(1, 0, 0.55, 0)
		title.BackgroundTransparency = 1
		title.Font = Enum.Font.FredokaOne
		title.TextScaled = true
		title.TextColor3 = Color3.fromRGB(50, 40, 30)
		title.Text = zone.name
		title.Parent = gui
		local sub = Instance.new("TextLabel")
		sub.Position = UDim2.new(0, 0, 0.55, 0)
		sub.Size = UDim2.new(1, 0, 0.45, 0)
		sub.BackgroundTransparency = 1
		sub.Font = Enum.Font.FredokaOne
		sub.TextScaled = true
		sub.TextColor3 = Color3.fromRGB(110, 90, 60)
		sub.Text = "Level " .. zone.levelMin .. " - " .. zone.levelMax
		sub.Parent = gui
		gui.Parent = board
	end
end

local function makeFountain(folder)
	local base = part({
		Name = "Brunnen",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(2, 18, 18),
		CFrame = uprightCylinderCFrame(0, 1, 0),
		Color = Color3.fromRGB(180, 185, 195),
		Material = Enum.Material.Marble,
	}, folder)

	part({
		Name = "BrunnenWasser",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1, 15, 15),
		CFrame = uprightCylinderCFrame(0, 2, 0),
		Color = Color3.fromRGB(80, 170, 255),
		Material = Enum.Material.Neon,
		Transparency = 0.25,
		CanCollide = false,
	}, folder)

	local orb = part({
		Name = "HeilKugel",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(5, 5, 5),
		CFrame = CFrame.new(0, 7, 0),
		Color = Color3.fromRGB(120, 200, 255),
		Material = Enum.Material.Neon,
		Transparency = 0.15,
		CanCollide = false,
	}, folder)
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(120, 200, 255)
	light.Range = 30
	light.Brightness = 1.5
	light.Parent = orb

	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromOffset(300, 60)
	billboard.StudsOffset = Vector3.new(0, 5, 0)
	billboard.MaxDistance = 120
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = "Heil-Brunnen"
	label.TextColor3 = Color3.fromRGB(160, 220, 255)
	label.TextStrokeTransparency = 0.3
	label.Parent = billboard
	billboard.Parent = orb

	-- Unsichtbare Heilzone
	local healZone = part({
		Name = "HeilZone",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(8, 24, 24),
		CFrame = uprightCylinderCFrame(0, 4, 0),
		Transparency = 1,
		CanCollide = false,
	}, folder)

	local lastHeal = {} -- [player] = Zeitpunkt
	healZone.Touched:Connect(function(hit)
		local character = hit.Parent
		if not character then return end
		local player = Players:GetPlayerFromCharacter(character)
		if not player then return end
		local now = os.clock()
		if lastHeal[player] and now - lastHeal[player] < 6 then return end
		lastHeal[player] = now
		PlayerData.HealAll(player)
		PlayerData.Notify(player, "Deine Brain Words wurden geheilt!", "good")
	end)
	Players.PlayerRemoving:Connect(function(player)
		lastHeal[player] = nil
	end)
end

function MapBuilder.Build()
	local folder = Instance.new("Folder")
	folder.Name = "BrainWordsMap"

	-- Boden
	part({
		Name = "Boden",
		Size = Vector3.new(MAP_HALF * 2, 2, MAP_HALF * 2),
		CFrame = CFrame.new(0, -1, 0),
		Color = Color3.fromRGB(106, 170, 80),
		Material = Enum.Material.Grass,
	}, folder)

	-- Unsichtbare Waende, damit niemand herunterfaellt
	local wallDefs = {
		{ Vector3.new(MAP_HALF * 2, 60, 4), CFrame.new(0, 30, -MAP_HALF) },
		{ Vector3.new(MAP_HALF * 2, 60, 4), CFrame.new(0, 30, MAP_HALF) },
		{ Vector3.new(4, 60, MAP_HALF * 2), CFrame.new(-MAP_HALF, 30, 0) },
		{ Vector3.new(4, 60, MAP_HALF * 2), CFrame.new(MAP_HALF, 30, 0) },
	}
	for _, def in ipairs(wallDefs) do
		part({ Name = "Wand", Size = def[1], CFrame = def[2], Transparency = 1 }, folder)
	end

	-- Spawn
	local spawnLoc = Instance.new("SpawnLocation")
	spawnLoc.Size = Vector3.new(14, 1, 14)
	spawnLoc.CFrame = CFrame.new(0, 0.5, 34)
	spawnLoc.Anchored = true
	spawnLoc.Duration = 0
	spawnLoc.Color = Color3.fromRGB(230, 230, 240)
	spawnLoc.Material = Enum.Material.SmoothPlastic
	spawnLoc.TopSurface = Enum.SurfaceType.Smooth
	spawnLoc.Parent = folder

	-- Zonen (farbige Flaechen + Schilder)
	for _, zone in ipairs(GameData.Zones) do
		part({
			Name = "Zone_" .. zone.id,
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.3, zone.radius * 2, zone.radius * 2),
			CFrame = uprightCylinderCFrame(zone.center.X, -0.05, zone.center.Z),
			Color = zone.color,
			Material = Enum.Material.Grass,
			Transparency = 0.2,
			CanCollide = false,
			CanQuery = false,
			CanTouch = false,
		}, folder)
		makeSign(folder, zone)
	end

	-- Kristalle auf dem Legenden-Gipfel
	local gipfel = GameData.Zones[#GameData.Zones]
	for _ = 1, 7 do
		local ang = rng:NextNumber(0, math.pi * 2)
		local dist = rng:NextNumber(10, gipfel.radius * 0.8)
		local x = gipfel.center.X + math.cos(ang) * dist
		local z = gipfel.center.Z + math.sin(ang) * dist
		local h = rng:NextNumber(4, 8)
		part({
			Name = "Kristall",
			Size = Vector3.new(2, h, 2),
			CFrame = CFrame.new(x, h * 0.4, z) * CFrame.Angles(rng:NextNumber(-0.3, 0.3), rng:NextNumber(0, 6), rng:NextNumber(-0.3, 0.3)),
			Color = Color3.fromRGB(255, 220, 120),
			Material = Enum.Material.Neon,
			Transparency = 0.2,
			CanCollide = false,
		}, folder)
	end

	-- Baeume verstreuen (nicht direkt am Spawn/Brunnen)
	for _ = 1, 34 do
		local x = rng:NextNumber(-MAP_HALF + 20, MAP_HALF - 20)
		local z = rng:NextNumber(-MAP_HALF + 20, MAP_HALF - 20)
		if math.sqrt(x * x + z * z) > 45 then
			makeTree(folder, x, z)
		end
	end

	-- Steine
	for _ = 1, 12 do
		local x = rng:NextNumber(-MAP_HALF + 15, MAP_HALF - 15)
		local z = rng:NextNumber(-MAP_HALF + 15, MAP_HALF - 15)
		if math.sqrt(x * x + z * z) > 40 then
			local size = rng:NextNumber(3, 6)
			part({
				Name = "Stein",
				Shape = Enum.PartType.Ball,
				Size = Vector3.new(size, size, size),
				CFrame = CFrame.new(x, size * 0.25, z),
				Color = Color3.fromRGB(140, 140, 145),
				Material = Enum.Material.Slate,
			}, folder)
		end
	end

	makeFountain(folder)
	folder.Parent = workspace

	-- Licht & Stimmung
	Lighting.ClockTime = 13.5
	Lighting.Brightness = 2.5
	Lighting.Ambient = Color3.fromRGB(120, 120, 130)
	Lighting.OutdoorAmbient = Color3.fromRGB(165, 175, 190)
end

return MapBuilder
