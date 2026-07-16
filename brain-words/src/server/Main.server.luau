-- ============================================================
-- BRAIN WORDS - Server-Start
-- Baut die Welt, laedt die Spielerdaten und startet alles.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes"))

-- RemoteEvents zuerst, damit der Client nichts verpasst
Remotes.InitServer()

local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local MapBuilder = require(script.Parent:WaitForChild("MapBuilder"))
local SpawnService = require(script.Parent:WaitForChild("SpawnService"))
local BattleService = require(script.Parent:WaitForChild("BattleService"))

MapBuilder.Build()
PlayerData.Init()
BattleService.Init()

-- Waehrend eines Kampfes darf das Team nicht umgebaut werden
PlayerData.IsBusy = BattleService.IsInBattle

-- Klick auf ein wildes Brain Word -> Kampf starten
SpawnService.Init(function(player, model)
	BattleService.TryStartWild(player, model)
end)

print("[BrainWords] Server gestartet - viel Spaß beim Fangen!")
