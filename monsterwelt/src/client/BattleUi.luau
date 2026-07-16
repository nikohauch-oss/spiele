-- ============================================================
-- Kampf-Oberflaeche:
-- feste Kampf-Kamera auf die Buehne, Menue (Kampf/Beutel/
-- Team/Flucht), KP-Balken, Kampftext, Fangkugel-Animation.
-- ============================================================

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local BattleUi = {}

local sendAction = nil
local gui = nil
local state = nil
local locked = false
local bobConn = nil

-- UI-Referenzen
local logLabel, buttonsArea, mainGrid, movesFrame, bagFrame, switchFrame
local resultBanner, resultText
local enemyName, enemyInfo, enemyBar
local allyName, allyInfo, allyHpText, allyBar, xpFill

local function setLog(msg)
	logLabel.Text = msg
end

-- ---------- Anzeige ----------

local function statusText(status)
	if status then
		return "  •  " .. GameData.StatusNames[status]
	end
	return ""
end

local function renderEnemy(instant)
	if not state or not state.enemy then return end
	local e = state.enemy
	enemyName.Text = e.name .. "   Lv. " .. e.level
	enemyInfo.Text = e.typ .. statusText(e.status)
	enemyInfo.TextColor3 = e.status and UiKit.Colors.Bad or GameData.TypeColors[e.typ]
	enemyBar.Set(e.hp, e.maxHp, instant)
end

local function renderAlly(instant)
	if not state or not state.ally then return end
	local a = state.ally
	allyName.Text = a.name .. "   Lv. " .. a.level
	allyInfo.Text = a.typ .. statusText(a.status)
	allyInfo.TextColor3 = a.status and UiKit.Colors.Bad or GameData.TypeColors[a.typ]
	allyBar.Set(a.hp, a.maxHp, instant)
	allyHpText.Text = a.hp .. " / " .. a.maxHp
	local frac = 0
	if a.xpNext and a.xpNext > 0 then
		frac = math.max(0, math.min(1, a.xp / a.xpNext))
	end
	xpFill.Size = UDim2.new(frac, 0, 1, 0)
end

-- ---------- Buehnen-Modelle & Kamera ----------

local function fetchModel(side, name)
	if not state or not state.stageFolder then return end
	local model = state.stageFolder:WaitForChild(name, 5)
	if model then
		state[side .. "Model"] = model
		state[side .. "Base"] = model:GetPivot()
	end
end

local function startBobbing()
	if bobConn then bobConn:Disconnect() end
	bobConn = RunService.RenderStepped:Connect(function()
		if not state then return end
		local t = os.clock()
		if state.allyModel and state.allyModel.Parent and state.allyBase then
			state.allyModel:PivotTo(state.allyBase * CFrame.new(0, math.abs(math.sin(t * 3)) * 0.35, 0))
		end
		if state.enemyModel and state.enemyModel.Parent and state.enemyBase then
			state.enemyModel:PivotTo(state.enemyBase * CFrame.new(0, math.abs(math.sin(t * 3 + 1.4)) * 0.35, 0))
		end
	end)
end

local function stopBobbing()
	if bobConn then
		bobConn:Disconnect()
		bobConn = nil
	end
end

local function flashHit(side)
	local model = state and state[side .. "Model"]
	if not model or not model.Parent then return end
	UiKit.Play("hit")
	local highlight = Instance.new("Highlight")
	highlight.FillColor = Color3.fromRGB(255, 70, 70)
	highlight.FillTransparency = 0.4
	highlight.OutlineTransparency = 1
	highlight.Parent = model
	task.delay(0.25, function()
		highlight:Destroy()
	end)
end

local function faintAnim(side)
	local model = state and state[side .. "Model"]
	local base = state and state[side .. "Base"]
	if not model or not model.Parent or not base then return end
	for i = 1, 6 do
		if not model.Parent then return end
		model:PivotTo(base * CFrame.new(0, -i * 0.5, 0) * CFrame.Angles(0, 0, math.rad(i * 13)))
		task.wait(0.06)
	end
	for _, part in ipairs(model:GetDescendants()) do
		if part:IsA("BasePart") then
			TweenService:Create(part, TweenInfo.new(0.3), { Transparency = 1 }):Play()
		end
	end
end

-- Fangkugel-Wurf mit Wackeln
local function ballAnimation(wobbles, success)
	if not state or not state.enemyBase then
		task.wait(0.5)
		return
	end
	local startPos = (state.allyBase or state.enemyBase).Position + Vector3.new(0, 2.5, 0)
	local endPos = state.enemyBase.Position + Vector3.new(0, 1.2, 0)

	local ball = Instance.new("Part")
	ball.Shape = Enum.PartType.Ball
	ball.Size = Vector3.new(1.2, 1.2, 1.2)
	ball.Color = Color3.fromRGB(220, 60, 60)
	ball.Material = Enum.Material.SmoothPlastic
	ball.Anchored = true
	ball.CanCollide = false
	ball.CFrame = CFrame.new(startPos)
	ball.Parent = workspace
	local stripe = Instance.new("Part")
	stripe.Shape = Enum.PartType.Cylinder
	stripe.Size = Vector3.new(0.3, 1.26, 1.26)
	stripe.Color = Color3.fromRGB(245, 245, 245)
	stripe.Anchored = true
	stripe.CanCollide = false
	stripe.Parent = workspace

	UiKit.Play("swoosh")
	-- Wurf-Bogen
	local flightTime = 0.55
	local t0 = os.clock()
	while true do
		local alpha = (os.clock() - t0) / flightTime
		if alpha >= 1 then break end
		local pos = startPos:Lerp(endPos, alpha) + Vector3.new(0, math.sin(alpha * math.pi) * 4, 0)
		ball.CFrame = CFrame.new(pos) * CFrame.Angles(0, 0, alpha * 12)
		stripe.CFrame = ball.CFrame * CFrame.Angles(0, 0, math.rad(90))
		RunService.RenderStepped:Wait()
	end
	ball.CFrame = CFrame.new(endPos)
	stripe.CFrame = ball.CFrame * CFrame.Angles(0, 0, math.rad(90))

	-- Monster "verschwindet" in der Kugel
	if state.enemyModel and state.enemyModel.Parent then
		for _, part in ipairs(state.enemyModel:GetDescendants()) do
			if part:IsA("BasePart") then
				part.Transparency = 1
			end
		end
	end

	-- Wackeln
	for _ = 1, wobbles do
		task.wait(0.25)
		UiKit.Play("click")
		for _, angle in ipairs({ 18, -18, 0 }) do
			ball.CFrame = CFrame.new(endPos) * CFrame.Angles(0, 0, math.rad(angle))
			stripe.CFrame = ball.CFrame * CFrame.Angles(0, 0, math.rad(90))
			task.wait(0.1)
		end
	end
	task.wait(0.3)

	if success then
		UiKit.Play("catch")
		ball.Color = Color3.fromRGB(150, 150, 150)
		task.wait(0.6)
	else
		-- Kugel platzt auf, Monster kommt zurueck
		if state.enemyModel and state.enemyModel.Parent then
			for _, part in ipairs(state.enemyModel:GetDescendants()) do
				if part:IsA("BasePart") then
					part.Transparency = 0
				end
			end
		end
	end
	ball:Destroy()
	stripe:Destroy()
end

local function enterCamera()
	if not state or not state.stageFolder then return end
	local camPoint = state.stageFolder:FindFirstChild("KameraPunkt")
	if not camPoint then return end
	local camera = workspace.CurrentCamera
	camera.CameraType = Enum.CameraType.Scriptable
	local tween = TweenService:Create(camera, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CFrame = camPoint.CFrame })
	tween:Play()
end

local function exitCamera()
	local camera = workspace.CurrentCamera
	camera.CameraType = Enum.CameraType.Custom
	local character = Players.LocalPlayer.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		camera.CameraSubject = humanoid
	end
end

-- ---------- Untermenues ----------

local function showMain()
	mainGrid.Visible = true
	movesFrame.Visible = false
	bagFrame.Visible = false
	switchFrame.Visible = false
end

local function send(action)
	if locked then return end
	locked = true
	buttonsArea.Visible = false
	sendAction(action)
end

local function clearButtons(frame)
	for _, child in ipairs(frame:GetChildren()) do
		if child:IsA("TextButton") or child:IsA("TextLabel") then
			child:Destroy()
		end
	end
end

local function showMoves()
	clearButtons(movesFrame)
	for i, move in ipairs(state.ally.moves) do
		UiKit.Constrain(UiKit.Button({
			Text = move.name .. "\n" .. move.typ .. " • Stärke " .. move.power,
			BackgroundColor3 = GameData.TypeColors[move.typ]:Lerp(Color3.new(0, 0, 0), 0.35),
			LayoutOrder = i,
			Parent = movesFrame,
		}, function()
			send({ kind = "move", index = i })
		end), 17)
	end
	UiKit.Constrain(UiKit.Button({
		Text = "Zurück",
		BackgroundColor3 = Color3.fromRGB(90, 90, 110),
		LayoutOrder = 9,
		Parent = movesFrame,
	}, showMain), 17)
	mainGrid.Visible = false
	movesFrame.Visible = true
	bagFrame.Visible = false
	switchFrame.Visible = false
end

local function showBag()
	clearButtons(bagFrame)
	local order = 1
	local any = false
	for _, itemId in ipairs(GameData.ItemOrder) do
		local count = (state.items and state.items[itemId]) or 0
		if count > 0 then
			any = true
			local item = GameData.Items[itemId]
			UiKit.Constrain(UiKit.Button({
				Text = item.name .. " x" .. count,
				BackgroundColor3 = item.ball and Color3.fromRGB(190, 70, 70) or Color3.fromRGB(80, 140, 90),
				LayoutOrder = order,
				Parent = bagFrame,
			}, function()
				send({ kind = "item", item = itemId })
			end), 16)
			order = order + 1
		end
	end
	if not any then
		UiKit.Constrain(UiKit.Label({
			Text = "Beutel leer!",
			LayoutOrder = 1,
			Size = UDim2.new(0.3, 0, 0.4, 0),
			Parent = bagFrame,
		}), 16)
	end
	UiKit.Constrain(UiKit.Button({
		Text = "Zurück",
		BackgroundColor3 = Color3.fromRGB(90, 90, 110),
		LayoutOrder = 9,
		Parent = bagFrame,
	}, showMain), 16)
	mainGrid.Visible = false
	movesFrame.Visible = false
	bagFrame.Visible = true
	switchFrame.Visible = false
end

local function showSwitch(forced)
	clearButtons(switchFrame)
	for i, mon in ipairs(state.team) do
		local usable = mon.hp > 0 and i ~= state.monIndex
		local label = mon.name .. " Lv." .. mon.level .. "\n" .. mon.hp .. "/" .. mon.maxHp
		if mon.hp <= 0 then
			label = mon.name .. "\nK.O."
		elseif i == state.monIndex then
			label = mon.name .. "\nim Kampf"
		end
		UiKit.Constrain(UiKit.Button({
			Text = label,
			BackgroundColor3 = usable and GameData.TypeColors[mon.typ]:Lerp(Color3.new(0, 0, 0), 0.4) or Color3.fromRGB(60, 60, 70),
			LayoutOrder = i,
			Parent = switchFrame,
		}, function()
			if usable then
				send({ kind = "switch", index = i })
			end
		end), 15)
	end
	if not forced then
		UiKit.Constrain(UiKit.Button({
			Text = "Zurück",
			BackgroundColor3 = Color3.fromRGB(90, 90, 110),
			LayoutOrder = 9,
			Parent = switchFrame,
		}, showMain), 15)
	end
	mainGrid.Visible = false
	movesFrame.Visible = false
	bagFrame.Visible = false
	switchFrame.Visible = true
end

-- ---------- Ablauf ----------

local RESULTS = {
	sieg = { text = "SIEG! 🏆", color = Color3.fromRGB(60, 160, 80) },
	gefangen = { text = "GEFANGEN! 🎉", color = Color3.fromRGB(70, 130, 220) },
	geflohen = { text = "Entkommen!", color = Color3.fromRGB(120, 120, 140) },
	niederlage = { text = "K.O. ...", color = Color3.fromRGB(170, 60, 60) },
}

function BattleUi.Start(payload)
	state = {
		mode = payload.mode,
		ally = payload.ally,
		enemy = payload.enemy,
		team = payload.team,
		monIndex = payload.monIndex,
		items = payload.items,
		canCatch = payload.canCatch,
		canFlee = payload.canFlee,
	}
	local arenas = workspace:WaitForChild("Kampfarenen", 5)
	state.stageFolder = arenas and arenas:WaitForChild(payload.stageName, 5) or nil
	fetchModel("ally", payload.allyModel)
	fetchModel("enemy", payload.enemyModel)

	locked = false
	renderAlly(true)
	renderEnemy(true)
	if payload.mode == "trainer" then
		setLog(payload.trainerName .. " will kämpfen! " .. payload.enemy.name .. " (Lv. " .. payload.enemy.level .. ") kommt raus!")
	else
		setLog("Ein wildes " .. payload.enemy.name .. " (Lv. " .. payload.enemy.level .. ") erscheint!")
	end
	resultBanner.Visible = false
	buttonsArea.Visible = true
	showMain()
	gui.Enabled = true
	enterCamera()
	startBobbing()
end

function BattleUi.Update(payload)
	task.spawn(function()
		if not state then
			if payload.over then
				gui.Enabled = false
				exitCamera()
				stopBobbing()
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
			elseif ev.t == "hit" then
				flashHit(ev.side)
				task.wait(0.2)
			elseif ev.t == "faint" then
				faintAnim(ev.side)
				task.wait(0.4)
			elseif ev.t == "status" then
				if ev.side == "enemy" and state.enemy then
					state.enemy.status = ev.status
					renderEnemy(true)
				elseif state.ally then
					state.ally.status = ev.status
					renderAlly(true)
				end
			elseif ev.t == "ally" then
				state.ally = ev.view
				renderAlly(true)
				task.wait(0.3)
			elseif ev.t == "enemy" then
				state.enemy = ev.view
				renderEnemy(true)
				task.wait(0.3)
			elseif ev.t == "allyModel" then
				fetchModel("ally", ev.name)
				task.wait(0.2)
			elseif ev.t == "enemyModel" then
				fetchModel("enemy", ev.name)
				task.wait(0.2)
			elseif ev.t == "ball" then
				ballAnimation(ev.wobbles, ev.success)
			end
		end

		if payload.ally then state.ally = payload.ally end
		if payload.enemy then state.enemy = payload.enemy end
		if payload.team then state.team = payload.team end
		if payload.monIndex then state.monIndex = payload.monIndex end
		if payload.items then state.items = payload.items end
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
			exitCamera()
			stopBobbing()
			state = nil
			locked = false
		else
			locked = false
			buttonsArea.Visible = true
			if payload.forcedSwitch then
				setLog("Wähle dein nächstes Monster!")
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
	gui = UiKit.Screen("MonsterBattle", 20)
	gui.Enabled = false

	-- Gegner-Karte oben rechts
	local enemyCard = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(0.98, 0, 0.05, 0),
		Size = UDim2.new(0.32, 0, 0.14, 0),
		Parent = gui,
	})
	UiKit.Round(enemyCard, 12)
	UiKit.Stroke(enemyCard)
	enemyName = UiKit.Constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.07, 0),
		Size = UDim2.new(0.9, 0, 0.36, 0),
		Parent = enemyCard,
	}), 24)
	enemyInfo = UiKit.Constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.44, 0),
		Size = UDim2.new(0.9, 0, 0.18, 0),
		Parent = enemyCard,
	}), 15)
	enemyBar = UiKit.HpBar({
		Position = UDim2.new(0.05, 0, 0.68, 0),
		Size = UDim2.new(0.9, 0, 0.18, 0),
		Parent = enemyCard,
	})

	-- Eigene Karte unten links
	local allyCard = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0.02, 0, 0.72, 0),
		Size = UDim2.new(0.32, 0, 0.17, 0),
		Parent = gui,
	})
	UiKit.Round(allyCard, 12)
	UiKit.Stroke(allyCard)
	allyName = UiKit.Constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.05, 0),
		Size = UDim2.new(0.9, 0, 0.3, 0),
		Parent = allyCard,
	}), 24)
	allyInfo = UiKit.Constrain(UiKit.Label({
		Text = "?",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0.05, 0, 0.37, 0),
		Size = UDim2.new(0.55, 0, 0.15, 0),
		Parent = allyCard,
	}), 14)
	allyHpText = UiKit.Constrain(UiKit.Label({
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = UiKit.Colors.TextDim,
		Position = UDim2.new(0.6, 0, 0.37, 0),
		Size = UDim2.new(0.35, 0, 0.15, 0),
		Parent = allyCard,
	}), 14)
	allyBar = UiKit.HpBar({
		Position = UDim2.new(0.05, 0, 0.57, 0),
		Size = UDim2.new(0.9, 0, 0.16, 0),
		Parent = allyCard,
	})
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

	-- Untere Leiste
	local bottom = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0.99, 0),
		Size = UDim2.new(0.96, 0, 0.25, 0),
		Parent = gui,
	})
	UiKit.Round(bottom, 14)
	UiKit.Stroke(bottom)

	logLabel = UiKit.Constrain(UiKit.Label({
		Text = "",
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		Position = UDim2.new(0.02, 0, 0.08, 0),
		Size = UDim2.new(0.52, 0, 0.84, 0),
		Parent = bottom,
	}), 24)

	buttonsArea = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0.56, 0, 0.05, 0),
		Size = UDim2.new(0.42, 0, 0.9, 0),
		Parent = bottom,
	})

	local function grid(parent, cols)
		UiKit.Mk("UIGridLayout", {
			CellSize = UDim2.new(1 / cols - 0.02, 0, 0.45, 0),
			CellPadding = UDim2.new(0.02, 0, 0.07, 0),
			SortOrder = Enum.SortOrder.LayoutOrder,
			Parent = parent,
		})
	end

	mainGrid = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Parent = buttonsArea })
	grid(mainGrid, 2)
	UiKit.Constrain(UiKit.Button({ Text = "Kampf", BackgroundColor3 = Color3.fromRGB(200, 70, 70), LayoutOrder = 1, Parent = mainGrid }, function()
		showMoves()
	end), 24)
	UiKit.Constrain(UiKit.Button({ Text = "Beutel", BackgroundColor3 = Color3.fromRGB(190, 130, 60), LayoutOrder = 2, Parent = mainGrid }, function()
		showBag()
	end), 24)
	UiKit.Constrain(UiKit.Button({ Text = "Team", BackgroundColor3 = Color3.fromRGB(210, 170, 60), LayoutOrder = 3, Parent = mainGrid }, function()
		showSwitch(false)
	end), 24)
	UiKit.Constrain(UiKit.Button({ Text = "Flucht", BackgroundColor3 = Color3.fromRGB(110, 110, 130), LayoutOrder = 4, Parent = mainGrid }, function()
		send({ kind = "run" })
	end), 24)

	movesFrame = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Visible = false, Parent = buttonsArea })
	grid(movesFrame, 3)
	bagFrame = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Visible = false, Parent = buttonsArea })
	grid(bagFrame, 3)
	switchFrame = UiKit.Mk("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, 0), Visible = false, Parent = buttonsArea })
	grid(switchFrame, 3)

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
