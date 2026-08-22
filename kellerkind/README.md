# KELLERKIND

Cinematic-Horror-Roguelite fuer **Unreal Engine 5.8**.

Leon Keller bekommt ein Paket ohne Absender: ein alter Kellerschluessel, eine
Kinderzeichnung, ein Familienfoto, eine Kassette, eine kleine Spielzeugfigur.
Auf der Rueckseite des Fotos steht: *„Du hast die Tuer offen gelassen."*
Er faehrt zum leerstehenden Haus seiner Familie. Im Keller brennt Licht.

## Was in diesem Verzeichnis liegt

| Ordner | Inhalt |
|---|---|
| `Source/Kellerkind/` | Das komplette Spielmodul in C++ (Kern, Spieler, Items, Kampf, KI, Level, Horror, Systeme, UI) |
| `Data/` | Der Inhaltskatalog als JSON: 225 Items, 45 Synergien, 21 Kreaturen, 8 Bosse, 7 Etagen, 120 Raumvorlagen |
| `Config/` | Engine-, Grafik-, Eingabe- und Gameplay-Tag-Konfiguration |
| `Tools/` | Pruef- und Exportwerkzeuge, die ohne Editor laufen |
| `Docs/` | Design-Bibel, Kunstrichtung, Technikuebersicht, Produktionsplan |

## Werkzeuge

```bash
python3 Tools/validate_content.py      # Inhaltskatalog gegen die Coderegeln pruefen
python3 Tools/simulate_floor.py 500    # Etagengenerator ueber 500 Seeds je Etage pruefen
python3 Tools/simulate_floor.py 1 --zeige   # Beispieletagen als Textbild ausgeben
python3 Tools/export_tags.py           # Gameplay-Tags aus dem Katalog neu erzeugen
```

Im Editor:

```
UnrealEditor-Cmd Kellerkind.uproject -run=KKContentImport
```

erzeugt aus `Data/*.json` die Data Assets unter `/Game/Kellerkind/Data`.

## Stand

Vollstaendig vorhanden: Spielsysteme in C++ und der gesamte Inhaltskatalog als Daten.
Noch nicht vorhanden: Kunst (Meshes, Texturen, Animationen, Audio) und die gebauten
Raumlevel. Was dafuer zu tun ist, steht in `Docs/04_Produktionsplan.md`.
