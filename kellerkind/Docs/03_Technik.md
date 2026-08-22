# KELLERKIND - Technik

**Engine: Unreal Engine 5.8.** Ein einziges C++-Modul (`Kellerkind`, Runtime),
C++20, Enhanced Input.

---

## 1. Aufbau des Moduls

```
Source/Kellerkind/
  Core/        Typen, Einstellungen, Spielinstanz, Run-Zustand, Spielstand,
               Inhaltsregister, GameMode
  Player/      Leon: Charakter, Werte, Herzen, Inventar, Aussehen, Angst,
               Interaktion, Stealth
  Items/       Item-Definition, Effektbasis und -bibliothek, Synergien,
               Pickup, Begleiter, Orbitals
  Combat/      Zustaende und Reaktionstabelle, Elementflaechen, Waffen,
               Bomben, Schadensroutinen
  AI/          Sinnes-Subsystem, Wahrnehmung, Kreaturbasis, Zustandsmaschine,
               Kreaturdaten, Bossgeruest, finaler Boss
  Level/       Raumdaten, Etagendaten, Etagengenerator, Raum, Tuer,
               sprengbare Wand, Versteck
  Horror/      Horror-Director, Ereignisbasis, Ereignisbibliothek,
               Kellerkind-Stalker
  Systems/     Kellerhaendler, Grafikoptionen
  UI/          HUD-Basisklasse
  Tools/       Import-Commandlet fuer den Inhaltskatalog
```

---

## 2. Zentrale Entwurfsentscheidungen

**Daten statt Code fuer Inhalt.** Items, Synergien, Kreaturen, Raeume und Etagen sind
Data Assets. Der Katalog wird als JSON gepflegt (`Data/`), weil er sich so versionieren,
im Text durchsuchen und ohne Editor pruefen laesst; `KKContentImportCommandlet` erzeugt
daraus die Assets. Handarbeit im Editor - Meshes, Icons, Effektklassen - wird beim Import
nie ueberschrieben.

**Ein Ort pro Regel.** Die Elementreaktionen stehen ausschliesslich in
`KKStatusEffectComponent`, die Schadensreihenfolge der Herzen ausschliesslich in
`KKHealthComponent`, die Etagengenerierung ausschliesslich in `KKFloorGenerator`. Wenn
eine Regel an zwei Stellen steht, driften die Stellen auseinander.

**Trennung von Plan und Welt.** `KKFloorGenerator::GenerateLayout` erzeugt reine Daten
ohne jeden Weltzugriff; `SpawnLayout` laedt daraus Level-Instanzen. Deshalb ist die
Generierung reproduzierbar und ausserhalb der Engine pruefbar
(`Tools/simulate_floor.py`).

**Getrennte Zufallsstroeme.** Layout, Items, Gegner, Events und Horror haben eigene
Stroeme aus demselben Run-Seed. Spielerverhalten in einem Bereich verschiebt nie die
Ergebnisse eines anderen.

**Reize statt Abfragen.** Kreaturen fragen die Welt nicht ab; Ereignisse schreiben Reize
in `KKSenseSubsystem`, das sie an die Zuhoerer in Reichweite verteilt. Das haelt die
KI-Kosten bei vielen Kreaturen niedrig und macht Stealth lesbar: Was keinen Reiz erzeugt,
kann niemand hoeren.

**Hooks statt Sonderfaelle.** Items greifen ueber definierte Haken in den Ablauf ein
(vor/nach Schaden, bei Kill, bei Raumwechsel ...). Ein neues Item braucht keine Aenderung
am Kampfcode. Nur Effekte, die `WantsTick()` melden, landen ueberhaupt in der Tick-Liste.

---

## 3. Ablauf eines Etagenwechsels

```
AKKGameMode::EnterFloor(Etage)
  ├─ Etagen-Seed aus Run-Seed ableiten (gleicher Run -> gleiche Etage)
  ├─ KKFloorGenerator::GenerateLayout    reiner Datenplan
  ├─ KKFloorGenerator::SpawnLayout       Level-Instanzen laden
  ├─ Fluch wuerfeln und ansagen
  ├─ PopulateRooms                       Kreaturen nach Raumbudget
  ├─ SpawnBoss
  ├─ Horror-Director auf Etagenintensitaet setzen
  └─ Spieler in den Startraum, Item-Hook OnFloorStarted
```

Beim Abstieg (`DescendToNextFloor`) werden zuerst die weissen Herzen abgerechnet - sie
werden zu Herzcontainern, wenn sie die Etage ueberlebt haben.

---

## 4. Ablauf eines Treffers

```
AKKCharacter::DealDamage
  ├─ Grundschaden x Damage-Stat
  ├─ Kritwurf (eigener Kampf-Zufallsstrom)
  ├─ Inventar: PreDealDamage   Items und Synergien aendern Betrag/Element
  ├─ AKKCreatureBase::ReceiveDamage
  │    ├─ Elementmodifikator der Kreatur
  │    ├─ Verwundbarkeit aus Zustaenden (nass + Elektro = x1,75)
  │    ├─ Zustandsreaktion (kann Ketten ausloesen)
  │    ├─ Blutspur als Sinnesreiz
  │    └─ Angreifer wird zum Ziel der Kreatur
  └─ Inventar: PostDealDamage  z. B. Kurzschluss-Kette, Doppelschlag, Brandmal
```

---

## 5. Leistung

Zielbild: 60 fps auf Mittelklasse-Hardware bei Preset *High*, 1440p mit TSR bei 80 %.

| Massnahme | Umsetzung |
|---|---|
| Nanite | Fuer alle statischen Umgebungsobjekte aktiv |
| Level-Streaming | Jeder Raum ist eine eigene Level-Instanz; nur Nachbarraeume bleiben geladen |
| World Partition | Nur fuer die grossen Etagen 4 und 6 |
| Occlusion Culling | Raumgrenzen sind zugleich Sichtbarkeitsgrenzen |
| LOD | Kreaturen mit vier Stufen, Bosse mit zwei |
| Texture Streaming | Pool auf 3000 MB (`Config/DefaultEngine.ini`) |
| KI-LOD | Wahrnehmung mit 10 Hz statt jedem Frame; Zustandsmaschine mit 10 Hz |
| Animations-LOD | `OnlyTickPoseWhenRendered` fuer Kreaturen, `AlwaysTickPose` nur fuer Leon |
| Klang-Culling | Virtualisierte Stimmen erlaubt, Reichweite je Kreaturenklang begrenzt |
| Partikel | Niagara-Qualitaetsstufen an das Grafik-Preset gekoppelt |

**Bekannte Kostenpunkte, die im Blick bleiben muessen:**
`KKStealthComponent::SampleLight` iteriert alle Lichter der geladenen Level (mit
Sichtlinienpruefung, 6,7 Hz). In den grossen Etagen sollte das auf die Lichter des
aktuellen und der angrenzenden Raeume eingegrenzt werden. Dasselbe gilt fuer die
`TActorIterator`-Durchlaeufe in Horrorereignissen und Begleitern - sie laufen selten, aber
ueber die ganze Welt.

---

## 6. Grafikoptionen

Fuenf Presets (Low, Medium, High, Ultra, Cinematic) ueber die Scalability-Gruppen in
`Config/DefaultScalability.ini`. Einzeln einstellbar: Aufloesung, FPS-Limit, VSync,
Schatten, Texturen, Global Illumination, Reflexionen, Effekte, Nebel, Sichtweite,
Anti-Aliasing, Upscaling (TSR/DLSS/FSR/XeSS), Motion Blur, Film Grain, Depth of Field und
die Staerke der Kameraatmung.

Sobald ein Einzelwert veraendert wird, springt das Preset auf *Benutzerdefiniert*;
persoenliche Schalter ueberleben jeden Preset-Wechsel
(`UKKGraphicsSettings::ApplySettings`).

---

## 7. Werkzeuge ohne Editor

```bash
python3 Tools/validate_content.py     # Katalog gegen die Coderegeln pruefen
python3 Tools/simulate_floor.py 500   # Etagengenerator ueber viele Seeds pruefen
python3 Tools/export_tags.py          # Gameplay-Tags aus dem Katalog erzeugen
```

`simulate_floor.py` ist eine Nachbildung von `KKFloorGenerator.cpp` in Python. Wird der
Algorithmus im C++-Code geaendert, muss die Nachbildung mitgezogen werden - sonst prueft
sie etwas anderes als das, was laeuft.
