-- ============================================================
-- Baut aus dem "build"-Bauplan in GameData eine richtige
-- 3D-Monster-Figur aus Parts (Rumpf, Kopf, Augen, Beine, ...).
-- Vorne ist -Z, damit CFrame.lookAt die Figur richtig dreht.
-- Wird von Server UND Client benutzt (Client: Mini-Bilder).
-- ============================================================

local GameData = require(script.Parent:WaitForChild("GameData"))

local MonsterFactory = {}

local function c3(rgb)
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

local function makePart(spec, scale)
	local part
	if spec.shape == "Wedge" then
		part = Instance.new("WedgePart")
	else
		part = Instance.new("Part")
		if spec.shape == "Ball" then
			part.Shape = Enum.PartType.Ball
		elseif spec.shape == "Cylinder" then
			part.Shape = Enum.PartType.Cylinder
		end
	end
	part.Size = Vector3.new(spec.size[1] * scale, spec.size[2] * scale, spec.size[3] * scale)
	part.Color = c3(spec.color)
	part.Material = spec.material and Enum.Material[spec.material] or Enum.Material.SmoothPlastic
	part.Transparency = spec.transparency or 0
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CanCollide = false
	part.CanQuery = false
	part.CastShadow = true
	part.Name = spec.name or "Teil"
	return part
end

local function offsetCFrame(spec, scale)
	local off = spec.offset or { 0, 0, 0 }
	local cf = CFrame.new(off[1] * scale, off[2] * scale, off[3] * scale)
	if spec.rot then
		cf = cf * CFrame.Angles(math.rad(spec.rot[1]), math.rad(spec.rot[2]), math.rad(spec.rot[3]))
	end
	return cf
end

local function weldTo(root, part)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = part
	weld.Parent = root
	part.Anchored = false
end

-- Augen (2 weisse Kugeln mit Pupillen) vorne an ein Teil setzen.
-- zForward = wie weit nach vorne (in Studs, unskaliert)
local function addEyes(model, root, attachCF, size, zForward, eyeScale, scale)
	local eyeD = size * 0.3 * (eyeScale or 1) * scale
	for _, side in ipairs({ -1, 1 }) do
		local white = Instance.new("Part")
		white.Shape = Enum.PartType.Ball
		white.Size = Vector3.new(eyeD, eyeD, eyeD)
		white.Color = Color3.fromRGB(250, 250, 250)
		white.Material = Enum.Material.SmoothPlastic
		white.CanCollide = false
		white.CanQuery = false
		white.Name = "Auge"
		white.CFrame = root.CFrame * attachCF
			* CFrame.new(side * size * 0.26 * scale, size * 0.12 * scale, -zForward * scale)
		white.Parent = model
		weldTo(root, white)

		local pupil = Instance.new("Part")
		pupil.Shape = Enum.PartType.Ball
		pupil.Size = Vector3.new(eyeD * 0.5, eyeD * 0.5, eyeD * 0.5)
		pupil.Color = Color3.fromRGB(25, 25, 30)
		pupil.Material = Enum.Material.SmoothPlastic
		pupil.CanCollide = false
		pupil.CanQuery = false
		pupil.Name = "Pupille"
		pupil.CFrame = white.CFrame * CFrame.new(0, 0, -eyeD * 0.34)
		pupil.Parent = model
		weldTo(root, pupil)
	end
end

-- Baut die Figur. scaleMul: 1 = normal, kleiner fuer Tisch-Figuren.
-- Rueckgabe: Model (PrimaryPart = Rumpf), Attribut "RootHeight" =
-- Abstand Rumpfmitte -> Boden, fuers Hinstellen.
function MonsterFactory.Create(speciesId, scaleMul)
	local scale = scaleMul or 1
	local sp = GameData.Species[speciesId]
	local build = sp.build

	local model = Instance.new("Model")
	model.Name = sp.name

	-- Rumpf (Wurzel, verankert). Bei gedrehten Koerpern (z.B.
	-- stehende Zylinder) ist die Wurzel ein unsichtbarer Block,
	-- damit alle Offsets gerade bleiben - der sichtbare Koerper
	-- wird als gedrehtes Teil angeschweisst.
	local body
	local bodySize = build.body.size
	if build.body.rot then
		local bounding = { bodySize[1], bodySize[2], bodySize[3] }
		if build.body.rot[3] ~= 0 then
			bounding = { bodySize[2], bodySize[1], bodySize[3] }
		end
		body = makePart({ shape = "Block", size = bounding, color = build.body.color, transparency = 1, name = "Rumpf" }, scale)
		bodySize = bounding
		local visible = makePart({
			shape = build.body.shape, size = build.body.size,
			color = build.body.color, material = build.body.material,
			transparency = build.body.transparency, name = "Koerper",
		}, scale)
		visible.CFrame = body.CFrame * offsetCFrame({ offset = { 0, 0, 0 }, rot = build.body.rot }, scale)
		visible.Parent = model
		body.Anchored = true
		body.CanQuery = true
		body.Parent = model
		model.PrimaryPart = body
		weldTo(body, visible)
	else
		body = makePart({
			shape = build.body.shape,
			size = build.body.size,
			color = build.body.color,
			material = build.body.material,
			transparency = build.body.transparency,
			name = "Rumpf",
		}, scale)
		body.Anchored = true
		body.CanQuery = true
		body.Parent = model
		model.PrimaryPart = body
	end

	local bodyH = bodySize[2] * scale
	local legs = build.legs or 0
	local legH = (build.legHeight or 0.6) * scale

	-- Beine
	if legs > 0 then
		local bx = bodySize[1] * scale * 0.32
		local bz = bodySize[3] * scale * 0.3
		local positions = {}
		if legs >= 4 then
			positions = { { -bx, -bz }, { bx, -bz }, { -bx, bz }, { bx, bz } }
		else
			positions = { { -bx * 0.8, 0 }, { bx * 0.8, 0 } }
		end
		local legColor = c3(build.body.color):Lerp(Color3.new(0, 0, 0), 0.25)
		for i, p in ipairs(positions) do
			local leg = Instance.new("Part")
			leg.Shape = Enum.PartType.Cylinder
			leg.Size = Vector3.new(legH, 0.55 * scale, 0.55 * scale)
			leg.Color = legColor
			leg.Material = Enum.Material.SmoothPlastic
			leg.CanCollide = false
			leg.CanQuery = false
			leg.Name = "Bein" .. i
			leg.CFrame = body.CFrame * CFrame.new(p[1], -bodyH / 2 - legH / 2 + 0.15 * scale, p[2])
				* CFrame.Angles(0, 0, math.rad(90))
			leg.Parent = model
			weldTo(body, leg)
		end
	end

	-- Kopf + Augen
	if build.head then
		local hs = build.head.size * scale
		local head = Instance.new("Part")
		head.Shape = Enum.PartType.Ball
		head.Size = Vector3.new(hs, hs, hs)
		head.Color = c3(build.head.color or build.body.color)
		head.Material = Enum.Material.SmoothPlastic
		head.CanCollide = false
		head.CanQuery = false
		head.Name = "Kopf"
		local hcf = offsetCFrame({ offset = build.head.offset }, scale)
		head.CFrame = body.CFrame * hcf
		head.Parent = model
		weldTo(body, head)
		addEyes(model, body, hcf, build.head.size, build.head.size * 0.38, build.head.eyeScale, scale)
	else
		-- Augen direkt vorne auf dem Rumpf
		addEyes(model, body, CFrame.new(0, bodyH * 0.15, 0), bodySize[1] * 0.8, bodySize[3] * 0.48, build.eyeScale, scale)
	end

	-- Weitere Teile (Ohren, Schwaenze, Flossen, Fluegel, ...)
	if build.parts then
		for _, spec in ipairs(build.parts) do
			local part = makePart(spec, scale)
			part.CFrame = body.CFrame * offsetCFrame(spec, scale)
			part.Parent = model
			weldTo(body, part)
		end
	end

	local rootHeight = bodyH / 2
	if legs > 0 then
		rootHeight = rootHeight + legH - 0.15 * scale
	end
	if build.groundClearance then
		rootHeight = rootHeight + build.groundClearance * scale
	end
	model:SetAttribute("RootHeight", rootHeight)
	model:SetAttribute("SpeciesId", speciesId)
	return model
end

-- Stellt das Monster so hin, dass es auf dem Boden steht und
-- Richtung "lookAt" schaut.
function MonsterFactory.PlaceOnGround(model, position, lookAt)
	local h = model:GetAttribute("RootHeight") or 1.5
	local pos = Vector3.new(position.X, position.Y + h, position.Z)
	local target = Vector3.new(lookAt.X, pos.Y, lookAt.Z)
	model:PivotTo(CFrame.lookAt(pos, target))
end

return MonsterFactory
