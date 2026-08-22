# KELLERKIND - Kunstrichtung

**Richtung: CINEMATIC REALISTIC HORROR.**

Keine Cartoon-Grafik, keine Comic-Optik, keine gezeichneten Monster, keine
Low-Poly-Charaktere, keine kindlichen Designs, keine billigen Standard-Horror-Assets.
Die Welt muss glaubwuerdig wirken, bevor sie unheimlich sein kann.

Der Massstab: Wenn jemand einen Screenshot von Leon, dem Kellerkind, einem Boss oder
einer Etage sieht, soll er erkennen, dass es KELLERKIND ist.

---

## 1. Renderpfad

Nanite, Lumen (Hardware Ray Tracing ab Preset *Ultra*), Virtual Shadow Maps,
volumetrischer Nebel, Virtual Textures, Substrate-Materialien, Hair Strands,
Chaos Cloth, Subsurface Scattering fuer Haut. Konfiguriert in
`Config/DefaultEngine.ini`.

Kein Post-Process-Effekt darf die Lesbarkeit des Raumes zerstoeren. Motion Blur, Film
Grain, Depth of Field und Kameraatmung sind einzeln abschaltbar
(`Source/Kellerkind/Systems/KKGraphicsSettings.h`) - Horror darf niemandem koerperlich
schlecht machen.

---

## 2. Umgebung

**Grundregel: Die Welt darf nie wie ein sauber zusammengesetztes Asset-Pack aussehen.**
Jede Oberflaeche braucht eine Geschichte darueber, was ihr zugestossen ist.

**Waende (Beton, Putz, Fliesen)**
Feuchtigkeit mit Wasserlaufspuren von oben nach unten. Schimmel in Ecken und dort, wo
Feuchtigkeit steht - nie gleichmaessig verteilt. Risse, die von Ecken und Oeffnungen
ausgehen. Rostfahnen unter jedem Metallteil in der Wand. Alte Farbe in mehreren Schichten,
abplatzend. Schmutz auf Kopf- und Huefthoehe, wo Menschen sich abgestuetzt haben.
Fingerabdruecke an Lichtschaltern und Tuerrahmen. Wasserflecken mit Rand. Beschaedigter
Beton mit freiliegender Bewehrung.

**Metall**
Rost in drei Stufen (Flugrost, Narbenrost, Durchrostung), Kratzer in Gebrauchsrichtung,
Fett an Griffen und Gelenken, Oel an Maschinen, unterschiedliche Roughness fuer benutzte
und unbenutzte Bereiche. Metall, das jeden Tag angefasst wird, ist blank.

**Holz**
Schlagschaeden an Kanten, Splitter, Quellung durch Feuchtigkeit, Grauverfaerbung durch
Alter, Nagelloecher, Reste alter Beschriftungen.

**Umsetzung.** Ein gemeinsames Master-Material mit den Parametern `Dirt`, `Wetness`,
`Rust`, `PaintLoss`, `Blood`, `Age`, gesteuert ueber Vertex-Painting und
Weltraum-Masken. Dieselben Parameternamen benutzt der `KKAppearanceComponent` fuer Leon -
so reagieren Charakter und Welt auf dieselbe Weise auf Naesse und Dreck.

---

## 3. Licht

Licht ist in KELLERKIND ein Spielsystem, kein Dekor: Der `KKStealthComponent` misst die
tatsaechliche Helligkeit am Spieler, Kreaturen reagieren darauf, und der Horror-Director
kann Lampen dauerhaft ausfallen lassen.

Daraus folgen zwei Regeln fuer die Beleuchtung:

1. **Jede Lichtquelle muss im Level ein Objekt haben.** Kein Licht aus dem Nichts. Wenn
   der Spieler eine Lampe zerstoert, muss der Raum dunkler werden.
2. **Kein Raum ist komplett dunkel.** Es gibt immer eine schwache Orientierung -
   ein Lueftungsgitter, eine Notleuchte, das Glimmen eines Items. Voellige Schwaerze ist
   nicht unheimlich, sondern nur unlesbar.

Die Ebenen unterscheiden sich in der Lichtfarbe: Etage 1 warmes, sterbendes Gluehlicht;
Etage 2 gruenliche Notbeleuchtung; Etage 3 zu freundliches Nachtlicht; Etage 4 kalte
Strassenlaternen; Etage 5 Eigenleuchten aus dem Gewebe; Etage 6 fast nichts; Etage 7
Licht ohne erkennbare Quelle.

---

## 4. Leon Keller

Leon muss so detailliert sein wie die Bosse. Kein generischer Unreal-Mannequin-Look.

**Gesicht.** Etwa 27 Jahre, maennlich, markante Zuege, attraktiv aber realistisch. Leichte
Bartstoppeln, dezente Augenringe, ernstes Auftreten. Erforderlich: Hautporen, kleine
Unreinheiten, Lippenstruktur, feine Falten, Augenfeuchtigkeit, glaubwuerdige Zaehne,
Augen mit korrekter Brechung und Limbus-Ring.

**Haare.** Dunkelbraun bis schwarz, oben mittellang, Seiten kuerzer, leicht unordentlich,
einzelne Straehnen sichtbar. Hair Strands, nicht Karten. Reagieren auf Bewegung, Wind
und Wasser.

**Koerper.** 1,80-1,85 m, schlank-athletisch, nicht uebertrieben muskuloes. Realistische
Proportionen, detaillierte Haende und Finger - die Haende sind das, was der Spieler die
meiste Zeit sieht.

**Kleidung.** Dunkle hochwertige Jacke, graues oder schwarzes Shirt, robuste dunkle Jeans
oder Cargohose, moderne Boots, Armbanduhr, kleiner Guertel mit Ausruestung. Chaos Cloth
fuer Jacke und Hosenbeine. Dirt Maps, Naesse, Beschaedigungen, Blutflecken.

**Veraenderung durch den Build.** Der `KKAppearanceComponent` blendet Schichten langsam
ein - eine Aufnahme veraendert Leon sichtbar, aber nicht schlagartig, und nie so stark,
dass die Silhouette unlesbar wird:

| Build | Sichtbar an Leon |
|---|---|
| Feuer | Leichte Brandspuren an Unterarmen und Kleidung, gluehende Waffenbestandteile, Rauchpartikel |
| Elektro | Elektrische Entladungen ueber die Haut, leuchtende Metallteile, Funken an den Fingerspitzen |
| Schatten | Dunklere Augen, schwarze Adern vom Hals aufwaerts, Schattenfetzen |
| Blut | Blutige Arme, rote Adern, organische Veraenderungen an den Haenden |
| Maschine | Metallteile im Unterarm, Kabel unter der Haut, mechanische Implantate |

**Animationen.** Idle, Gehen, Rennen, Sprint, Schleichen, Ducken, Kriechen, Springen,
Klettern, Stolpern, verletzt Gehen, schwere Atmung, Waffe aufnehmen, Tuer oeffnen (schnell
und langsam), Gegenstand untersuchen, Heilung, Angriff (leicht/schwer je Waffe), Block,
Ausweichen.

**Angstreaktion.** Bei steigender Angst: schnellere Atmung, leichtes Handzittern,
nervoeserer Blick, hoerbarer Herzschlag. **Die Steuerung bleibt praezise.** Der
`KKFearComponent` wirkt ausschliesslich auf Praesentation - nie auf Eingabeverzoegerung,
Trefferzonen oder Zielgenauigkeit. Ein Horrorspiel darf erschrecken, aber nicht die
Kontrolle wegnehmen.

---

## 5. Kreaturen

Jede Kreatur braucht eine Silhouette, die man auf 30 Metern im Gegenlicht erkennt.

Die vollstaendigen Beschreibungen stehen in `Data/creatures.json`. Drei
Gestaltungsprinzipien ziehen sich durch alle:

**Falsche Proportionen statt Fantasieanatomie.** Der Kellerhund ist erschreckend, weil er
fast ein Hund ist - mit zu langen Beinen, fast menschlichen Haenden und einem zu kleinen
Kopf. Nichts an ihm ist erfunden, alles ist verschoben.

**Etwas Menschliches bleibt immer sichtbar.** Ein Rest Kleidung, eine Hand, ein Gesicht
im Fleisch. Der Horror kommt aus dem Wiedererkennen.

**Die Bewegung erzaehlt die Rolle.** Der Kriecher bewegt sich ruckhaft und macht Pausen -
man hoert seine Gelenke, bevor man ihn sieht. Die Marionette bewegt sich gar nicht,
solange man hinsieht. Der Waechter geht in gleichmaessigem Takt und wird nie schneller.

---

## 6. Bosse

Jeder Boss muss auf den ersten Blick beeindrucken. Vollstaendige Beschreibungen in
`Data/bosses.json`.

Gemeinsame Regeln:
- **Massstab ist die halbe Miete.** Der Heizer mit vier Metern in einem Kellerraum wirkt
  groesser als jeder Riese im Freien.
- **Der Koerper zeigt die Mechanik.** Die Rohre des Heizers sind Schwachstelle und
  Phasenwechsel zugleich - man sieht dem Boss an, wie man ihn schlaegt.
- **Die Arena ist Teil des Bosses.** Der Heizer setzt sie in Brand, der Hausmeister
  verriegelt sie, die Mutter loescht das Licht, der Schlaefer *ist* sie.
- **Der Kopf zuletzt.** Bei jedem Boss sieht man zuerst Koerper, Bewegung und Umgebung -
  das Gesicht wird gezielt zurueckgehalten.

---

## 7. Klang

Hochwertiger 3D-Klang mit vollstaendiger Verdeckungsberechnung: Was hinter einer Wand
passiert, klingt auch so.

**Weltklaenge**: Rohre, Schritte auf sechs Untergruenden, Metall, Wasser, Atem, Schreie,
Kinderstimmen, Maschinen, Tueren, Wind in Schaechten, Stoff, Knochen, Ketten, elektrische
Anlagen.

**Jede Kreatur hat eigene Geraeusche** - das prueft der Content-Validator. Kein geteiltes
Kreaturen-Sounddesign.

**Musik nur gezielt.** Normales Spiel: fast ausschliesslich Ambient und Raumklang.
Bosskaempfe: Industrial Horror, tiefe Percussion, verzerrte Streicher, metallische
Geraeusche, Choere, tiefer Bass.

Der wichtigste Klang ist die Stille davor. Wenn Musik einsetzt, ist etwas passiert.
