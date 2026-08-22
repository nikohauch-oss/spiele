# KELLERKIND - Design-Bibel

Dieses Dokument beschreibt die Regeln. Der Inhalt, der diese Regeln ausfuellt, steht in
`Data/`. Wo eine Regel im Code festgeschrieben ist, steht die Datei dabei.

---

## 1. Perspektive und Koerper

Gespielt wird in erster Person. Leon hat **einen** Koerper - kein separates Arm-Mesh.
Die Kamera haengt am Kopfsocket desselben Skeletal Mesh, das auch in Spiegeln, in
Zwischensequenzen und beim Blick nach unten sichtbar ist
(`Source/Kellerkind/Player/KKCharacter.cpp`).

Das kostet etwas Animationsaufwand und zwingt zu sauberer Kameraarbeit, hat aber drei
Vorteile, die fuer ein Horrorspiel entscheidend sind: Leons Schatten stimmt, sein
Spiegelbild stimmt, und jede optische Veraenderung durch Items ist am eigenen Koerper
sichtbar - nicht nur an Haenden, die es sonst nirgendwo gibt.

Von aussen gezeigt wird Leon in: Zwischensequenzen, Spiegeln, bestimmten Story-Momenten,
im Charaktermenue und in den Endsequenzen.

---

## 2. Story

**Ausgangspunkt.** Leon Keller, 27, erhaelt ein Paket ohne Absender. Inhalt: ein alter
Kellerschluessel, eine Kinderzeichnung, ein Familienfoto, eine Kassette, eine kleine
Spielzeugfigur. Auf der Rueckseite des Fotos steht: *„Du hast die Tuer offen gelassen."*

Leon erkennt das Haus. Es ist das Haus seiner Familie, seit Jahren leer. Er faehrt
waehrend eines Gewitters hin. Im Erdgeschoss ist alles verlassen, im Keller brennt Licht.
Es klopft. Dreimal. Dann eine Kinderstimme: *„Leon?"*

Er oeffnet die Kellertuer. Unten steht fuer einen Moment ein Kind. Das Licht flackert.
Das Kind ist weg. Leon steigt hinab. Die Tuer faellt zu.

**Die Wahrheit des Kellers.** Mit jedem Abschnitt wird deutlicher, dass der Keller
groesser ist als das Gebaeude. Treppen fuehren kilometerweit hinunter. Raeume veraendern
sich zwischen zwei Besuchen. Tueren fuehren an Orte, an die sie nicht fuehren koennen.
Manche Raeume stammen aus Leons Erinnerung, andere sind Jahrhunderte alt.

Unter dem Haus liegt etwas, das Erinnerungen, Angst und Menschen miteinander verbindet.
Das Kellerkind ist moeglicherweise nicht der Ursprung - es koennte versuchen, Leon vor
etwas Groesserem zu warnen. Die vier Gegenstaende aus dem Paket sind Story-Relikte
(`Data/items_05_fluch_relikt_waffen.json`); wer alle vier in einem Run findet, oeffnet
den Weg zum geheimen Boss.

**Erzaehlweise.** Keine Zwischensequenz dauert laenger als etwa zwoelf Sekunden. Die
Geschichte liegt in Storyraeumen, in Fundstuecken, in Aufnahmen auf der Kassette und in
dem, was Kreaturen sagen. Wer nur spielen will, kommt durch; wer alles liest, bekommt
Ende 4.

---

## 3. Der Run

Ein Durchlauf heisst **Run**. Leon startet schwach: drei Herzcontainer, ein Brecheisen,
eine Bombe, keine Kellermarken (`Config/DefaultGame.ini`).

Waehrend eines Runs findet er Waffen, passive Items, aktive Items, Herz-Upgrades,
Begleiter, Orbitals, Schluessel, Bomben, Kellermarken, Relikte und verfluchte Items.

Jeder Run wuerfelt neu: Raeume, Gegnerkombinationen, Items, Events, Bosse, Abzweigungen.

**Seed und Zufallsstroeme.** Ein Run haengt an genau einem Seed. Daraus werden fuenf
getrennte Zufallsstroeme abgeleitet - Layout, Items, Gegner, Events, Horror
(`Source/Kellerkind/Core/KKRunState.cpp`). Das ist bewusst so: Wenn ein Spieler einen
Raum anders spielt, soll sich der Inhalt des naechsten Schatzraums nicht verschieben.
Derselbe Seed erzeugt denselben Run, auch wenn man ihn anders durchlaeuft.

---

## 4. Die sieben Ebenen

| # | Ebene | Optik | Boss |
|---|---|---|---|
| 1 | Der alte Keller | Beton, Heizungen, Kellerabteile, Waschraum, Werkzeugraum, Sicherungskaesten | **Der Heizer** |
| 2 | Die Versorgung | Rohre, Wartungstunnel, Generatoren, Pumpen, Dampf, Wasser | **Der Hausmeister** |
| 3 | Das Kinderreich | Kinderzimmer im falschen Massstab: Spielzeuge, Puppen, Stofftiere, Bauklötze | **Das Spielzeug** |
| 4 | Die vergessene Siedlung | Unterirdische Stadt: Wohnungen, Schule, Krankenhaus, Laden, Kirche, Spielplatz, U-Bahn | **Die Mutter** |
| 5 | Die Fleischtiefe | Beton wird Fleisch, Rohre werden Adern, Kabel werden Nerven | **Der Fleischkoenig** |
| 6 | Der Abgrund | Gigantische Industriearchitektur, Schaechte, Bruecken, tiefe Dunkelheit | **Der Schlaefer** |
| 7 | Das Nest | Ursprung des Kellerkindes; die Realitaet bricht zusammen | **Das Andere Kind** |

Geheimer Boss: **Der Vater**, erreichbar ueber den Super-Geheimraum der siebten Ebene,
mit dem Familienfoto im Inventar und ohne einen einzigen Teufelspakt im gesamten Run.

Etage 2 und 4 haben einen alternativen Weg: eine zweite Treppe an einer weit entfernten
Sackgasse, die eine Ebene ueberspringt und dafuer haerter ist
(`Data/floors.json`, Feld `altPath`).

---

## 5. Raumsystem

Eine Etage besteht aus **handgebauten Raeumen**, die prozedural kombiniert werden. Die
Etage ist zufaellig, der einzelne Raum ist gestaltet.

**Raumarten:** Start, Kampf, Schatz, Haendler, Geheim, Super-Geheim, Raetsel, Story,
Safe Room, Challenge, Mini-Boss, Verflucht, Opfer, Event, Boss, Treppe.

**Algorithmus** (`Source/Kellerkind/Level/KKFloorGenerator.cpp`, Referenzimplementierung
in `Tools/simulate_floor.py`):

1. Gitter 13x13, Start in der Mitte.
2. Ausbreitung vom Rand aus. Kernregel: **Ein neuer Raum darf nur an genau einen
   bestehenden Raum grenzen.** Dadurch entstehen Aeste und Sackgassen statt eines
   offenen Rechtecks - und Sackgassen sind es, an denen Schatz, Laden und Boss liegen.
   42 % aller moeglichen Anbauten werden verworfen; das erzeugt die unregelmaessige Form.
3. Breitensuche vom Start: jeder Raum bekommt seinen Abstand.
4. Bossraum = entfernteste Sackgasse.
5. Sonderraeume nach Wichtigkeit auf die verbleibenden Sackgassen, absteigend nach
   Entfernung. Reicht es nicht, wird der entfernteste Kampfraum umgewidmet.
6. Geheimraeume in leere Zellen: der normale Geheimraum an eine Stelle mit drei oder
   vier Nachbarn (so hat der Spieler eine echte Chance, ihn zu erschliessen), der
   Super-Geheimraum an eine Stelle mit genau einem Nachbarn, moeglichst weit vom Start.
   Keiner von beiden grenzt an Start oder Boss - sonst waeren sie eine Abkuerzung.
7. Tuermasken aus der Nachbarschaft, dann Auswahl der passenden Raumvorlage.

**Geprueft.** `Tools/simulate_floor.py` laeuft ueber 500 Seeds je Etage und stellt
sicher: jede Etage haengt zusammen, der Bossraum ist erreichbar und grenzt nie an den
Start, alle geforderten Sonderraeume finden Platz, und mindestens 30 % der Raeume bleiben
normale Kampfraeume. Genau diese letzte Pruefung hat waehrend der Entwicklung gegriffen:
die urspruenglichen Raumzahlen liessen auf Etage 7 nur 5 % Kampfraeume uebrig, die
Raumzahlen wurden daraufhin angehoben.

---

## 6. Herzsystem

Alle Werte in **Halbherzen** (2 = ein volles Herz), weil das Spiel in Halbherzen
austeilt (`Source/Kellerkind/Player/KKHealthComponent.h`).

| Herz | Wirkung |
|---|---|
| **Rot** | Normales Leben, begrenzt durch Herzcontainer. |
| **Blau** | Temporaerer Schutz ueber die Container hinaus. |
| **Schwarz** | Verfluchte Schutzherzen. Zerbricht eines vollstaendig, trifft eine Horror-Schockwelle (700 cm Radius, 32 Schaden, Element Schatten) alle Kreaturen in Reichweite. |
| **Weiss** | Selten. Bleibt es bis zum Ende einer Etage erhalten, wird daraus **ein permanenter Herzcontainer fuer diesen Run**. |

**Schadensreihenfolge: Weiss, Blau, Schwarz, Rot.** Diese Reihenfolge ist die
eigentliche Designentscheidung:

- **Weiss zuerst**, weil weisse Herzen eine Wette sind. Wer eine Etage sauber spielt,
  behaelt sie und wird belohnt; wer getroffen wird, verliert zuerst genau diese
  Belohnung. Das macht ein weisses Herz zu einem Grund, vorsichtiger zu spielen.
- **Blau** als normaler Puffer.
- **Schwarz als letzte Schicht vor dem Fleisch**, damit die Schockwelle in dem Moment
  zuendet, in dem es wirklich eng wird - dann, wenn sie den Unterschied macht.
- **Rot zuletzt.**

Nach jedem Treffer: 1,1 Sekunden Unverwundbarkeit. Ein Treffer kostet immer mindestens
ein Halbherz, egal wie hoch die Ruestung ist - sonst waere hohe Ruestung gleichbedeutend
mit Unverwundbarkeit.

---

## 7. Werte

Leon hat zehn Werte: Damage, Attack Speed, Movement Speed, Range, Critical Chance, Luck,
Armor, Max HP, Dodge, Interaction Speed.

**Verrechnung** (`Source/Kellerkind/Player/KKStatsComponent.cpp`): Erst alle flachen
Zugaben, dann die **Summe** aller Multiplikatoren einmal angewendet. Additiv gestapelte
Multiplikatoren halten Builds lesbar; multiplikative Stapelung wuerde bei 225 Items sehr
schnell entgleisen.

Modifikatoren werden nicht in den Wert gerechnet, sondern als Quellen gespeichert und bei
Bedarf neu ausgewertet. Dadurch kann ein Item jederzeit sauber entfernt werden -
Opferraum, verfluchte Tauschgeschaefte, Diebstahl durch den Sammler.

**Grenzen:** Krit 95 %, Ausweichen 60 %, Ruestungsreduktion 75 %, Tempo 900,
Herzcontainer 12. Ruestung wirkt mit abnehmendem Ertrag: `Armor / (Armor + 20)`.

---

## 8. Items

**225 Items** in `Data/items_*.json`, verteilt auf: Passiv (116), Verflucht (23),
Aktiv (22), Relikt (15), Begleiter (14), Orbital (12), Waffe (12), Verbrauch (8),
Quest (3).

Ein Item ist ein Datensatz (`UKKItemData`), sein Verhalten steckt in einer
Effektklasse (`UKKItemEffect`) mit Haken fuer: Erhalt, Entfernung, Stapeln, vor/nach
ausgeteiltem Schaden, vor erlittenem Schaden, Kill, Raum betreten, Raum geraeumt,
Etagenstart, Herz verloren, Item aufgenommen, Aktivierung, Tick.

**Qualitaet 0-4** steuert Preis, Pool-Gewicht und Praesentation. Der Preis ergibt sich
aus der Qualitaet (7 / 15 / 25 / 40 / 66 Kellermarken); verfluchte Items kosten die
Haelfte, weil sie ihren Preis anders eintreiben.

**Glueck** verschiebt die Gewichtung zu hoeherer Qualitaet, statt einfach seltene Items
haeufiger zu machen: jeder Qualitaetspunkt wird mit `(1 + Luck * 0,15)` skaliert
(`Source/Kellerkind/Core/KKContentRegistry.cpp`).

Kein Item erscheint zweimal in einem Run - auch Ladenware ist nach dem Auslegen vergeben,
ob sie gekauft wird oder nicht.

---

## 9. Synergien

**45 Synergien** in `Data/synergies.json`. Eine Synergie ist kein Sonderfall im Code,
sondern ein eigener Datensatz: Bedingung (Tags und/oder konkrete Item-IDs) -> zusaetzlicher
Effekt (`Source/Kellerkind/Items/KKSynergyData.h`).

Weil Bedingungen ueber **Tags** laufen, greift dieselbe Synergie auch fuer spaeter
hinzugefuegte Items mit denselben Tags - ohne dass eine Tabelle gepflegt werden muss.

Synergien koennen selbst Tags vergeben. Dadurch bauen sie aufeinander auf: `Kurzschluss`
vergibt `Synergie.Kette`, worauf `Kettenreaktion` und `Erdschluss` reagieren. Das Inventar
wertet deshalb in zwei Durchlaeufen aus
(`Source/Kellerkind/Player/KKInventoryComponent.cpp`).

**Das Beispiel aus dem Konzept, vollstaendig umgesetzt:**

```
Nasse Sicherung   Angriffe hinterlassen Wasser und machen Ziele nass   [Element.Wasser]
Hochspannung      Angriffe verursachen Elektroschaden                  [Element.Elektro]
-----------------------------------------------------------------------------------
Kurzschluss       Elektrizitaet springt durch Wasserflaechen auf mehrere Gegner ueber
```

Umsetzung: `UKKEffect_NasseSicherung` erzeugt `AKKElementSurface` vom Typ *Nass* und
setzt den Zustand *Nass* auf getroffene Ziele. `UKKEffect_Hochspannung` wandelt Schaden
in Elektro. `UKKSynergy_Kurzschluss` ruft `UKKDamageLibrary::ChainThroughWet` auf: Der
Schlag springt auf nasse Ziele in Reichweite, und die Reichweite waechst, wenn eine
Wasserflaeche dazwischenliegt. Jede Station kostet 28 % Energie, maximal vier Glieder -
sonst waere die Kette staerker als der Erstschlag und liefe ins Unendliche.

---

## 10. Elemente

Physisch, Feuer, Elektrizitaet, Blut, Gift, Frost, Schatten, Psyche.

Elemente setzen **Zustaende**, und die Zustaende reagieren aufeinander. Die
Reaktionstabelle steht an genau einer Stelle
(`Source/Kellerkind/Combat/KKStatusEffectComponent.cpp`), damit „Wasser leitet Strom"
nicht in zwanzig Items einzeln nachprogrammiert werden muss:

| Reaktion | Ergebnis |
|---|---|
| Nass + Elektro | Kettenueberschlag, Elektroschaden x1,75 |
| Nass + Feuer | Feuer entzuendet nicht, Wasser verdampft |
| Oelig + Feuer | Doppelte Brandstapel, 80 % laenger, Feuerschaden x1,6 |
| Unterkuehlt + Physisch | Physischer Schaden x1,4 |
| Frost + Brennend | Loescht |
| Markiert + Schatten | Schattenschaden x1,3 |

**Flaechen** (`AKKElementSurface`) sind der physische Traeger: Wasser, Oel, Feuer, Eis,
Gift. Wer darin steht, bekommt den Zustand. Gleiche Flaechen verschmelzen, statt sich zu
stapeln - ein Wasser-Build erzeugt sonst hunderte Aktoren.

---

## 11. Waffen

Brecheisen, Vorschlaghammer, Feuerwehraxt, Metallrohr, Nagelpistole, Bolzenwerfer,
Elektrowaffe, Signalpistole, improvisierte Schrotwaffe, Kettensaege, schweres
Industriewerkzeug, Knochenklinge.

Vier Modi: Nahkampf, Schuss, Streuung, Dauerfeuer (`Source/Kellerkind/Combat/KKWeapon.h`).
Nahkampf trifft nur im Schwungkegel - Rundumschlaege gibt es ausschliesslich per Item.
Schwere Angriffe haben eine sichtbare Ausholphase, auf die Kreaturen reagieren koennen.

Jeder Angriff erzeugt einen Hoerreiz. Eine Kettensaege ist im Keller nicht zu ueberhoeren
und damit eine bewusste Entscheidung gegen Stealth.

Items veraendern Waffen **sichtbar**: `AddWeaponLayer` schaltet Materialparameter am
Waffenmesh frei - gluehende Schneide, Kabel, Blutkanaele.

---

## 12. Begleiter und Orbitals

**14 Begleiter**, sechs Rollen: Schuetze, Nahkampf, Licht, Sammler, Spuerer, Schild.
Sie folgen mit Verzoegerung auf eigener Bahn, damit mehrere sich nicht ueberlagern.
Ihr Schaden laeuft ueber Leon - dadurch gelten Item- und Synergie-Hooks auch fuer sie,
und ein Feuer-Build faerbt auch die Puppe ein.

**12 Orbitals**: Glasscherben, Kreissaegen, Knochen, Messer, Schrauben, Gluehbirnen,
Zahnraeder, mechanische Teile. Sie kreisen sichtbar um Leon und teilen sich den Kreis
gleichmaessig auf, egal wie viele dazukommen. Jedes Ziel hat einen eigenen kurzen
Trefferabstand - sonst wuerde ein Orbital in einem einzigen Frame alles ausloeschen.

---

## 13. Horror-Director

Der Director (`Source/Kellerkind/Horror/KKHorrorDirector.cpp`) beobachtet: Blickrichtung,
Position, Leben, Ausruestung, Raumart, Aufenthaltsdauer im Raum, Lichtstaerke, Angst und
alle bisherigen Horrorereignisse.

**Spannungskurve statt Zufall.** Die Spannung steigt, waehrend nichts geschieht - durch
Zeit im Raum, Dunkelheit und niedriges Leben - und faellt nach jedem Ereignis um 0,55.
Daraus entsteht Rhythmus: lange Ruhe, dann etwas, dann wieder Ruhe. Ein reiner
Zufallsgenerator wuerde Haeufungen und Leerlauf erzeugen.

**Waehrend eines Kampfes schweigt der Director.** Ist eine Kreatur in Sichtweite, wird
keine Spannung aufgebaut und kein Ereignis ausgeloest. Horror und Gefecht wuerden sich
gegenseitig entwerten.

**Jumpscare-Budget.** Hoechstens 7 % aller Ereignisse duerfen Jumpscares sein
(`Config/DefaultGame.ini`), und in den ersten acht Ereignissen eines Runs gar keiner -
der Keller muss erst glaubwuerdig werden. Das ist die wichtigste Designregel des Spiels
und steht deshalb als harte Grenze im Code, nicht als Vorsatz im Dokument.

**Die Ereignisbibliothek** (`Source/Kellerkind/Horror/KKHorrorEvents.h`): Licht faellt
aus, Tuer schlaegt zu, Schritte hinter Leon, Schatten bewegt sich, Telefon klingelt,
Spiegelbild reagiert falsch, Kellerkind erscheint, Spielzeug bewegt sich, Radio schaltet
sich ein, Wand klopft.

Jedes Ereignis bewertet sich selbst fuer die aktuelle Lage: Abklingzeit, Haeufigkeit im
Run, Spannungsfenster, Raumart, Dunkelheit. Der Director waehlt gewichtet aus den
passenden aus.

Zwei Beispiele fuer die Haltung dahinter:
- *Licht faellt aus*: Ein Teil der Lampen bleibt danach kaputt. Der Raum ist dauerhaft
  dunkler als vorher - das Ereignis hinterlaesst eine Spur.
- *Schritte hinter Leon*: Die Schritte kommen naeher und hoeren auf. Es folgt nichts.
  Genau das ist der Punkt.

---

## 14. Das Kellerkind als Stalker

Das Kellerkind taucht waehrend Runs auf und ist nicht immer angreifbar
(`Source/Kellerkind/Horror/KKKellerkindStalker.cpp`). Es kann beobachten, folgen, Tueren
oeffnen, Gegner beeinflussen, Items hinterlassen, Raeume veraendern, den Spieler retten
oder ihn in eine Falle fuehren.

**Der Spieler soll nie sicher wissen, ob es Freund oder Feind ist.** Das entsteht nicht
durch Zufall, sondern durch ein inneres Gleichgewicht: Der Stalker fuehrt Buch darueber,
ob seine letzten Auftritte hilfreich oder schaedlich waren, und kippt bewusst, sobald ein
Muster erkennbar wird (nach drei gleichartigen Auftritten). Auch ein fast toter Spieler
wird nur in 55 % der Faelle gerettet - genau diese Luecke haelt die Frage offen.

Es laesst sich nie einholen: Wer naeher als 5,5 Meter kommt, findet einen leeren Raum.

---

## 15. Kreaturen

**21 Kreaturen** in `Data/creatures.json`, darunter neun Minibosse.

**Designregel:** Keine Kreatur darf die Farbvariante einer anderen sein. Jede braucht
eigene Silhouette, eigene Animation, eigenes Geraeusch und eine eigene Rolle im
Spielgeschehen. `Tools/validate_content.py` prueft, dass Silhouette und Klang bei jeder
Kreatur beschrieben sind.

**Sinne** (`Source/Kellerkind/AI/KKPerceptionComponent.h`): Sicht, Gehoer, Blutgeruch,
Lichtreaktion. Jede Kreatur gewichtet sie anders - Die Blinden haben Sichtgewicht 0 und
eine sehr niedrige Hoerschwelle, Der Kellerhund riecht Blut, Das Fluestern meidet Licht.
Der Verhaltensunterschied entsteht aus Daten, nicht aus Sonderklassen.

**Zustandskette** (`Source/Kellerkind/AI/KKAIController.cpp`): Ruhe -> Patrouille ->
Untersuchen -> Suchen -> Alarm -> Jagd -> Angriff, dazu Lauern und Rueckzug. Die Kette ist
fuer alle gleich, die Taktik faerbt sie ein. Das macht Verhalten lernbar: Man kann
herausfinden, wie eine Kreatur denkt.

Wichtige Details:
- Ein Geraeusch verraet den **Ort**, nicht den Spieler. Die Kreatur geht hin und sucht.
- Suchen heisst: vier Punkte in wachsenden Kreisen um den letzten Hinweis abgehen -
  nicht einmal hinlaufen und aufgeben.
- Ein vergessenes Ziel loescht nicht die letzte bekannte Position.
- Erkennen braucht Zeit. Sichtbarkeit haengt an Licht, Haltung und Tempo des Spielers.

**Taktiken:** Direkt, Hinterhalt, Decke, Rudel, Schwarm, Fernkampf, Wand, Schacht, Dieb,
Beobachter, Blind, Waechter, Bruthelfer, Schatten.

Der **Beobachter** (Die Maske, Die Marionetten) bewegt sich nur, wenn der Spieler nicht
hinsieht. „Beobachtet" heisst dabei: im Blickfeld **und** nicht verdeckt - sonst koennte
sich Die Maske hinter einer Wand direkt vor dem Spieler bewegen
(`AKKCreatureBase::IsObservedByPlayer`).

---

## 16. Bosse

**Designregel:** Kein Boss ist ein Schadensschwamm. Jeder braucht mehrere Phasen,
Arena-Mechaniken, Schwachstellen, unterschiedliche Angriffe und Reaktionen auf
Spieleraktionen. Der Validator prueft das: mindestens zwei Phasen, fallende
Phasenschwellen, mindestens vier Angriffe, mindestens eine Schwachstelle, und **keine
Ankuendigung unter 0,35 Sekunden** - darunter ist ein Angriff nicht mehr fair lesbar.

Alle Bosse mit Aussehen, Bewegung, Intro, Phasen und Angriffen stehen in
`Data/bosses.json`. Das Geruest liegt in `Source/Kellerkind/AI/KKBossBase.cpp`:

- Phasen wechseln bei Lebensschwellen; der Uebergang ist ein Fenster, in dem der Boss
  gebunden **und** um 50 % verwundbarer ist. Das belohnt Aufmerksamkeit.
- Angriffe sind eigene Objekte mit Bedingung, Ankuendigung, Abklingzeit, Reichweitenfenster
  und Phasenfreigabe. Der Boss waehlt gewichtet aus dem, was gerade moeglich ist.
- Schwachstellen sind benannte Sockel mit eigenem Faktor.

**Das Andere Kind** (`Source/Kellerkind/AI/KKBoss_AnderesKind.cpp`) imitiert ab Phase 3
die Faehigkeiten, die Leon in diesem Run am **haeufigsten** benutzt hat - nicht die
staerksten. Es imitiert Gewohnheiten. Die Datengrundlage sammelt `UKKRunState` waehrend
des gesamten Runs: jeder Waffenschlag, jedes aktive Item, jedes Ausweichen, jede Bombe.

**Boss-Intros** sind kurz und filmisch, nie laenger als zwoelf Sekunden, und gehen direkt
in den Kampf ueber. Beispiel Heizer: Leon betritt den Heizungsraum, Maschinen laufen an,
Druckanzeigen steigen, Rohre bewegen sich - dann erkennt er, dass die Rohre mit etwas
verbunden sind, und der Heizer hebt den Kopf.

---

## 17. Stealth, Bewegung, Interaktion

**Stealth.** Leon kann schleichen, sich ducken, kriechen, sich verstecken, Licht
ausschalten, Gegenstaende werfen und Gegner ablenken. Sichtbarkeit misst der
`KKStealthComponent` aus der tatsaechlichen Helligkeit am Spieler: Lichter in Reichweite
werden summiert, jeweils mit Sichtlinienpruefung - eine Lampe hinter einer Wand zaehlt
nicht. Im Dunkeln bleibt ein Rest Sichtbarkeit von 15 %; Dunkelheit ist keine
Unsichtbarkeitstaste.

Verstecke (Schrank, Bettunterseite, Regalnische, dunkle Nische) machen unsichtbar, aber
Kreaturen, die Leon hineingehen sahen, koennen ihn herausziehen. Sonst waeren Verstecke
eine Pausentaste.

Laerm entsteht aus Bewegung: Schrittabstand und Lautstaerke haengen direkt am Tempo.
Schleichen ist deshalb keine Sonderregel, sondern ergibt sich.

**Bewegung.** Laufen, sprinten, springen, ducken, kriechen, klettern, ueber Hindernisse
steigen, ausweichen. Ausweichen gibt 0,35 Sekunden Unverwundbarkeit bei 1,2 Sekunden
Abklingzeit. Kein uebertriebenes Kamera-Wackeln - und in den Optionen laesst sich die
Kameraatmung vollstaendig abschalten.

**Interaktion.** Tueren normal oder langsam oeffnen, Schubladen, Gegenstaende aufnehmen
und werfen, Ventile drehen, Generatoren bedienen, Sicherungen einsetzen, Kisten schieben,
Bretter entfernen. Eine Tuer langsam zu oeffnen dauert 1,8 Sekunden und macht fast keinen
Laerm - schnell oeffnen kostet nichts und macht Laerm. Diese Wahl ist der Kern des
Stealth-Spiels an Tueren.

---

## 18. Geheimraeume

Zu finden ueber: Bomben an bruechigen Waenden, Geraeusche (Zugluft, anderer Klang beim
Anschlagen), sichtbare Risse, spezielle Items (Mechanisches Auge, Findernase,
Wandgesicht), Karten und versteckte Schalter.

Eine Wand mit Geheimraum dahinter gibt immer Hinweise. Das Abklopfen aller Waende darf
nie die effizienteste Suchmethode sein.

---

## 19. Haendler und Waehrung

**Der Kellerhaendler**: alter Mantel, teilweise mechanischer Koerper, ein kleines Licht
am Kopf, das Gesicht schwer zu erkennen. Er verkauft Items, Herzen, Schluessel, Bomben
und Relikte. Er redet nicht viel. Wird er angegriffen, wehrt er sich nicht - er geht und
nimmt sein Angebot mit.

**Waehrung: Kellermarken.**

---

## 20. Freischaltungen und Charaktere

Nach Runs schalten sich dauerhaft frei: Items, Raeume, Bosse, Gegner, Charaktere,
Startwaffen, Etagen und alternative Wege (`Data/meta.json`).

| Charakter | Profil | Freischaltung |
|---|---|---|
| **Leon** | Ausgeglichen, 3 Herzen, Brecheisen | von Anfang an |
| **Mira** | Schnell, 2 Herzen, starker Fernkampf, Nagelpistole | Erreiche die Siedlung |
| **Der Hausmeister** | Langsam, 6 Herzen, starker Nahkampf, Vorschlaghammer | Besiege den Hausmeister dreimal |
| **Das Kellerkind** | 1 Herz, sehr schnell, nutzt Lueftungsschaechte und Schattenwege | Geheimes Ende |

---

## 21. Challenge-Raeume, Fluecke, Zufallsereignisse

**Challenge-Raeume** enthalten mehrere Gegnerwellen (dreifaches Gegnerbudget) und die
Tuer bleibt zu. Belohnung: seltenes Item, viele Kellermarken, Herzcontainer oder Relikt.

**Etagenfluecke** werden beim Betreten gewuerfelt; die Chance steigt mit der Tiefe
(8 % + 4 % je Etage): Fluch der Dunkelheit, der Stimmen, des Gedaechtnisses, der Tueren,
des Kindes, des Blutes. Zu jedem Fluch gibt es ein Gegenmittel im Itemkatalog
(`Data/meta.json`).

**Zufallsereignisse**: Stromausfall, Ueberschwemmung, Rauch, Feuer, Gegnerjagd,
veraenderte Raeume, versteckter Haendler, seltener Boss, Item-Regen, verfluchte Etage.

---

## 22. Safe Rooms und Tod

**Safe Rooms** sind Ruhepunkte: speichern, Inventar ansehen, Story lesen, Upgrades
verwalten. Der Horror-Director schweigt dort. Genau deshalb wirkt es, wenn sich ein Safe
Room spaeter doch veraendert (`AKKRoom::TransformInto`).

**Tod**: kurze Horrorsequenz, Schwarzbild, eine Kinderstimme sagt einen Satz -
*„Nochmal."*, *„Du kommst sowieso zurueck."*, *„Ich habe gewartet."* - dann die
Run-Auswertung.

---

## 23. Enden

| Ende | Bedingung |
|---|---|
| **1 - Flucht** | Das Nest ueberleben und aufsteigen. Etwas ist mitgekommen. |
| **2 - Kellerkind** | Das Kellerkind hat mehr geholfen als geschadet, und Leon greift es im Finale nicht an. |
| **3 - Opfer** | Im Finale die Tuer von innen schliessen. |
| **4 - Wahrheit** | Alle Storyraeume und beide Story-Relikte in einem Run. |
| **5 - Das Tor** | Im Nest die tiefere Ebene oeffnen, statt aufzusteigen. |
| **Geheim** | Der Vater besiegt, mit dem Familienfoto, ohne Teufelspakt im gesamten Run. Der Keller ist kein Ort, sondern ein lebendiges Netzwerk aus Erinnerungen. |

**New Game+** fuegt pro Stufe zwei Raeume je Etage hinzu und schaltet neue Gegner, Raeume,
Items, alternative Bosse und zusaetzliche Storyinformationen frei.

---

## 24. UI und Inventar

Das HUD zeigt: Herzen, Schluessel, Bomben, Kellermarken, aktives Item, kleine Karte.
Mehr nicht - keine Schadenszahlen, keine Questmarker
(`Source/Kellerkind/UI/KKHUDWidget.h`).

Die Karte fuellt sich schrittweise: betretene Raeume sind bekannt, angrenzende werden
angedeutet, Geheimraeume erscheinen erst, wenn sie gefunden wurden. Unter dem Fluch des
Gedaechtnisses bleibt sie leer.

Questgegenstaende liegen in einem eigenen Inventar, getrennt von Waffen, Items und
Verbrauchsgegenstaenden.

---

## 25. Die ersten zehn Minuten

Leon faehrt bei Gewitter zum Haus. Er betritt das Gebaeude, der Strom funktioniert
teilweise, er untersucht das Haus. Im Keller hoert er drei Klopfgeraeusche. Er oeffnet
die Tuer. Am unteren Ende der Treppe steht das Kellerkind - eine Sekunde lang. Das Licht
flackert. Es ist weg.

Leon findet eine Zeichnung: er selbst als Kind, daneben eine zweite Figur, darueber steht
**KELLERKIND**. Die Kellertuer faellt zu. Das Tutorial geht direkt in den ersten Run
ueber - ohne Schnitt, ohne Menue.

Diese zehn Minuten sind der Massstab fuer die Qualitaet des gesamten Spiels. Sie
enthalten keinen einzigen Jumpscare.

---

## 26. Die beiden wichtigsten Regeln

**Horror entsteht aus Atmosphaere, Klang, Kreaturendesign, Ungewissheit, intelligenten
Gegnern, Licht, Umgebung, Story und unerwarteten Ereignissen.** Jumpscares werden selten
und gezielt eingesetzt - im Code auf 7 % begrenzt.

**Besonders viel Qualitaet fliesst in drei Bereiche:** den Spielercharakter, die Bosse
und die normalen Kreaturen. Wirkt eines dieser Modelle schwach, wird das Design
ueberarbeitet - nicht das Licht gedimmt.
