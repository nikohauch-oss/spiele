-- ============================================================
-- HUD: Team oben links (3D-Mini-Bilder), Muenzen oben rechts,
-- Quest-Banner (Pixel-Stil), Zonen-Anzeige mit Fang-Chancen
-- unten links und Menue-Knoepfe.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local HudUi = {}

local gui = nil
local teamContainer = nil
local coinsLabel = nil
local questBanner = nil
local questLabel = nil
local zonePanel = nil
local zoneTitle = nil
local zoneRows = nil
local callbacks = nil
local lastData = nil

-- ---------- Quest-Banner ----------

local function updateQuest()
	if not lastData then return end
	local text = nil
	if not lastData.starter then
		text = "Besuche das Labor (gelbes Schild), um dein erstes Monster zu bekommen!"
	elseif (lastData.catches or 0) == 0 then
		text = "Lauf ins hohe Gras auf Route 1 (Osten) und fang dein erstes Monster!"
	end
	if text then
		questLabel.Text = text
		questBanner.Visible = true
	else
		questBanner.Visible = false
	end
end

-- ---------- Zonen-Anzeige mit Fang-Chancen ----------

local function patchAt(pos)
	for _, patch in ipairs(GameData.GrassPatches) do
		if pos.X >= patch[1] and pos.X <= patch[3] and pos.Z >= patch[2] and pos.Z <= patch[4] then
			return patch
		end
	end
	return nil
end

local function updateZone()
	local character = Players.LocalPlayer.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local patch = root and patchAt(root.Position) or nil
	if not patch then
		zonePanel.Visible = false
		return
	end
	local route = GameData.Routes[patch[5]]
	zoneTitle.Text = route.name .. "  (Lv. " .. route.levelMin .. "-" .. route.levelMax .. ")"

	for _, child in ipairs(zoneRows:GetChildren()) do
		if child:IsA("TextLabel") then
			child:Destroy()
		end
	end
	local total = 0
	for _, entry in ipairs(route.pool) do
		total = total + entry[2]
	end
	local sorted = {}
	for _, entry in ipairs(route.pool) do
		table.insert(sorted, entry)
	end
	table.sort(sorted, function(a, b)
		return a[2] > b[2]
	end)
	for i = 1, math.min(4, #sorted) do
		local sp = GameData.Species[sorted[i][1]]
		local pct = sorted[i][2] / total * 100
		local pctText = pct >= 10 and string.format("%d%%", math.floor(pct + 0.5)) or string.format("%.1f%%", pct)
		local row = UiKit.Label({
			Text = sp.name .. "  " .. pctText,
			TextColor3 = GameData.TypeColors[sp.typ],
			TextStrokeTransparency = 0.2,
			TextXAlignment = Enum.TextXAlignment.Left,
			Size = UDim2.new(1, 0, 0, 16),
			LayoutOrder = i,
			Parent = zoneRows,
		})
		UiKit.Constrain(row, 13)
	end
	zonePanel.Visible = true
end

-- ---------- Daten ----------

function HudUi.SetData(data)
	if not data then return end
	lastData = data
	coinsLabel.Text = "🪙 " .. data.coins
	updateQuest()

	for _, child in ipairs(teamContainer:GetChildren()) do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end
	for i, mon in ipairs(data.team) do
		local sp = GameData.Species[mon.id]
		local stats = GameData.StatsFor(mon.id, mon.level)
		local card = UiKit.Mk("Frame", {
			BackgroundColor3 = UiKit.Colors.Panel,
			BackgroundTransparency = 0.15,
			Size = UDim2.new(1, 0, 0, 54),
			LayoutOrder = i,
			Parent = teamContainer,
		})
		UiKit.Round(card, 10)
		UiKit.Stroke(card)

		local viewport = UiKit.MonsterViewport({
			Size = UDim2.new(0, 46, 0, 46),
			Position = UDim2.new(0, 4, 0, 4),
			Parent = card,
		})
		viewport.SetSpecies(mon.id)

		UiKit.Constrain(UiKit.Label({
			Text = sp.name .. " LVL " .. mon.level,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 56, 0, 5),
			Size = UDim2.new(1, -60, 0, 18),
			Parent = card,
		}), 13)

		local bar = UiKit.HpBar({
			Position = UDim2.new(0, 56, 0, 26),
			Size = UDim2.new(1, -100, 0, 12),
			Parent = card,
		})
		bar.Set(mon.hp, stats.maxHp, true)

		UiKit.Constrain(UiKit.Label({
			Text = mon.hp .. "/" .. stats.maxHp .. (mon.status and ("  " .. GameData.StatusNames[mon.status]) or ""),
			TextColor3 = mon.status and UiKit.Colors.Bad or UiKit.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 56, 0, 40),
			Size = UDim2.new(1, -60, 0, 12),
			Parent = card,
		}), 11)

		UiKit.Constrain(UiKit.Label({
			Text = i == 1 and "★" or "",
			TextColor3 = UiKit.Colors.Accent,
			Position = UDim2.new(1, -24, 0, 4),
			Size = UDim2.new(0, 20, 0, 20),
			Parent = card,
		}), 16)
	end
end

-- ---------- Aufbau ----------

function HudUi.Init(cb)
	callbacks = cb
	gui = UiKit.Screen("MonsterHud", 5)

	-- Team oben links
	teamContainer = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 10, 0, 12),
		Size = UDim2.new(0, 190, 0, 360),
		Parent = gui,
	})
	UiKit.Mk("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 5),
		Parent = teamContainer,
	})

	-- Muenzen-Pille oben rechts
	local coinPill = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(205, 160, 60),
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 12),
		Size = UDim2.new(0, 150, 0, 34),
		Parent = gui,
	})
	UiKit.Round(coinPill, 17)
	UiKit.Stroke(coinPill, Color3.fromRGB(90, 60, 20), 3)
	coinsLabel = UiKit.Constrain(UiKit.Label({
		Text = "🪙 0",
		Size = UDim2.new(1, -16, 1, -8),
		Position = UDim2.new(0, 8, 0, 4),
		Parent = coinPill,
	}), 18)

	-- Quest-Banner oben (Pixel-Stil, wie im Vorbild)
	questBanner = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		BackgroundTransparency = 0.25,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 14),
		Size = UDim2.new(0.46, 0, 0, 58),
		Visible = false,
		Parent = gui,
	})
	UiKit.Round(questBanner, 10)
	UiKit.Constrain(UiKit.Label({
		Text = "❗",
		TextColor3 = Color3.fromRGB(220, 50, 50),
		Position = UDim2.new(0, 6, 0, 6),
		Size = UDim2.new(0, 40, 1, -12),
		Parent = questBanner,
	}), 30)
	questLabel = UiKit.Constrain(UiKit.Label({
		Text = "",
		TextColor3 = Color3.fromRGB(40, 40, 48),
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 52, 0, 6),
		Size = UDim2.new(1, -60, 1, -12),
		Parent = questBanner,
	}), 14)

	-- Zonen-Anzeige unten links (ueber den Knoepfen)
	zonePanel = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(20, 22, 28),
		BackgroundTransparency = 0.35,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 14, 1, -130),
		Size = UDim2.new(0, 210, 0, 100),
		Visible = false,
		Parent = gui,
	})
	UiKit.Round(zonePanel, 10)
	zoneTitle = UiKit.Constrain(UiKit.Label({
		Text = "",
		TextStrokeTransparency = 0.2,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 8, 0, 4),
		Size = UDim2.new(1, -16, 0, 18),
		Parent = zonePanel,
	}), 14)
	zoneRows = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 8, 0, 26),
		Size = UDim2.new(1, -16, 1, -30),
		Parent = zonePanel,
	})
	UiKit.Mk("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 2),
		Parent = zoneRows,
	})
	task.spawn(function()
		while true do
			task.wait(1)
			pcall(updateZone)
		end
	end)

	-- Menue-Knoepfe unten links
	local buttons = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 14, 1, -14),
		Size = UDim2.new(0, 150, 0, 104),
		Parent = gui,
	})
	UiKit.Mk("UIListLayout", {
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 8),
		Parent = buttons,
	})
	UiKit.Constrain(UiKit.Button({
		Text = "🎒 TASCHE (B)",
		BackgroundColor3 = Color3.fromRGB(210, 140, 55),
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 1,
		Parent = buttons,
	}, function()
		callbacks.onToggleBag()
	end), 14)
	UiKit.Constrain(UiKit.Button({
		Text = "⭐ TEAM (T)",
		BackgroundColor3 = Color3.fromRGB(55, 170, 110),
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 2,
		Parent = buttons,
	}, function()
		callbacks.onToggleTeam()
	end), 14)
end

return HudUi
