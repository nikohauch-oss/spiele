-- ============================================================
-- Rundenbasiertes Kampfsystem (Server).
-- Beide Monster stehen als 3D-Figuren auf einer Kampf-Buehne
-- hoch ueber der Welt; die Kamera des Spielers faehrt hin.
-- Der Server berechnet alles, der Client animiert nur.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local MonsterFactory = require(Shared:WaitForChild("MonsterFactory"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local WorldBuilder = require(script.Parent:WaitForChild("WorldBuilder"))
local RoamService = require(script.Parent:WaitForChild("RoamService"))

local BattleService = {}

local STAGE_COUNT = 8

local rng = Random.new()
local battles = {} -- [player] = Kampfzustand
local stages = {} -- { base, folder, busy }
local BattleStartRemote = nil
local BattleUpdateRemote = nil

-- ---------- Kampf-Buehnen ----------

local function buildStages()
	local stageFolder = Instance.new("Folder")
	stageFolder.Name = "Kampfarenen"
	for i = 1, STAGE_COUNT do
		local base = Vector3.new(-600 + i * 150, 240, 900)
		local folder = Instance.new("Folder")
		folder.Name = "Arena" .. i

		local function p(props)
			local prt = Instance.new("Part")
			prt.Anchored = true
			prt.TopSurface = Enum.SurfaceType.Smooth
			prt.BottomSurface = Enum.SurfaceType.Smooth
			for k, v in pairs(props) do
				prt[k] = v
			end
			prt.Parent = folder
			return prt
		end

		-- Boden der Buehne
		p({ Size = Vector3.new(46, 1, 28), Color = Color3.fromRGB(120, 170, 100), Material = Enum.Material.Grass, CFrame = CFrame.new(base) })
		p({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.3, 10, 10), Color = Color3.fromRGB(220, 215, 200), Material = Enum.Material.Concrete, CanCollide = false,
			CFrame = CFrame.new(base + Vector3.new(-10, 0.6, 0)) * CFrame.Angles(0, 0, math.rad(90)) })
		p({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.3, 10, 10), Color = Color3.fromRGB(220, 215, 200), Material = Enum.Material.Concrete, CanCollide = false,
			CFrame = CFrame.new(base + Vector3.new(10, 0.6, 0)) * CFrame.Angles(0, 0, math.rad(90)) })

		-- Kamerapunkt fuer den Client
		local cam = p({ Size = Vector3.new(1, 1, 1), Transparency = 1, CanCollide = false, Name = "KameraPunkt" })
		cam.CFrame = CFrame.lookAt(base + Vector3.new(-16, 9, 16), base + Vector3.new(3, 3, 0))

		folder.Parent = stageFolder
		table.insert(stages, { base = base, folder = folder, busy = false })
	end
	stageFolder.Parent = workspace
end

local function takeStage()
	for _, stage in ipairs(stages) do
		if not stage.busy then
			stage.busy = true
			return stage
		end
	end
	return nil
end

-- Monster-Figur auf die Buehne stellen. side = "ally"/"enemy"
local function spawnStageModel(state, side, speciesId)
	local stage = state.stage
	local counterKey = side .. "Counter"
	state[counterKey] = (state[counterKey] or 0) + 1
	local name = (side == "ally" and "AllyMon" or "EnemyMon") .. state[counterKey]

	local oldKey = side .. "Model"
	if state[oldKey] then
		state[oldKey]:Destroy()
		state[oldKey] = nil
	end

	local model = MonsterFactory.Create(speciesId, 1.1)
	model.Name = name
	local x = (side == "ally") and -10 or 10
	local pos = stage.base + Vector3.new(x, 0.6, 0)
	local look = stage.base + Vector3.new(-x, 0.6, 0)
	MonsterFactory.PlaceOnGround(model, pos, look)
	model.Parent = stage.folder
	state[oldKey] = model
	return name
end

-- ---------- Ansichten ----------

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
		name = sp.name, typ = sp.typ, level = mon.level,
		hp = mon.hp, maxHp = stats.maxHp, status = mon.status,
		xp = mon.xp, xpNext = GameData.XpToNext(mon.level),
		moves = movesView(GameData.MovesFor(mon.id, mon.level)),
	}
end

local function enemyView(enemy)
	local sp = GameData.Species[enemy.id]
	return {
		name = sp.name, typ = sp.typ, level = enemy.level,
		hp = enemy.hp, maxHp = enemy.stats.maxHp, status = enemy.status,
	}
end

local function teamView(session)
	local list = {}
	for _, mon in ipairs(session.team) do
		local sp = GameData.Species[mon.id]
		table.insert(list, {
			name = sp.name, typ = sp.typ, level = mon.level,
			hp = mon.hp, maxHp = GameData.StatsFor(mon.id, mon.level).maxHp,
			status = mon.status,
		})
	end
	return list
end

-- ---------- Helfer ----------

local function push(events, event)
	table.insert(events, event)
end

local function setFrozen(player, frozen)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
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
		push(events, { t = "text", msg = "Es ist sehr effektiv!" })
	elseif mult < 1 then
		push(events, { t = "text", msg = "Es ist nicht sehr effektiv..." })
	end
end

-- Statuseffekt einer Attacke anwenden (falls Glueck)
local function maybeApplyStatus(events, move, target, targetName, side)
	if not move.effect or target.status or target.hp <= 0 then return end
	if rng:NextNumber() < move.effect.chance then
		target.status = move.effect.status
		if target.status == "brand" then
			push(events, { t = "text", msg = targetName .. " wurde verbrannt!" })
		else
			push(events, { t = "text", msg = targetName .. " steht unter Schock!" })
		end
		push(events, { t = "status", side = side, status = target.status })
	end
end

-- Ist das Monster wegen Schock handlungsunfaehig?
local function checkSchock(events, target, targetName)
	if target.status == "schock" and rng:NextNumber() < 0.3 then
		push(events, { t = "text", msg = targetName .. " ist gelähmt vor Schock und kann nicht angreifen!" })
		return true
	end
	return false
end

-- ---------- Angriffe ----------

local function allyAttack(session, state, events, moveId)
	local mon = session.team[state.monIndex]
	local sp = GameData.Species[mon.id]
	if checkSchock(events, mon, sp.name) then return false end
	local stats = GameData.StatsFor(mon.id, mon.level)
	local move = GameData.Moves[moveId]
	local enemySp = GameData.Species[state.enemy.id]
	local dmg, mult = calcDamage(mon.level, stats.atk, state.enemy.stats.def, moveId, sp.typ, enemySp.typ)
	state.enemy.hp = math.max(0, state.enemy.hp - dmg)
	push(events, { t = "text", msg = sp.name .. " setzt " .. move.name .. " ein!" })
	push(events, { t = "hit", side = "enemy" })
	push(events, { t = "hp", side = "enemy", hp = state.enemy.hp })
	pushEffectiveness(events, mult)
	maybeApplyStatus(events, move, state.enemy, enemySp.name, "enemy")
	if state.enemy.hp <= 0 then
		push(events, { t = "text", msg = enemySp.name .. " wurde besiegt!" })
		push(events, { t = "faint", side = "enemy" })
		return true
	end
	return false
end

local function chooseEnemyMove(state, defenderTyp)
	local total = 0
	local weights = {}
	for _, moveId in ipairs(state.enemy.moves) do
		local move = GameData.Moves[moveId]
		local w = move.power * GameData.TypeMultiplier(move.typ, defenderTyp)
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

local function enemyAttack(session, state, events)
	local mon = session.team[state.monIndex]
	local monSp = GameData.Species[mon.id]
	local enemySp = GameData.Species[state.enemy.id]
	if checkSchock(events, state.enemy, enemySp.name) then return false end
	local moveId = chooseEnemyMove(state, monSp.typ)
	local move = GameData.Moves[moveId]
	local myStats = GameData.StatsFor(mon.id, mon.level)
	local dmg, mult = calcDamage(state.enemy.level, state.enemy.stats.atk, myStats.def, moveId, enemySp.typ, monSp.typ)
	mon.hp = math.max(0, mon.hp - dmg)
	push(events, { t = "text", msg = enemySp.name .. " setzt " .. move.name .. " ein!" })
	push(events, { t = "hit", side = "ally" })
	push(events, { t = "hp", side = "ally", hp = mon.hp })
	pushEffectiveness(events, mult)
	maybeApplyStatus(events, move, mon, monSp.name, "ally")
	if mon.hp <= 0 then
		push(events, { t = "text", msg = monSp.name .. " wurde besiegt!" })
		push(events, { t = "faint", side = "ally" })
		return true
	end
	return false
end

-- Brand-Schaden am Rundenende. Gibt (enemyDown, allyDown) zurueck.
local function burnTick(session, state, events)
	local enemyDown, allyDown = false, false
	if state.enemy.hp > 0 and state.enemy.status == "brand" then
		local sp = GameData.Species[state.enemy.id]
		state.enemy.hp = math.max(0, state.enemy.hp - math.max(1, math.floor(state.enemy.stats.maxHp / 12)))
		push(events, { t = "text", msg = sp.name .. " leidet unter dem Brand!" })
		push(events, { t = "hp", side = "enemy", hp = state.enemy.hp })
		if state.enemy.hp <= 0 then
			push(events, { t = "text", msg = sp.name .. " wurde besiegt!" })
			push(events, { t = "faint", side = "enemy" })
			enemyDown = true
		end
	end
	local mon = session.team[state.monIndex]
	if not enemyDown and mon.hp > 0 and mon.status == "brand" then
		local sp = GameData.Species[mon.id]
		local maxHp = GameData.StatsFor(mon.id, mon.level).maxHp
		mon.hp = math.max(0, mon.hp - math.max(1, math.floor(maxHp / 12)))
		push(events, { t = "text", msg = sp.name .. " leidet unter dem Brand!" })
		push(events, { t = "hp", side = "ally", hp = mon.hp })
		if mon.hp <= 0 then
			push(events, { t = "text", msg = sp.name .. " wurde besiegt!" })
			push(events, { t = "faint", side = "ally" })
			allyDown = true
		end
	end
	return enemyDown, allyDown
end

-- ---------- EP, Level, Entwicklung ----------

local function awardXp(session, state, events)
	local mon = session.team[state.monIndex]
	local enemyLegendary = GameData.Species[state.enemy.id].legendary == true
	local gain = GameData.XpGain(state.enemy.level, state.mode == "trainer", enemyLegendary)
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
		state.leveled[state.monIndex] = true
		local sp = GameData.Species[mon.id]
		push(events, { t = "text", msg = sp.name .. " ist jetzt Level " .. mon.level .. "!" })
		local learned = GameData.MoveLearnedAt(mon.id, mon.level)
		if learned then
			push(events, { t = "text", msg = sp.name .. " lernt " .. GameData.Moves[learned].name .. "!" })
		end
	end
	if changed then
		push(events, { t = "ally", view = allyView(mon) })
	end
end

-- Entwicklungen NACH dem Kampf (wie im Vorbild-Spiel)
local function processEvolutions(player, session, state)
	for index in pairs(state.leveled) do
		local mon = session.team[index]
		if mon then
			local sp = GameData.Species[mon.id]
			if sp.evolveLevel and sp.evolveTo and mon.level >= sp.evolveLevel then
				local oldName = sp.name
				mon.id = sp.evolveTo
				mon.hp = GameData.StatsFor(mon.id, mon.level).maxHp
				mon.status = nil
				PlayerData.Notify(player, "WOW! " .. oldName .. " entwickelt sich zu " .. GameData.Species[mon.id].name .. "!", "good")
			end
		end
	end
end

-- ---------- Kampf-Ende ----------

local function handleAllyFaint(player, session, state, events)
	local anyAlive = false
	for _, mon in ipairs(session.team) do
		if mon.hp > 0 then
			anyAlive = true
		end
	end
	if anyAlive then
		state.forcedSwitch = true
		push(events, { t = "text", msg = "Wähle dein nächstes Monster!" })
	else
		state.over = true
		state.result = "niederlage"
		push(events, { t = "text", msg = "Alle deine Monster sind K.O.! Du wachst im Monster-Center auf..." })
	end
end

local function cleanup(player, state)
	if state.charConn then
		state.charConn:Disconnect()
	end
	if state.allyModel then state.allyModel:Destroy() end
	if state.enemyModel then state.enemyModel:Destroy() end
	if state.stage then state.stage.busy = false end
	battles[player] = nil
	setFrozen(player, false)
end

local function finishBattle(player, session, state)
	cleanup(player, state)
	processEvolutions(player, session, state)
	if state.result == "niederlage" then
		PlayerData.HealAll(player)
		local character = player.Character
		if character then
			character:PivotTo(CFrame.new(WorldBuilder.PlazaSpawn))
		end
	end
	PlayerData.Sync(player)
end

-- ---------- Kampfstart ----------

local function baseChecks(player)
	if battles[player] then return nil end
	local session = PlayerData.SessionOf(player)
	if not session then return nil end
	if not session.starter or #session.team == 0 then
		return nil
	end
	local aliveIndex = nil
	for i, mon in ipairs(session.team) do
		if mon.hp > 0 then
			aliveIndex = i
			break
		end
	end
	if not aliveIndex then
		PlayerData.Notify(player, "Deine Monster sind alle K.O.! Lass sie im Monster-Center heilen.", "bad")
		return nil
	end
	return session, aliveIndex
end

local function makeEnemy(speciesId, level)
	local stats = GameData.StatsFor(speciesId, level)
	return {
		id = speciesId, level = level, hp = stats.maxHp,
		stats = stats, moves = GameData.MovesFor(speciesId, level), status = nil,
	}
end

local function startBattle(player, session, aliveIndex, mode, enemy, trainerDef)
	local stage = takeStage()
	if not stage then
		PlayerData.Notify(player, "Alle Kampfarenen sind gerade belegt. Versuch es gleich nochmal!", "bad")
		return false
	end

	local state = {
		mode = mode, stage = stage, monIndex = aliveIndex,
		enemy = enemy, trainer = trainerDef, trainerTeamIndex = 1,
		forcedSwitch = false, over = false, result = nil, busy = false,
		leveled = {}, charConn = nil,
	}
	battles[player] = state
	setFrozen(player, true)

	local allyName = spawnStageModel(state, "ally", session.team[aliveIndex].id)
	local enemyName = spawnStageModel(state, "enemy", enemy.id)

	state.charConn = player.CharacterAdded:Connect(function()
		if battles[player] == state then
			cleanup(player, state)
			BattleUpdateRemote:FireClient(player, { events = {}, over = true, result = "abbruch", forcedSwitch = false })
		end
	end)

	BattleStartRemote:FireClient(player, {
		mode = mode,
		trainerName = trainerDef and trainerDef.name or nil,
		stageName = stage.folder.Name,
		allyModel = allyName,
		enemyModel = enemyName,
		enemy = enemyView(enemy),
		ally = allyView(session.team[aliveIndex]),
		team = teamView(session),
		monIndex = aliveIndex,
		canCatch = mode == "wild",
		canFlee = mode == "wild",
		items = session.items,
	})
	return true
end

-- Wilder Kampf (aus Gras oder von herumlaufendem Monster)
function BattleService.TryStartWild(player, speciesId, level, roamerModel)
	local session, aliveIndex = baseChecks(player)
	if not session then return false end
	if roamerModel then
		local rec = RoamService.Take(roamerModel)
		if not rec then return false end
	end
	local sp = GameData.Species[speciesId]
	if sp.legendary then
		PlayerData.Notify(player, "⭐ Das legendäre " .. sp.name .. " (Lv. " .. level .. ") greift an!", "good")
	else
		PlayerData.Notify(player, "Ein wildes " .. sp.name .. " (Lv. " .. level .. ") greift an!", "info")
	end
	return startBattle(player, session, aliveIndex, "wild", makeEnemy(speciesId, level), nil)
end

-- Trainerkampf
function BattleService.TryStartTrainer(player, trainerDef)
	local session, aliveIndex = baseChecks(player)
	if not session then return false end
	local first = trainerDef.team[1]
	return startBattle(player, session, aliveIndex, "trainer", makeEnemy(first[1], first[2]), trainerDef)
end

function BattleService.IsInBattle(player)
	return battles[player] ~= nil
end

-- ---------- Sieg-Logik ----------

-- Gegner besiegt: EP + ggf. naechstes Trainer-Monster
local function onEnemyDefeated(player, session, state, events)
	awardXp(session, state, events)
	if state.mode == "trainer" then
		local nextIndex = state.trainerTeamIndex + 1
		local nextDef = state.trainer.team[nextIndex]
		if nextDef then
			state.trainerTeamIndex = nextIndex
			state.enemy = makeEnemy(nextDef[1], nextDef[2])
			local name = spawnStageModel(state, "enemy", state.enemy.id)
			push(events, { t = "text", msg = state.trainer.name .. " schickt " .. GameData.Species[state.enemy.id].name .. " (Lv. " .. state.enemy.level .. ")!" })
			push(events, { t = "enemyModel", name = name })
			push(events, { t = "enemy", view = enemyView(state.enemy) })
			return
		end
		-- Trainer besiegt!
		session.beatenTrainers[state.trainer.id] = true
		PlayerData.AddCoins(player, state.trainer.reward)
		push(events, { t = "text", msg = "Du hast " .. state.trainer.name .. " besiegt! +" .. state.trainer.reward .. " Münzen!" })
		state.over = true
		state.result = "sieg"
	else
		state.over = true
		state.result = "sieg"
	end
end

-- Rundenende: Brand-Schaden + Folgen
local function endOfRound(player, session, state, events)
	if state.over or state.forcedSwitch then return end
	local enemyDown, allyDown = burnTick(session, state, events)
	if enemyDown then
		onEnemyDefeated(player, session, state, events)
	elseif allyDown then
		handleAllyFaint(player, session, state, events)
	end
end

-- ---------- Aktionen ----------

local function doEnemyTurnAfterPlayerAction(player, session, state, events)
	local allyDown = enemyAttack(session, state, events)
	if allyDown then
		handleAllyFaint(player, session, state, events)
	end
end

local function resolveAction(player, state, session, action, events)
	local kind = action.kind
	if state.forcedSwitch and kind ~= "switch" then
		return
	end

	if kind == "move" then
		local mon = session.team[state.monIndex]
		local myMoves = GameData.MovesFor(mon.id, mon.level)
		local index = math.floor(tonumber(action.index) or 0)
		local moveId = myMoves[index]
		if not moveId then return end
		local myStats = GameData.StatsFor(mon.id, mon.level)
		if myStats.spd >= state.enemy.stats.spd then
			local enemyDown = allyAttack(session, state, events, moveId)
			if enemyDown then
				onEnemyDefeated(player, session, state, events)
			else
				doEnemyTurnAfterPlayerAction(player, session, state, events)
			end
		else
			local allyDown = enemyAttack(session, state, events)
			if allyDown then
				handleAllyFaint(player, session, state, events)
			else
				local enemyDown = allyAttack(session, state, events, moveId)
				if enemyDown then
					onEnemyDefeated(player, session, state, events)
				end
			end
		end
		endOfRound(player, session, state, events)

	elseif kind == "item" then
		local itemId = action.item
		local item = type(itemId) == "string" and GameData.Items[itemId]
		if not item then return end

		if item.ball then
			-- Fangkugel werfen
			if state.mode == "trainer" then
				push(events, { t = "text", msg = "Man darf keine Monster von Trainern fangen!" })
				return
			end
			if not PlayerData.TakeItem(player, "fangkugel") then
				push(events, { t = "text", msg = "Keine Fangkugeln mehr! Kauf welche im Markt." })
				return
			end
			local enemySp = GameData.Species[state.enemy.id]
			push(events, { t = "text", msg = "Du wirfst eine Fangkugel auf " .. enemySp.name .. "..." })
			local chance = GameData.CatchChance(state.enemy.level, state.enemy.hp / state.enemy.stats.maxHp, enemySp.legendary == true)
			local success = rng:NextNumber() < chance
			push(events, { t = "ball", wobbles = success and 3 or rng:NextInteger(1, 2), success = success })
			if success then
				local dest = PlayerData.AddCaught(player, state.enemy.id, state.enemy.level)
				if dest then
					push(events, { t = "text", msg = "GEFANGEN! " .. enemySp.name .. " gehört jetzt dir! (" .. dest .. ")" })
					awardXp(session, state, events)
					state.over = true
					state.result = "gefangen"
				else
					push(events, { t = "text", msg = "Kein Platz mehr in Team und Box!" })
				end
			else
				push(events, { t = "text", msg = "Oh nein! " .. enemySp.name .. " hat sich befreit!" })
				doEnemyTurnAfterPlayerAction(player, session, state, events)
				endOfRound(player, session, state, events)
			end
		else
			-- Heil-Item auf das aktive Monster
			local mon = session.team[state.monIndex]
			if (session.items[itemId] or 0) < 1 then
				push(events, { t = "text", msg = "Davon hast du nichts mehr!" })
				return
			end
			local ok, msg = PlayerData.ApplyItemEffect(mon, itemId)
			if not ok then
				push(events, { t = "text", msg = msg })
				return
			end
			PlayerData.TakeItem(player, itemId)
			push(events, { t = "text", msg = msg })
			push(events, { t = "hp", side = "ally", hp = mon.hp })
			push(events, { t = "status", side = "ally", status = mon.status })
			doEnemyTurnAfterPlayerAction(player, session, state, events)
			endOfRound(player, session, state, events)
		end

	elseif kind == "switch" then
		local index = math.floor(tonumber(action.index) or 0)
		if index < 1 or index > #session.team or index == state.monIndex then return end
		local target = session.team[index]
		if target.hp <= 0 then return end
		local wasForced = state.forcedSwitch
		state.forcedSwitch = false
		state.monIndex = index
		local name = spawnStageModel(state, "ally", target.id)
		push(events, { t = "text", msg = "Los, " .. GameData.Species[target.id].name .. "!" })
		push(events, { t = "allyModel", name = name })
		push(events, { t = "ally", view = allyView(target) })
		if not wasForced then
			doEnemyTurnAfterPlayerAction(player, session, state, events)
			endOfRound(player, session, state, events)
		end

	elseif kind == "run" then
		if state.mode == "trainer" then
			push(events, { t = "text", msg = "Aus einem Trainerkampf kann man nicht fliehen!" })
			return
		end
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
			doEnemyTurnAfterPlayerAction(player, session, state, events)
			endOfRound(player, session, state, events)
		end
	end
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
		resolveAction(player, state, session, action, events)
	end)
	if not ok then
		warn("[Monsterwelt] Kampf-Fehler: " .. tostring(err))
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
		items = session.items,
	})

	if state.over then
		finishBattle(player, session, state)
	else
		state.busy = false
	end
end

function BattleService.Init()
	buildStages()
	BattleStartRemote = Remotes.Get("BattleStart")
	BattleUpdateRemote = Remotes.Get("BattleUpdate")
	Remotes.Get("BattleAction").OnServerEvent:Connect(onBattleAction)
	Players.PlayerRemoving:Connect(function(player)
		local state = battles[player]
		if state then
			cleanup(player, state)
		end
	end)
end

return BattleService
