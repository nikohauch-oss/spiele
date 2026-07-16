-- ============================================================
-- Die Kampf-Oberflaeche: HP-Balken, Attacken-Knoepfe,
-- Kampf-Text und Ergebnis-Banner.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local BattleUi = {}

local sendAction = nil
local gui = nil

local state = nil -- { ally, enemy, team, monIndex }
local locked = false

-- UI-Referenzen
local logLabel = nil
local buttonsArea = nil
local mainGrid = nil
local movesFrame = nil
local switchFrame = nil
local resultBanner = nil
local resultText = nil

local enemyName = nil
local enemyInfo = nil
local enemyBar = nil
local allyName = nil
local allyInfo = nil
local allyBar = nil
local allyHpText = nil
local xpFill = nil

local function constrain(label, maxSize)
	UiKit.Mk("UITextSizeConstraint", { MaxTextSize = maxSize, Parent = label })
	return label
end

local function setLog(msg)
	logLabel.Text = msg
end

-- ---------- Anzeigen aktualisieren ----------

local function renderEnemy(instant)
	if not state or not state.enemy then return end
	local e = state.enemy
	enemyName.Text = e.name .. "   Lv. " .. e.level
	enemyInfo.Text = e.typ .. " • " .. e.rarity
	enemyInfo.TextColor3 = GameData.Rarities[e.rarity].color
	enemyBar.Set(e.hp, e.maxHp, instant)
end

local function renderAlly(instant)
	if not state or not state.ally then return end
	local a = state.ally
	allyName.Text = a.name .. "   Lv. " .. a.level
	allyInfo.Text = a.typ
	allyInfo.TextColor3 = GameData.TypeColors[a.typ]
	allyBar.Set(a.hp, a.maxHp, instant)
	allyHpText.Text = a.hp .. " / " .. a.maxHp
	local frac = 0
	if a.xpNext and a.xpNext > 0 then
		frac = math.max(0, math.min(1, a.xp / a.xpNext))
	end
	xpFill.Size = UDim2.new(frac, 0, 1, 0)
end

-- ---------- Untermenues ----------

local function showMain()
	mainGrid.Visible = true
	movesFrame.Visible = false
	switchFrame.Visible = false
end

local function send(action)
	if locked then return end
	locked = true
	buttonsArea.Visible = false
	sendAction(action)
end

local function showMoves()
	for _, child in ipairs(movesFrame:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for i, move in ipairs(state.ally.moves) do
		local color = GameData.TypeColors[move.typ]:Lerp(Color3.new(0, 0, 0), 0.35)
		local btn = UiKit.Button({
			Text = move.name .. "\n" .. move.typ .. " • Stärke " .. move.power,
			BackgroundColor3 = color,
			LayoutOrder = i,
			Parent = movesFrame,
		}, function()
			send({ kind = "move", index = i })
		end)
		constrain(btn, 18)
	end
	local back = UiKit.Button({
		Text = "Zurück",
		BackgroundColor3 = Color3.fromRGB(90, 90, 110),
		LayoutOrder = 9,
		Parent = movesFrame,
	}, showMain)
	constrain(back, 18)
	mainGrid.Visible = false
	movesFrame.Visible = true
	switchFrame.Visible = false
end

local function showSwitch(forced)
	for _, child in ipairs(switchFrame:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for i, mon in ipairs(state.team) do
		local usable = mon.hp > 0 and i ~= state.monIndex
		local color = usable and GameData.TypeColors[mon.typ]:Lerp(Color3.new(0, 0, 0), 0.4) or Color3.fromRGB(60, 60, 70)
		local label = mon.name .. " Lv." .. mon.level .. "\n" .. mon.hp .. "/" .. mon.maxHp
		if mon.hp <= 0 then
			label = mon.name .. "\nK.O."
		elseif i == state.monIndex then
			label = mon.name .. "\nim Kampf"
		end
		local btn = UiKit.Button({
			Text = label,
			BackgroundColor3 = color,
			LayoutOrder = i,
			Parent = switchFrame,
		}, function()
			if usable then
				send({ kind = "switch", index = i })
			end
		end)
		constrain(btn, 16)
	end
	if not forced then
		local back = UiKit.Button({
			Text = "Zurück",
			BackgroundColor3 = Color3.fromRGB(90, 90, 110),
			LayoutOrder = 9,
			Parent = switchFrame,
		}, showMain)
		constrain(back, 16)
	end
	mainGrid.Visible = false
	movesFrame.Visible = false
	switchFrame.Visible = true
end

-- ---------- Ergebnis-Banner ----------

local RESULTS = {
	sieg = { text = "SIEG!", color = Color3.fromRGB(60, 160, 80) },
	gefangen = { text = "GEFANGEN!", color = Color3.fromRGB(70, 130, 220) },
	geflohen = { text = "Entkommen!", color = Color3.fromRGB(120, 120, 140) },
	niederlage = { text = "K.O. ...", color = Color3.fromRGB(170, 60, 60) },
}

-- ---------- Ablauf ----------

function BattleUi.Start(payload)
	state = {
		ally = payload.ally,
		enemy = payload.enemy,
		team = payload.team,
		monIndex = payload.monIndex,
	}
	locked = false
	renderAlly(true)
	renderEnemy(true)
	setLog("Ein wildes " .. payload.enemy.name .. " (Lv. " .. payload.enemy.level .. ") erscheint!")
	resultBanner.Visible = false
	buttonsArea.Visible = true
	showMain()
	gui.Enabled = true
end

function BattleUi.Update(payload)
	task.spawn(function()
		if not state then
			if payload.over then
				gui.Enabled = false
			end
			return
		end
		buttonsArea.Visible = false

		for _, ev in ipairs(payload.events) do
			if ev.t == "text" then
				setLog(ev.msg)
				task.wait(1.05)
			elseif ev.t == "hp" then
				if ev.side == "enemy" and state.enemy then
					state.enemy.hp = ev.hp
					enemyBar.Set(ev.hp, state.enemy.maxHp, false)
				elseif state.ally then
					state.ally.hp = ev.hp
					allyBar.Set(ev.hp, state.ally.maxHp, false)
					allyHpText.Text = ev.hp .. " / " .. state.ally.maxHp
				end
				task.wait(0.5)
			elseif ev.t == "ally" then
				state.ally = ev.view
				renderAlly(true)
				task.wait(0.35)
			end
		end

		-- Endstand uebernehmen
		if payload.ally then state.ally = payload.ally end
		if payload.enemy then state.enemy = payload.enemy end
		if payload.team then state.team = payload.team end
		if payload.monIndex then state.monIndex = payload.monIndex end
		renderAlly(true)
		renderEnemy(true)

		if payload.over then
			local info = RESULTS[payload.result]
			if info then
				resultText.Text = info.text
				resultBanner.BackgroundColor3 = info.color
				resultBanner.Visible = true
				task.wait(1.6)
			end
			gui.Enabled = false
			state = nil
			locked = false
		else
			locked = false
			buttonsArea.Visible = true
			if payload.forcedSwitch then
				setLog("Wähle dein nächstes Brain Word!")
				showSwitch(true)
			else
				showMain()
			end
		end
	end)
end

-- ---------- Aufbau ----------

function BattleUi.Init(sender)
	sendAction = sender
	gui = UiKit.Screen("BrainBattle", 20)
	gui.Enabled = false

	-- Abdunkelung
	UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.55,
		Size = UDim2.new(1, 0, 1, 0),
		Parent = gui,
	})

	-- Gegner-Karte (oben rechts)
	local enemyCard = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(0.98, 0, 0.05, 0),
		Size = UDim2.new(0.34, 0, 0.15, 0),
		Parent = gui,
	})
	UiKit.Round(enemyCard, 12)
	UiKit.Stroke(enemyCard)
	enemyName = constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.06, 0),
		Size = UDim2.new(0.9, 0, 0.36, 0),
		Parent = enemyCard,
	}), 24)
	enemyInfo = constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.42, 0),
		Size = UDim2.new(0.9, 0, 0.2, 0),
		Parent = enemyCard,
	}), 16)
	enemyBar = UiKit.HpBar({
		Position = UDim2.new(0.05, 0, 0.68, 0),
		Size = UDim2.new(0.9, 0, 0.18, 0),
		Parent = enemyCard,
	})

	-- Eigene Karte (unten links)
	local allyCard = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0.02, 0, 0.72, 0),
		Size = UDim2.new(0.34, 0, 0.18, 0),
		Parent = gui,
	})
	UiKit.Round(allyCard, 12)
	UiKit.Stroke(allyCard)
	allyName = constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.05, 0),
		Size = UDim2.new(0.9, 0, 0.3, 0),
		Parent = allyCard,
	}), 24)
	allyInfo = constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.36, 0),
		Size = UDim2.new(0.5, 0, 0.16, 0),
		Parent = allyCard,
	}), 15)
	allyHpText = constrain(UiKit.Label({
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Right,
		Position = UDim2.new(0.55, 0, 0.36, 0),
		Size = UDim2.new(0.4, 0, 0.16, 0),
		TextColor3 = UiKit.Colors.TextDim,
		Parent = allyCard,
	}), 15)
	allyBar = UiKit.HpBar({
		Position = UDim2.new(0.05, 0, 0.56, 0),
		Size = UDim2.new(0.9, 0, 0.16, 0),
		Parent = allyCard,
	})
	-- EP-Balken
	local xpBack = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(25, 25, 38),
		BorderSizePixel = 0,
		Position = UDim2.new(0.05, 0, 0.8, 0),
		Size = UDim2.new(0.9, 0, 0.08, 0),
		Parent = allyCard,
	})
	UiKit.Round(xpBack, 4)
	xpFill = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(120, 160, 255),
		BorderSizePixel = 0,
		Size = UDim2.new(0, 0, 1, 0),
		Parent = xpBack,
	})
	UiKit.Round(xpFill, 4)

	-- Untere Leiste: Text + Knoepfe
	local bottom = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0.99, 0),
		Size = UDim2.new(0.96, 0, 0.25, 0),
		Parent = gui,
	})
	UiKit.Round(bottom, 14)
	UiKit.Stroke(bottom)

	logLabel = constrain(UiKit.Label({
		Text = "",
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		Position = UDim2.new(0.02, 0, 0.08, 0),
		Size = UDim2.new(0.54, 0, 0.84, 0),
		Parent = bottom,
	}), 26)

	buttonsArea = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0.58, 0, 0.05, 0),
		Size = UDim2.new(0.4, 0, 0.9, 0),
		Parent = bottom,
	})

	mainGrid = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Parent = buttonsArea })
	UiKit.Mk("UIGridLayout", {
		CellSize = UDim2.new(0.485, 0, 0.46, 0),
		CellPadding = UDim2.new(0.03, 0, 0.08, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = mainGrid,
	})
	constrain(UiKit.Button({ Text = "Angriff", BackgroundColor3 = Color3.fromRGB(200, 70, 70), LayoutOrder = 1, Parent = mainGrid }, function()
		showMoves()
	end), 24)
	constrain(UiKit.Button({ Text = "Fangen", BackgroundColor3 = Color3.fromRGB(70, 130, 220), LayoutOrder = 2, Parent = mainGrid }, function()
		send({ kind = "catch" })
	end), 24)
	constrain(UiKit.Button({ Text = "Wechseln", BackgroundColor3 = Color3.fromRGB(210, 160, 50), LayoutOrder = 3, Parent = mainGrid }, function()
		showSwitch(false)
	end), 24)
	constrain(UiKit.Button({ Text = "Weglaufen", BackgroundColor3 = Color3.fromRGB(110, 110, 130), LayoutOrder = 4, Parent = mainGrid }, function()
		send({ kind = "run" })
	end), 24)

	movesFrame = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Visible = false, Parent = buttonsArea })
	UiKit.Mk("UIGridLayout", {
		CellSize = UDim2.new(0.32, 0, 0.46, 0),
		CellPadding = UDim2.new(0.015, 0, 0.06, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = movesFrame,
	})

	switchFrame = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Visible = false, Parent = buttonsArea })
	UiKit.Mk("UIGridLayout", {
		CellSize = UDim2.new(0.32, 0, 0.44, 0),
		CellPadding = UDim2.new(0.015, 0, 0.08, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = switchFrame,
	})

	-- Ergebnis-Banner
	resultBanner = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(60, 160, 80),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.4, 0),
		Size = UDim2.new(0.44, 0, 0.16, 0),
		Visible = false,
		ZIndex = 10,
		Parent = gui,
	})
	UiKit.Round(resultBanner, 16)
	UiKit.Stroke(resultBanner, Color3.fromRGB(255, 255, 255), 3)
	resultText = UiKit.Label({
		Text = "",
		Size = UDim2.new(1, 0, 1, 0),
		ZIndex = 10,
		Parent = resultBanner,
	})
end

return BattleUi
