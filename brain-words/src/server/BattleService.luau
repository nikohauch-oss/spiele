-- ============================================================
-- Rundenbasiertes Kampfsystem (Server-Seite).
-- Der Server berechnet alles, der Client zeigt es nur an.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local SpawnService = require(script.Parent:WaitForChild("SpawnService"))

local BattleService = {}

local rng = Random.new()
local battles = {} -- [player] = Kampfzustand
local BattleStartRemote = nil
local BattleUpdateRemote = nil

-- ---------- Ansichten fuer den Client ----------

local function movesView(moveIds)
	local list = {}
	for _, moveId in ipairs(moveIds) do
		local move = GameData.Moves[moveId]
		table.insert(list, { name = move.name, typ = move.typ, power = move.power })
	end
	return list
end

local function allyView(mon)
	local sp = GameData.Species[mon.id]
	local stats = GameData.StatsFor(mon.id, mon.level)
	return {
		name = sp.name,
		typ = sp.typ,
		level = mon.level,
		hp = mon.hp,
		maxHp = stats.maxHp,
		xp = mon.xp,
		xpNext = GameData.XpToNext(mon.level),
		moves = movesView(GameData.MovesFor(mon.id, mon.level)),
	}
end

local function enemyView(enemy)
	local sp = GameData.Species[enemy.id]
	return {
		name = sp.name,
		typ = sp.typ,
		rarity = sp.rarity,
		level = enemy.level,
		hp = enemy.hp,
		maxHp = enemy.stats.maxHp,
	}
end

local function teamView(session)
	local list = {}
	for _, mon in ipairs(session.team) do
		local sp = GameData.Species[mon.id]
		table.insert(list, {
			name = sp.name,
			typ = sp.typ,
			level = mon.level,
			hp = mon.hp,
			maxHp = GameData.StatsFor(mon.id, mon.level).maxHp,
		})
	end
	return list
end

-- ---------- Hilfsfunktionen ----------

local function push(events, event)
	table.insert(events, event)
end

local function setFrozen(player, frozen)
	local character = player.Character
	if not character then return end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then return end
	if frozen then
		humanoid.WalkSpeed = 0
		humanoid.JumpHeight = 0
	else
		humanoid.WalkSpeed = 16
		humanoid.JumpHeight = 7.2
	end
end

local function calcDamage(attLevel, attAtk, defDef, moveId, attackerTyp, defenderTyp)
	local move = GameData.Moves[moveId]
	local stab = (move.typ == attackerTyp) and 1.5 or 1
	local mult = GameData.TypeMultiplier(move.typ, defenderTyp)
	local base = ((2 * attLevel / 5 + 2) * move.power * attAtk / math.max(defDef, 1)) / 30 + 3
	local dmg = math.floor(base * stab * mult * (0.85 + rng:NextNumber() * 0.15))
	if dmg < 1 then dmg = 1 end
	return dmg, mult
end

local function pushEffectiveness(events, mult)
	if mult > 1 then
		push(events, { t = "text", msg = "Sehr effektiv!" })
	elseif mult < 1 then
		push(events, { t = "text", msg = "Nicht sehr effektiv..." })
	end
end

-- Angriff des Spieler-Brain-Words. Gibt true zurueck, wenn der Gegner besiegt wurde.
local function allyAttack(session, state, events, moveId)
	local mon = session.team[state.monIndex]
	local sp = GameData.Species[mon.id]
	local stats = GameData.StatsFor(mon.id, mon.level)
	local move = GameData.Moves[moveId]
	local dmg, mult = calcDamage(mon.level, stats.atk, state.enemy.stats.def, moveId, sp.typ, GameData.Species[state.enemy.id].typ)
	state.enemy.hp = math.max(0, state.enemy.hp - dmg)
	push(events, { t = "text", msg = sp.name .. " setzt " .. move.name .. " ein!" })
	push(events, { t = "hp", side = "enemy", hp = state.enemy.hp })
	pushEffectiveness(events, mult)
	if state.enemy.hp <= 0 then
		push(events, { t = "text", msg = "Das wilde " .. GameData.Species[state.enemy.id].name .. " wurde besiegt!" })
		return true
	end
	return false
end

-- Der Gegner sucht sich eine (moeglichst effektive) Attacke aus
local function chooseEnemyMove(state, defenderTyp)
	local weights = {}
	local total = 0
	for _, moveId in ipairs(state.enemy.moves) do
		local move = GameData.Moves[moveId]
		local mult = GameData.TypeMultiplier(move.typ, defenderTyp)
		local w = move.power * mult
		table.insert(weights, { moveId, w })
		total = total + w
	end
	local roll = rng:NextNumber(0, total)
	for _, entry in ipairs(weights) do
		roll = roll - entry[2]
		if roll <= 0 then
			return entry[1]
		end
	end
	return state.enemy.moves[1]
end

-- Angriff des Gegners. Gibt true zurueck, wenn das eigene Brain Word besiegt wurde.
local function enemyAttack(session, state, events)
	local mon = session.team[state.monIndex]
	local monSp = GameData.Species[mon.id]
	local enemySp = GameData.Species[state.enemy.id]
	local moveId = chooseEnemyMove(state, monSp.typ)
	local move = GameData.Moves[moveId]
	local myStats = GameData.StatsFor(mon.id, mon.level)
	local dmg, mult = calcDamage(state.enemy.level, state.enemy.stats.atk, myStats.def, moveId, enemySp.typ, monSp.typ)
	mon.hp = math.max(0, mon.hp - dmg)
	push(events, { t = "text", msg = "Das wilde " .. enemySp.name .. " setzt " .. move.name .. " ein!" })
	push(events, { t = "hp", side = "ally", hp = mon.hp })
	pushEffectiveness(events, mult)
	if mon.hp <= 0 then
		push(events, { t = "text", msg = monSp.name .. " wurde besiegt!" })
		return true
	end
	return false
end

-- EP-Belohnung inkl. Level-Ups und Entwicklung
local function awardXp(session, state, events)
	local mon = session.team[state.monIndex]
	local enemySp = GameData.Species[state.enemy.id]
	local gain = GameData.XpGain(state.enemy.level, enemySp.rarity)
	mon.xp = mon.xp + gain
	push(events, { t = "text", msg = GameData.Species[mon.id].name .. " erhält " .. gain .. " EP!" })

	local changed = false
	while mon.level < GameData.MAX_LEVEL and mon.xp >= GameData.XpToNext(mon.level) do
		mon.xp = mon.xp - GameData.XpToNext(mon.level)
		local oldMax = GameData.StatsFor(mon.id, mon.level).maxHp
		mon.level = mon.level + 1
		local newMax = GameData.StatsFor(mon.id, mon.level).maxHp
		mon.hp = math.min(newMax, mon.hp + (newMax - oldMax))
		changed = true
		local sp = GameData.Species[mon.id]
		push(events, { t = "text", msg = sp.name .. " ist jetzt Level " .. mon.level .. "!" })
		local learned = GameData.MoveLearnedAt(mon.id, mon.level)
		if learned then
			push(events, { t = "text", msg = sp.name .. " lernt " .. GameData.Moves[learned].name .. "!" })
		end
		if sp.evolveLevel and sp.evolveTo and mon.level >= sp.evolveLevel then
			local oldName = sp.name
			mon.id = sp.evolveTo
			session.dex[mon.id] = true
			mon.hp = GameData.StatsFor(mon.id, mon.level).maxHp
			push(events, { t = "text", msg = "WOW! " .. oldName .. " entwickelt sich zu " .. GameData.Species[mon.id].name .. "!" })
		end
	end
	if changed then
		push(events, { t = "ally", view = allyView(mon) })
	end
end

-- Was passiert, wenn das aktive Brain Word besiegt wurde
local function handleAllyFaint(player, session, state, events)
	local anyAlive = false
	for _, mon in ipairs(session.team) do
		if mon.hp > 0 then
			anyAlive = true
		end
	end
	if anyAlive then
		state.forcedSwitch = true
		push(events, { t = "text", msg = "Wähle dein nächstes Brain Word!" })
	else
		state.over = true
		state.result = "niederlage"
		push(events, { t = "text", msg = "Alle deine Brain Words sind K.O.! Du wachst am Brunnen wieder auf..." })
		PlayerData.HealAll(player)
		local character = player.Character
		if character then
			character:PivotTo(CFrame.new(0, 4, 26))
		end
	end
end

local function cleanup(player)
	local state = battles[player]
	if not state then return end
	if state.charConn then
		state.charConn:Disconnect()
	end
	battles[player] = nil
	setFrozen(player, false)
end

-- ---------- Oeffentliche API ----------

function BattleService.IsInBattle(player)
	return battles[player] ~= nil
end

function BattleService.TryStartWild(player, model)
	if battles[player] then return end
	local session = PlayerData.SessionOf(player)
	if not session then return end
	if not session.starter or #session.team == 0 then
		PlayerData.Notify(player, "Wähle zuerst dein Start-Brain-Word!", "bad")
		return
	end
	local aliveIndex = nil
	for i, mon in ipairs(session.team) do
		if mon.hp > 0 then
			aliveIndex = i
			break
		end
	end
	if not aliveIndex then
		PlayerData.Notify(player, "Deine Brain Words sind alle K.O.! Heile sie am Brunnen.", "bad")
		return
	end

	local rec = SpawnService.Take(model)
	if not rec then return end -- jemand anderes war schneller

	local stats = GameData.StatsFor(rec.id, rec.level)
	local state = {
		monIndex = aliveIndex,
		enemy = {
			id = rec.id,
			level = rec.level,
			hp = stats.maxHp,
			stats = stats,
			moves = GameData.MovesFor(rec.id, rec.level),
		},
		forcedSwitch = false,
		over = false,
		result = nil,
		busy = false,
		charConn = nil,
	}
	battles[player] = state
	setFrozen(player, true)

	-- Falls der Spieler seinen Charakter zuruecksetzt: Kampf abbrechen
	state.charConn = player.CharacterAdded:Connect(function()
		if battles[player] == state then
			cleanup(player)
			BattleUpdateRemote:FireClient(player, {
				events = {},
				over = true,
				result = "abbruch",
				forcedSwitch = false,
			})
		end
	end)

	BattleStartRemote:FireClient(player, {
		enemy = enemyView(state.enemy),
		ally = allyView(session.team[aliveIndex]),
		team = teamView(session),
		monIndex = aliveIndex,
	})
end

local function resolveAction(player, state, session, action, events)
	local kind = action.kind

	-- Nach einem K.O. ist nur Wechseln erlaubt
	if state.forcedSwitch and kind ~= "switch" then
		return false
	end

	if kind == "move" then
		local mon = session.team[state.monIndex]
		local myMoves = GameData.MovesFor(mon.id, mon.level)
		local index = math.floor(tonumber(action.index) or 0)
		local moveId = myMoves[index]
		if not moveId then return false end

		local myStats = GameData.StatsFor(mon.id, mon.level)
		local allyFirst = myStats.spd >= state.enemy.stats.spd
		if allyFirst then
			local enemyDown = allyAttack(session, state, events, moveId)
			if enemyDown then
				awardXp(session, state, events)
				state.over = true
				state.result = "sieg"
			else
				local allyDown = enemyAttack(session, state, events)
				if allyDown then
					handleAllyFaint(player, session, state, events)
				end
			end
		else
			local allyDown = enemyAttack(session, state, events)
			if allyDown then
				handleAllyFaint(player, session, state, events)
			else
				local enemyDown = allyAttack(session, state, events, moveId)
				if enemyDown then
					awardXp(session, state, events)
					state.over = true
					state.result = "sieg"
				end
			end
		end
		return true

	elseif kind == "catch" then
		local enemySp = GameData.Species[state.enemy.id]
		if #session.team >= GameData.TEAM_SIZE and #session.box >= GameData.BOX_SIZE then
			push(events, { t = "text", msg = "Kein Platz mehr! Team und Box sind voll." })
			return true
		end
		push(events, { t = "text", msg = "Du wirfst eine Brain-Blase auf " .. enemySp.name .. "..." })
		local chance = GameData.CatchChance(enemySp.rarity, state.enemy.hp / state.enemy.stats.maxHp)
		if rng:NextNumber() < chance then
			local dest = PlayerData.AddCaught(player, state.enemy.id, state.enemy.level)
			push(events, { t = "text", msg = "GEFANGEN! " .. enemySp.name .. " gehört jetzt dir! (" .. tostring(dest) .. ")" })
			awardXp(session, state, events)
			state.over = true
			state.result = "gefangen"
		else
			push(events, { t = "text", msg = enemySp.name .. " hat sich befreit!" })
			local allyDown = enemyAttack(session, state, events)
			if allyDown then
				handleAllyFaint(player, session, state, events)
			end
		end
		return true

	elseif kind == "switch" then
		local index = math.floor(tonumber(action.index) or 0)
		if index < 1 or index > #session.team or index == state.monIndex then return false end
		local target = session.team[index]
		if target.hp <= 0 then return false end
		local wasForced = state.forcedSwitch
		state.forcedSwitch = false
		state.monIndex = index
		push(events, { t = "text", msg = "Los, " .. GameData.Species[target.id].name .. "!" })
		push(events, { t = "ally", view = allyView(target) })
		if not wasForced then
			local allyDown = enemyAttack(session, state, events)
			if allyDown then
				handleAllyFaint(player, session, state, events)
			end
		end
		return true

	elseif kind == "run" then
		local mon = session.team[state.monIndex]
		local myStats = GameData.StatsFor(mon.id, mon.level)
		local bonus = (myStats.spd - state.enemy.stats.spd) * 0.008
		if bonus > 0.25 then bonus = 0.25 end
		if bonus < -0.25 then bonus = -0.25 end
		if rng:NextNumber() < 0.7 + bonus then
			push(events, { t = "text", msg = "Du bist entkommen!" })
			state.over = true
			state.result = "geflohen"
		else
			push(events, { t = "text", msg = "Du kommst nicht weg!" })
			local allyDown = enemyAttack(session, state, events)
			if allyDown then
				handleAllyFaint(player, session, state, events)
			end
		end
		return true
	end

	return false
end

local function onBattleAction(player, action)
	local state = battles[player]
	if not state or state.busy or state.over then return end
	if type(action) ~= "table" or type(action.kind) ~= "string" then return end
	local session = PlayerData.SessionOf(player)
	if not session then return end

	state.busy = true
	local events = {}
	local ok, err = pcall(function()
		return resolveAction(player, state, session, action, events)
	end)
	if not ok then
		warn("[BrainWords] Kampf-Fehler: " .. tostring(err))
		state.busy = false
		return
	end

	local mon = session.team[state.monIndex]
	BattleUpdateRemote:FireClient(player, {
		events = events,
		ally = mon and allyView(mon) or nil,
		enemy = enemyView(state.enemy),
		team = teamView(session),
		monIndex = state.monIndex,
		over = state.over,
		result = state.result,
		forcedSwitch = state.forcedSwitch,
	})

	if state.over then
		cleanup(player)
		PlayerData.Sync(player)
	else
		state.busy = false
	end
end

function BattleService.Init()
	BattleStartRemote = Remotes.Get("BattleStart")
	BattleUpdateRemote = Remotes.Get("BattleUpdate")
	Remotes.Get("BattleAction").OnServerEvent:Connect(onBattleAction)
	Players.PlayerRemoving:Connect(function(player)
		cleanup(player)
	end)
end

return BattleService
