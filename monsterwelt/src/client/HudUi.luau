-- ============================================================
-- HUD: Team-Anzeige oben links (mit 3D-Mini-Bildern),
-- Muenzen oben rechts, Menue-Knoepfe, Hinweis unten.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameData = require(Shared:WaitForChild("GameData"))
local UiKit = require(script.Parent:WaitForChild("UiKit"))

local HudUi = {}

local gui = nil
local teamContainer = nil
local coinsLabel = nil
local callbacks = nil

function HudUi.SetData(data)
	if not data then return end
	coinsLabel.Text = "🪙 " .. data.coins

	-- Team-Karten neu aufbauen
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
			Text = sp.name .. "  Lv. " .. mon.level,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 56, 0, 4),
			Size = UDim2.new(1, -60, 0, 20),
			Parent = card,
		}), 16)

		local bar = UiKit.HpBar({
			Position = UDim2.new(0, 56, 0, 27),
			Size = UDim2.new(1, -100, 0, 11),
			Parent = card,
		})
		bar.Set(mon.hp, stats.maxHp, true)

		UiKit.Constrain(UiKit.Label({
			Text = mon.hp .. "/" .. stats.maxHp .. (mon.status and ("  •  " .. GameData.StatusNames[mon.status]) or ""),
			TextColor3 = mon.status and UiKit.Colors.Bad or UiKit.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.new(0, 56, 0, 39),
			Size = UDim2.new(1, -60, 0, 13),
			Parent = card,
		}), 12)

		UiKit.Constrain(UiKit.Label({
			Text = i == 1 and "★" or "",
			TextColor3 = UiKit.Colors.Accent,
			Position = UDim2.new(1, -24, 0, 4),
			Size = UDim2.new(0, 20, 0, 20),
			Parent = card,
		}), 16)
	end
end

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

	-- Muenzen oben rechts
	coinsLabel = UiKit.Constrain(UiKit.Label({
		Text = "🪙 0",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 12),
		Size = UDim2.new(0, 160, 0, 32),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextStrokeTransparency = 0.4,
		Parent = gui,
	}), 26)

	-- Menue-Knoepfe unten links
	local buttons = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 14, 1, -14),
		Size = UDim2.new(0, 140, 0, 104),
		Parent = gui,
	})
	UiKit.Mk("UIListLayout", {
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 8),
		Parent = buttons,
	})
	UiKit.Constrain(UiKit.Button({
		Text = "🎒 Beutel (B)",
		BackgroundColor3 = Color3.fromRGB(190, 130, 60),
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 1,
		Parent = buttons,
	}, function()
		callbacks.onToggleBag()
	end), 18)
	UiKit.Constrain(UiKit.Button({
		Text = "⭐ Team (T)",
		BackgroundColor3 = UiKit.Colors.Blue,
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 2,
		Parent = buttons,
	}, function()
		callbacks.onToggleTeam()
	end), 18)

	-- Hinweis unten Mitte
	UiKit.Constrain(UiKit.Label({
		Text = "Lauf durchs hohe Gras, um wilde Monster zu finden!",
		TextStrokeTransparency = 0.4,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.new(0.6, 0, 0, 20),
		Parent = gui,
	}), 16)
end

return HudUi
