-- ============================================================
-- Spielerdaten: Team, Box, Muenzen, Items, Speichern & Laden
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local PlayerData = {}

-- Wird von Main.server gesetzt:
PlayerData.IsBusy = function(_player) return false end -- im Kampf?
PlayerData.OnTeamChanged = function(_player) end -- Begleiter aktualisieren

local sessions = {}
local store = nil
local storeOk = false

local DataSyncRemote = nil
local NotifyRemote = nil

-- ---------- Monster-Instanzen ----------

function PlayerData.NewMon(speciesId, level)
	local stats = GameData.StatsFor(speciesId, level)
	return { id = speciesId, level = level, xp = 0, hp = stats.maxHp, status = nil }
end

function PlayerData.MaxHpOf(mon)
	return GameData.StatsFor(mon.id, mon.level).maxHp
end

local function defaultData()
	local items = {}
	for id, count in pairs(GameData.StartItems) do
		items[id] = count
	end
	return {
		team = {}, box = {}, items = items,
		coins = GameData.START_COINS,
		starter = false, catches = 0, beatenTrainers = {},
	}
end

-- ---------- Laden/Speichern absichern ----------

local function sanitizeMon(raw)
	if type(raw) ~= "table" then return nil end
	if type(raw.id) ~= "string" or not GameData.Species[raw.id] then return nil end
	local level = math.floor(tonumber(raw.level) or 1)
	if level < 1 then level = 1 end
	if level > GameData.MAX_LEVEL then level = GameData.MAX_LEVEL end
	local mon = PlayerData.NewMon(raw.id, level)
	local maxHp = PlayerData.MaxHpOf(mon)
	local xp = math.floor(tonumber(raw.xp) or 0)
	if xp < 0 then xp = 0 end
	mon.xp = xp
	local hp = math.floor(tonumber(raw.hp) or maxHp)
	if hp < 0 then hp = 0 end
	if hp > maxHp then hp = maxHp end
	mon.hp = hp
	if raw.status == "brand" or raw.status == "schock" then
		mon.status = raw.status
	end
	return mon
end

local function sanitize(raw)
	local data = defaultData()
	if type(raw) ~= "table" then return data end
	if type(raw.team) == "table" then
		for _, rawMon in ipairs(raw.team) do
			local mon = sanitizeMon(rawMon)
			if mon and #data.team < GameData.TEAM_SIZE then
				table.insert(data.team, mon)
			end
		end
	end
	if type(raw.box) == "table" then
		for _, rawMon in ipairs(raw.box) do
			local mon = sanitizeMon(rawMon)
			if mon and #data.box < GameData.BOX_SIZE then
				table.insert(data.box, mon)
			end
		end
	end
	if type(raw.items) == "table" then
		data.items = {}
		for id, count in pairs(raw.items) do
			if GameData.Items[id] and type(count) == "number" and count > 0 then
				data.items[id] = math.floor(count)
			end
		end
	end
	if type(raw.beatenTrainers) == "table" then
		data.beatenTrainers = {}
		for id, v in pairs(raw.beatenTrainers) do
			if v then data.beatenTrainers[id] = true end
		end
	end
	data.coins = math.max(0, math.floor(tonumber(raw.coins) or GameData.START_COINS))
	data.catches = math.floor(tonumber(raw.catches) or 0)
	data.starter = (raw.starter == true) and (#data.team > 0)
	return data
end

local function keyFor(player)
	return "p_" .. player.UserId
end

local function saveNow(player)
	local session = sessions[player]
	if not session or not storeOk then return end
	local payload = {
		team = session.team, box = session.box, items = session.items,
		coins = session.coins, starter = session.starter,
		catches = session.catches, beatenTrainers = session.beatenTrainers,
	}
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)
	if not ok then
		warn("[Monsterwelt] Speichern fehlgeschlagen fuer " .. player.Name .. ": " .. tostring(err))
	end
end

-- ---------- Oeffentliche API ----------

function PlayerData.SessionOf(player)
	return sessions[player]
end

function PlayerData.Notify(player, msg, kind)
	if NotifyRemote then
		NotifyRemote:FireClient(player, msg, kind or "info")
	end
end

local function updateLeaderstats(player)
	local session = sessions[player]
	local stats = player:FindFirstChild("leaderstats")
	if not session or not stats then return end
	local coins = stats:FindFirstChild("Münzen")
	if coins then coins.Value = session.coins end
	local caught = stats:FindFirstChild("Gefangen")
	if caught then caught.Value = session.catches end
end

function PlayerData.Sync(player)
	local session = sessions[player]
	if not session or not DataSyncRemote then return end
	updateLeaderstats(player)
	DataSyncRemote:FireClient(player, {
		team = session.team, box = session.box, items = session.items,
		coins = session.coins, starter = session.starter,
	})
	PlayerData.OnTeamChanged(player)
end

function PlayerData.AddCoins(player, amount)
	local session = sessions[player]
	if not session then return end
	session.coins = math.max(0, session.coins + amount)
end

function PlayerData.GiveItem(player, itemId, count)
	local session = sessions[player]
	if not session or not GameData.Items[itemId] then return end
	session.items[itemId] = (session.items[itemId] or 0) + (count or 1)
end

-- Verbraucht 1x Item. Gibt true zurueck, wenn vorhanden.
function PlayerData.TakeItem(player, itemId)
	local session = sessions[player]
	if not session then return false end
	local count = session.items[itemId] or 0
	if count < 1 then return false end
	if count == 1 then
		session.items[itemId] = nil
	else
		session.items[itemId] = count - 1
	end
	return true
end

-- Heil-/Beeren-Wirkung auf ein Monster anwenden.
-- Gibt (erfolgreich, Nachricht) zurueck.
function PlayerData.ApplyItemEffect(mon, itemId)
	local item = GameData.Items[itemId]
	local sp = GameData.Species[mon.id]
	if item.ball then
		return false, "Fangkugeln kannst du nur im Kampf werfen!"
	end
	local maxHp = GameData.StatsFor(mon.id, mon.level).maxHp
	local didSomething = false
	if item.heal then
		if mon.hp < maxHp then
			if item.heal == "full" then
				mon.hp = maxHp
			else
				mon.hp = math.min(maxHp, mon.hp + item.heal)
			end
			didSomething = true
		end
	end
	if item.cure and mon.status then
		mon.status = nil
		didSomething = true
	end
	if not didSomething then
		return false, "Das würde gerade nichts bringen."
	end
	return true, sp.name .. " fühlt sich besser! (" .. item.name .. ")"
end

function PlayerData.GiveStarter(player, speciesId)
	local session = sessions[player]
	if not session or session.starter then return end
	local valid = false
	for _, id in ipairs(GameData.Starters) do
		if id == speciesId then valid = true end
	end
	if not valid then return end
	table.insert(session.team, PlayerData.NewMon(speciesId, 5))
	session.starter = true
	PlayerData.Sync(player)
	PlayerData.Notify(player, GameData.Species[speciesId].name .. " ist jetzt dein Partner! Viel Erfolg!", "good")
end

function PlayerData.AddCaught(player, speciesId, level)
	local session = sessions[player]
	if not session then return nil end
	local mon = PlayerData.NewMon(speciesId, level)
	local dest = nil
	if #session.team < GameData.TEAM_SIZE then
		table.insert(session.team, mon)
		dest = "Team"
	elseif #session.box < GameData.BOX_SIZE then
		table.insert(session.box, mon)
		dest = "Box"
	end
	if dest then
		session.catches = session.catches + 1
	end
	PlayerData.Sync(player)
	return dest
end

function PlayerData.HealAll(player)
	local session = sessions[player]
	if not session then return end
	for _, mon in ipairs(session.team) do
		mon.hp = PlayerData.MaxHpOf(mon)
		mon.status = nil
	end
	PlayerData.Sync(player)
end

-- ---------- Remote-Handler ----------

local function onTeamAction(player, op, index)
	local session = sessions[player]
	if not session then return end
	if PlayerData.IsBusy(player) then
		PlayerData.Notify(player, "Nicht mitten im Kampf!", "bad")
		return
	end
	index = math.floor(tonumber(index) or 0)
	if op == "leader" then
		if index >= 2 and index <= #session.team then
			local mon = table.remove(session.team, index)
			table.insert(session.team, 1, mon)
		end
	elseif op == "toBox" then
		if index >= 1 and index <= #session.team and #session.team > 1 and #session.box < GameData.BOX_SIZE then
			local mon = table.remove(session.team, index)
			table.insert(session.box, mon)
		end
	elseif op == "fromBox" then
		if index >= 1 and index <= #session.box and #session.team < GameData.TEAM_SIZE then
			local mon = table.remove(session.box, index)
			table.insert(session.team, mon)
		end
	end
	PlayerData.Sync(player)
end

local function onUseItem(player, itemId, teamIndex)
	local session = sessions[player]
	if not session or type(itemId) ~= "string" or not GameData.Items[itemId] then return end
	if PlayerData.IsBusy(player) then
		PlayerData.Notify(player, "Benutze den Beutel im Kampf über das Kampfmenü!", "bad")
		return
	end
	teamIndex = math.floor(tonumber(teamIndex) or 0)
	local mon = session.team[teamIndex]
	if not mon then return end
	if (session.items[itemId] or 0) < 1 then return end
	local ok, msg = PlayerData.ApplyItemEffect(mon, itemId)
	if ok then
		PlayerData.TakeItem(player, itemId)
		PlayerData.Sync(player)
		PlayerData.Notify(player, msg, "good")
	else
		PlayerData.Notify(player, msg, "bad")
	end
end

local function onShopBuy(player, itemId)
	local session = sessions[player]
	if not session or type(itemId) ~= "string" then return end
	local item = GameData.Items[itemId]
	if not item or not item.price then return end
	if session.coins < item.price then
		PlayerData.Notify(player, "Nicht genug Münzen! (" .. item.price .. " nötig)", "bad")
		return
	end
	session.coins = session.coins - item.price
	PlayerData.GiveItem(player, itemId, 1)
	PlayerData.Sync(player)
	PlayerData.Notify(player, item.name .. " gekauft!", "good")
end

-- ---------- Spieler-Lebenszyklus ----------

local function onPlayerAdded(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Münzen"
	coins.Parent = stats
	local caught = Instance.new("IntValue")
	caught.Name = "Gefangen"
	caught.Parent = stats
	stats.Parent = player

	local raw = nil
	if storeOk then
		local ok, result = pcall(function()
			return store:GetAsync(keyFor(player))
		end)
		if ok then
			raw = result
		else
			warn("[Monsterwelt] Laden fehlgeschlagen fuer " .. player.Name .. ": " .. tostring(result))
		end
	end
	sessions[player] = sanitize(raw)
	updateLeaderstats(player)
end

local function onClientReady(player)
	local waited = 0
	while not sessions[player] and player.Parent and waited < 15 do
		task.wait(0.25)
		waited = waited + 0.25
	end
	local session = sessions[player]
	if not session then return end
	PlayerData.Sync(player)
	if session.starter then
		PlayerData.Notify(player, "Willkommen zurück, " .. player.DisplayName .. "!", "info")
	else
		PlayerData.Notify(player, "Willkommen! Hol dir dein erstes Monster im Labor (gelbes Gebäude)!", "info")
	end
end

function PlayerData.Init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore("Monsterwelt_v1")
	end)
	if ok then
		store = result
		storeOk = true
	else
		warn("[Monsterwelt] Kein DataStore-Zugriff (im Studio: API-Zugriff aktivieren). Es wird nicht gespeichert.")
	end

	DataSyncRemote = Remotes.Get("DataSync")
	NotifyRemote = Remotes.Get("Notify")

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(onPlayerAdded, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		saveNow(player)
		sessions[player] = nil
	end)

	Remotes.Get("ClientReady").OnServerEvent:Connect(onClientReady)
	Remotes.Get("TeamAction").OnServerEvent:Connect(function(player, op, index)
		if type(op) == "string" then
			onTeamAction(player, op, index)
		end
	end)
	Remotes.Get("UseItem").OnServerEvent:Connect(onUseItem)
	Remotes.Get("ShopBuy").OnServerEvent:Connect(onShopBuy)
	Remotes.Get("StarterChoose").OnServerEvent:Connect(function(player, speciesId)
		if type(speciesId) == "string" then
			PlayerData.GiveStarter(player, speciesId)
		end
	end)

	task.spawn(function()
		while true do
			task.wait(120)
			for player in pairs(sessions) do
				saveNow(player)
			end
		end
	end)

	game:BindToClose(function()
		for player in pairs(sessions) do
			saveNow(player)
		end
	end)
end

return PlayerData
