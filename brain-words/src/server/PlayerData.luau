-- ============================================================
-- Spielerdaten: Team, Box, Brain-Dex, Speichern & Laden
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local PlayerData = {}

-- Wird von Main.server mit BattleService.IsInBattle ueberschrieben,
-- damit man das Team nicht mitten im Kampf umbauen kann.
PlayerData.IsBusy = function(_player)
	return false
end

local sessions = {} -- [player] = { team, box, dex, catches, starter }
local store = nil
local storeOk = false

local DataSyncRemote = nil
local NotifyRemote = nil
local StarterOfferRemote = nil

-- ---------- Hilfsfunktionen ----------

function PlayerData.NewMon(speciesId, level)
	local stats = GameData.StatsFor(speciesId, level)
	return { id = speciesId, level = level, xp = 0, hp = stats.maxHp }
end

function PlayerData.MaxHpOf(mon)
	return GameData.StatsFor(mon.id, mon.level).maxHp
end

local function defaultData()
	return { team = {}, box = {}, dex = {}, catches = 0, starter = false }
end

-- Geladene Daten absichern (falls alte/kaputte Speicherstaende existieren)
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
	if type(raw.dex) == "table" then
		for id, v in pairs(raw.dex) do
			if v and GameData.Species[id] then
				data.dex[id] = true
			end
		end
	end
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
		team = session.team,
		box = session.box,
		dex = session.dex,
		catches = session.catches,
		starter = session.starter,
	}
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)
	if not ok then
		warn("[BrainWords] Speichern fehlgeschlagen fuer " .. player.Name .. ": " .. tostring(err))
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
	local caught = stats:FindFirstChild("Gefangen")
	if caught then caught.Value = session.catches end
	local best = 0
	for _, mon in ipairs(session.team) do
		if mon.level > best then best = mon.level end
	end
	local bestVal = stats:FindFirstChild("Bestes Lv")
	if bestVal then bestVal.Value = best end
end

function PlayerData.Sync(player)
	local session = sessions[player]
	if not session or not DataSyncRemote then return end
	updateLeaderstats(player)
	DataSyncRemote:FireClient(player, {
		team = session.team,
		box = session.box,
		dex = session.dex,
		catches = session.catches,
		starter = session.starter,
	})
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
	session.dex[speciesId] = true
	session.starter = true
	PlayerData.Sync(player)
	PlayerData.Notify(player, GameData.Species[speciesId].name .. " ist jetzt dein Partner! Viel Erfolg!", "good")
end

-- Fuegt ein gefangenes Brain Word hinzu. Gibt "Team", "Box" oder nil zurueck.
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
		session.dex[speciesId] = true
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
	end
	PlayerData.Sync(player)
end

-- Team-Verwaltung aus dem Menue
function PlayerData.HandleTeamAction(player, op, index)
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

-- ---------- Spieler-Lebenszyklus ----------

local function onPlayerAdded(player)
	-- Leaderboard
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local caught = Instance.new("IntValue")
	caught.Name = "Gefangen"
	caught.Value = 0
	caught.Parent = stats
	local best = Instance.new("IntValue")
	best.Name = "Bestes Lv"
	best.Value = 0
	best.Parent = stats
	stats.Parent = player

	-- Daten laden
	local raw = nil
	if storeOk then
		local ok, result = pcall(function()
			return store:GetAsync(keyFor(player))
		end)
		if ok then
			raw = result
		else
			warn("[BrainWords] Laden fehlgeschlagen fuer " .. player.Name .. ": " .. tostring(result))
		end
	end
	sessions[player] = sanitize(raw)
	updateLeaderstats(player)
end

local function onPlayerRemoving(player)
	saveNow(player)
	sessions[player] = nil
end

-- Client meldet: UI ist bereit -> Daten schicken, ggf. Starterauswahl
local function onClientReady(player)
	-- Kurz warten, falls die Daten noch geladen werden
	local waited = 0
	while not sessions[player] and player.Parent and waited < 15 do
		task.wait(0.25)
		waited = waited + 0.25
	end
	local session = sessions[player]
	if not session then return end
	PlayerData.Sync(player)
	if not session.starter then
		StarterOfferRemote:FireClient(player, GameData.Starters)
	else
		PlayerData.Notify(player, "Willkommen zurück, " .. player.DisplayName .. "!", "info")
	end
end

function PlayerData.Init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore("BrainWords_v1")
	end)
	if ok then
		store = result
		storeOk = true
	else
		warn("[BrainWords] Kein DataStore-Zugriff (im Studio: API-Zugriff in den Spieleinstellungen aktivieren). Es wird nicht gespeichert.")
	end

	DataSyncRemote = Remotes.Get("DataSync")
	NotifyRemote = Remotes.Get("Notify")
	StarterOfferRemote = Remotes.Get("StarterOffer")

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(onPlayerAdded, player)
	end
	Players.PlayerRemoving:Connect(onPlayerRemoving)

	Remotes.Get("ClientReady").OnServerEvent:Connect(onClientReady)
	Remotes.Get("StarterChoose").OnServerEvent:Connect(function(player, speciesId)
		if type(speciesId) == "string" then
			PlayerData.GiveStarter(player, speciesId)
		end
	end)
	Remotes.Get("TeamAction").OnServerEvent:Connect(function(player, op, index)
		if type(op) == "string" then
			PlayerData.HandleTeamAction(player, op, index)
		end
	end)

	-- Automatisch alle 2 Minuten speichern
	task.spawn(function()
		while true do
			task.wait(120)
			for player in pairs(sessions) do
				saveNow(player)
			end
		end
	end)

	-- Beim Schliessen des Servers alle speichern
	game:BindToClose(function()
		for player in pairs(sessions) do
			saveNow(player)
		end
	end)
end

return PlayerData
