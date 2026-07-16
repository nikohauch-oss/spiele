-- Verwaltet alle RemoteEvents zwischen Server und Client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = {}

local FOLDER_NAME = "BrainWordsRemotes"

local NAMES = {
	"ClientReady", -- Client -> Server: UI ist geladen, bitte Daten senden
	"DataSync", -- Server -> Client: Team/Box/Dex-Daten
	"Notify", -- Server -> Client: kleine Nachricht (Toast)
	"StarterOffer", -- Server -> Client: Starterauswahl anzeigen
	"StarterChoose", -- Client -> Server: gewaehlter Starter
	"BattleStart", -- Server -> Client: Kampf beginnt
	"BattleUpdate", -- Server -> Client: Rundenergebnis
	"BattleAction", -- Client -> Server: Aktion (Angriff/Fangen/...)
	"TeamAction", -- Client -> Server: Team verwalten
}

-- Wird einmal vom Server aufgerufen
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

-- Holt ein RemoteEvent (wartet notfalls, bis es existiert)
function Remotes.Get(name)
	local folder = ReplicatedStorage:WaitForChild(FOLDER_NAME)
	return folder:WaitForChild(name)
end

return Remotes
