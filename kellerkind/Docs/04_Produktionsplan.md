# KELLERKIND - Stand und Produktionsplan

## 1. Was vorhanden ist

**Spielsysteme in C++** (`Source/Kellerkind/`, 98 Dateien, rund 12 700 Zeilen):

| System | Zustand |
|---|---|
| Herzsystem mit vier Herzarten, Schockwelle, weissen Herzen | vollstaendig |
| Zehn Werte mit quellenbasierten Modifikatoren und Grenzen | vollstaendig |
| Itemsystem mit Effekt-Hooks, Stapeln, Entfernen | vollstaendig |
| Synergiesystem ueber Tags, mit aufeinander aufbauenden Synergien | vollstaendig |
| Elemente, Zustaende, Reaktionstabelle, Elementflaechen | vollstaendig |
| Etagengenerator mit Sonderraeumen und Geheimraeumen | vollstaendig, geprueft ueber 3500 Seeds |
| Wahrnehmung (Sicht, Gehoer, Blutgeruch, Licht) und Reiz-Subsystem | vollstaendig |
| KI-Zustandsmaschine mit 14 Taktiken | vollstaendig |
| Bossgeruest mit Phasen, Schwachstellen, Angriffsauswahl | vollstaendig |
| Das Andere Kind mit Imitation der Spielergewohnheiten | vollstaendig |
| Horror-Director mit Spannungskurve und Jumpscare-Budget | vollstaendig |
| Zehn Horrorereignisse | vollstaendig |
| Kellerkind-Stalker mit Freund/Feind-Gleichgewicht | vollstaendig |
| Erster-Person-Charakter mit vollem Koerper, Stealth, Interaktion | vollstaendig |
| Waffen (vier Modi), Bomben, Orbitals, Begleiter | vollstaendig |
| Kellerhaendler, Kellermarken | vollstaendig |
| Spielstand, Freischaltungen, Run-Auswertung | vollstaendig |
| Grafikoptionen mit fuenf Presets | vollstaendig |
| HUD-Basisklasse mit Karte | vollstaendig |

**Inhaltskatalog** (`Data/`): 225 Items, 45 Synergien, 21 Kreaturen (davon 9 Minibosse),
8 Bosse mit Phasen und Angriffen, 7 Etagen, 120 Raumvorlagen, 6 Fluecke, 10
Zufallsereignisse, 12 Horrorereignisse, 6 Enden, 4 Charaktere, 13 Freischaltungen.

**Werkzeuge**: Inhaltspruefung, Generator-Simulation, Tag-Export, Import-Commandlet.

---

## 2. Was fehlt

Alles, was Kunst ist, und alles, was im Editor gebaut wird. Das laesst sich nicht in
Quelltext schreiben:

| Fehlt | Umfang |
|---|---|
| Leon: Kopf-Scan, Koerper, Kleidung, Hair Strands, Blendshapes | 1 Charakter, hoechste Qualitaetsstufe |
| Kreaturenmodelle mit Rigging und Animationssaetzen | 21 |
| Bossmodelle mit Phasen-Varianten und Arena-Mechanik | 8 |
| Raumlevel (`RoomLevel` in den Raumdaten) | 120 |
| Master-Materialien und Materialbibliothek | ca. 40 |
| Waffenmodelle mit Item-Schichten | 12 |
| Item-Weltmeshes und Symbole | 225 |
| Niagara-Effekte (Feuer, Elektro, Blut, Gift, Frost, Schatten, Dampf, Staub) | ca. 60 |
| Klangbibliothek inklusive eigener Kreaturenstimmen | ca. 900 Dateien |
| Animationssaetze fuer Leon | ca. 120 Zustaende |
| UMG-Widgets auf Basis von `UKKHUDWidget` | ca. 15 |
| Boss-Intro-Sequenzen (Level Sequences) | 8 |
| Prolog-Level Haus und Kellertreppe | 1 zusammenhaengender Abschnitt |
| Blueprint-Ableitungen (Item-Effekte, Kreaturen, Bosse, Tueren, Verstecke) | ca. 300 |

Die C++-Seite ist so gebaut, dass diese Arbeit rein additiv ist: Ein neues Item braucht
einen JSON-Eintrag, ein Mesh, ein Symbol und - falls es mehr als Werte veraendert - eine
Effektklasse. Kein Eingriff in bestehenden Code.

---

## 3. Reihenfolge

**Stufe 1 - Spielbarer Kern (grau)**
Prolog-Level, ein Raumsatz fuer Etage 1 mit Platzhaltergeometrie, Leon mit
Standard-Skelett, drei Kreaturen, der Heizer. Ziel: ein Run von der Kellertuer bis zum
ersten Boss, mit echtem Generator, echtem Herzsystem und echten Items.
Das beantwortet die Frage, ob sich der Loop gut anfuehlt - bevor Kunst entsteht.

**Stufe 2 - Vertikaler Schnitt**
Etage 1 vollstaendig in Zielqualitaet: Leon fertig, Raeume gebaut, Materialien, Licht,
Klang, der Heizer mit allen Phasen, die ersten zehn Minuten komplett.
Das ist der Massstab, an dem alles Weitere gemessen wird.

**Stufe 3 - Breite**
Etagen 2 bis 4 mit ihren Bossen und Kreaturen. Der Itemkatalog wird von 225 Definitionen
auf 225 fertige Items gebracht. Erste Freischaltungen greifen.

**Stufe 4 - Tiefe**
Etagen 5 bis 7, Das Andere Kind, Der Vater, alle Enden, New Game+.

**Stufe 5 - Feinschliff**
Balance ueber Telemetrie aus den Run-Statistiken, Barrierefreiheit, Lokalisierung,
Leistungsoptimierung an den in `03_Technik.md` genannten Kostenpunkten.

---

## 4. Wie man weiterarbeitet

**Ein Item hinzufuegen**
1. Eintrag in eine der Dateien `Data/items_*.json`.
2. `python3 Tools/validate_content.py` - prueft ID, Pool, Stats, Tags.
3. `python3 Tools/export_tags.py`, falls neue Tags dazukommen.
4. Im Editor: `-run=KKContentImport`.
5. Nur wenn das Item mehr tut als Werte aendern: Effektklasse von `UKKItemEffect`
   ableiten (Vorbilder in `Source/Kellerkind/Items/KKItemEffects.cpp`).

**Eine Kreatur hinzufuegen**
1. Eintrag in `Data/creatures.json` - Silhouette und Klang sind Pflichtfelder, der
   Validator besteht darauf.
2. Taktik aus `EKKTactic` waehlen. Nur wenn keine passt, eine neue Taktik in
   `KKAIController` ergaenzen.
3. Blueprint von `AKKCreatureBase` ableiten, Mesh und Animationen setzen.

**Einen Raum hinzufuegen**
1. Level bauen, Tuersockel an den Kanten, `ATargetPoint` mit Tag `KKSpawn` fuer
   Gegnerplaetze, `AKKRoom` platzieren.
2. Eintrag in `Data/rooms.json` mit korrekter Tuermaske.
3. `python3 Tools/simulate_floor.py 500` - prueft, ob die Etage weiterhin fuer jede
   Tuerkombination eine Vorlage hat.

**Balance aendern**
Basiswerte, Grenzen, Herzsystem, Generierung und Horror-Budget stehen in
`Config/DefaultGame.ini` unter `[/Script/Kellerkind.KKGameSettings]` und sind im Editor
unter *Projekteinstellungen -> Kellerkind - Balance* erreichbar. Keine Neukompilierung
noetig.
