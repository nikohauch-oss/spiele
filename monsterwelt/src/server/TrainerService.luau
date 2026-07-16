-- ============================================================
-- Trainer-NPCs auf den Routen: Wer vorbeilaeuft, wird zum
-- Kampf herausgefordert. Sieg bringt Muenzen (einmalig).
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local WorldBuilder = require(script.Parent:WaitForChild("WorldBuilder"))

local TrainerService = {}

local CHALLENGE_DISTANCE = 13

local onTrainerBattle = nil -- Callback: (player, trainerDef) -> bool
local cooldown = {} -- [player] = { [trainerId] = Zeitpunkt }

local function trainerPosition(def)
	return Vector3.new(def.pos[1], 0, def.pos[2])
end

local function detectionLoop()
	while true do
		task.wait(0.5)
		for _, def in ipairs(GameData.Trainers) do
			local tpos = trainerPosition(def)
			for _, player in ipairs(Players:GetPlayers()) do
				local session = PlayerData.SessionOf(player)
				local character = player.Character
				local root = character and character:FindFirstChild("HumanoidRootPart")
				if session and session.starter and root and not session.beatenTrainers[def.id] then
					local dist = (Vector3.new(root.Position.X, 0, root.Position.Z) - tpos).Magnitude
					if dist < CHALLENGE_DISTANCE then
						local cd = cooldown[player]
						local last = cd and cd[def.id]
						if not last or os.clock() - last > 20 then
							cooldown[player] = cooldown[player] or {}
							cooldown[player][def.id] = os.clock()
							local started = onTrainerBattle(player, def)
							if started then
								PlayerData.Notify(player, def.name .. ": " .. def.greeting, "info")
							end
						end
					end
				end
			end
		end
	end
end

function TrainerService.MarkBeaten(player, trainerId)
	local session = PlayerData.SessionOf(player)
	if session then
		session.beatenTrainers[trainerId] = true
	end
end

function TrainerService.Init(trainerBattleCallback)
	onTrainerBattle = trainerBattleCallback

	-- Trainer-Figuren aufstellen
	for _, def in ipairs(GameData.Trainers) do
		local pos = trainerPosition(def)
		WorldBuilder.MakeNpc({
			name = def.name,
			shirt = def.shirt,
			pos = pos,
			faceTo = Vector3.new(0, 0, 0),
			prompt = {
				action = "Herausfordern",
				callback = function(player)
					local session = PlayerData.SessionOf(player)
					if not session or not session.starter then
						PlayerData.Notify(player, "Hol dir zuerst ein Monster im Labor!", "bad")
						return
					end
					if session.beatenTrainers[def.id] then
						PlayerData.Notify(player, def.name .. ": Du hast mich schon besiegt. Stark!", "info")
						return
					end
					local started = onTrainerBattle(player, def)
					if started then
						PlayerData.Notify(player, def.name .. ": " .. def.greeting, "info")
					end
				end,
			},
		})
	end

	Players.PlayerRemoving:Connect(function(player)
		cooldown[player] = nil
	end)
	task.spawn(detectionLoop)
end

return TrainerService
