-- ============================================================
-- Beeren-Farm am Stadtrand:
-- Fruechte pflücken (Buesche + Baeume), Job beim Farmer:
-- 8 Fruechte sammeln -> Muenzen. Bueusche wachsen nach.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local WorldBuilder = require(script.Parent:WaitForChild("WorldBuilder"))

local FarmService = {}

local BASKET_SIZE = 8
local JOB_REWARD = 150

local rng = Random.new(777)
local folder = nil
local jobs = {} -- [player] = { count = n }

local function c3(r, g, b)
	return Color3.fromRGB(r, g, b)
end

local function part(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		p[k] = v
	end
	p.Parent = folder
	return p
end

-- ---------- Ernte-Logik ----------

local function giveFruit(player, itemId, itemName)
	PlayerData.GiveItem(player, itemId, 1)
	local job = jobs[player]
	local msg = itemName .. " gepflückt!"
	if job then
		if job.count < BASKET_SIZE then
			job.count = job.count + 1
		end
		if job.count >= BASKET_SIZE then
			msg = msg .. " Korb voll (" .. BASKET_SIZE .. "/" .. BASKET_SIZE .. ") - zurück zum Farmer!"
		else
			msg = msg .. " Korb: " .. job.count .. "/" .. BASKET_SIZE
		end
	end
	PlayerData.Sync(player)
	PlayerData.Notify(player, msg, "good")
end

-- Busch mit Beeren + Nachwachsen
local function makeBerryBush(x, z, blue)
	local bush = part({
		Shape = Enum.PartType.Ball, Size = Vector3.new(3.6, 2.8, 3.6),
		Color = c3(75, 155, 80), Material = Enum.Material.Grass,
		CFrame = CFrame.new(x, 1.3, z),
	})
	local berryColor = blue and c3(80, 110, 235) or c3(220, 60, 70)
	local berries = {}
	for i = 1, 4 do
		local ang = i * 1.55
		table.insert(berries, part({
			Shape = Enum.PartType.Ball, Size = Vector3.new(0.7, 0.7, 0.7),
			Color = berryColor, Material = Enum.Material.SmoothPlastic, CanCollide = false,
			CFrame = CFrame.new(x + math.cos(ang) * 1.4, 1.6 + (i % 2) * 0.7, z + math.sin(ang) * 1.4),
		}))
	end

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Pflücken"
	prompt.ObjectText = blue and "Blaubeeren-Busch" or "Beeren-Busch"
	prompt.HoldDuration = 0.4
	prompt.MaxActivationDistance = 9
	prompt.RequiresLineOfSight = false
	prompt.Parent = bush

	local ready = true
	prompt.Triggered:Connect(function(player)
		if not ready then return end
		ready = false
		prompt.Enabled = false
		for _, berry in ipairs(berries) do
			berry.Transparency = 1
		end
		if blue then
			giveFruit(player, "blaubeere", "Blaubeere")
		else
			giveFruit(player, "rotebeere", "Rote Beere")
		end
		task.delay(rng:NextNumber(60, 120), function()
			for _, berry in ipairs(berries) do
				berry.Transparency = 0
			end
			prompt.Enabled = true
			ready = true
		end)
	end)
end

-- Obstbaum mit Goldaepfeln
local function makeAppleTree(x, z)
	part({
		Shape = Enum.PartType.Cylinder, Size = Vector3.new(8, 2, 2),
		Color = c3(110, 75, 48), Material = Enum.Material.Wood,
		CFrame = CFrame.new(x, 4, z) * CFrame.Angles(0, 0, math.rad(90)),
	})
	part({
		Shape = Enum.PartType.Ball, Size = Vector3.new(9, 8, 9),
		Color = c3(80, 165, 75), Material = Enum.Material.Grass, CanCollide = false,
		CFrame = CFrame.new(x, 9, z),
	})
	local apples = {}
	for i = 1, 3 do
		local ang = i * 2.1
		table.insert(apples, part({
			Shape = Enum.PartType.Ball, Size = Vector3.new(0.9, 0.9, 0.9),
			Color = c3(255, 205, 60), Material = Enum.Material.Neon, CanCollide = false,
			CFrame = CFrame.new(x + math.cos(ang) * 3.4, 7 + (i % 2) * 1.6, z + math.sin(ang) * 3.4),
		}))
	end
	local trunk = part({ Size = Vector3.new(1, 1, 1), Transparency = 1, CanCollide = false, CFrame = CFrame.new(x, 3, z) })
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Pflücken"
	prompt.ObjectText = "Goldapfel-Baum"
	prompt.HoldDuration = 0.6
	prompt.MaxActivationDistance = 10
	prompt.RequiresLineOfSight = false
	prompt.Parent = trunk

	local ready = true
	prompt.Triggered:Connect(function(player)
		if not ready then return end
		ready = false
		prompt.Enabled = false
		for _, apple in ipairs(apples) do
			apple.Transparency = 1
		end
		giveFruit(player, "goldapfel", "Goldapfel")
		task.delay(rng:NextNumber(180, 260), function()
			for _, apple in ipairs(apples) do
				apple.Transparency = 0
			end
			prompt.Enabled = true
			ready = true
		end)
	end)
end

-- ---------- Aufbau ----------

function FarmService.Init()
	folder = Instance.new("Folder")
	folder.Name = "BeerenFarm"
	folder.Parent = workspace

	local cx, cz = -140, 100 -- Zentrum des Obstgartens

	-- Ackerboden + Zaun
	part({ Size = Vector3.new(70, 0.3, 56), Color = c3(150, 115, 80), Material = Enum.Material.Ground, CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(cx, 0.06, cz) })
	local function fence(x, z, w, d)
		part({ Size = Vector3.new(w, 2.6, d), Color = c3(160, 115, 70), Material = Enum.Material.Wood, CFrame = CFrame.new(x, 1.3, z) })
	end
	fence(cx, cz - 28, 70, 0.6)
	fence(cx - 35, cz, 0.6, 56)
	fence(cx + 35, cz - 8, 0.6, 40) -- Luecke als Eingang (Osten)
	fence(cx, cz + 28, 70, 0.6)

	-- Beerenbuesche in Reihen
	for row = 0, 1 do
		for i = 0, 3 do
			makeBerryBush(cx - 24 + i * 12, cz - 14 + row * 14, false)
		end
	end
	makeBerryBush(cx - 24, cz + 16, true)
	makeBerryBush(cx - 4, cz + 16, true)

	-- Obstbaeume
	makeAppleTree(cx + 20, cz + 14)
	makeAppleTree(cx + 24, cz - 4)
	makeAppleTree(cx + 12, cz + 22)

	-- Farmer am Eingang
	WorldBuilder.MakeNpc({
		name = "Farmer Willi",
		shirt = { 110, 160, 80 }, hair = { 200, 180, 140 },
		pos = Vector3.new(cx + 38, 0, cz + 16),
		faceTo = Vector3.new(0, 0, 20),
		prompt = {
			action = "Reden",
			callback = function(player)
				local job = jobs[player]
				if not job then
					jobs[player] = { count = 0 }
					PlayerData.Notify(player, "Farmer Willi: Pflück mir " .. BASKET_SIZE .. " Früchte, dann gibt's " .. JOB_REWARD .. " Münzen!", "info")
				elseif job.count >= BASKET_SIZE then
					jobs[player] = nil
					PlayerData.AddCoins(player, JOB_REWARD)
					PlayerData.Sync(player)
					PlayerData.Notify(player, "Farmer Willi: Super Arbeit! Hier sind " .. JOB_REWARD .. " Münzen!", "good")
				else
					PlayerData.Notify(player, "Farmer Willi: Der Korb ist noch nicht voll (" .. job.count .. "/" .. BASKET_SIZE .. ").", "info")
				end
			end,
		},
	})

	-- Hinweisschild
	local sign = part({ Size = Vector3.new(7, 3, 0.4), Color = c3(240, 230, 205), CFrame = CFrame.lookAt(Vector3.new(cx + 42, 4, cz + 8), Vector3.new(0, 4, 0)) })
	part({ Size = Vector3.new(0.7, 4, 0.7), Color = c3(120, 85, 55), Material = Enum.Material.Wood, CFrame = CFrame.new(cx + 42, 2, cz + 8) })
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = "Beeren-Farm\nFrüchte-Job beim Farmer!"
	label.TextColor3 = c3(60, 45, 30)
	label.Parent = gui
	gui.Parent = sign

	Players.PlayerRemoving:Connect(function(player)
		jobs[player] = nil
	end)
end

return FarmService
