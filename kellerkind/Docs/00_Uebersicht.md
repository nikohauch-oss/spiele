# KELLERKIND - Uebersicht

## Was KELLERKIND ist

Ein Horrorspiel in erster Person mit vollem Koerper, das seine Wiederspielbarkeit aus
einem Roguelite-Aufbau bezieht: zufaellig zusammengesetzte Etagen, hunderte Items,
Synergien zwischen ihnen, ein Herzsystem, Geheimraeume, alternative Wege und Bosse,
die man lernen kann.

Was KELLERKIND **nicht** ist: eine Kopie eines bestehenden Roguelites mit Horroranstrich.
Uebernommen ist die Struktur - Run, Raumtypen, Item-Pools, Herzarten, Synergien.
Alles andere - Welt, Story, Kreaturen, Bosse, Items, Optik - ist eigenstaendig.

## Die drei Saeulen

**1. Der Keller ist groesser als das Haus.**
Der Abstieg ist die Geschichte. Sieben Ebenen, von einem gewoehnlichen Mietskeller bis
zu einem Ort, der keine Architektur mehr ist. Jede Ebene erklaert die vorherige neu.

**2. Horror entsteht aus Ungewissheit, nicht aus Lautstaerke.**
Der Horror-Director (`Source/Kellerkind/Horror/KKHorrorDirector.h`) haelt ein hartes
Budget: hoechstens 7 % aller Horrorereignisse duerfen Jumpscares sein. Alles andere
arbeitet mit Licht, Klang, Bewegung am Rand des Blickfelds und Kreaturen, die
nachvollziehbar denken.

**3. Jeder Run erzaehlt eine eigene Geschichte.**
Nicht durch Text, sondern durch den Build: Wer im ersten Schatzraum die Nasse Sicherung
findet und im zweiten die Hochspannung, spielt ab da ein anderes Spiel als jemand, der
Zuendkerze und Brennglas zieht.

## Wie die Dokumente zusammenhaengen

| Datei | Inhalt |
|---|---|
| `01_Design_Bibel.md` | Alle Spielsysteme mit Zahlen und Begruendungen |
| `02_Kunstrichtung.md` | Optik: Leon, Kreaturen, Bosse, Materialien, Licht |
| `03_Technik.md` | Architektur, Klassen, Renderpfad, Leistungsbudget |
| `04_Produktionsplan.md` | Was fertig ist, was fehlt, in welcher Reihenfolge |

Der Inhalt selbst - Items, Synergien, Kreaturen, Bosse, Etagen, Raeume - steht nicht in
den Dokumenten, sondern in `Data/`. Die Dokumente erklaeren die Regeln, die Daten fuellen
sie aus. So bleibt beides pflegbar, und `Tools/validate_content.py` kann pruefen, ob die
Daten die Regeln einhalten.
