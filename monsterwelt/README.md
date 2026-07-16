# Monsterwelt 🐾⚡

Ein komplettes Roblox-Spiel (Luau), das sich spielt wie Pokémon — mit **18
eigenen, selbst erfundenen Monstern** (keine echten Pokémon-Namen oder
-Figuren, also keine Urheberrechts-Probleme). Die ganze Welt, alle
Monster-Figuren und die komplette Oberfläche werden **per Skript erzeugt** —
du brauchst keine Modelle, keine Assets.

## 🚀 Schnellstart (einfachster Weg)

1. **Roblox Studio installieren** (kostenlos): [roblox.com/create](https://www.roblox.com/create)
2. Die Datei **`Monsterwelt.rbxlx`** herunterladen (auf GitHub anklicken →
   „Download raw file")
3. In Roblox Studio: **Datei → Open from File** → `Monsterwelt.rbxlx` → **Play** drücken. Fertig! 🎉

**Speichern aktivieren:** Damit der Fortschritt gespeichert wird, das Spiel
einmal veröffentlichen (**Datei → Publish to Roblox**) und in den
**Game Settings → Security → „Enable Studio Access to API Services"**
einschalten.

## 📂 Welche Datei gehört wohin? (manueller Einbau)

Wer die Skripte lieber selbst in ein leeres Baseplate-Projekt einfügt —
so gehört alles in den Explorer (Skript-Typ beachten!):

| Datei in `src/` | Ort in Roblox Studio | Skript-Typ | Name |
|---|---|---|---|
| `shared/GameData.luau` | `ReplicatedStorage → Ordner "Shared"` | ModuleScript | `GameData` |
| `shared/MonsterFactory.luau` | `ReplicatedStorage → Ordner "Shared"` | ModuleScript | `MonsterFactory` |
| `shared/Remotes.luau` | `ReplicatedStorage → Ordner "Shared"` | ModuleScript | `Remotes` |
| `server/Main.server.luau` | `ServerScriptService → Ordner "Server"` | **Script** | `Main` |
| `server/PlayerData.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `PlayerData` |
| `server/WorldBuilder.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `WorldBuilder` |
| `server/CompanionService.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `CompanionService` |
| `server/BattleService.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `BattleService` |
| `server/RoamService.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `RoamService` |
| `server/TrainerService.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `TrainerService` |
| `server/FarmService.luau` | `ServerScriptService → Ordner "Server"` | ModuleScript | `FarmService` |
| `client/Main.client.luau` | `StarterPlayer → StarterPlayerScripts → Ordner "Client"` | **LocalScript** | `Main` |
| `client/UiKit.luau` | `StarterPlayer → StarterPlayerScripts → Ordner "Client"` | ModuleScript | `UiKit` |
| `client/HudUi.luau` | `StarterPlayer → StarterPlayerScripts → Ordner "Client"` | ModuleScript | `HudUi` |
| `client/MenuUi.luau` | `StarterPlayer → StarterPlayerScripts → Ordner "Client"` | ModuleScript | `MenuUi` |
| `client/BattleUi.luau` | `StarterPlayer → StarterPlayerScripts → Ordner "Client"` | ModuleScript | `BattleUi` |

Wichtig: Die **Ordnernamen** müssen genau `Shared`, `Server` und `Client`
heißen, die Skriptnamen wie in der Tabelle (z.B. `Main`, ohne `.server`).
Rojo-Nutzer können stattdessen einfach `rojo serve` mit der
`default.project.json` verwenden. Die fertige `.rbxlx` erspart das alles.

## 🕹️ So spielt man

- **Start beim Professor:** Im gelben **Labor** stehen 3 Starter auf Tischen:
  **Flarix** (Feuer), **Aquani** (Wasser), **Sprössli** (Pflanze).
  Hingehen, **E** drücken, bestätigen.
- **Wilde Monster:** In den Gras-Flächen auf **Route 1** (Osten, Lv. 3–7) und
  **Route 2** (Norden, Lv. 8–14). Beim Durchlaufen starten Zufallskämpfe,
  und herumhüpfende Monster kann man direkt anlaufen.
- **Kampf:** Rundenbasiert auf einer Kampf-Bühne mit eigener Kamera.
  Menü: **Kampf** (Attacken), **Beutel** (Fangkugeln & Heil-Items),
  **Team** (wechseln), **Flucht**. Typen-Effektivität: Wasser schlägt Feuer,
  Feuer schlägt Pflanze, Pflanze schlägt Wasser, Elektro schlägt Wasser.
- **Fangen:** Im Kampf → Beutel → **Fangkugel**. Je weniger KP der Gegner
  hat, desto besser die Chance! Kugel fliegt, wackelt … Daumen drücken.
- **Monster-Center** (rotes Dach): An der Theke bei Schwester Amara
  **kostenlos heilen** (mit Licht und Sound), am **PC** die Box verwalten.
- **Markt** (blaues Dach): Fangkugeln, Tränke und Früchte kaufen.
- **Beeren-Farm** (Westen): Beim **Farmer Willi** den Job annehmen,
  8 Früchte pflücken → 150 Münzen. Früchte heilen auch im Kampf!
  (Rote Beere +20 KP, Blaubeere heilt Status, Goldapfel = alles voll)
- **Trainer:** Auf den Routen stehen 3 Trainer, die dich beim Vorbeilaufen
  herausfordern — Sieg bringt ordentlich Münzen.
- **Level & Entwicklung:** Siege geben EP. Ab bestimmten Leveln entwickeln
  sich Monster und werden sichtbar größer (z.B. Flarix → Flammgor ab Lv. 16).
- **Begleiter:** Dein erstes Team-Monster läuft dir hinterher — auch für
  andere Spieler sichtbar. (Anführer im Team-Menü festlegen!)
- **Statusprobleme:** Feuer-Attacken können **Brand** (Schaden pro Runde),
  Elektro-Attacken **Schock** (manchmal handlungsunfähig) verursachen.
- **Tasten:** **B** = Beutel, **T** = Team. Alles geht auch über die Knöpfe
  (Handy/Tablet-tauglich).
- Tag-Nacht-Wechsel inklusive — nachts gehen die Straßenlaternen an!

## 🐲 Die 18 Monster

| Monster | Typ | Entwicklung |
|---|---|---|
| Flarix → Flammgor | Feuer | ab Lv. 16 |
| Aquani → Wellodon | Wasser | ab Lv. 16 |
| Sprössli → Florassor | Pflanze | ab Lv. 16 |
| Mopsel → Mopsulor | Normal | ab Lv. 14 |
| Zappli → Voltarex | Elektro | ab Lv. 18 |
| Flauschi, Brockel | Normal | – |
| Quallino, Flossi | Wasser | – |
| Pilzli, Dorni | Pflanze | – |
| Glutmops | Feuer | – |
| Blinki | Elektro | – |

## 🛠️ Eigene Monster & Musik

- **Neue Monster:** Alles steht in `src/shared/GameData.luau`
  (`ReplicatedStorage → Shared → GameData`). Einfach einen Eintrag bei
  `GameData.Species` kopieren und anpassen — der `build`-Bauplan bestimmt,
  wie die 3D-Figur aussieht (Rumpf, Kopf, Beine, Extra-Teile). Danach das
  Monster in einen Routen-`pool` eintragen.
- **Musik:** In `src/server/WorldBuilder.luau` oben bei `MUSIC_ID` die ID
  eines eigenen/kostenlosen Audios aus dem Creator Store eintragen
  (Toolbox → Audio). `0` = keine Musik.
- **Balancing:** Formeln (Schaden, EP, Fangchance) stehen unten in
  `GameData.luau`.

## 📁 Technik-Überblick

- Der **Server** berechnet Kämpfe, Fangen, EP, Münzen und Items —
  der Client zeigt nur an (kein Schummeln möglich).
- Gespeichert wird mit **DataStoreService** (Team, Box, Items, Münzen,
  besiegte Trainer) — automatisch beim Verlassen und alle 2 Minuten.
- Kampf-Bühnen schweben hoch über der Karte; die Kamera fährt im Kampf
  dorthin und danach zurück.
- `python3 build_place.py` baut die `Monsterwelt.rbxlx` neu aus `src/`.

Viel Spaß beim Fangen! 🎉
