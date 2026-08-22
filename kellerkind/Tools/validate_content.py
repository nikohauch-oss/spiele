#!/usr/bin/env python3
"""
KELLERKIND - Inhaltspruefung.

Prueft die Datendateien unter Data/ gegen die Regeln, die der Code voraussetzt.
Der Generator und die Registry gehen davon aus, dass IDs eindeutig sind, dass
Verweise aufloesbar sind und dass fuer jede geforderte Raumart auf jeder Etage
mindestens eine passende Raumvorlage existiert. Genau das wird hier geprueft.

Aufruf:  python3 Tools/validate_content.py
Rueckgabe: 0 = alles in Ordnung, 1 = Fehler gefunden.
"""

import glob
import json
import os
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Data")

STATS = {"Damage", "AttackSpeed", "MoveSpeed", "Range", "CritChance",
         "Luck", "Armor", "MaxHP", "Dodge", "InteractionSpeed"}
CATEGORIES = {"Passiv", "Aktiv", "Begleiter", "Orbital", "Waffe",
              "Verflucht", "Relikt", "Verbrauch", "Quest"}
POOLS = {"Schatzraum", "Laden", "Bossbelohnung", "Teufelspakt", "Engelsraum",
         "Geheimraum", "Opferraum", "Challenge", "Kellerkind", "Start", "Verfluchter Raum"}
ELEMENTS = {"Physisch", "Feuer", "Elektro", "Blut", "Gift", "Frost", "Schatten", "Psyche"}
ROOM_TYPES = {"Start", "Kampf", "Schatz", "Haendler", "Geheim", "SuperGeheim", "Raetsel",
              "Story", "SafeRoom", "Challenge", "MiniBoss", "Verflucht", "Opfer", "Event",
              "Boss", "Treppe"}
TACTICS = {"Direkt", "Hinterhalt", "Decke", "Rudel", "Schwarm", "Fernkampf", "Wand",
           "Schacht", "Dieb", "Beobachter", "Blind", "Waechter", "Bruthelfer", "Schatten"}

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load(name):
    path = os.path.join(DATA, name)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load_items():
    items = []
    for path in sorted(glob.glob(os.path.join(DATA, "items_*.json"))):
        items.extend(load(os.path.basename(path))["items"])
    return items


def check_items(items):
    ids = Counter(i["id"] for i in items)
    for item_id, count in ids.items():
        if count > 1:
            fail(f"Item-ID mehrfach vergeben: {item_id} ({count}x)")
        if not item_id.replace("_", "").isalnum():
            fail(f"Item-ID ist kein gueltiger Bezeichner: {item_id!r}")

    for item in items:
        ref = item["id"]
        if item["category"] not in CATEGORIES:
            fail(f"{ref}: unbekannte Kategorie {item['category']!r}")
        if not 0 <= item.get("quality", 0) <= 4:
            fail(f"{ref}: Qualitaet ausserhalb 0-4")
        for pool in item.get("pools", []):
            if pool not in POOLS:
                fail(f"{ref}: unbekannter Pool {pool!r}")
        if item.get("element", "Physisch") not in ELEMENTS:
            fail(f"{ref}: unbekanntes Element {item['element']!r}")
        for mod in item.get("stats", []):
            if mod["stat"] not in STATS:
                fail(f"{ref}: unbekannter Stat {mod['stat']!r}")
            if "add" not in mod and "mul" not in mod:
                fail(f"{ref}: Stat-Modifikator ohne Wirkung")
        if not item.get("desc"):
            fail(f"{ref}: keine Beschreibung")

        # Ein Item ohne Pool kann nie gezogen werden. Das ist nur fuer
        # Verbrauchsgegenstaende und Startausruestung in Ordnung.
        if not item.get("pools") and item["category"] not in {"Verbrauch", "Quest"}:
            warn(f"{ref}: in keinem Pool - kann im Run nicht gefunden werden")

    return {i["id"] for i in items}


def check_synergies(synergies, item_ids, item_tags):
    # Synergien koennen selbst Tags vergeben; darauf duerfen andere Synergien aufbauen.
    available = set(item_tags) | {s["grants"] for s in synergies if s.get("grants")}
    seen = set()
    for syn in synergies:
        ref = syn["id"]
        if ref in seen:
            fail(f"Synergie-ID mehrfach vergeben: {ref}")
        seen.add(ref)

        if not syn.get("tags") and not syn.get("items"):
            fail(f"Synergie {ref}: ohne Bedingung - waere immer aktiv")

        for tag in syn.get("tags", []):
            if tag not in available:
                fail(f"Synergie {ref}: Tag {tag!r} kommt an keinem Item vor")

        for needed in syn.get("items", []):
            if needed not in item_ids:
                fail(f"Synergie {ref}: verweist auf unbekanntes Item {needed!r}")


def check_creatures(creatures, floor_ids):
    ids = {c["id"] for c in creatures}
    for creature in creatures:
        ref = creature["id"]
        if creature["tactic"] not in TACTICS:
            fail(f"Kreatur {ref}: unbekannte Taktik {creature['tactic']!r}")
        for floor in creature["floors"]:
            if floor not in floor_ids:
                fail(f"Kreatur {ref}: unbekannte Etage {floor!r}")
        brood = creature.get("spawnOnDeath")
        if brood and brood["id"] not in ids:
            fail(f"Kreatur {ref}: spawnOnDeath verweist auf unbekannte Kreatur {brood['id']!r}")
        if creature["sightWeight"] == 0 and creature["hearingWeight"] <= 0:
            fail(f"Kreatur {ref}: weder Sicht noch Gehoer - kann den Spieler nie finden")
        if not creature.get("sounds"):
            fail(f"Kreatur {ref}: keine eigenen Geraeusche beschrieben (Designregel 52)")
        if not creature.get("silhouette"):
            fail(f"Kreatur {ref}: keine eigene Silhouette beschrieben (Designregel 52)")
    return ids


def check_bosses(bosses, floor_ids):
    for boss in bosses:
        ref = boss["id"]
        if boss["floor"] not in floor_ids:
            fail(f"Boss {ref}: unbekannte Etage {boss['floor']!r}")

        phases = boss["phasen"]
        if len(phases) < 2:
            fail(f"Boss {ref}: braucht mehrere Phasen (Designregel 53)")
        if abs(phases[0]["schwelle"] - 1.0) > 1e-6:
            fail(f"Boss {ref}: erste Phase muss bei Schwelle 1.0 beginnen")
        for a, b in zip(phases, phases[1:]):
            if b["schwelle"] >= a["schwelle"]:
                fail(f"Boss {ref}: Phasenschwellen muessen fallen ({a['id']} -> {b['id']})")

        if not boss.get("schwachstellen"):
            fail(f"Boss {ref}: keine Schwachstellen (Designregel 53)")
        if len(boss["angriffe"]) < 4:
            fail(f"Boss {ref}: zu wenige Angriffe fuer einen Kampf ueber mehrere Phasen")

        for attack in boss["angriffe"]:
            if attack["telegraph"] < 0.35:
                fail(f"Boss {ref}, Angriff {attack['id']}: Ankuendigung unter 0,35 s ist nicht lesbar")
            if attack["minRange"] >= attack["maxRange"]:
                fail(f"Boss {ref}, Angriff {attack['id']}: leeres Reichweitenfenster")
            for phase in attack.get("phasen", []):
                if phase >= len(phases):
                    fail(f"Boss {ref}, Angriff {attack['id']}: Phase {phase} existiert nicht")


def check_rooms(rooms, floors):
    ids = set()
    by_floor_type = defaultdict(list)

    for room in rooms:
        ref = room["id"]
        if ref in ids:
            fail(f"Raum-ID mehrfach vergeben: {ref}")
        ids.add(ref)

        if room["type"] not in ROOM_TYPES:
            fail(f"Raum {ref}: unbekannte Raumart {room['type']!r}")
        if not 0 <= room["doors"] <= 15:
            fail(f"Raum {ref}: Tuermaske ausserhalb 0-15")
        if room["doors"] == 0:
            fail(f"Raum {ref}: keine Tueren - waere unerreichbar")

        for floor in room["floors"]:
            by_floor_type[(floor, room["type"])].append(room)

    # Der Generator braucht auf jeder Etage fuer jede geforderte Raumart mindestens
    # eine Vorlage - und mindestens eine, die jede Tuerkombination bedienen kann.
    demand = {
        "Schatz": "treasure", "Haendler": "shop", "Geheim": "secret",
        "SuperGeheim": "superSecret", "MiniBoss": "miniBoss", "Challenge": "challenge",
        "SafeRoom": "safe", "Story": "story", "Raetsel": "puzzle", "Event": "event",
        "Verflucht": "cursed", "Opfer": "sacrifice",
    }

    for floor in floors:
        floor_id = floor["id"]
        needed = ["Start", "Kampf", "Boss"] + [t for t, key in demand.items() if floor.get(key, 0) > 0]

        for room_type in needed:
            candidates = by_floor_type.get((floor_id, room_type), [])
            if not candidates:
                fail(f"Etage {floor_id}: keine Raumvorlage fuer Typ {room_type}")
                continue
            # Ein Raum mit Maske 15 passt an jede Stelle. Fehlt so einer, kann die
            # Generierung an ungluecklichen Tuerkombinationen scheitern.
            if room_type in {"Kampf", "Boss", "Start"} and not any(r["doors"] == 15 for r in candidates):
                warn(f"Etage {floor_id}, Typ {room_type}: keine Vorlage mit allen vier Tueren")


def check_floors(floors, boss_ids):
    ids = []
    for floor in floors:
        ref = floor["id"]
        ids.append(ref)
        if floor["boss"] not in boss_ids:
            fail(f"Etage {ref}: unbekannter Boss {floor['boss']!r}")
        if floor.get("secretBoss") and floor["secretBoss"] not in boss_ids:
            fail(f"Etage {ref}: unbekannter Geheimboss {floor['secretBoss']!r}")
        low, high = floor["rooms"]
        if low > high or low < 6:
            fail(f"Etage {ref}: unplausible Raumzahl {floor['rooms']}")
        if floor.get("altPath") and floor.get("altTarget") not in [f["id"] for f in floors]:
            fail(f"Etage {ref}: alternativer Weg zeigt auf unbekannte Etage")
    return set(ids)


def check_meta(meta, item_ids, room_ids, boss_ids):
    known = item_ids | room_ids | boss_ids | {c["id"] for c in meta["characters"]} | {"NewGamePlus"}
    known |= {f"{f}_Alt" for f in ("Fleischtiefe", "Abgrund", "Kinderreich", "Nest", "Siedlung", "Versorgung")}

    for unlock in meta["unlocks"]:
        if unlock["id"] not in known:
            fail(f"Freischaltung {unlock['id']!r} verweist auf nichts Bekanntes")
        if unlock["schwelle"] <= 0:
            fail(f"Freischaltung {unlock['id']}: Schwelle muss positiv sein")

    for character in meta["characters"]:
        for stat in character["stats"]:
            if stat not in STATS:
                fail(f"Charakter {character['id']}: unbekannter Stat {stat!r}")
        weapon = character.get("startWeapon")
        if weapon and weapon not in item_ids:
            fail(f"Charakter {character['id']}: unbekannte Startwaffe {weapon!r}")

    # Die wichtigste Designregel: Jumpscares bleiben die Ausnahme.
    jumpscares = [e for e in meta["horrorEvents"] if e["jumpscare"]]
    quota = len(jumpscares) / len(meta["horrorEvents"])
    if quota > 0.25:
        fail(f"Zu viele Jumpscare-Ereignisse: {quota:.0%} der Ereignisbibliothek")

    if len(meta["endings"]) < 5:
        fail("Es braucht mindestens fuenf Enden plus geheimes Ende")


def main():
    items = load_items()
    item_ids = check_items(items)
    item_tags = {tag for item in items for tag in item.get("tags", [])}

    floors_data = load("floors.json")["floors"]
    bosses = load("bosses.json")["bosses"]
    boss_ids = {b["id"] for b in bosses}

    floor_ids = check_floors(floors_data, boss_ids)
    check_bosses(bosses, floor_ids)
    check_synergies(load("synergies.json")["synergies"], item_ids, item_tags)
    check_creatures(load("creatures.json")["creatures"], floor_ids)

    rooms = load("rooms.json")["rooms"]
    check_rooms(rooms, floors_data)

    meta = load("meta.json")
    check_meta(meta, item_ids, {r["id"] for r in rooms}, boss_ids)

    # --- Bericht ---
    by_category = Counter(i["category"] for i in items)
    print("KELLERKIND - Inhaltsuebersicht")
    print(f"  Items gesamt: {len(items)}")
    for category, count in sorted(by_category.items(), key=lambda kv: -kv[1]):
        print(f"    {category:<12} {count}")
    print(f"  Synergien:    {len(load('synergies.json')['synergies'])}")
    print(f"  Kreaturen:    {len(load('creatures.json')['creatures'])}")
    print(f"  Bosse:        {len(bosses)}")
    print(f"  Etagen:       {len(floors_data)}")
    print(f"  Raumvorlagen: {len(rooms)}")
    print(f"  Item-Tags:    {len(item_tags)}")

    if warnings:
        print(f"\n{len(warnings)} Hinweis(e):")
        for message in warnings:
            print(f"  - {message}")

    if errors:
        print(f"\n{len(errors)} FEHLER:")
        for message in errors:
            print(f"  - {message}")
        return 1

    print("\nAlle Pruefungen bestanden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
