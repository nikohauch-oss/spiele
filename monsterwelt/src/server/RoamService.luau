-- ============================================================
-- Wilde Monster:
-- 1) Sichtbar herumhuepfende Monster im hohen Gras (anlaufen!)
-- 2) Zufallsbegegnungen beim Laufen durchs hohe Gras
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local MonsterFactory = require(Shared:WaitForChild("MonsterFactory"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local RoamService = {}

local ROAMERS_PER_PATCH = 2
local STEP_CHANCE = 0.09 -- Chance pro Gras-"Schritt"

local rng = Random.new()
local folder = nil
local records = {} -- [model] = { id, level, patchIndex }
local onWildBattle = nil -- Callback: (player, speciesId, level, modelOderNil) -> bool

-- ---------- Helfer ----------

local function pickFromPool(pool)
	local total = 0
	for _, entry in ipairs(pool) do
		total = total + entry[2]
	end
	local roll = rng:NextNumber(0, total)
	for _, entry in ipairs(pool) do
		roll = roll - entry[2]
		if roll <= 0 then
			return entry[1]
		end
	end
	return pool[1][1]
end

local function randomInPatch(patch)
	return Vector3.new(rng:NextNumber(patch[1] + 3, patch[3] - 3), 0, rng:NextNumber(patch[2] + 3, patch[4] - 3))
end

local function patchAt(pos)
	for i, patch in ipairs(GameData.GrassPatches) do
		if pos.X >= patch[1] and pos.X <= patch[3] and pos.Z >= patch[2] and pos.Z <= patch[4] then
			return i, patch
		end
	end
	return nil, nil
end

-- ---------- Herumlaufende Monster ----------

function RoamService.Take(model)
	local rec = records[model]
	if not rec then return nil end
	records[model] = nil
	model:Destroy()
	return rec
end

local function hopTo(model, root, targetPos)
	-- Ein Hopser: hoch-vorwaerts, dann runter
	local h = model:GetAttribute("RootHeight") or 1.5
	local current = root.Position
	local flatTarget = Vector3.new(targetPos.X, h, targetPos.Z)
	local look = CFrame.lookAt(current, Vector3.new(flatTarget.X, current.Y, flatTarget.Z))
	local mid = current:Lerp(flatTarget, 0.5) + Vector3.new(0, 1.4, 0)
	local t1 = TweenService:Create(root, TweenInfo.new(0.26, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CFrame = CFrame.lookAt(mid, mid + look.LookVector) })
	t1:Play()
	t1.Completed:Wait()
	if not root.Parent then return false end
	local t2 = TweenService:Create(root, TweenInfo.new(0.26, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { CFrame = CFrame.lookAt(flatTarget, flatTarget + look.LookVector) })
	t2:Play()
	t2.Completed:Wait()
	return root.Parent ~= nil
end

local function roamLoop(model, root, patch)
	while model.Parent and root.Parent do
		local target = randomInPatch(patch)
		local hops = math.floor((Vector3.new(target.X, 0, target.Z) - Vector3.new(root.Position.X, 0, root.Position.Z)).Magnitude / 4)
		for _ = 1, math.max(1, hops) do
			if not model.Parent or not root.Parent then return end
			local current = root.Position
			local dir = Vector3.new(target.X - current.X, 0, target.Z - current.Z)
			if dir.Magnitude < 3 then break end
			local nextPos = current + dir.Unit * math.min(4, dir.Magnitude)
			if not hopTo(model, root, nextPos) then return end
			task.wait(rng:NextNumber(0.1, 0.5))
		end
		task.wait(rng:NextNumber(1, 3))
	end
end

-- speciesId/level/isLegendary sind optional (fuer legendaere Spawns)
local function spawnRoamer(patchIndex, speciesId, level, isLegendary)
	local patch = GameData.GrassPatches[patchIndex]
	local route = GameData.Routes[patch[5]]
	speciesId = speciesId or pickFromPool(route.pool)
	level = level or rng:NextInteger(route.levelMin, route.levelMax)
	local sp = GameData.Species[speciesId]

	local model = MonsterFactory.Create(speciesId, 1)
	local pos = randomInPatch(patch)
	MonsterFactory.PlaceOnGround(model, pos, pos + Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1)))

	-- Namensschild
	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromOffset(220, isLegendary and 76 or 56)
	billboard.StudsOffset = Vector3.new(0, isLegendary and 4.6 or 3.2, 0)
	billboard.MaxDistance = isLegendary and 220 or 100
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, isLegendary and 0.6 or 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = isLegendary and ("⭐ " .. sp.name .. " ⭐") or (sp.name .. "  Lv. " .. level)
	label.TextColor3 = isLegendary and Color3.fromRGB(255, 210, 70) or GameData.TypeColors[sp.typ]
	label.TextStrokeTransparency = 0.2
	label.Parent = billboard
	if isLegendary then
		local sub = Instance.new("TextLabel")
		sub.Position = UDim2.new(0, 0, 0.6, 0)
		sub.Size = UDim2.new(1, 0, 0.4, 0)
		sub.BackgroundTransparency = 1
		sub.Font = Enum.Font.FredokaOne
		sub.TextScaled = true
		sub.Text = "Lv. " .. level .. " • LEGENDÄR"
		sub.TextColor3 = Color3.fromRGB(255, 255, 255)
		sub.TextStrokeTransparency = 0.3
		sub.Parent = billboard
	end
	billboard.Parent = model.PrimaryPart

	-- Legendaere zaehlen nicht zum normalen Nachschub (patchIndex 0)
	records[model] = { id = speciesId, level = level, patchIndex = isLegendary and 0 or patchIndex }

	-- Beruehrung startet den Kampf
	local touched = false
	for _, child in ipairs(model:GetDescendants()) do
		if child:IsA("BasePart") then
			child.Touched:Connect(function(hit)
				if touched then return end
				local character = hit.Parent
				local player = character and Players:GetPlayerFromCharacter(character)
				if not player then return end
				if not records[model] then return end
				touched = true
				local started = onWildBattle(player, speciesId, level, model)
				if not started then
					touched = false
				end
			end)
		end
	end

	model.Parent = folder
	task.spawn(roamLoop, model, model.PrimaryPart, patch)
	return model
end

-- ---------- Legendaere Monster (selten!) ----------

local activeLegendary = nil

local function announceAll(msg)
	for _, player in ipairs(Players:GetPlayers()) do
		PlayerData.Notify(player, msg, "good")
	end
end

local function legendaryLoop()
	task.wait(120) -- erste Ruhephase nach Serverstart
	while true do
		if not activeLegendary or not activeLegendary.Parent or not records[activeLegendary] then
			local id = GameData.Legendaries[rng:NextInteger(1, #GameData.Legendaries)]
			local patchIndex = rng:NextInteger(1, #GameData.GrassPatches)
			local level = rng:NextInteger(22, 28)
			local model = spawnRoamer(patchIndex, id, level, true)
			activeLegendary = model
			local patch = GameData.GrassPatches[patchIndex]
			local routeName = GameData.Routes[patch[5]].name
			announceAll("⭐ Ein legendäres " .. GameData.Species[id].name .. " ist auf " .. routeName .. " aufgetaucht! Schnell!")
			-- Nach 2 Minuten verschwindet es wieder
			task.delay(120, function()
				if records[model] then
					records[model] = nil
					model:Destroy()
					announceAll("Das legendäre " .. GameData.Species[id].name .. " ist wieder verschwunden...")
				end
				if activeLegendary == model then
					activeLegendary = nil
				end
			end)
		end
		task.wait(rng:NextNumber(180, 300))
	end
end

local function roamerManager()
	while true do
		for patchIndex in ipairs(GameData.GrassPatches) do
			local count = 0
			for _, rec in pairs(records) do
				if rec.patchIndex == patchIndex then
					count = count + 1
				end
			end
			if count < ROAMERS_PER_PATCH then
				spawnRoamer(patchIndex)
			end
		end
		task.wait(5)
	end
end

-- ---------- Zufallsbegegnungen im Gras ----------

local lastPos = {} -- [player] = Vector3

local function grassLoop()
	while true do
		task.wait(0.4)
		for _, player in ipairs(Players:GetPlayers()) do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if root then
				local pos = root.Position
				local prev = lastPos[player]
				lastPos[player] = pos
				local patchIndex, patch = patchAt(pos)
				if patchIndex and prev then
					local moved = (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(prev.X, 0, prev.Z)).Magnitude
					if moved > 2 and rng:NextNumber() < STEP_CHANCE then
						local route = GameData.Routes[patch[5]]
						local speciesId = pickFromPool(route.pool)
						local level = rng:NextInteger(route.levelMin, route.levelMax)
						onWildBattle(player, speciesId, level, nil)
					end
				end
			end
		end
	end
end

function RoamService.Init(wildBattleCallback)
	onWildBattle = wildBattleCallback
	folder = Instance.new("Folder")
	folder.Name = "WildeMonster"
	folder.Parent = workspace
	task.spawn(roamerManager)
	task.spawn(grassLoop)
	task.spawn(legendaryLoop)
	Players.PlayerRemoving:Connect(function(player)
		lastPos[player] = nil
	end)
end

return RoamService
