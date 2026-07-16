# Prompt: Roblox-Spiel „Monsterwelt“ (spielt sich wie Pokémon)

**So benutzt du diesen Prompt:** Kopiere alles unterhalb der Linie und füge es bei einer KI ein (z. B. Claude), die dir das Spiel für Roblox Studio baut.

**Hinweis:** Der Prompt verlangt absichtlich *eigene* Monster statt echter Pokémon. Spiele mit echten Pokémon-Figuren und -Namen löscht Roblox wegen Urheberrecht (Nintendo). Das Spielgefühl ist trotzdem 1:1 wie Pokémon.

---

Du bist ein erfahrener Roblox-Entwickler. Baue mir ein komplettes Roblox-Spiel in Roblox Studio (Sprache: Luau), das sich genauso spielt wie Pokémon – aber mit eigenen, selbst erfundenen Monstern. Eigene Namen und eigene Designs, keine echten Pokémon-Namen oder -Figuren, damit das Spiel nicht wegen Urheberrecht gelöscht wird.

## Wichtigste Regel

Das Spielgefühl soll 1:1 wie Pokémon sein: Monster im hohen Gras finden, fangen, ein Team aufbauen, rundenbasiert kämpfen, im Monster-Center heilen, Stadt und Routen erkunden, Monster entwickeln.

## Technik

- Alles wird per Skript erzeugt: Ein „WorldBuilder“-Server-Skript baut die komplette Welt aus Parts beim Spielstart. Ich will das Spiel starten können, indem ich nur die Skripte in Roblox Studio einfüge (ServerScriptService, StarterPlayerScripts, ReplicatedStorage für gemeinsame Module).
- Sage mir am Ende genau, welche Datei wohin gehört.
- Fortschritt (Team, Level, Items, Münzen) wird mit DataStoreService gespeichert.
- Kamera: normale Third-Person-Ansicht beim Laufen, im Kampf eine feste Kampf-Kamera.
- Alle Texte im Spiel auf Deutsch.

## Die Monster (wichtig!)

- Mindestens 12 eigene Monster mit den Typen Feuer, Wasser, Pflanze, Elektro und Normal.
- Jedes Monster ist eine **richtige 3D-Figur** aus Parts/MeshParts (Körper, Kopf, Augen, Ohren, Schwanz, Flossen oder Flügel), mit eigener Form und Farbe. Keine schwebenden Bilder, keine Billboards.
- Wilde Monster laufen **sichtbar in der Welt herum** (im hohen Gras auf den Routen) mit einfacher Bewegungs-Animation (hüpfen/wackeln per TweenService reicht).
- Jedes Monster hat: Name, Typ, Level, KP (Leben), Angriff, Verteidigung, Tempo, 2–4 Attacken, XP.
- Entwicklung: Ab einem bestimmten Level entwickelt sich das Monster – die Figur wird größer und verändert sich sichtbar, Name und Werte ändern sich.
- Das erste Monster im Team läuft dem Spieler als Begleiter hinterher. Andere Spieler sehen die Begleiter auch.

## Start beim Professor

- In der Stadt steht ein Labor. Beim ersten Betreten wählt man eines von 3 Starter-Monstern (Feuer / Wasser / Pflanze), die als Figuren auf Tischen stehen. Ansprechen per ProximityPrompt, dann Auswahl bestätigen.

## Fangen & Kämpfe

- Läuft man durchs hohe Gras, kann ein wilder Kampf starten (Zufallschance pro Schritt, außerdem sichtbar herumlaufende Monster, die man anlaufen kann).
- Rundenbasierter Kampf auf einer Kampf-Bühne: Beide Monster stehen sich als 3D-Figuren gegenüber, die Kamera fährt hin. Unten ein Menü: **Kampf / Beutel / Team / Flucht**.
- Attacken haben Typen mit Effektivität (Wasser schlägt Feuer, Feuer schlägt Pflanze, Pflanze schlägt Wasser; Elektro schlägt Wasser). Schadensformel nutzt Level, Angriff und Verteidigung. Texte wie „Flarix setzt Glutbiss ein! Es ist sehr effektiv!“.
- Fangkugeln werfen: Fangchance steigt, je weniger KP das wilde Monster hat. Kleine Wurf- und Wackel-Animation der Kugel.
- Gewonnene Kämpfe geben XP, Level-Ups erhöhen die Werte, neue Attacken werden gelernt.
- Auf den Routen stehen Trainer-NPCs, die einen beim Vorbeilaufen zum Kampf herausfordern und Münzen als Preisgeld geben.
- Team-Größe: maximal 6 Monster.

## Monster-Center (wie ein Pokémon-Center)

- Auffälliges Gebäude in der Stadtmitte mit rotem Dach, betretbar, innen eine Theke mit einer freundlichen Schwester-NPC.
- ProximityPrompt „Heilen“: Das ganze Team wird kostenlos vollständig geheilt, mit Heil-Sound und Licht-Effekt an der Theke.
- Innen steht außerdem ein PC mit Box-System: gefangene Monster lagern und mit dem Team tauschen.

## Früchte-Job (Beeren-Farm)

- Am Stadtrand liegt ein Obstgarten mit Beerenbüschen und Obstbäumen.
- Beim Farmer-NPC kann man einen Job annehmen: Früchte pflücken (ProximityPrompt an Büschen und Bäumen). Pro vollem Erntekorb zahlt der Farmer Münzen.
- Geerntete Früchte landen im Beutel und heilen Monster, z. B.: Rote Beere +20 KP, Blaubeere heilt Statusprobleme, Goldapfel füllt die KP komplett. Früchte sind auch mitten im Kampf einsetzbar.
- Abgeerntete Büsche wachsen nach 1–2 Minuten nach.

## Die Stadt & Welt (voll ausgebaut!)

- Eine richtige kleine Stadt: mindestens 6–8 Häuser mit Türen, Fenstern, Dächern in verschiedenen Farben – 2–3 davon betretbar und innen mit Möbeln eingerichtet.
- Gepflasterte Gehwege verbinden alle Häuser. Dazu Straßenlaternen (leuchten nachts), Bänke, Zäune, Blumenbeete und ein Brunnen auf dem Stadtplatz.
- Überall Bäume (Stamm + Blätterkrone), Büsche und Blumen, damit nichts leer aussieht.
- Ein Markt/Shop mit blauem Dach: Fangkugeln, Tränke und Früchte kaufen, Verkäufer-NPC hinter der Theke.
- Mindestens 2 Routen ins Grüne mit hohem Gras (dort spawnen wilde Monster), einem kleinen See mit Brücke und ein paar Felsen.
- Tag-Nacht-Wechsel und dezente Hintergrundmusik.

## UI

- Oben links: Team-Anzeige mit Mini-Bild, Namen, Level und KP-Balken jedes Monsters.
- Münzen-Anzeige oben rechts. Beutel öffnen mit Taste B, Team-Menü mit Taste T.
- Kampf-UI: große Attacken-Knöpfe, KP-Balken beider Monster, Textfeld für Kampfnachrichten.

## Arbeitsreihenfolge

Baue in dieser Reihenfolge und teste nach jedem Schritt:

1. Welt bauen (Stadt mit Häusern, Gehwegen, Laternen, Bäumen; Routen mit hohem Gras)
2. Monster-Daten (Modul) + 3D-Figuren-Erzeugung
3. Wilde Monster spawnen + Begegnung im Gras
4. Rundenbasiertes Kampfsystem
5. Fangen + Team-Verwaltung
6. Monster-Center mit Heilung und Box
7. Beeren-Farm mit Job und Früchten
8. Shop, Trainer-NPCs, Speichern mit DataStore, Feinschliff (Sounds, Effekte, Tag/Nacht)

Erkläre mir zum Schluss Schritt für Schritt, wie ich alles in Roblox Studio einfüge und starte.
