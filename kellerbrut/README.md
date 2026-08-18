# KELLERBRUT

Ein 2D-Twin-Stick-Roguelite im Geist von *The Binding of Isaac* — mit
denselben Mechaniken, aber komplett eigenen Grafiken, Namen und Items.
Alles steckt in **einer einzigen HTML-Datei** (`index.html`, ca. 2800 Zeilen):
kein Build, keine Abhängigkeiten, keine externen Assets.

**Spielen:** `index.html` im Browser öffnen. Fertig.

---

## Steuerung

| Taste | Wirkung |
|---|---|
| WASD | Bewegen |
| Pfeiltasten | Schießen (8 Richtungen) |
| E | Aktives Item benutzen |
| Leertaste | Bombe legen |
| Q | Pille / Karte benutzen |
| P oder ESC | Pause |
| M / N | Musik / Ton umschalten |

Gamepads werden unterstützt: linker Stick bewegt, rechter Stick schießt,
A = Bombe, B = aktives Item, X = Pille/Karte, Start = Pause.

---

## Was drin ist

**Kampf.** Tränen als Projektile mit Reichweite, Flughöhe samt Schatten und
Streuung. Die Statwerte sind Tempo, Feuerrate, Schaden, Reichweite,
Schussgeschwindigkeit und Glück. Treffer erzeugen Rückstoß und Screenshake.

**Leben.** Rote Herzcontainer in halben Schritten, dazu Seelenherzen und
schwarze Herzen (die beim Verlust alle Gegner im Raum verletzen). Ein Treffer
kostet ein halbes Herz, danach kurze Unverwundbarkeit mit Blinken.

**Etagen.** Sechs Etagen mit eigenen Tilesets und Gegnerpools, prozedural auf
einem Raster erzeugt. Raumtypen: Start, Normal, Schatzraum, Shop, Boss,
Geheimraum, Fluchraum, Opferraum und Arkade. Die Automap oben rechts deckt
sich beim Erkunden auf.

**Schlüssel sind garantiert.** Jede Etage legt 1–2 Schlüssel aus, und zwar
immer in Räumen, die man ohne Schlüssel und ohne Bombe erreicht — sonst
bräuchte man ja einen Schlüssel, um an den Schlüssel zu kommen. Sie liegen
außerdem nur auf Feldern, die zu Fuß mit dem Raumrand verbunden sind, also nie
in einer von Steinen umschlossenen Nische. Dazu kommen die üblichen
Zufallsfunde.

**Schatzräume und Shops** sind verschlossen und brauchen einen **Schlüssel**.
Man stellt sich einfach mit einem Schlüssel im Gepäck vor die goldene Tür —
sie springt von selbst auf und ein Schlüssel wird verbraucht. Hat man keinen,
ertönt nur ein Fehlton. Schlüssel fallen aus geräumten Räumen, Steinen,
Kothaufen und Truhen, kosten im Shop 5 Münzen, und es gibt sie über die Pille
*Schlüsselglück* (+2) und den *Dietrichfinger* (+3, spart Schlüssel manchmal
ganz ein). Die Karte *Die Pforte* öffnet alle Türen im Raum ohne Schlüssel.

**Türen.** Steinrahmen in leichter Aufsichtsperspektive mit zwei Türblättern,
die aufschwingen, sobald alle Gegner im Raum tot sind. Jede Türart ist auf
einen Blick erkennbar: die Schlosstür golden mit Vorhängeschloss, die Bosstür
mit Schädel im Sturz und rotem Schein aus dem Spalt, die Fluchtür dunkelrot
mit Zähnen im Durchgang, der Geheimgang als aufgesprengter Mauerriss mit
Schutt. Gezeichnet wird immer in lokalen Koordinaten, die Wandseite ergibt
sich allein aus der Drehung (`DOOR_ROT`) — eine neue Türart braucht daher nur
einen Eintrag in `doorStyle()` und einen Verzierungsblock in `drawDoor()`.

**Seeds.** Gleicher Seed erzeugt garantiert dieselben Etagen — in der
Charakterauswahl mit `S` eingebbar. Der Seed steht während des Spiels unten
rechts.

**Inhalte.** 48 Items (passiv und aktiv), 19 Gegnertypen mit Champion-Varianten,
7 Bosse mit mehreren Angriffsmustern und Phasenwechsel, 10 Pillen, 8 Karten,
4 Charaktere (drei davon freischaltbar).

**Kothaufen** sind mehr als Deko: Wer einen aufbricht, findet manchmal Beute —
manchmal krabbelt aber auch ein **Kotkrabbler** heraus, und die Chance darauf
steigt mit jeder Etage. Der **Kotspritzer** lobt Klumpen im Bogen, die als
ätzende Pfütze zerplatzen. Beide gehören zum **Kloakenfürsten**, einem Boss,
der auf den Spieler springt (bei der Landung spritzt ein Ring aus Klumpen weg),
Klumpenregen wirft und ab der Hälfte seiner Lebenspunkte quer durch den Raum
rutscht, dabei eine Spur hinterlässt und Diener aus dem Dreck ruft.

**Die Figuren** haben Isaac-Proportionen: großer runder Kopf auf kleinem
Körper, Beine treten im Laufen abwechselnd, die Pupillen folgen der
Schussrichtung, gelegentlich wird geblinzelt, bei Schaden reißt der Mund auf.
Die Frisur unterscheidet sie — Lumo trägt eine Kapuze, Flink Stachelhaar,
Brocken Zotteln mit wippenden Büscheln, Schemen schwebt als Geist mit
Schleier und Schweif statt Beinen. Gezeichnet werden alle von derselben
Funktion `zeichneCharakter()`, die auch die Charakterauswahl benutzt; eine
neue Frisur braucht nur einen Zweig in `zeichneFrisur()` und das Feld
`frisur` im Charaktereintrag.

**Item-Wirkungen sind sichtbar.** Elementare Schüsse ziehen ihre Spur — Gift
qualmt grün, Feuer sprüht Funken, Frost stäubt. Getroffene Gegner zeigen den
Zustand deutlich: Vergiftete blubbern und färben sich grün, Brennende lodern,
Erfrorene bekommen einen Eispanzer mit Zacken. Kritische Treffer blitzen auf
und lassen das Bild kurz wackeln. Jedes Aktivitem hat eine eigene Signatur,
etwa die Druckwelle des *Sturmatems*, die Schallringe der *Knochenglocke*
oder das rote Aufwallen des *Berserkerkelchs*.

**Giftpfützen haben einen Besitzer.** Gegnerische sind violett und schaden
dir, deine eigenen (aus Schüssen mit der *Giftdrüse*) sind grün und vergiften
Gegner, die hineinlaufen.

**Progression.** Permadeath. Der Schwierigkeitsgrad steigt pro Etage (mehr
Lebenspunkte, mehr Gegner, häufiger Champions). Nach dem Run gibt es einen
Auswertungsbildschirm mit Statistik und allen gefundenen Items. Freischaltungen
und Statistiken liegen im `localStorage`.

**Ton.** Sämtliche Geräusche und die Hintergrundmusik werden zur Laufzeit per
WebAudio synthetisiert — es wird keine Audiodatei geladen.

---

## Eigene Inhalte hinzufügen

Alle Inhalte stehen in Datentabellen am Anfang der Datei. Suche im Code nach
`==== 4.` und `==== 5.`, dort liegt alles beieinander.

### Neues Item

```js
defItem({
  id:'donnerkeil', name:'Donnerkeil', desc:'Schaden hoch, aber langsamer',
  type:'passive',                 // 'passive' oder 'active'
  pool:['treasure','boss'],       // treasure | boss | shop | curse | secret
  mod:s=>{ s.dmg+=2; s.tps-=0.3; },   // verändert die Statwerte
  flags:['pierce'],               // Schussverhalten, siehe unten
});
```

Verfügbare `flags`: `triple`, `quad`, `homing`, `pierce`, `spectral`, `bounce`,
`poison`, `burn`, `frost`, `split`, `bigshot`, `needle`, `beam`, `laser`,
`heavyknock`, `crit`, `flight`, `spikeimmun`, `bombimmun`, `keysaver`, `greed`,
`thorns`.

Weitere Felder: `pickup:p=>{}` für einmalige Effekte beim Aufheben (etwa
Herzcontainer), `famil:'shadow'` für einen Begleiter (`shadow`, `orbit`, `bug`,
`rat`, `bird`), sowie `charge` und `use:p=>{}` für aktive Items.

### Neuer Gegner

```js
zornbeisser: { name:'Zornbeißer', hp:14, spd:60, r:11, ai:'chase' },
```

Fertige Verhaltensmuster für `ai`: `chase`, `hop`, `shoot`, `wall`, `charge`,
`creeper`, `spread`, `spray`, `dart`, `turret`, `ghost`, `spawner`, `bounce`,
`ring`, `burrow`. Optional: `fly:true` (ignoriert Bodenhindernisse), `shotCd` in
Sekunden, `onDeath:{split:['typ',anzahl]}` für Splittergegner. Damit der Gegner
auch auftaucht, muss seine ID in den `pool` einer Etage in `FLOORS`.

### Neues Raumlayout

In `TEMPLATES.normal` einen Block aus 7 Zeilen à 13 Zeichen ergänzen:

```
'.'  frei        'R'  Stein        'r'  Stein (50% Chance)
'P'  Loch        'S'  Stacheln     'F'  Feuerstelle
'C'  Kothaufen   'e'  Gegner-Spawnpunkt
```

Die mittleren Felder der Außenkanten bitte frei lassen — das sind die
Türgassen.

### Neue Etage

Einen Eintrag in `FLOORS` ergänzen (Farben des Tilesets, `pool` mit
Gegner-IDs, `bosses`, `mus` als Index der Musikschleife). Die Anzahl der Etagen
ergibt sich automatisch aus der Länge der Tabelle.

---

## Tests

Es gibt einen Smoke-Test, der das Spiel in einem echten Browser durchspielt:

```bash
npm install
npm test                     # alle Phasen
node test/smoketest.js 4,5   # nur einzelne Phasen
```

Geprüft werden unter anderem: Seed-Determinismus, 240 erzeugte Etagen auf
Vollständigkeit und Erreichbarkeit aller Räume, jeder Gegnertyp, jeder Boss
samt Phasenwechsel, jedes Item unter Dauerfeuer, alle Pillen und Karten, das
Durchschreiten offener wie verschlossener Türen in allen vier Richtungen,
jeder Raumtyp, ein kompletter Durchlauf bis zum Sieg, das Zeichnen sämtlicher
Sprites sowie die Bildrate unter Last. Die Zahlen zieht der Test aus den
Datentabellen — neue Inhalte werden also automatisch mitgeprüft.

Zwei Umgebungsvariablen sind optional: `KB_CHROMIUM` setzt einen abweichenden
Browser-Pfad, `KB_SHOTS` das Verzeichnis für die Screenshots.
