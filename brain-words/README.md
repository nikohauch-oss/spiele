# Brain Words 🧠✨

Ein Pokémon-inspiriertes Fang- und Kampfspiel für **Roblox** — aber statt
Monstern fängst du **Brain Words**: verrückte, lebendig gewordene Wörter wie
*Sigma*, *Skibidi*, *Rizzler*, *Ohio* oder den legendären *Lord Brainrot*!

Alles wird per Code erzeugt (Karte, Kreaturen, Menüs) — du brauchst **keine
Modelle oder Assets**, nur Roblox Studio.

## 🎮 So startest du das Spiel (ganz einfach!)

1. **Roblox Studio installieren** (kostenlos): auf [roblox.com/create](https://www.roblox.com/create)
   auf „Start Creating" klicken.
2. Die Datei **`BrainWords.rbxlx`** aus diesem Ordner herunterladen
   (auf GitHub: Datei anklicken → oben rechts „Download raw file").
3. Roblox Studio öffnen → **Datei → Open from File** (Aus Datei öffnen) →
   `BrainWords.rbxlx` auswählen.
4. Oben auf den blauen **Play**-Knopf drücken — fertig, du bist im Spiel! 🎉

### Spiel veröffentlichen (damit Freunde mitspielen können)

- **Datei → Publish to Roblox** (Auf Roblox veröffentlichen), Name und
  Beschreibung eingeben.
- **Wichtig fürs Speichern:** In Studio unter
  **Game Settings → Security → „Enable Studio Access to API Services"**
  einschalten. Erst dann werden Team & Fortschritt dauerhaft gespeichert
  (im veröffentlichten Spiel klappt das automatisch, der Schalter ist nur
  für den Test in Studio).

## 🕹️ So spielt man

- **Starter wählen:** Beim ersten Start suchst du dir eins von drei
  Brain Words aus: **Sigma** (Cool), **Skibidi** (Chaos) oder **Slay** (Süß).
- **Wilde Brain Words** schweben als leuchtende Wörter in den vier Zonen.
  Hinlaufen und **E drücken** (auf Handy/Tablet: Knopf antippen) → Kampf!
- **Im Kampf:** *Angriff* (4 Attacken), *Fangen* (klappt besser, wenn der
  Gegner wenig HP hat!), *Wechseln* oder *Weglaufen*.
- **EP & Level:** Siege geben Erfahrungspunkte. Deine Brain Words leveln auf,
  lernen neue Attacken und **entwickeln sich** (z.B. Sigma → Giga-Sigma ab
  Level 18).
- **Heil-Brunnen:** Der blaue Brunnen am Spawn heilt dein ganzes Team.
- **Team & Brain-Dex:** Knöpfe unten links. Bis zu 6 im Team, der Rest
  wandert in die Box. Im Brain-Dex siehst du, welche der **27 Arten** du
  schon gefangen hast.

### Die Zonen

| Zone | Level | Was gibt's da? |
|---|---|---|
| 🌼 Meme-Wiese | 2–6 | Bruh, Yeet, Sus, NPC … perfekt für den Anfang |
| 🌲 Chaos-Wald | 5–12 | Fanum, Mewing, Delulu, Bussin … |
| 👻 Gruselgrube | 9–16 | Cringe, Tung-Sahur, Bombardiro, selten: Ohio |
| ⭐ Legenden-Gipfel | 14–24 | Die stärksten — mit Glück **Aura** oder **Lord Brainrot**! |

### Die 6 Typen

Jeder Typ schlägt genau einen anderen (doppelter Schaden) und ist gegen einen
schwach: **Laut → Schlau → Cool → Chaos → Süß → Gruselig → Laut** …

## 🛠️ Eigene Brain Words hinzufügen

Alle Kreaturen, Attacken und Zonen stehen in **einer** Datei:
`src/shared/GameData.luau` (in Studio: `ReplicatedStorage → Shared → GameData`).

Einfach einen neuen Eintrag bei `GameData.Species` einfügen, z.B.:

```lua
blubber = {
    name = "Blubber", typ = "Süß", rarity = "Mittel",
    desc = "Blubbert. Mehr macht es nicht.",
    base = { hp = 60, atk = 55, def = 55, spd = 50 },
    learnset = { { 1, "knuddelattacke" }, { 9, "zuckerschock" }, { 17, "herzhurrikan" } },
},
```

Dann noch `"blubber"` in `GameData.DexOrder` und in eine Zonen-`pool`-Liste
eintragen — fertig!

## 📁 Aufbau (für Fortgeschrittene)

```
brain-words/
├── BrainWords.rbxlx        ← fertige Spieldatei, einfach in Studio öffnen
├── build_place.py          ← baut die .rbxlx neu aus src/ (python3 build_place.py)
├── default.project.json    ← für Rojo-Nutzer (rojo build / rojo serve)
└── src/
    ├── shared/    GameData (alle Spieldaten), Remotes
    ├── server/    Main, MapBuilder, PlayerData, SpawnService, BattleService
    └── client/    Main, UiKit, MenuUi, BattleUi
```

Der Server berechnet alle Kämpfe (kein Schummeln möglich), der Client zeigt
nur die Oberfläche an. Gespeichert wird per DataStore automatisch beim
Verlassen und alle 2 Minuten.

Viel Spaß beim Fangen! 🎉
