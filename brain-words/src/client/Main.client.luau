-- ============================================================
-- BRAIN WORDS - Client-Start
-- Verbindet die UI mit dem Server und animiert die
-- wilden Brain Words in der Welt.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))
local MenuUi = require(script.Parent:WaitForChild("MenuUi"))
local BattleUi = require(script.Parent:WaitForChild("BattleUi"))

-- ---------- RemoteEvents ----------
local ClientReady = Remotes.Get("ClientReady")
local DataSync = Remotes.Get("DataSync")
local Notify = Remotes.Get("Notify")
local StarterOffer = Remotes.Get("StarterOffer")
local StarterChoose = Remotes.Get("StarterChoose")
local BattleStart = Remotes.Get("BattleStart")
local BattleUpdate = Remotes.Get("BattleUpdate")
local BattleAction = Remotes.Get("BattleAction")
local TeamAction = Remotes.Get("TeamAction")

-- ---------- UI aufbauen ----------
MenuUi.Init({
	onTeamAction = function(op, index)
		TeamAction:FireServer(op, index)
	end,
	onStarterPick = function(id)
		StarterChoose:FireServer(id)
	end,
})
BattleUi.Init(function(action)
	BattleAction:FireServer(action)
end)

-- ---------- Server-Nachrichten ----------
DataSync.OnClientEvent:Connect(function(data)
	MenuUi.SetData(data)
end)

Notify.OnClientEvent:Connect(function(msg, kind)
	UiKit.Toast(msg, kind)
end)

StarterOffer.OnClientEvent:Connect(function(options)
	MenuUi.ShowStarter(options)
end)

BattleStart.OnClientEvent:Connect(function(payload)
	MenuUi.CloseAll()
	BattleUi.Start(payload)
end)

BattleUpdate.OnClientEvent:Connect(function(payload)
	BattleUi.Update(payload)
end)

-- ---------- Wilde Brain Words schweben lassen ----------
local floating = {} -- [part] = { phase, gui }

local function watch(part)
	floating[part] = { phase = math.random() * math.pi * 2, gui = nil }
end

for _, part in ipairs(CollectionService:GetTagged("BrainWordSpawn")) do
	watch(part)
end
CollectionService:GetInstanceAddedSignal("BrainWordSpawn"):Connect(watch)
CollectionService:GetInstanceRemovedSignal("BrainWordSpawn"):Connect(function(part)
	floating[part] = nil
end)

RunService.Heartbeat:Connect(function()
	local t = os.clock()
	for part, info in pairs(floating) do
		if part.Parent then
			if not info.gui then
				info.gui = part:FindFirstChildOfClass("BillboardGui")
			end
			if info.gui then
				info.gui.StudsOffset = Vector3.new(0, 2.8 + math.sin(t * 2 + info.phase) * 0.5, 0)
			end
		else
			floating[part] = nil
		end
	end
end)

-- ---------- Fertig: Server Bescheid geben ----------
ClientReady:FireServer()
