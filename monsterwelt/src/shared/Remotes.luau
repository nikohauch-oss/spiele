-- Verwaltet alle RemoteEvents zwischen Server und Client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = {}

local FOLDER_NAME = "MonsterweltRemotes"

local NAMES = {
	"ClientReady", -- Client -> Server: UI geladen, bitte Daten senden
	"DataSync", -- Server -> Client: Team/Box/Items/Muenzen
	"Notify", -- Server -> Client: Toast-Nachricht
	"StarterAsk", -- Server -> Client: "Willst du X nehmen?"
	"StarterChoose", -- Client -> Server: Starter bestaetigt
	"BattleStart", -- Server -> Client: Kampf beginnt
	"BattleUpdate", -- Server -> Client: Rundenergebnis
	"BattleAction", -- Client -> Server: Aktion
	"TeamAction", -- Client -> Server: Team/Box verwalten
	"UseItem", -- Client -> Server: Item ausserhalb des Kampfes
	"ShopBuy", -- Client -> Server: Item kaufen
	"OpenUi", -- Server -> Client: "shop" / "box" oeffnen
}

function Remotes.InitServer()
	local folder = Instance.new("Folder")
	folder.Name = FOLDER_NAME
	for _, name in ipairs(NAMES) do
		local ev = Instance.new("RemoteEvent")
		ev.Name = name
		ev.Parent = folder
	end
	folder.Parent = ReplicatedStorage
end

function Remotes.Get(name)
	local folder = ReplicatedStorage:WaitForChild(FOLDER_NAME)
	return folder:WaitForChild(name)
end

return Remotes
