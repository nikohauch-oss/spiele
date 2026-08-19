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

**Schatzräume und Shops.** Shoptüren sind immer verschlossen. Schatzräume
dagegen nur etwa zur Hälfte — die anderen stehen offen, damit man nie ganz
ohne Item dasteht, bloß weil kein Schlüssel gefallen ist. Vor einer
verschlossenen Tür genügt ein Schlüssel im Gepäck: sie springt von selbst auf
und ein Schlüssel wird verbraucht. Hat man keinen, ertönt nur ein Fehlton.
Schlüssel fallen aus geräumten Räumen, Steinen, Kothaufen und Truhen, kosten
im Shop 5 Münzen, und es gibt sie über die Pille *Schlüsselglück* (+2) und den
*Dietrichfinger* (+3, spart Schlüssel manchmal ganz ein). Die Karte
*Die Pforte* öffnet alle Türen im Raum ohne Schlüssel.

**Teufels- und Engelsraum.** Hinter jedem Bossraum liegt eine Kammer, die
erst der erlegte Boss aufschließt. Wer die Etage **ohne einen einzigen
Treffer** übersteht, bekommt sie sicher — sonst entscheidet der Zufall
(etwa jedes vierte Mal). Vorher ist sie weder sichtbar noch auf der Karte.

Der **Teufel** legt zwei Items aus, bezahlt wird nicht mit Münzen, sondern
mit einem **Herzcontainer** je Item; wer keinen entbehren kann, zahlt
ersatzweise mit drei Seelen- oder schwarzen Herzen. Reicht beides nicht,
bleibt das Angebot einfach stehen — daran stirbt niemand. Seine Ware ist roh
stärker: *Blutpakt*, *Hornhaut*, *Schlangenzunge*, *Pechschwinge*,
*Schwarze Galle*.

Der **Engel** schenkt: ein Item umsonst und zwei Seelenherzen. Dafür zeigt er
sich nur, solange man noch **keinen Handel mit dem Teufel** geschlossen hat.
Wer einmal mit Herzen bezahlt hat, sieht ihn den ganzen Durchlauf nicht
wieder — das ist die eigentliche Entscheidung eines Runs. Seine Ware schützt
statt zu wüten: *Federkleid*, *Taufwasser*, *Richtstrahl*, *Schutzfeder*.

Man erkennt die Türen sofort: die Teufelstür ist blutrot mit zwei Hörnern und
einem glühenden Auge im Sturz, die Engelstür hell mit Flügeln und
Heiligenschein. Auf der Automap stehen dafür kleine Hörner und ein Ring.

**Zwanzig benannte Grundrisse.** Jeder Normalraum kommt aus einem von zwanzig
Plänen mit eigenem Einfall: der *Kreuzgang* teilt den Raum in vier Viertel, die
*Säulenhalle* schluckt jeden weiten Schuss, die *Brücke* lässt nur einen
schmalen Steg über ein Loch, das *Schneckenhaus* dreht sich als Spirale nach
innen, der *Altar* liegt als Insel hinter Löchern und einem Stachelring. Man
erkennt Räume dadurch wieder, statt immer dasselbe Gestrüpp zu sehen. In jedem
Plan sind alle vier Türgassen begehbar und miteinander verbunden — auch dann,
wenn jeder Zufallsstein wirklich steht.

**Jede Etage hat ihre eigene Handschrift.** Nicht nur die Bodenfarbe ändert
sich, sondern das Material, aus dem alles gemacht ist. Im *Feuchten Keller*
sind es nasse Feldsteine, Pfützen und Moos in den Fugen, von der Decke tropft
es. Die *Pilzgrotte* wächst aus jeder Fuge, die Feuerstellen brennen grün und
Sporen steigen auf. Der *Knochengang* ist ein Beinhaus: Schädel im Boden,
Rippenbögen, eingemauerte Schädel in den Wänden, kalter Zug quer durch den
Raum. Im *Giftschlund* sind die Steine violette Kristalle, die Lauge frisst
Flecken in den Boden und läuft die Wände herunter. Die *Blutkammer* ist
Fleisch: Adern unter dem Boden, Schleifspuren, und der ganze Raum schlägt wie
ein Herz. In der *Wurzel des Kellers* brechen Wurzeln durch den Boden und
blasse Lichter treiben durch die Dunkelheit.

**Scharfes Bild.** Gerechnet und gezeichnet wird in 640×360, aber die
Leinwand bekommt so viele echte Bildpunkte, wie der Bildschirm an dieser
Stelle hergibt (`leinwandAnpassen()`, Faktor `SKALA`, bis zu vierfach). Auf
Full HD entsteht dadurch ein 1280×720- statt eines hochskalierten
640×360-Bildes — nichts wird mehr weichgezogen. Die Grundtransformation des
Kontexts trägt den Faktor, im ganzen Spielcode wird weiterhin in 640×360
gerechnet. Ändert sich die Fenstergröße, wird der vorgebackene
Raumhintergrund verworfen und in der neuen Auflösung neu gezeichnet.

**Licht und Tiefe.** Das Licht kommt von oben links: eine Deckenlampe hellt die
Raummitte auf, die Wände werfen Schatten auf den Boden (oben am tiefsten, unten
am flachsten), jedes Hindernis wirft einen Schlagschatten, Löcher bekommen
helle und dunkle Innenkanten, Feuerstellen leuchten flackernd den Boden aus,
und eine Vignette drückt die Dunkelheit von den Rändern herein. Der ruhende
Teil davon wird beim Betreten eines Raums einmal auf zwei Nebenleinwände
gezeichnet und danach nur noch kopiert — sonst wäre das mit Schraffur und
Handkontur nicht bei 60 Bildern die Sekunde zu halten.

**Türen.** Steinrahmen in leichter Aufsichtsperspektive mit zwei Türblättern,
die aufschwingen, sobald alle Gegner im Raum tot sind. Jede Türart ist auf
einen Blick erkennbar: die **Schatztür golden** (mit Vorhängeschloss, wenn sie
verschlossen ist, sonst einfach offen), die **Ladentür kupfern mit einer
Münze im Sturz**, die Bosstür mit Schädel im Sturz und rotem Schein aus dem
Spalt, die Fluchtür dunkelrot mit Zähnen im Durchgang, der Geheimgang als
aufgesprengter Mauerriss mit Schutt. Schatz und Laden trägt man so schon vom
Nachbarraum aus auseinander. Gezeichnet wird immer in lokalen Koordinaten, die Wandseite ergibt
sich allein aus der Drehung (`DOOR_ROT`) — eine neue Türart braucht daher nur
einen Eintrag in `doorStyle()` und einen Verzierungsblock in `drawDoor()`.

**Seeds.** Gleicher Seed erzeugt garantiert dieselben Etagen — in der
Charakterauswahl mit `S` eingebbar. Der Seed steht während des Spiels unten
rechts.

**Jede Etage hat eigene Gegner.** Drei Kennzeichen-Arten je Etage, die es
nirgendwo sonst gibt und die aus dem Material der Etage gemacht sind: im
*Knochengang* Klapperer, Schädelroller und Rippenwächter, im *Giftschlund*
Säureblase, Laugenkriecher und Giftsprüher, in der *Blutkammer* Blutegel,
Aderngeist und Herzklopfer. Wer im Eintrag ein Feld `etage` trägt, gehört
ausschließlich in diesen Pool — der Smoke-Test prüft das über alle Etagen und
Seeds nach.

**Inhalte.** 61 Items (passiv und aktiv), 52 Gegnertypen mit Champion-Varianten,
7 Bosse mit mehreren Angriffsmustern und Phasenwechsel, 10 Pillen, 8 Karten,
9 Charaktere (acht davon freischaltbar).

**Alles ist in Tusche gezeichnet.** Die Welt wird wie mit der Feder gesetzt:
leicht unrunde Pfade, dunkle Kontur mit schwankender Strichstärke, Schraffur
statt Verlauf. Die Linien werden siebenmal je Sekunde neu gezogen, wie eine
auf Dreier animierte Zeichnung. Das HUD bleibt ausgenommen — Zahlen und
Herzen sollen ruhig stehen, deshalb schaltet `drawHUD()` den Stil ab
(`tuscheAn`). Auch der Boden zeichnet ohne Kontur, sonst ergäbe jede Kachel
ein Gitter, das alles andere erschlägt. Die ruhende Kulisse — Steine, Stacheln,
Wucherungen, Löcher, Wände — wird vorgebacken und zittert deshalb nicht mit;
Feuer, Wände-Bewuchs und alles Lebende schon.

**Zwölf Kreaturen mit eigenem Haken.** Der *Talgwicht* wird gefährlicher,
wenn man ihn trifft: Erlischt seine Flamme, rennt er blind und doppelt so
schnell weiter. Der *Spinnwirt* fällt von der Decke und legt ein Netz, das
auf ein Drittel Tempo bremst. Das *Glockenmaul* schlägt an und wirft einen
mit einer Ringwelle zurück. Der *Schlundling* frisst deine Beute und trägt
sie zur nächsten Tür hinaus. Der *Aschgeist* sammelt sich nach dem Tod wieder
— außer er brennt oder ist vereist. Der *Sporenwirt* presst bei jedem Treffer
eine Wolke aus, die die Sicht nimmt. Das *Klingenrad* umrundet den Raum und
legt pro Runde zu. Der *Zwiebelbalg* schält sich über drei Stufen zu einem
kleinen, schnellen Kern. Der *Laternenfisch* zieht dich heran, bis seine
Lampe erlischt. Der *Kettenhund* bewacht einen festen Kreis. Das
*Schimmelherz* heilt alle anderen und schlägt schneller, je weniger noch
stehen. Der *Steinrücken* ist von vorn immun und muss umlaufen werden.

**Jeder Boss lohnt sich.** Neben dem Item auf dem Podest lässt jeder Boss
etwas Dauerhaftes liegen: entweder einen **Herzcontainer** (ein Herz mehr,
dazu volle Heilung) oder einen **Schadensbonus**, der den ganzen Lauf über
bleibt. Welches von beidem, entscheidet der Zufall zur Hälfte. Ein Bosskampf
ist damit immer spürbar wert, auch wenn das Podest-Item nicht zum Aufbau
passt.

**Zwölf Herzen sind die Grenze.** Mehr rote Container gibt es nicht — weder
über Bosslohn noch über *Herzwurz* oder *Eisenherz*. Wer schon bei zwölf
steht, bekommt vom Boss statt des Containers den Schadensbonus, damit die
Belohnung nicht verpufft. Seelen- und schwarze Herzen zählen nicht mit, die
kommen oben drauf.

**Kothaufen** sind mehr als Deko: Wer einen aufbricht, findet manchmal Beute —
manchmal krabbelt aber auch ein **Kotkrabbler** heraus, und die Chance darauf
steigt mit jeder Etage. Der **Kotspritzer** lobt Klumpen im Bogen, die als
ätzende Pfütze zerplatzen. Beide gehören zum **Kloakenfürsten**, einem Boss,
der auf den Spieler springt (bei der Landung spritzt ein Ring aus Klumpen weg),
Klumpenregen wirft und ab der Hälfte seiner Lebenspunkte quer durch den Raum
rutscht, dabei eine Spur hinterlässt und Diener aus dem Dreck ruft.

**Gegner lassen auch Items fallen.** Neben Münzen, Herzen, Schlüsseln und
Bomben fällt selten ein richtiges Item aus einem erlegten Gegner: bei
gewöhnlichen Gegnern in gut einem von hundert Fällen, bei **Champions** rund
neunmal so oft — es lohnt sich also, sie zu jagen statt zu umgehen. Glück
(*Luck*) erhöht beides. Das Item liegt leuchtend am Boden und wird beim
Darüberlaufen aufgenommen; es kommt aus demselben Topf wie die Schatzräume,
man findet also nichts doppelt. Hatte man schon ein Aktivitem, legt man das
alte daneben ab, statt es zu verlieren.

**Die Figuren** haben Isaac-Proportionen: großer runder Kopf auf kleinem
Körper, Beine treten im Laufen abwechselnd, die Pupillen folgen der
Schussrichtung, gelegentlich wird geblinzelt, bei Schaden reißt der Mund auf.
Frisur und Zierrat unterscheiden sie — Lumo trägt eine Kapuze, Flink
Stachelhaar, Brocken Zotteln mit wippenden Büscheln, Schemen schwebt als
Geist mit Schleier und Schweif statt Beinen. Gezeichnet werden alle von
derselben Funktion `zeichneCharakter()`, die auch die Charakterauswahl
benutzt; eine neue Frisur braucht nur einen Zweig in `zeichneFrisur()` und
das Feld `frisur` im Charaktereintrag, ein Gesichtsstück einen Zweig in
`zeichneZier()` und das Feld `zier`.

**Fünf Kellerkinder** kamen dazu, und jedes bringt eine eigene Regel mit —
nicht bloß andere Zahlen:

| Figur | Eigenheit | Freischaltung |
|---|---|---|
| **Der Schrauber** | Blechfaust und Schweißerbrille. Eigene Bomben tun ihm nichts, er startet mit vier davon, fünf Münzen und dem Bombenvogel. | Erreiche Etage 4 |
| **Die Rosenbraut** | Trägt ein Brett vor der Gesichtshälfte und eine Dornenkrone. **Vor ihr geht jedes Schloss ohne Schlüssel auf** — dafür ist sie zart (2 Herzen) und schlägt hart zu. | Schließe einen Handel mit dem Teufel |
| **Das Laternenkind** | Kapuze mit Hörnern, grüne Laterne in der Hand. **Kennt jede Etage sofort** (Geheimräume ausgenommen) und schießt durch Wände. | Finde einen Geheimraum |
| **Das Mooskind** | Moospelz mit leuchtenden Pilzen. Vergiftet mit jedem Schuss und **heilt ein halbes Herz je geräumtem Raum** — nie über die eigenen Container hinaus. | Erlege insgesamt 500 Gegner |
| **Die Flickenpuppe** | Knopfaugen, Nahtmund, bunte Wollsträhnen. **Steht einmal je Lauf wieder auf**, mit einem halben Herzen und kurzer Unverwundbarkeit. | Stirb zehnmal |

Die Sonderregeln hängen an Fahnen im Charaktereintrag (`tuerkind`, `laterne`,
`moos`, `flicken`), die beim Start in `p.flags` wandern — genau wie
Item-Fahnen. Eine neue Figur mit eigener Regel braucht also nur einen Eintrag
in `CHARS` und eine Stelle im Code, die ihre Fahne abfragt.

**Neun Begleiter** kämpfen mit, jeder auf eigene Art: der *Schattengeselle*
schießt im Takt mit dir, der *Kreiselgeist* kreist und blockt, der
*Brummkäfer* vergiftet im Vorbeikrabbeln, die *Sammelratte* zieht Beute
heran, der *Bombenvogel* spuckt explosive Kugeln, der *Frostgeist* vereist
den nächsten Gegner, die *Glutmotte* lässt brennende Glut fallen, der
*Panzerling* stellt sich in Blickrichtung vor dich und fängt gegnerische
Geschosse ab, und das *Späherauge* jagt selbstständig Gegner mit
durchschlagenden Schüssen.

**Was ein Item tut, steht dabei.** An drei Stellen:

- **Am Podest**, sobald man nahe genug steht — Name, Wirkung und Preis, im
  Laden in Münzen, in der Teufelskammer in Herzcontainern. Gerade dort will
  man das wissen, *bevor* man zugreift. Dasselbe gilt für Items, die ein
  Gegner hat fallen lassen.
- **Im Pausenbildschirm** als Liste mit Namen und Wirkung, sieben je Seite,
  geblättert mit ◄ ►. Das Aktivitem steht oben und ist mit `[Q]` markiert,
  die Pille oder Karte in der Tasche darunter. Bei zwanzig Fundstücken sagen
  einem bloße Symbole nichts mehr.
- **Im Post-Run-Screen** stehen unter den Symbolen alle Namen des Laufs.

Beim Aufheben zeigt ohnehin ein Banner Namen und Wirkung.

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
`rat`, `bird`, `frostgeist`, `motte`, `panzer`, `spaeher`), sowie `charge` und
`use:p=>{}` für aktive Items.

### Neuer Gegner

```js
zornbeisser: { name:'Zornbeißer', hp:14, spd:60, r:11, ai:'chase' },
```

Fertige Verhaltensmuster für `ai`: `chase`, `hop`, `shoot`, `wall`, `charge`,
`creeper`, `spread`, `spray`, `dart`, `turret`, `ghost`, `spawner`, `bounce`,
`ring`, `burrow`, `talg`, `decke`, `glocke`, `dieb`, `asche`, `sporen`,
`wandlauf`, `laterne`, `kette`, `heiler`, `panzer`. Optional: `fly:true` (ignoriert Bodenhindernisse), `shotCd` in
Sekunden, `onDeath:{split:['typ',anzahl]}` für Splittergegner. Damit der Gegner
auch auftaucht, muss seine ID in den `pool` einer Etage in `FLOORS`.

### Neues Raumlayout

In `TEMPLATES.normal` einen Block aus 7 Zeilen à 13 Zeichen ergänzen:

```
'.'  frei        'R'  Stein        'r'  Stein (50% Chance)
'P'  Loch        'S'  Stacheln     'F'  Feuerstelle
'C'  Kothaufen   'e'  Gegner-Spawnpunkt
```

Die vier Türfelder — Zeile 0 und 6 in Spalte 6, Zeile 3 in Spalte 0 und 12 —
müssen begehbar bleiben **und untereinander verbunden sein**, sonst sperrt man
sich im Raum ein. Auch jeder Gegnerplatz muss von den Türen aus erreichbar
sein, sonst lässt sich der Raum nie leerräumen und die Türen gehen nicht auf.
Testphase 14 prüft beides für jedes Layout durch, im ungünstigsten Fall, in
dem jedes `r` zum Stein wird.

### Neue Spielfigur

Einen Eintrag in `CHARS` ergänzen. Pflichtfelder: `id`, `name`, `desc`,
`color` (Haut), `hood` (Kleidung), `frisur`, die Startwerte (`red`, `soul`,
`speed`, `tps`, `dmg`, `range`, `shot`, `luck`, `coins`, `bombs`, `keys`)
sowie `unlock` und `unlockText`, wenn sie freigeschaltet werden muss.

Optional: `zier` für ein Gesichts- oder Handstück (`zeichneZier()`), `item`
für ein Startitem, `pocket` für Pille oder Karte in der Tasche, und `flags`
für angeborene Fahnen. Eine Fahne wird beim Start in `p.flags` gelegt und
kann überall abgefragt werden — so hängen `tuerkind`, `laterne`, `moos` und
`flicken` an genau einer Stelle im Code.

### Neue Etage

Zwei Einträge: einen in `FLOORS` (Farben des Tilesets, `pool` mit Gegner-IDs,
`bosses`, `mus` als Index der Musikschleife) und einen in `HANDSCHRIFTEN`
(siehe Abschnitt 10 im Code). Die Anzahl der Etagen ergibt sich automatisch aus
der Länge von `FLOORS`.

Die Handschrift bestimmt, **woraus** die Etage gemacht ist:

```js
{ licht:'rgba(230,186,120,0.16)',   // Farbe der Deckenlampe
  tiefe:'#0b0806',                  // Farbe im Loch und hinter allem
  feuerschein:'rgba(232,134,42,0.38)',
  bodenDeko(x,y,s,k){ … },          // liegt flach IM Boden, ohne Kontur
  wandDeko(ox,oy,bw,bh,rand,t){ … },// darf sich bewegen
  dunst(x,y,w,h,t){ … },            // Raumstimmung über allem
  stein(x,y,s){ … }, loch(x,y,s){ … }, stachel(x,y,s){ … },
  feuer(x,y,s,rot,t){ … }, wuchs(x,y,s){ … } }
```

Fehlt der Eintrag, erbt die Etage die letzte vorhandene Handschrift.

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
jeder Raumtyp, ein kompletter Durchlauf bis zum Sieg, die Kennzeichnung der
Sondertüren (Laden immer verschlossen, Schatz gemischt offen und verschlossen),
der Item-Abwurf der Gegner, die Kammer hinter dem Boss samt Herzhandel, die
Eigenheiten aller neun Spielfiguren, dass jedes Item eine Wirkungs-
beschreibung hat, die auch auf die Tafel passt, die echte Bildauflösung, den
Bosslohn und die Zwölf-Herzen-Grenze, die
Spielbarkeit aller zwanzig Grundrisse, die
Vollständigkeit der sechs Etagen-Handschriften samt Nachweis, dass jede Etage
wirklich anders aussieht, das Zeichnen sämtlicher Sprites sowie die Bildrate
unter Last. Die Zahlen zieht der Test aus den
Datentabellen — neue Inhalte werden also automatisch mitgeprüft.

Zwei Umgebungsvariablen sind optional: `KB_CHROMIUM` setzt einen abweichenden
Browser-Pfad, `KB_SHOTS` das Verzeichnis für die Screenshots.
