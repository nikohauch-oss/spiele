-- ============================================================
-- Menues: HUD-Knoepfe, Starterauswahl, Team und Brain-Dex.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local MenuUi = {}

local data = nil
local callbacks = nil

local menuGui = nil
local teamPanel = nil
local teamScroll = nil
local dexPanel = nil
local dexScroll = nil
local dexProgress = nil
local starterModal = nil
local starterCards = nil

local function hex(color)
	return string.format(
		"#%02X%02X%02X",
		math.floor(color.R * 255 + 0.5),
		math.floor(color.G * 255 + 0.5),
		math.floor(color.B * 255 + 0.5)
	)
end

-- ---------- Panel-Grundgeruest ----------

local function makePanel(title, size)
	local panel = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = size,
		Visible = false,
		Parent = menuGui,
	})
	UiKit.Round(panel, 14)
	UiKit.Stroke(panel, Color3.fromRGB(15, 15, 25), 3)

	UiKit.Label({
		Text = title,
		Size = UDim2.new(1, -60, 0, 34),
		Position = UDim2.new(0, 14, 0, 8),
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = panel,
	})

	UiKit.Button({
		Text = "X",
		BackgroundColor3 = UiKit.Colors.Bad,
		Size = UDim2.new(0, 34, 0, 34),
		Position = UDim2.new(1, -42, 0, 8),
		Parent = panel,
	}, function()
		panel.Visible = false
	end)

	return panel
end

local function clearRows(container)
	for _, child in ipairs(container:GetChildren()) do
		if child:IsA("Frame") or child:IsA("TextLabel") then
			child:Destroy()
		end
	end
end

-- ---------- Team-Panel ----------

local function addTeamRow(container, order, mon, isTeam, index)
	local sp = GameData.Species[mon.id]
	local stats = GameData.StatsFor(mon.id, mon.level)
	local row = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.PanelLight,
		Size = UDim2.new(1, -8, 0, 56),
		LayoutOrder = order,
		Parent = container,
	})
	UiKit.Round(row, 10)

	UiKit.Label({
		RichText = true,
		Text = '<font color="' .. hex(GameData.TypeColors[sp.typ]) .. '">●</font> ' .. sp.name .. "   Lv. " .. mon.level,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 10, 0, 4),
		Size = UDim2.new(0.58, 0, 0, 22),
		Parent = row,
	})
	UiKit.Label({
		Text = "HP " .. mon.hp .. "/" .. stats.maxHp,
		TextColor3 = UiKit.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 10, 0, 30),
		Size = UDim2.new(0, 90, 0, 18),
		Parent = row,
	})
	local bar = UiKit.HpBar({
		Position = UDim2.new(0, 106, 0, 33),
		Size = UDim2.new(0.24, 0, 0, 12),
		Parent = row,
	})
	bar.Set(mon.hp, stats.maxHp, true)

	if isTeam then
		if index > 1 then
			UiKit.Button({
				Text = "Anführer",
				BackgroundColor3 = UiKit.Colors.Blue,
				Position = UDim2.new(0.62, 0, 0.5, -15),
				Size = UDim2.new(0.18, 0, 0, 30),
				Parent = row,
			}, function()
				callbacks.onTeamAction("leader", index)
			end)
		end
		if data and #data.team > 1 then
			UiKit.Button({
				Text = "→ Box",
				Position = UDim2.new(0.815, 0, 0.5, -15),
				Size = UDim2.new(0.16, 0, 0, 30),
				Parent = row,
			}, function()
				callbacks.onTeamAction("toBox", index)
			end)
		end
	else
		if data and #data.team < GameData.TEAM_SIZE then
			UiKit.Button({
				Text = "→ Team",
				BackgroundColor3 = UiKit.Colors.Good,
				Position = UDim2.new(0.78, 0, 0.5, -15),
				Size = UDim2.new(0.19, 0, 0, 30),
				Parent = row,
			}, function()
				callbacks.onTeamAction("fromBox", index)
			end)
		end
	end
end

local function renderTeam()
	if not data then return end
	clearRows(teamScroll)
	local order = 1
	for i, mon in ipairs(data.team) do
		addTeamRow(teamScroll, order, mon, true, i)
		order = order + 1
	end
	local header = UiKit.Label({
		Text = "Box (" .. #data.box .. "/" .. GameData.BOX_SIZE .. ")",
		TextColor3 = UiKit.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		Size = UDim2.new(1, -8, 0, 26),
		LayoutOrder = order,
		Parent = teamScroll,
	})
	header.Name = "BoxHeader"
	order = order + 1
	for i, mon in ipairs(data.box) do
		addTeamRow(teamScroll, order, mon, false, i)
		order = order + 1
	end
end

-- ---------- Brain-Dex ----------

local function renderDex()
	if not data then return end
	clearRows(dexScroll)
	local caughtCount = 0
	for i, id in ipairs(GameData.DexOrder) do
		local sp = GameData.Species[id]
		local caught = data.dex[id] == true
		if caught then
			caughtCount = caughtCount + 1
		end
		local card = UiKit.Mk("Frame", {
			BackgroundColor3 = caught and GameData.TypeColors[sp.typ]:Lerp(Color3.new(0, 0, 0), 0.55) or Color3.fromRGB(48, 48, 62),
			LayoutOrder = i,
			Parent = dexScroll,
		})
		UiKit.Round(card, 10)
		UiKit.Label({
			Text = "#" .. i,
			TextColor3 = UiKit.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 6, 0, 2),
			Size = UDim2.new(0.5, 0, 0, 14),
			Parent = card,
		})
		UiKit.Label({
			Text = caught and sp.name or "???",
			Position = UDim2.new(0, 4, 0, 18),
			Size = UDim2.new(1, -8, 0, 34),
			TextColor3 = caught and UiKit.Colors.Text or Color3.fromRGB(120, 120, 135),
			Parent = card,
		})
		UiKit.Label({
			Text = caught and (sp.typ .. " • " .. sp.rarity) or "Noch nicht gefangen",
			TextColor3 = caught and GameData.Rarities[sp.rarity].color or Color3.fromRGB(100, 100, 115),
			Position = UDim2.new(0, 4, 0, 56),
			Size = UDim2.new(1, -8, 0, 16),
			Parent = card,
		})
	end
	dexProgress.Text = "Entdeckt: " .. caughtCount .. " / " .. #GameData.DexOrder
end

-- ---------- Starterauswahl ----------

local function buildStarterModal()
	starterModal = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Size = UDim2.new(1, 0, 1, 0),
		Visible = false,
		ZIndex = 5,
		Parent = menuGui,
	})
	local panel = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0.72, 0, 0.66, 0),
		ZIndex = 5,
		Parent = starterModal,
	})
	UiKit.Round(panel, 16)
	UiKit.Stroke(panel, UiKit.Colors.Accent, 3)
	UiKit.Label({
		Text = "Wähle dein erstes Brain Word!",
		Size = UDim2.new(1, 0, 0.14, 0),
		ZIndex = 5,
		Parent = panel,
	})
	starterCards = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0.16, 0),
		Size = UDim2.new(1, 0, 0.84, 0),
		ZIndex = 5,
		Parent = panel,
	})
	UiKit.Mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Padding = UDim.new(0.02, 0),
		Parent = starterCards,
	})
end

function MenuUi.ShowStarter(options)
	for _, child in ipairs(starterCards:GetChildren()) do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end
	for _, id in ipairs(options) do
		local sp = GameData.Species[id]
		local card = UiKit.Mk("Frame", {
			BackgroundColor3 = UiKit.Colors.PanelLight,
			Size = UDim2.new(0.3, 0, 0.9, 0),
			ZIndex = 5,
			Parent = starterCards,
		})
		UiKit.Round(card, 14)
		UiKit.Stroke(card, GameData.TypeColors[sp.typ], 3)
		UiKit.Label({
			Text = sp.name,
			TextColor3 = GameData.TypeColors[sp.typ],
			Position = UDim2.new(0, 0, 0.04, 0),
			Size = UDim2.new(1, 0, 0.18, 0),
			ZIndex = 5,
			Parent = card,
		})
		UiKit.Label({
			Text = "Typ: " .. sp.typ,
			Position = UDim2.new(0, 0, 0.24, 0),
			Size = UDim2.new(1, 0, 0.1, 0),
			TextColor3 = UiKit.Colors.TextDim,
			ZIndex = 5,
			Parent = card,
		})
		UiKit.Label({
			Text = sp.desc,
			TextWrapped = true,
			TextScaled = false,
			TextSize = 16,
			Position = UDim2.new(0.05, 0, 0.38, 0),
			Size = UDim2.new(0.9, 0, 0.36, 0),
			ZIndex = 5,
			Parent = card,
		})
		local pick = UiKit.Button({
			Text = "Nehmen!",
			BackgroundColor3 = UiKit.Colors.Good,
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 0.97, 0),
			Size = UDim2.new(0.8, 0, 0.14, 0),
			ZIndex = 5,
			Parent = card,
		}, function()
			starterModal.Visible = false
			callbacks.onStarterPick(id)
		end)
		pick.ZIndex = 5
	end
	starterModal.Visible = true
end

-- ---------- Oeffentliche API ----------

function MenuUi.SetData(newData)
	data = newData
	if teamPanel.Visible then
		renderTeam()
	end
	if dexPanel.Visible then
		renderDex()
	end
end

function MenuUi.CloseAll()
	teamPanel.Visible = false
	dexPanel.Visible = false
end

function MenuUi.Init(cb)
	callbacks = cb
	menuGui = UiKit.Screen("BrainMenus", 10)

	-- Team-Panel
	teamPanel = makePanel("Dein Team", UDim2.new(0.44, 0, 0.74, 0))
	teamScroll = UiKit.Mk("ScrollingFrame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 10, 0, 50),
		Size = UDim2.new(1, -20, 1, -60),
		CanvasSize = UDim2.new(0, 0, 0, 0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		Parent = teamPanel,
	})
	UiKit.Mk("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 6),
		Parent = teamScroll,
	})

	-- Brain-Dex-Panel
	dexPanel = makePanel("Brain-Dex", UDim2.new(0.56, 0, 0.78, 0))
	dexProgress = UiKit.Label({
		Text = "Entdeckt: 0 / 0",
		TextColor3 = UiKit.Colors.Accent,
		Position = UDim2.new(0, 14, 0, 42),
		Size = UDim2.new(1, -28, 0, 20),
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = dexPanel,
	})
	dexScroll = UiKit.Mk("ScrollingFrame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 10, 0, 68),
		Size = UDim2.new(1, -20, 1, -78),
		CanvasSize = UDim2.new(0, 0, 0, 0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		Parent = dexPanel,
	})
	UiKit.Mk("UIGridLayout", {
		CellSize = UDim2.new(0, 128, 0, 78),
		CellPadding = UDim2.new(0, 8, 0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = dexScroll,
	})

	buildStarterModal()

	-- HUD unten links
	local hud = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 14, 1, -14),
		Size = UDim2.new(0, 130, 0, 104),
		Parent = menuGui,
	})
	UiKit.Mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		Padding = UDim.new(0, 8),
		Parent = hud,
	})
	UiKit.Button({
		Text = "Team",
		BackgroundColor3 = UiKit.Colors.Blue,
		Size = UDim2.new(1, 0, 0, 44),
		Parent = hud,
	}, function()
		dexPanel.Visible = false
		teamPanel.Visible = not teamPanel.Visible
		if teamPanel.Visible then
			renderTeam()
		end
	end)
	UiKit.Button({
		Text = "Brain-Dex",
		BackgroundColor3 = Color3.fromRGB(150, 90, 220),
		Size = UDim2.new(1, 0, 0, 44),
		Parent = hud,
	}, function()
		teamPanel.Visible = false
		dexPanel.Visible = not dexPanel.Visible
		if dexPanel.Visible then
			renderDex()
		end
	end)

	-- Kleiner Hinweis unten in der Mitte
	UiKit.Label({
		Text = "Gehe zu einem wilden Brain Word und drücke den Kampf-Knopf (Taste E)!",
		TextColor3 = Color3.fromRGB(235, 235, 245),
		TextStrokeTransparency = 0.4,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.new(0.6, 0, 0, 20),
		Parent = menuGui,
	})
end

return MenuUi
