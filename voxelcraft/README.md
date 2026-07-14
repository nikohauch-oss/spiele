# VoxelCraft

Ein Minecraft-inspiriertes Voxel-Sandbox-Spiel für **Godot 4.3** in **GDScript** —
komplett ohne externe Assets: Texturen, Icons und UI werden zur Laufzeit
prozedural erzeugt. Einfach den Ordner in Godot 4.3 importieren
(`project.godot` öffnen) und starten.

## Features

**Welt**
- Chunk-basiertes Voxel-System (16×16×256 Blöcke pro Chunk), Rendering über
  `ArrayMesh`/`SurfaceTool` mit Face-Culling (nur sichtbare Flächen)
- Prozedurale Terrain-Generierung mit `FastNoiseLite`: Höhenkarte,
  3 Biome (Wiese, Wüste, Wald), Höhlen, Erze, Bäume, Seen/Ozeane
- 14 Blocktypen: Gras, Erde, Stein, Sand, Holzstamm, Blätter, Wasser,
  Kohle-Erz, Eisen-Erz, Bretter, Werkbank, Ofen, Grundgestein, Luft
- Chunks werden dynamisch um den Spieler geladen/entladen; Daten-Generierung
  und Meshing laufen in einem **Worker-Thread** (kein Ruckeln beim Nachladen)

**Spieler**
- First-Person-Controller (`CharacterBody3D`): Laufen, Springen, Sprinten,
  Schwimmen, Fallschaden, Kreativmodus mit Fliegen + Sofort-Abbau
- Block-Abbau per Raycast mit Abbauzeit je Blockhärte/Werkzeug
  (inkl. Drahtgitter-Highlight + Fortschrittsbalken), Blöcke platzieren
- Inventar mit 36 Slots (9er-Hotbar + Hauptinventar), Maus-Drag wie in
  Minecraft (Linksklick = Stapel, Rechtsklick = einzeln/halbieren)

**Crafting**
- 2×2-Crafting im Inventar, 3×3 an der Werkbank (geformte + formlose Rezepte,
  positionsunabhängig und gespiegelt erkannt)
- Werkzeuge: Spitzhacke/Axt/Schaufel/Schwert in Holz/Stein/Eisen mit
  Haltbarkeit, Abbau-Tempo und Mindest-Stufe für Drops
  (Stein braucht eine Spitzhacke, Eisen-Erz mindestens Stein-Spitzhacke)
- Ofen als Block-Entity: schmilzt Eisen-Erz → Eisenbarren und Holz → Kohle,
  Brennstoffe mit Brennwerten (Kohle, Holz, Bretter, Stöcke); läuft auch
  bei geschlossenem UI weiter

**Extras**
- Tag-Nacht-Zyklus (rotierende Sonne, Himmels-/Nebel-/Ambientfarben)
- Zombies spawnen nachts, verfolgen den Spieler und greifen an
- Healthbar + Hunger-System (Sprinten macht hungrig, Essen: Äpfel aus
  Blättern; hoher Hunger regeneriert, leerer Hunger zehrt)
- Speichern/Laden: Seed + nur veränderte Chunks + Spieler + Öfen
  (`user://voxelcraft_save.dat`, Godot-Binärformat); Autosave beim Beenden

## Steuerung

| Taste | Aktion |
| --- | --- |
| `W A S D` | Bewegen |
| `Leertaste` | Springen / Schwimmen / im Flug aufsteigen |
| `Strg` | Sprinten |
| `Umschalt` | Im Flugmodus sinken |
| `F` | Kreativmodus an/aus (Fliegen + Sofort-Abbau) |
| `Linke Maustaste` | Block abbauen (halten) / Gegner angreifen |
| `Rechte Maustaste` | Block platzieren / Werkbank & Ofen öffnen / essen |
| `E` | Inventar öffnen/schließen |
| `1–9` / Mausrad | Hotbar-Slot wählen |
| `F3` | Debug-Overlay (FPS, Position, Chunks) |
| `F5` / `F9` / `F10` | Speichern / letzten Stand laden / neue Welt |
| `Esc` | UI schließen bzw. Maus freigeben |

## Projektstruktur

```
voxelcraft/
├── project.godot            Projekt + Autoloads (Input-Map wird per Code registriert)
├── scenes/Main.tscn         Einstiegsszene (Rest wird per Code aufgebaut)
└── scripts/
    ├── main.gd              Szenen-Zusammenbau, Spawn, Respawn, Spielstand anwenden
    ├── day_night_cycle.gd   Sonne + Environment-Überblendung
    ├── autoload/
    │   ├── block_db.gd      Blocktypen, prozeduraler Textur-Atlas, Materialien
    │   ├── item_db.gd       Items/Werkzeuge, Icons, Abbau-Regeln (Zeit & Drops)
    │   ├── recipe_db.gd     Crafting-/Schmelzrezepte + Pattern-Matching
    │   └── game.gd          Input-Map, Referenzen, Öfen-Ticks, Speichern/Laden, UI-Steuerung
    ├── world/
    │   ├── chunk.gd         Chunk-Node (Mesh + Kollision) und Daten-Indexierung
    │   ├── chunk_mesher.gd  SurfaceTool-Meshing mit Face-Culling (Thread-sicher)
    │   ├── terrain_generator.gd  FastNoiseLite: Höhen, Biome, Höhlen, Erze, Bäume
    │   └── chunk_manager.gd Lade-Pipeline, Worker-Thread, Block-Zugriff, Save-Anbindung
    ├── player/
    │   ├── player_controller.gd   Bewegung, Kamera, Modi
    │   ├── player_interaction.gd  Raycast: Abbauen/Platzieren/Benutzen/Angreifen
    │   └── player_stats.gd        Gesundheit + Hunger
    ├── items/
    │   ├── inventory.gd     36-Slot-Datenmodell inkl. Werkzeug-Haltbarkeit
    │   └── furnace_state.gd Ofen-Logik (Block-Entity)
    ├── ui/
    │   ├── slot_ui.gd       wiederverwendbarer Item-Slot
    │   ├── hud.gd           Fadenkreuz, Hotbar, Herzen/Hunger, Debug, Toasts
    │   └── container_ui.gd  Inventar / Werkbank / Ofen (ein gemeinsames Fenster)
    └── enemies/
        ├── zombie.gd        Gegner-KI (Verfolgen, Springen, Angreifen)
        └── zombie_spawner.gd  Nacht-Spawns um den Spieler
```

## Architektur-Entscheidungen

- **Chunk-Pipeline in zwei Phasen:** Erst werden Blockdaten im Radius
  *Sichtweite + 1* generiert, gemesht wird ein Chunk erst, wenn alle vier
  Nachbarn Daten haben. So funktioniert Face-Culling über Chunkgrenzen ohne
  Nachbearbeitung. Ein Worker-Thread arbeitet eine priorisierte Job-Queue ab
  (Block-Edits überholen Weltgenerierung); der Main-Thread übernimmt maximal
  2 fertige Meshes pro Frame (kein Frame-Spike).
- **Deterministische Generierung:** Gleicher Seed ⇒ gleiche Welt (eigener
  Integer-Hash statt `hash()`). Deshalb müssen nur *editierte* Chunks
  gespeichert werden — der Rest wird identisch regeneriert.
- **Kollision nur für opake Blöcke:** Die Trimesh-Form wird vor dem Anhängen
  der Wasser-Surface erzeugt; Wasser bleibt begehbar/schwimmbar und der
  Raycast ignoriert es.
- **Szenenaufbau per Code:** Außer `Main.tscn` gibt es keine .tscn-Dateien —
  Nodes werden in `_ready()` erzeugt. Das hält das Projekt asset-frei,
  diff-freundlich und vermeidet kaputte Ressourcen-Referenzen; die Struktur
  steckt in klar geschnittenen `class_name`-Skripten.
- **Zombies ohne `NavigationAgent3D`:** Ein Navmesh lässt sich auf einer
  ständig editierbaren Voxelwelt nicht sinnvoll aktuell halten. Direktes
  Steering + Auto-Sprung entspricht dem Minecraft-Original.

## Performance-Stellschrauben

- `ChunkManager.view_distance` (Standard 4 = 9×9 Chunks) — größer = mehr Sicht,
  mehr Generierungslast. Der Nebel ist auf die Standard-Sichtweite abgestimmt.
- `Chunk.HEIGHT` (256) kann für schwächere Rechner auf 128 gesenkt werden;
  das Meshing überspringt Luft oberhalb des höchsten Blocks ohnehin.
- `MESH_APPLIES_PER_FRAME` in `chunk_manager.gd` drosselt Mesh-Übernahmen.

## Ideen zum Weiterbauen

- Greedy Meshing (Flächen zusammenfassen) für noch weniger Vertices
- Item-Drops als 3D-Entities statt Auto-Pickup
- Fließendes Wasser, Torchlight/Block-Licht, Glas (Sand schmelzen)
- Sounds, Schrittgeräusche, Partikel beim Abbauen
- Mehr Gegner, Rüstung, Truhen (das Container-UI ist dafür vorbereitet)
