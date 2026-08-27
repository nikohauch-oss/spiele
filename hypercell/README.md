# HYPERCELL

Ein hochwertiges, stilisiertes 3D-Hero-Actionspiel — **als eine einzige, sofort
spielbare Datei**.

```
dist/HYPERCELL.html      ← Doppelklick. Fertig.
```

Keine Installation, kein Server, kein Build-Schritt, keine Engine. Die Datei
enthält alles: Renderer, Spiel, Charaktere, Waffen, Karte, Effekte, Musik.

---

## 1. Warum eine HTML-Datei (und keine Unity-/Unreal-/Godot-Projektdatei)

Die Vorgabe war ausdrücklich: **eine fertige Datei und ein fertiges Spiel** —
und (§61) *„Wenn du ein Asset nicht tatsächlich erzeugen kannst, behaupte
niemals, dass es vorhanden ist."*

Ein Engine-Projekt hätte an genau dieser Stelle gescheitert: Es hätte auf
`.fbx`-Charaktere, `.wav`-Sounds und Animations-Clips verwiesen, die niemand
mitliefert. Das Ergebnis wäre ein Projekt voller roter Fehlermeldungen und
weißer Platzhalterwürfel gewesen — also exakt das, was §1 verbietet.

**Deshalb erzeugt HYPERCELL jedes Asset zur Laufzeit im Code:**

| Asset-Typ | Wie es entsteht | Datei |
|---|---|---|
| Charaktermodelle | Prozedurale Geometrie auf echter Knochen-Hierarchie | `09_character_model.js` |
| Waffenmodelle | Ein Builder je Waffen-Archetyp, mit benannten Sockets | `10_weapon_model.js` |
| Texturen | Canvas-generiert: Gewebe, gebürstetes Metall, Beton, Leder, Gummi, Haar, Hologramme, Neon, Platinen | `08_materials.js` |
| Normal-Maps | Sobel-Ableitung aus den erzeugten Höhenfeldern | `08_materials.js` |
| Animationen | Prozedurale Zustandsmaschine, kein einziger Baked Clip | `11_animation.js` |
| Sounds | WebAudio-Synthese, mehrschichtig pro Waffe | `05_audio.js` |
| Musik | 16tel-Scheduler mit sechs dynamischen Layern | `05_audio.js` |
| Karte | Prozedural gebaute Stadtarena inkl. Props und Licht | `15_map_nova_district.js` |
| Navigation | Automatisch aus der Kollisionswelt gesampelt | `14_nav.js` |

**Es gibt daher keine fehlenden Assets — es gibt keine externen Assets.**
Die einzige eingebundene Fremd-Bibliothek ist three.js (MIT), fest in die
Datei eingebettet.

---

## 2. Sofort spielen

```bash
# Variante A — einfach öffnen
open dist/HYPERCELL.html          # macOS
xdg-open dist/HYPERCELL.html      # Linux
start dist\HYPERCELL.html         # Windows

# Variante B — lokaler Server (empfohlen für Pointer-Lock in manchen Browsern)
npx http-server dist -p 8080 && open http://localhost:8080/HYPERCELL.html
```

**Voraussetzung:** ein Browser mit WebGL2 (Chrome, Edge, Firefox, Safari 15+).
Läuft der Rechner ohne GPU-Beschleunigung, in den Einstellungen
`Render Scale` auf 0.5 und `Shadows` auf Aus stellen.

### Steuerung

| Eingabe | Aktion |
|---|---|
| `W A S D` | Bewegen |
| `Maus` | Umsehen · `Linksklick` Feuern · `Rechtsklick` Zielen |
| `Shift` | Sprinten |
| `Leertaste` | Springen |
| `Strg` / `C` | Ducken (im Sprint: Slide) |
| `Q` | Ausweichrolle (kurze Schadensreduktion) |
| `R` | Nachladen · `X` Waffenwechsel |
| `E` | Fähigkeit 1 · `F` Fähigkeit 2 · `G` Ultimate |
| `V` | Schulterwechsel |
| `Tab` | Scoreboard (halten) |
| `Esc` | Pause |
| Gamepad | Vollständig unterstützt (Deadzone + Kurve einstellbar) |

Alle Tasten sind im Menü unter **Settings → Controls** frei belegbar.

---

## 3. Was drin ist

### Helden (8, jeder vollständig spielbar)

| Held | Klasse | Waffe | Fähigkeit 1 | Fähigkeit 2 | Ultimate |
|---|---|---|---|---|---|
| **REX** | Assault | Pulse Rifle | Combat Dash | Overcharge | Shock Rocket |
| **MAYA** | Mobility | Whisper SMGs | Air Jump | Hologram | Hyper Mode |
| **BRUTUS** | Tank | Bulwark Rotary | Energy Shield | Ground Slam | Juggernaut |
| **NYX** | Assassin | Rift Blades + Shade Sidearm | Blink | Cloak | Shadow Strike |
| **JAX** | Demolition | Crackerjack GL | Sticky Charge | Blast Jump | Mega Bomb |
| **NOVA** | Energy | Solstice Plasma | Hover | Plasma Orb | Supernova |
| **KODA** | Hunter | Timberline 12 | Hunter Trap | Scout Drone | Predator Mode |
| **ZERO** | Controller | Meridian DMR | Scanner Pulse | Energy Barrier | Orbital Beam |

Kein Held ist eine Farbvariante eines anderen: Körperbau, Gangart, Gewicht,
Silhouette, Gesicht, Frisur, Ausrüstung, Palette und Idle-Haltung sind je Held
eigene Daten (`03_characters_data.js`).

### Skins (33)

Vier Seltenheiten pro Held. **Legendaries ändern nie nur die Farbe** — sie
tauschen Rüstung, Helm, Umhang, Waffenmodell, Ability-VFX, Spawn-Pose,
Victory-Pose und Audio-Timbre (`04_skins_data.js`).
Freischaltung über Held-Mastery: Rare ab 3, Epic ab 6, Legendary ab 10.

### Spielmodi (5, alle vollständig implementiert)

* **POWER CORE** (Hauptmodus, 5v5) — Core aus dem Plaza holen, zur eigenen
  Zone bringen. Träger ist 22 % langsamer und für alle markiert. 5 Punkte.
* **TEAM CLASH** (5v5) — 40 Eliminierungen.
* **ZONE CONTROL** (5v5) — drei Zonen, Punkte pro gehaltener Zone/Sekunde.
* **CRYSTAL CONTROL** (5v5) — Kristalle sammeln, beim Tod verlieren.
* **SOLO ARENA** (8 Spieler) — jeder gegen jeden.

### Karte — NOVA DISTRICT

Drei Lanes (Plaza / Seitenstraßen / Servicetunnel), zwei umkämpfte Dächer,
Innenräume, Rampen, Catwalks, Balkone, Deckungsring um das Objective,
Werbetafeln, Neonschilder, Fahrzeuge, Container, Bänke, Automaten, Kabel,
Lüftungsschächte mit Dampf und eine Skyline im Hintergrund.

---

## 4. Architektur

Die Systeme sind strikt getrennt (§55), Daten liegen zentral (§56–58), und
kein System kennt ein anderes direkt — Kommunikation läuft über Event-Busse
und einen einzigen Kampf-Kontext.

```
hypercell/
├── build.js                     Packt alles zu einer HTML-Datei
├── vendor/three.min.js          three.js r160 (MIT)
├── tools/smoketest.js           Automatischer Browser-Test
└── src/
    ├── 00_core.js               Namespace, RNG, Mathe, Event-Bus, Pools, Registry
    ├── 01_config.js             ALLE Balance-Werte (keine Magic Numbers im Code)
    ├── 02_weapons_data.js       9 Waffen als reine Daten
    ├── 03_characters_data.js    8 Helden als reine Daten
    ├── 04_skins_data.js         33 Skins als reine Daten
    ├── 05_audio.js              Sound-Synthese + dynamische Musik
    ├── 06_input.js              Tastatur / Maus / Gamepad, frei belegbar
    ├── 07_save.js               Profil, Progression, Mastery, Einstellungen
    ├── 08_materials.js          Prozedurale Texturen + Rim-Light-Shader
    ├── 09_character_model.js    Skelett + Körper + Gesicht + Haare + Gear
    ├── 10_weapon_model.js       Waffen, Projektile, Power Core
    ├── 11_animation.js          Prozedurale Animations-Zustandsmaschine
    ├── 12_vfx.js                GPU-Partikel, Tracer, Explosionen, Decals, Lichter
    ├── 13_physics.js            AABB + Rampen, Kapsel-Sweeps, Raycasts
    ├── 14_nav.js                Navigationsgraph + A*
    ├── 15_map_nova_district.js  Die Arena
    ├── 16_health.js             Health / Shield / Armor, Schadenstypen
    ├── 17_weapon.js             Waffenlaufzeit + Projektilsystem
    ├── 18_abilities.js          Framework + alle 24 Fähigkeiten
    ├── 19_actor.js              Der Kämpfer (Movement, Zustand, Feedback)
    ├── 20_ai.js                 Bot-Gehirn
    ├── 21_camera.js             Third-Person-Rig + Spieler-Controller
    ├── 22_arena.js              Match, Kampf-Kontext, alle 5 Modi
    ├── 23_hud.js                HUD
    ├── 24_menus.js              Menüs, Lobby, Heldenwahl, Ergebnisse
    ├── 25_postfx.js             Bloom-Pipeline
    ├── 26_game.js               Bootstrap + Hauptschleife + Match-Flow
    └── ui.css                   Designsprache
```

### Drei Entscheidungen, die den Rest tragen

**1 · Fixed Timestep.** Gameplay läuft mit 120 Hz fest (`HC.StepClock`),
Rendering darüber frei. Rückstoß, Bewegung und Trefferprüfung sind damit
framerate-unabhängig — dasselbe Spielgefühl bei 60 wie bei 144 FPS.

**2 · Animation über zurückgelegte Strecke, nicht über Zeit.** Der Laufzyklus
wird mit `phase += (speed · dt) / strideLength · 2π` fortgeschaltet. Dadurch
ist die Schrittlänge im Weltraum fixiert und **Füße gleiten prinzipiell
nicht** (§14) — auch nicht beim Beschleunigen, Abbremsen oder in Zeitlupe.

**3 · Ein einziger Kampf-Kontext.** `ctx.damage`, `ctx.explode`, `ctx.trace`,
`ctx.mark` in `22_arena.js` sind die einzigen Stellen, an denen Schaden
entsteht. Waffen und Fähigkeiten *bitten* darum — sie rechnen ihn nie selbst.
Das ist die Grundlage für spätere Server-Autorität (§52).

---

## 5. Game Feel — was bei einem Schuss tatsächlich passiert

Die Vorgabe (§18) verlangt gleichzeitig wirkende Ebenen. Bei einem Schuss:

1. **Waffenanimation** — Schulter absorbiert, Brust und Kopf folgen nach (`11_animation.js`, `addRecoil`)
2. **Waffenrückstoß** — je Waffe eigenes Muster: `vertical_drift`, `random`, `vibration`, `single_kick`
3. **Kamera-Rückstoß** — separat, mit eigener Rückkehrkurve
4. **Mündungsfeuer** — Lichtquelle + Flare-Quad + Funken + Rauchfahne
5. **Schusssound** — fünf Schichten: Transiente, Body, Sub, Mechanik, Hall
6. **Tracer** — vom echten Mündungs-Socket, nicht von der Kamera
7. **Einschlag** — Material-abhängige Partikel, Sound und Decal
8. **Trefferreaktion** — richtungsabhängiges Zucken des Getroffenen
9. **Hitmarker** — eigene Form/Farbe/Ton für Normal, Krit, Schild, Kill
10. **Damage Numbers** — abschaltbar
11. **Umgebungssound** — Entfernungsdämpfung, Luftabsorption, Hall-Send
12. **Screen Shake** — entfernungsgedämpft, per Slider skalierbar
13. **Hit-Stop** — 55 ms Zeitlupe beim Kill

Dazu Bloom auf allen emissiven Flächen, Rim-Light auf jedem Charakter für
Silhouetten-Lesbarkeit (§67) und Team-Ringe am Boden.

---

## 6. Selbst bauen und testen

```bash
node hypercell/build.js            # → dist/HYPERCELL.html
node hypercell/tools/smoketest.js  # startet Chromium und spielt automatisch
```

Der Smoke-Test bootet das Spiel headless, baut **jeden Helden mit jedem Skin
und jeder Waffe**, erzeugt die Karte, den Navigationsgraphen und ein volles
5v5-Match, steuert den Spieler ~10 Sekunden mit synthetischen Eingaben und
schlägt bei **jeder** Konsolenfehlermeldung fehl. Screenshots landen in
`dist/shots/`.

```bash
node hypercell/tools/smoketest.js zone_control brutus 15   # anderer Modus/Held
```

### Typische Fehler und ihre Lösung

| Symptom | Ursache | Lösung |
|---|---|---|
| Schwarzer Bildschirm, Meldung „needs hardware 3D acceleration" | WebGL deaktiviert | In Chrome `chrome://settings` → System → Hardwarebeschleunigung aktivieren |
| Maus dreht sich nicht | Pointer-Lock nicht erteilt | Einmal ins Bild klicken (Browser verlangen eine Geste) |
| Kein Ton | WebAudio braucht eine Nutzergeste | Einmal klicken oder eine Taste drücken |
| Ruckelt | Software-Rendering oder schwache GPU | Settings → Render Scale 0.5, Shadows aus, Bloom aus, Particles Low |
| Fortschritt weg | Privater Modus / localStorage blockiert | Normales Fenster verwenden; das Spiel läuft sonst mit Sitzungsprofil weiter |
| `dist/` fehlt | Build nicht gelaufen | `node hypercell/build.js` |

---

## 7. Was bewusst noch fehlt

Ehrlichkeit vor Feature-Liste (§61, §63):

* **Kein Online-Multiplayer.** Gespielt wird 5v5 gegen Bots. Die
  Architektur ist darauf vorbereitet — Schaden, Health, Score, Objectives und
  Abilities laufen bereits ausschließlich über den zentralen Kontext, der die
  spätere Server-Instanz wäre — aber es gibt **keinen** Netzwerk-Code, keine
  Prediction und keine Lag-Kompensation. Das wäre die nächste Phase.
* **Keine Sprachausgabe.** Charaktere haben Klang-Timbres (Tonhöhe, Filter),
  aber keine gesprochenen Lines.
* **Nur eine Karte.** NOVA DISTRICT ist vollständig ausgebaut; weitere Karten
  wären neue Dateien nach demselben Muster.
* **Kein Shop / Battle Pass.** In der Vorgabe als „optional später" markiert.

Alles andere aus dem Master-Prompt ist implementiert und funktioniert —
insbesondere gibt es kein System, das nur so aussieht, als täte es etwas.

---

## 8. Lizenz / Credits

Spielcode, Design, Charaktere, Waffen, Karte, Musik und Effekte: eigene
Umsetzung für dieses Projekt.
Eingebettet: [three.js](https://threejs.org) r160 — MIT-Lizenz.
