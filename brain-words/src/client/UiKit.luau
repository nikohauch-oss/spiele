-- ============================================================
-- Kleine Helfer zum Bauen der Benutzeroberflaeche.
-- ============================================================

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local SoundService = game:GetService("SoundService")

local UiKit = {}

UiKit.Colors = {
	Panel = Color3.fromRGB(40, 40, 62),
	PanelLight = Color3.fromRGB(58, 58, 88),
	Text = Color3.fromRGB(255, 255, 255),
	TextDim = Color3.fromRGB(190, 190, 210),
	Good = Color3.fromRGB(90, 200, 110),
	Bad = Color3.fromRGB(230, 90, 90),
	Accent = Color3.fromRGB(255, 190, 60),
	Blue = Color3.fromRGB(80, 150, 255),
}

local clickSound = Instance.new("Sound")
clickSound.SoundId = "rbxasset://sounds/electronicpingshort.wav"
clickSound.Volume = 0.35
clickSound.Parent = SoundService

function UiKit.Click()
	SoundService:PlayLocalSound(clickSound)
end

local function playerGui()
	return Players.LocalPlayer:WaitForChild("PlayerGui")
end

-- Erzeugt eine Instanz mit Eigenschaften
function UiKit.Mk(className, props)
	local inst = Instance.new(className)
	local parent = nil
	for k, v in pairs(props) do
		if k == "Parent" then
			parent = v
		else
			inst[k] = v
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function UiKit.Screen(name, displayOrder)
	return UiKit.Mk("ScreenGui", {
		Name = name,
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		DisplayOrder = displayOrder or 1,
		Parent = playerGui(),
	})
end

function UiKit.Round(inst, px)
	UiKit.Mk("UICorner", { CornerRadius = UDim.new(0, px or 10), Parent = inst })
	return inst
end

function UiKit.Stroke(inst, color, thickness)
	UiKit.Mk("UIStroke", {
		Color = color or Color3.fromRGB(15, 15, 25),
		Thickness = thickness or 2,
		Parent = inst,
	})
	return inst
end

function UiKit.Label(props)
	local defaults = {
		BackgroundTransparency = 1,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = UiKit.Colors.Text,
	}
	for k, v in pairs(props) do
		defaults[k] = v
	end
	return UiKit.Mk("TextLabel", defaults)
end

function UiKit.Button(props, callback)
	local defaults = {
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = UiKit.Colors.Text,
		BackgroundColor3 = UiKit.Colors.PanelLight,
		AutoButtonColor = true,
		BorderSizePixel = 0,
	}
	for k, v in pairs(props) do
		defaults[k] = v
	end
	local btn = UiKit.Mk("TextButton", defaults)
	UiKit.Round(btn, 10)
	UiKit.Stroke(btn)
	UiKit.Mk("UIPadding", {
		PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4),
		PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6),
		Parent = btn,
	})
	if callback then
		btn.Activated:Connect(function()
			UiKit.Click()
			callback()
		end)
	end
	return btn
end

-- Lebensbalken: gibt eine Tabelle mit Set(hp, maxHp, sofort) zurueck
function UiKit.HpBar(props)
	local frame = UiKit.Mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(25, 25, 38),
		BorderSizePixel = 0,
		Size = props.Size,
		Position = props.Position,
		AnchorPoint = props.AnchorPoint or Vector2.new(0, 0),
		Parent = props.Parent,
	})
	UiKit.Round(frame, 6)
	local fill = UiKit.Mk("Frame", {
		BackgroundColor3 = UiKit.Colors.Good,
		BorderSizePixel = 0,
		Size = UDim2.new(1, 0, 1, 0),
		Parent = frame,
	})
	UiKit.Round(fill, 6)

	local api = {}
	function api.Set(hp, maxHp, instant)
		local frac = 0
		if maxHp > 0 then
			frac = math.max(0, math.min(1, hp / maxHp))
		end
		local color = UiKit.Colors.Good
		if frac <= 0.25 then
			color = UiKit.Colors.Bad
		elseif frac <= 0.5 then
			color = UiKit.Colors.Accent
		end
		fill.BackgroundColor3 = color
		local goal = UDim2.new(frac, 0, 1, 0)
		if instant then
			fill.Size = goal
		else
			TweenService:Create(fill, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = goal }):Play()
		end
	end
	return api
end

-- Kleine Nachrichten oben in der Mitte
local toastContainer = nil

local function ensureToasts()
	if toastContainer and toastContainer.Parent then
		return toastContainer
	end
	local gui = UiKit.Screen("BrainToasts", 50)
	toastContainer = UiKit.Mk("Frame", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.new(0.5, 0, 0.3, 0),
		Parent = gui,
	})
	UiKit.Mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 6),
		Parent = toastContainer,
	})
	return toastContainer
end

function UiKit.Toast(msg, kind)
	local container = ensureToasts()
	local color = UiKit.Colors.Panel
	if kind == "good" then
		color = Color3.fromRGB(35, 90, 50)
	elseif kind == "bad" then
		color = Color3.fromRGB(105, 40, 45)
	end
	local toast = UiKit.Mk("TextLabel", {
		BackgroundColor3 = color,
		BackgroundTransparency = 0.1,
		Font = Enum.Font.FredokaOne,
		TextColor3 = UiKit.Colors.Text,
		TextSize = 18,
		Text = "  " .. msg .. "  ",
		AutomaticSize = Enum.AutomaticSize.X,
		Size = UDim2.new(0, 0, 0, 34),
		Parent = container,
	})
	UiKit.Round(toast, 10)
	UiKit.Stroke(toast)
	task.delay(3.5, function()
		if toast.Parent then
			local tween = TweenService:Create(toast, TweenInfo.new(0.4), { TextTransparency = 1, BackgroundTransparency = 1 })
			tween:Play()
			tween.Completed:Wait()
			toast:Destroy()
		end
	end)
end

return UiKit
