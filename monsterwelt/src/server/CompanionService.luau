-- ============================================================
-- Begleiter: Das erste Team-Monster laeuft dem Spieler
-- hinterher. Laeuft auf dem Server, damit ALLE Spieler die
-- Begleiter der anderen sehen.
-- ============================================================

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MonsterFactory = require(Shared:WaitForChild("MonsterFactory"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local CompanionService = {}

local companions = {} -- [player] = { model, speciesId }
local folder = nil

local function destroyCompanion(player)
	local comp = companions[player]
	if comp then
		if comp.model then
			comp.model:Destroy()
		end
		companions[player] = nil
	end
end

-- Baut den Begleiter neu, wenn sich das erste Team-Monster aendert
function CompanionService.Refresh(player)
	local session = PlayerData.SessionOf(player)
	local wantedId = nil
	if session and session.team[1] then
		wantedId = session.team[1].id
	end
	local comp = companions[player]
	if comp and comp.speciesId == wantedId then
		return
	end
	destroyCompanion(player)
	if not wantedId then return end

	local model = MonsterFactory.Create(wantedId, 0.8)
	model.Name = player.Name .. "s " .. model.Name
	local character = player.Character
	local startPos = Vector3.new(0, 0, 20)
	if character and character.PrimaryPart then
		startPos = character.PrimaryPart.Position + Vector3.new(-3, -2.5, 3)
	end
	MonsterFactory.PlaceOnGround(model, Vector3.new(startPos.X, 0, startPos.Z), startPos + Vector3.new(0, 0, -4))
	model.Parent = folder
	companions[player] = { model = model, speciesId = wantedId }
end

local function updateLoop()
	while true do
		task.wait(0.12)
		for player, comp in pairs(companions) do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local body = comp.model and comp.model.PrimaryPart
			if root and body then
				-- Zielpunkt: schraeg hinter dem Spieler
				local targetCf = root.CFrame * CFrame.new(-2.6, 0, 3.4)
				local h = comp.model:GetAttribute("RootHeight") or 1.5
				local target = Vector3.new(targetCf.X, h, targetCf.Z)
				local current = body.Position
				local dist = (Vector3.new(target.X, 0, target.Z) - Vector3.new(current.X, 0, current.Z)).Magnitude
				if dist > 40 then
					-- Zu weit weg: teleportieren
					comp.model:PivotTo(CFrame.lookAt(target, target + root.CFrame.LookVector))
				elseif dist > 1.2 then
					-- Weich hinterherlaufen (mit kleinem Hopser)
					local alpha = math.min(1, 0.22)
					local newPos = current:Lerp(target, alpha)
					local hop = math.abs(math.sin(os.clock() * 8)) * 0.35
					local look = Vector3.new(target.X, newPos.Y, target.Z)
					if (look - newPos).Magnitude > 0.1 then
						comp.model:PivotTo(CFrame.lookAt(Vector3.new(newPos.X, h + hop, newPos.Z), Vector3.new(look.X, h + hop, look.Z)))
					end
				end
			end
		end
	end
end

function CompanionService.Init()
	folder = Instance.new("Folder")
	folder.Name = "Begleiter"
	folder.Parent = workspace

	Players.PlayerRemoving:Connect(destroyCompanion)
	local function hookPlayer(player)
		player.CharacterAdded:Connect(function()
			task.wait(0.5)
			CompanionService.Refresh(player)
		end)
	end
	Players.PlayerAdded:Connect(hookPlayer)
	for _, player in ipairs(Players:GetPlayers()) do
		hookPlayer(player)
	end
	task.spawn(updateLoop)
end

return CompanionService
