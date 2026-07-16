-- ============================================================
-- MONSTERWELT - Client-Start
-- Verbindet UI und Server, Tasten: B = Beutel, T = Team.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(Shared:WaitForChild("Remotes"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))
local HudUi = require(script.Parent:WaitForChild("HudUi"))
local MenuUi = require(script.Parent:WaitForChild("MenuUi"))
local BattleUi = require(script.Parent:WaitForChild("BattleUi"))

-- ---------- RemoteEvents ----------
local ClientReady = Remotes.Get("ClientReady")
local DataSync = Remotes.Get("DataSync")
local Notify = Remotes.Get("Notify")
local StarterAsk = Remotes.Get("StarterAsk")
local StarterChoose = Remotes.Get("StarterChoose")
local BattleStart = Remotes.Get("BattleStart")
local BattleUpdate = Remotes.Get("BattleUpdate")
local BattleAction = Remotes.Get("BattleAction")
local TeamAction = Remotes.Get("TeamAction")
local UseItem = Remotes.Get("UseItem")
local ShopBuy = Remotes.Get("ShopBuy")
local OpenUi = Remotes.Get("OpenUi")

-- ---------- UI aufbauen ----------
local inBattle = false

HudUi.Init({
	onToggleBag = function()
		if not inBattle then
			MenuUi.ToggleBag()
		end
	end,
	onToggleTeam = function()
		if not inBattle then
			MenuUi.ToggleTeam(false)
		end
	end,
})

MenuUi.Init({
	onTeamAction = function(op, index)
		TeamAction:FireServer(op, index)
	end,
	onUseItem = function(itemId, teamIndex)
		UseItem:FireServer(itemId, teamIndex)
	end,
	onShopBuy = function(itemId)
		ShopBuy:FireServer(itemId)
	end,
	onStarterChoose = function(speciesId)
		StarterChoose:FireServer(speciesId)
	end,
})

BattleUi.Init(function(action)
	BattleAction:FireServer(action)
end)

-- ---------- Server-Nachrichten ----------
DataSync.OnClientEvent:Connect(function(data)
	HudUi.SetData(data)
	MenuUi.SetData(data)
end)

Notify.OnClientEvent:Connect(function(msg, kind)
	if kind == "heal" then
		UiKit.PlayHealJingle()
	end
	UiKit.Toast(msg, kind)
end)

StarterAsk.OnClientEvent:Connect(function(speciesId)
	MenuUi.ShowStarterAsk(speciesId)
end)

OpenUi.OnClientEvent:Connect(function(which)
	if inBattle then return end
	if which == "shop" then
		MenuUi.OpenShop()
	elseif which == "box" then
		MenuUi.ToggleTeam(true)
	end
end)

BattleStart.OnClientEvent:Connect(function(payload)
	inBattle = true
	MenuUi.CloseAll()
	BattleUi.Start(payload)
end)

BattleUpdate.OnClientEvent:Connect(function(payload)
	if payload.over then
		inBattle = false
	end
	BattleUi.Update(payload)
end)

-- ---------- Tasten ----------
UserInputService.InputBegan:Connect(function(input, gameProcessed)
	if gameProcessed or inBattle then return end
	if input.KeyCode == Enum.KeyCode.B then
		MenuUi.ToggleBag()
	elseif input.KeyCode == Enum.KeyCode.T then
		MenuUi.ToggleTeam(false)
	end
end)

-- ---------- Fertig ----------
ClientReady:FireServer()
