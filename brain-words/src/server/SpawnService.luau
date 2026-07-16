-- ============================================================
-- Laesst wilde Brain Words in den Zonen erscheinen.
-- Jedes wilde Brain Word ist eine leuchtende Kugel mit
-- schwebendem Namen und einem "Kaempfen!"-Knopf (Taste E).
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))

local SpawnService = {}

local LIFETIME = 130 -- Sekunden, bis ein unberuehrtes Brain Word verschwindet

local rng = Random.new()
local records = {} -- [model] = { id, level, zoneId, born }
local folder = nil
local onPromptTriggered = nil -- Callback aus Main (startet den Kampf)

local function pickSpecies(zone)
	local total = 0
	for _, entry in ipairs(zone.pool) do
		total = total + entry[2]
	end
	local roll = rng:NextNumber(0, total)
	for _, entry in ipairs(zone.pool) do
		roll = roll - entry[2]
		if roll <= 0 then
			return entry[1]
		end
	end
	return zone.pool[1][1]
end

local function spawnOne(zone)
	local speciesId = pickSpecies(zone)
	local sp = GameData.Species[speciesId]
	local level = rng:NextInteger(zone.levelMin, zone.levelMax)

	-- Position: zufaellig in der Zone verteilt
	local ang = rng:NextNumber(0, math.pi * 2)
	local dist = zone.radius * 0.9 * math.sqrt(rng:NextNumber())
	local x = zone.center.X + math.cos(ang) * dist
	local z = zone.center.Z + math.sin(ang) * dist

	local orb = Instance.new("Part")
	orb.Name = sp.name
	orb.Shape = Enum.PartType.Ball
	orb.Size = Vector3.new(2.6, 2.6, 2.6)
	orb.CFrame = CFrame.new(x, 3, z)
	orb.Anchored = true
	orb.CanCollide = false
	orb.CastShadow = false
	orb.Material = Enum.Material.Neon
	orb.Color = GameData.TypeColors[sp.typ]
	orb:SetAttribute("SpeciesId", speciesId)
	orb:SetAttribute("Level", level)

	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromOffset(230, 84)
	billboard.StudsOffset = Vector3.new(0, 2.8, 0)
	billboard.MaxDistance = 170

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.new(1, 0, 0.62, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.TextScaled = true
	nameLabel.Text = sp.name
	nameLabel.TextColor3 = GameData.Rarities[sp.rarity].color
	nameLabel.TextStrokeTransparency = 0.15
	nameLabel.Parent = billboard

	local subLabel = Instance.new("TextLabel")
	subLabel.Position = UDim2.new(0, 0, 0.62, 0)
	subLabel.Size = UDim2.new(1, 0, 0.38, 0)
	subLabel.BackgroundTransparency = 1
	subLabel.Font = Enum.Font.FredokaOne
	subLabel.TextScaled = true
	subLabel.Text = "Lv. " .. level .. "  •  " .. sp.typ
	subLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	subLabel.TextStrokeTransparency = 0.3
	subLabel.Parent = billboard
	billboard.Parent = orb

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Kämpfen!"
	prompt.ObjectText = sp.name .. " (Lv. " .. level .. ")"
	prompt.HoldDuration = 0.25
	prompt.MaxActivationDistance = 15
	prompt.RequiresLineOfSight = false
	prompt.Parent = orb
	prompt.Triggered:Connect(function(player)
		if onPromptTriggered then
			onPromptTriggered(player, orb)
		end
	end)

	CollectionService:AddTag(orb, "BrainWordSpawn")
	records[orb] = { id = speciesId, level = level, zoneId = zone.id, born = os.clock() }
	orb.Parent = folder
end

-- Nimmt ein wildes Brain Word aus der Welt (fuer den Kampfstart).
-- Gibt den Datensatz zurueck - oder nil, falls es schon weg ist.
function SpawnService.Take(model)
	local rec = records[model]
	if not rec then return nil end
	records[model] = nil
	model:Destroy()
	return rec
end

local function zoneLoop(zone)
	while true do
		-- Alte Spawns aufraeumen
		local now = os.clock()
		local count = 0
		for model, rec in pairs(records) do
			if rec.zoneId == zone.id then
				if now - rec.born > LIFETIME then
					records[model] = nil
					model:Destroy()
				else
					count = count + 1
				end
			end
		end
		-- Nachschub
		if count < zone.maxActive then
			spawnOne(zone)
		end
		task.wait(rng:NextNumber(4, 7))
	end
end

function SpawnService.Init(promptCallback)
	onPromptTriggered = promptCallback
	folder = Instance.new("Folder")
	folder.Name = "WildeBrainWords"
	folder.Parent = workspace
	for _, zone in ipairs(GameData.Zones) do
		task.spawn(zoneLoop, zone)
	end
end

return SpawnService
