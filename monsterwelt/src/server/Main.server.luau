-- ============================================================
-- MONSTERWELT - Server-Start
-- Baut die Welt und startet alle Systeme.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes"))

-- RemoteEvents zuerst, damit der Client nichts verpasst
Remotes.InitServer()

local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local WorldBuilder = require(script.Parent:WaitForChild("WorldBuilder"))
local CompanionService = require(script.Parent:WaitForChild("CompanionService"))
local BattleService = require(script.Parent:WaitForChild("BattleService"))
local RoamService = require(script.Parent:WaitForChild("RoamService"))
local TrainerService = require(script.Parent:WaitForChild("TrainerService"))
local FarmService = require(script.Parent:WaitForChild("FarmService"))

PlayerData.Init()
WorldBuilder.Build()
CompanionService.Init()
BattleService.Init()

-- Wilde Begegnungen (Gras + herumlaufende Monster)
RoamService.Init(function(player, speciesId, level, roamerModel)
	return BattleService.TryStartWild(player, speciesId, level, roamerModel)
end)

-- Trainer-Herausforderungen
TrainerService.Init(function(player, trainerDef)
	return BattleService.TryStartTrainer(player, trainerDef)
end)

FarmService.Init()

-- Querverbindungen
PlayerData.IsBusy = BattleService.IsInBattle
PlayerData.OnTeamChanged = function(player)
	CompanionService.Refresh(player)
end

print("[Monsterwelt] Server gestartet - viel Spaß beim Fangen!")
