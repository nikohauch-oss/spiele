-- ============================================================
-- Menues: Beutel (B), Team (T), Box-PC, Shop und
-- Starter-Bestaetigung im Labor.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local MenuUi = {}

local data = nil
local callbacks = nil

local gui = nil
local bagPanel = nil
local bagScroll = nil
local teamPanel = nil
local teamTitle = nil
local teamScroll = nil
local teamBoxMode = false
local shopPanel = nil
local shopScroll = nil
local shopCoins = nil
local starterModal = nil

-- ---------- Grundgeruest ----------

local function makePanel(title, size)
	local panel = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = size,
		Visible = false,
		Parent = gui,
	})
	UiKit.Round(panel, 14)
	UiKit.Stroke(panel, Color3.fromRGB(15, 15, 25), 3)
	local titleLabel = UiKit.Label({
		Text = title,
		Size = UDim2.new(1, -60, 0, 32),
		Position = UDim2.new(0, 14, 0, 8),
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = panel,
	})
	UiKit.Button({
		Text = "X",
		BackgroundColor3 = UiKit.Colors.Bad,
		Size = UDim2.new(0, 32, 0, 32),
		Position = UDim2.new(1, -40, 0, 8),
		Parent = panel,
	}, function()
		panel.Visible = false
	end)
	return panel, titleLabel
end

local function makeScroll(panel, topOffset)
	local scroll = UiKit.Mk("ScrollingFrame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 10, 0, topOffset),
		Size = UDim2.new(1, -20, 1, -topOffset - 10),
		CanvasSize = UDim2.new(0, 0, 0, 0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		Parent = panel,
	})
	UiKit.Mk("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 6),
		Parent = scroll,
	})
	return scroll
end

local function clearRows(container)
	for _, child in ipairs(container:GetChildren()) do
		if child:IsA("Frame") or child:IsA("TextLabel") then
			child:Destroy()
		end
	end
end

-- ---------- Beutel ----------

local function askTarget(itemId)
	-- Overlay: Auf welches Monster anwenden?
	local overlay = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.4,
		Size = UDim2.new(1, 0, 1, 0),
		ZIndex = 8,
		Parent = gui,
	})
	local box = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0, 320, 0, 90 + #data.team * 44),
		ZIndex = 8,
		Parent = overlay,
	})
	UiKit.Round(box, 12)
	UiKit.Stroke(box)
	local title = UiKit.Label({
		Text = GameData.Items[itemId].name .. " benutzen auf:",
		Size = UDim2.new(1, -16, 0, 30),
		Position = UDim2.new(0, 8, 0, 8),
		ZIndex = 8,
		Parent = box,
	})
	UiKit.Constrain(title, 20)
	for i, mon in ipairs(data.team) do
		local sp = GameData.Species[mon.id]
		local stats = GameData.StatsFor(mon.id, mon.level)
		local btn = UiKit.Button({
			Text = sp.name .. "  Lv." .. mon.level .. "  (" .. mon.hp .. "/" .. stats.maxHp .. ")",
			Size = UDim2.new(1, -20, 0, 36),
			Position = UDim2.new(0, 10, 0, 40 + (i - 1) * 44),
			ZIndex = 8,
			Parent = box,
		}, function()
			overlay:Destroy()
			callbacks.onUseItem(itemId, i)
		end)
		btn.ZIndex = 8
		UiKit.Constrain(btn, 16)
	end
	local cancel = UiKit.Button({
		Text = "Abbrechen",
		BackgroundColor3 = UiKit.Colors.Bad,
		Size = UDim2.new(1, -20, 0, 32),
		Position = UDim2.new(0, 10, 1, -40),
		ZIndex = 8,
		Parent = box,
	}, function()
		overlay:Destroy()
	end)
	cancel.ZIndex = 8
	UiKit.Constrain(cancel, 16)
end

local function renderBag()
	if not data then return end
	clearRows(bagScroll)
	local order = 1
	local empty = true
	for _, itemId in ipairs(GameData.ItemOrder) do
		local count = data.items[itemId] or 0
		if count > 0 then
			empty = false
			local item = GameData.Items[itemId]
			local row = UiKit.Mk("Frame", {
				BackgroundColor3 = UiKit.Colors.PanelLight,
				Size = UDim2.new(1, -8, 0, 58),
				LayoutOrder = order,
				Parent = bagScroll,
			})
			UiKit.Round(row, 10)
			UiKit.Constrain(UiKit.Label({
				Text = item.name .. "  x" .. count,
				TextXAlignment = Enum.TextXAlignment.Left,
				Position = UDim2.new(0, 10, 0, 5),
				Size = UDim2.new(0.72, 0, 0, 22),
				Parent = row,
			}), 18)
			UiKit.Constrain(UiKit.Label({
				Text = item.desc,
				TextColor3 = UiKit.Colors.TextDim,
				TextXAlignment = Enum.TextXAlignment.Left,
				Position = UDim2.new(0, 10, 0, 30),
				Size = UDim2.new(0.72, 0, 0, 20),
				Parent = row,
			}), 13)
			if not item.ball then
				UiKit.Constrain(UiKit.Button({
					Text = "Benutzen",
					BackgroundColor3 = UiKit.Colors.Good,
					Position = UDim2.new(1, -102, 0.5, -16),
					Size = UDim2.new(0, 94, 0, 32),
					Parent = row,
				}, function()
					if data and #data.team > 0 then
						askTarget(itemId)
					end
				end), 15)
			end
			order = order + 1
		end
	end
	if empty then
		UiKit.Label({
			Text = "Dein Beutel ist leer. Kauf etwas im Markt!",
			TextColor3 = UiKit.Colors.TextDim,
			Size = UDim2.new(1, -8, 0, 40),
			LayoutOrder = 1,
			Parent = bagScroll,
		})
	end
end

-- ---------- Team / Box ----------

local function addMonRow(order, mon, isTeam, index)
	local sp = GameData.Species[mon.id]
	local stats = GameData.StatsFor(mon.id, mon.level)
	local row = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.PanelLight,
		Size = UDim2.new(1, -8, 0, 62),
		LayoutOrder = order,
		Parent = teamScroll,
	})
	UiKit.Round(row, 10)

	local viewport = UiKit.MonsterViewport({
		Size = UDim2.new(0, 52, 0, 52),
		Position = UDim2.new(0, 5, 0, 5),
		Parent = row,
	})
	viewport.SetSpecies(mon.id)

	UiKit.Constrain(UiKit.Label({
		Text = sp.name .. "  Lv. " .. mon.level .. "  (" .. sp.typ .. ")",
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 64, 0, 5),
		Size = UDim2.new(0.5, 0, 0, 22),
		Parent = row,
	}), 17)
	UiKit.Constrain(UiKit.Label({
		Text = "KP " .. mon.hp .. "/" .. stats.maxHp .. (mon.status and ("  •  " .. GameData.StatusNames[mon.status]) or ""),
		TextColor3 = mon.status and UiKit.Colors.Bad or UiKit.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 64, 0, 29),
		Size = UDim2.new(0.35, 0, 0, 16),
		Parent = row,
	}), 14)
	local bar = UiKit.HpBar({
		Position = UDim2.new(0, 64, 0, 48),
		Size = UDim2.new(0.32, 0, 0, 9),
		Parent = row,
	})
	bar.Set(mon.hp, stats.maxHp, true)

	if isTeam then
		if index > 1 then
			UiKit.Constrain(UiKit.Button({
				Text = "Anführer",
				BackgroundColor3 = UiKit.Colors.Blue,
				Position = UDim2.new(0.62, 0, 0.5, -16),
				Size = UDim2.new(0.17, 0, 0, 32),
				Parent = row,
			}, function()
				callbacks.onTeamAction("leader", index)
			end), 14)
		end
		if teamBoxMode and data and #data.team > 1 then
			UiKit.Constrain(UiKit.Button({
				Text = "→ Box",
				Position = UDim2.new(0.81, 0, 0.5, -16),
				Size = UDim2.new(0.16, 0, 0, 32),
				Parent = row,
			}, function()
				callbacks.onTeamAction("toBox", index)
			end), 14)
		end
	else
		if data and #data.team < GameData.TEAM_SIZE then
			UiKit.Constrain(UiKit.Button({
				Text = "→ Team",
				BackgroundColor3 = UiKit.Colors.Good,
				Position = UDim2.new(0.78, 0, 0.5, -16),
				Size = UDim2.new(0.19, 0, 0, 32),
				Parent = row,
			}, function()
				callbacks.onTeamAction("fromBox", index)
			end), 14)
		end
	end
end

local function renderTeam()
	if not data then return end
	teamTitle.Text = teamBoxMode and "Monster-PC (Team & Box)" or "Dein Team"
	clearRows(teamScroll)
	local order = 1
	for i, mon in ipairs(data.team) do
		addMonRow(order, mon, true, i)
		order = order + 1
	end
	if teamBoxMode then
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
			addMonRow(order, mon, false, i)
			order = order + 1
		end
	end
end

-- ---------- Shop ----------

local function renderShop()
	if not data then return end
	shopCoins.Text = "Deine Münzen: 🪙 " .. data.coins
	clearRows(shopScroll)
	for i, itemId in ipairs(GameData.ItemOrder) do
		local item = GameData.Items[itemId]
		local row = UiKit.Mk("Frame", {
			BackgroundColor3 = UiKit.Colors.PanelLight,
			Size = UDim2.new(1, -8, 0, 58),
			LayoutOrder = i,
			Parent = shopScroll,
		})
		UiKit.Round(row, 10)
		UiKit.Constrain(UiKit.Label({
			Text = item.name .. "  –  🪙 " .. item.price,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 10, 0, 5),
			Size = UDim2.new(0.7, 0, 0, 22),
			Parent = row,
		}), 18)
		UiKit.Constrain(UiKit.Label({
			Text = item.desc,
			TextColor3 = UiKit.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 10, 0, 30),
			Size = UDim2.new(0.7, 0, 0, 20),
			Parent = row,
		}), 13)
		UiKit.Constrain(UiKit.Button({
			Text = "Kaufen",
			BackgroundColor3 = UiKit.Colors.Good,
			Position = UDim2.new(1, -96, 0.5, -16),
			Size = UDim2.new(0, 88, 0, 32),
			Parent = row,
		}, function()
			callbacks.onShopBuy(itemId)
		end), 15)
	end
end

-- ---------- Starter-Bestaetigung ----------

function MenuUi.ShowStarterAsk(speciesId)
	if starterModal then
		starterModal:Destroy()
	end
	local sp = GameData.Species[speciesId]
	starterModal = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Size = UDim2.new(1, 0, 1, 0),
		ZIndex = 9,
		Parent = gui,
	})
	local box = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Panel,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0, 380, 0, 330),
		ZIndex = 9,
		Parent = starterModal,
	})
	UiKit.Round(box, 14)
	UiKit.Stroke(box, GameData.TypeColors[sp.typ], 3)
	UiKit.Constrain(UiKit.Label({
		Text = sp.name .. " (" .. sp.typ .. ")",
		TextColor3 = GameData.TypeColors[sp.typ],
		Position = UDim2.new(0, 0, 0, 10),
		Size = UDim2.new(1, 0, 0, 34),
		ZIndex = 9,
		Parent = box,
	}), 26)
	local viewport = UiKit.MonsterViewport({
		Size = UDim2.new(0, 130, 0, 130),
		Position = UDim2.new(0.5, -65, 0, 50),
		Parent = box,
	})
	viewport.frame.ZIndex = 9
	viewport.SetSpecies(speciesId)
	UiKit.Constrain(UiKit.Label({
		Text = sp.desc .. "\n\nWillst du " .. sp.name .. " als Partner nehmen?",
		TextWrapped = true,
		TextScaled = false,
		TextSize = 16,
		Position = UDim2.new(0, 20, 0, 186),
		Size = UDim2.new(1, -40, 0, 80),
		ZIndex = 9,
		Parent = box,
	}), 16)
	local yes = UiKit.Button({
		Text = "Ja, nehmen!",
		BackgroundColor3 = UiKit.Colors.Good,
		Position = UDim2.new(0, 20, 1, -50),
		Size = UDim2.new(0.45, -25, 0, 38),
		ZIndex = 9,
		Parent = box,
	}, function()
		starterModal:Destroy()
		starterModal = nil
		callbacks.onStarterChoose(speciesId)
	end)
	yes.ZIndex = 9
	local no = UiKit.Button({
		Text = "Lieber nicht",
		BackgroundColor3 = UiKit.Colors.Bad,
		Position = UDim2.new(0.55, 5, 1, -50),
		Size = UDim2.new(0.45, -25, 0, 38),
		ZIndex = 9,
		Parent = box,
	}, function()
		starterModal:Destroy()
		starterModal = nil
	end)
	no.ZIndex = 9
end

-- ---------- Oeffentliche API ----------

function MenuUi.SetData(newData)
	data = newData
	if bagPanel.Visible then renderBag() end
	if teamPanel.Visible then renderTeam() end
	if shopPanel.Visible then renderShop() end
end

function MenuUi.CloseAll()
	bagPanel.Visible = false
	teamPanel.Visible = false
	shopPanel.Visible = false
	if starterModal then
		starterModal:Destroy()
		starterModal = nil
	end
end

function MenuUi.ToggleBag()
	teamPanel.Visible = false
	shopPanel.Visible = false
	bagPanel.Visible = not bagPanel.Visible
	if bagPanel.Visible then renderBag() end
end

function MenuUi.ToggleTeam(boxMode)
	bagPanel.Visible = false
	shopPanel.Visible = false
	if teamPanel.Visible and teamBoxMode == (boxMode == true) then
		teamPanel.Visible = false
		return
	end
	teamBoxMode = boxMode == true
	teamPanel.Visible = true
	renderTeam()
end

function MenuUi.OpenShop()
	MenuUi.CloseAll()
	shopPanel.Visible = true
	renderShop()
end

function MenuUi.Init(cb)
	callbacks = cb
	gui = UiKit.Screen("MonsterMenus", 10)

	bagPanel = makePanel("Beutel", UDim2.new(0, 420, 0, 440))
	bagScroll = makeScroll(bagPanel, 48)

	teamPanel, teamTitle = makePanel("Dein Team", UDim2.new(0, 480, 0, 520))
	teamScroll = makeScroll(teamPanel, 48)

	shopPanel = makePanel("Markt", UDim2.new(0, 430, 0, 480))
	shopCoins = UiKit.Constrain(UiKit.Label({
		Text = "",
		TextColor3 = UiKit.Colors.Accent,
		TextXAlignment = Enum.TextXAlignment.Left,
		Position = UDim2.new(0, 14, 0, 42),
		Size = UDim2.new(1, -28, 0, 22),
		Parent = shopPanel,
	}), 18)
	shopScroll = makeScroll(shopPanel, 70)
end

return MenuUi
