#!/usr/bin/env python3
"""
KELLERKIND - Etagengenerator, Referenzimplementierung.

Das ist eine 1:1-Nachbildung des Algorithmus aus
Source/Kellerkind/Level/KKFloorGenerator.cpp in Python. Sie existiert, damit sich
die Generierung ohne Editor pruefen laesst: ueber viele Seeds hinweg wird
kontrolliert, dass jede Etage zusammenhaengt, der Bossraum erreichbar ist, alle
geforderten Sonderraeume Platz finden und Geheimraeume sinnvoll liegen.

Aufruf:
    python3 Tools/simulate_floor.py            # alle Etagen, 500 Seeds
    python3 Tools/simulate_floor.py 2000       # mehr Seeds
    python3 Tools/simulate_floor.py 1 --zeige  # eine Etage ausgeben
"""

import json
import os
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = 13
DIRS = {"N": (0, -1), "O": (1, 0), "S": (0, 1), "W": (-1, 0)}

SYMBOL = {
    "Start": "S", "Boss": "B", "Schatz": "T", "Haendler": "$", "Geheim": "?",
    "SuperGeheim": "!", "SafeRoom": "+", "MiniBoss": "m", "Challenge": "C",
    "Story": "s", "Raetsel": "R", "Event": "E", "Verflucht": "X", "Opfer": "O",
    "Treppe": ">", "Kampf": "#",
}


class Stream:
    """Deterministischer Zufallsstrom, gleiches Verhalten wie FRandomStream."""

    def __init__(self, seed):
        self.state = seed & 0x7FFFFFFF or 1

    def _next(self):
        # Linearer Kongruenzgenerator wie in Unreals FRandomStream.
        self.state = (self.state * 196314165 + 907633515) & 0xFFFFFFFF
        return self.state

    def frand(self):
        return self._next() / 0x100000000

    def rand_range(self, lo, hi):
        return lo + int(self.frand() * (hi - lo + 1)) % max(1, hi - lo + 1)


def inside(coord):
    half = GRID // 2
    return abs(coord[0]) <= half and abs(coord[1]) <= half


def neighbours(coord):
    return [(coord[0] + dx, coord[1] + dy) for dx, dy in DIRS.values()]


def count_neighbours(nodes, coord):
    return sum(1 for n in neighbours(coord) if n in nodes)


def carve(stream, target):
    nodes = {(0, 0): "Start"}
    frontier = [(0, 0)]
    guard = 0

    while len(nodes) < target and guard < 10000:
        guard += 1
        if not frontier:
            frontier = list(nodes.keys())
            if not frontier:
                break

        index = stream.rand_range(0, len(frontier) - 1)
        current = frontier.pop(index)

        for delta in DIRS.values():
            if len(nodes) >= target:
                break
            candidate = (current[0] + delta[0], current[1] + delta[1])
            if not inside(candidate) or candidate in nodes:
                continue
            if count_neighbours(nodes, candidate) > 1:
                continue
            if stream.frand() < 0.42:
                continue
            nodes[candidate] = "Kampf"
            frontier.append(candidate)

    return nodes


def distances(nodes):
    dist = {coord: None for coord in nodes}
    dist[(0, 0)] = 0
    queue = deque([(0, 0)])
    while queue:
        current = queue.popleft()
        for neighbour in neighbours(current):
            if neighbour in nodes and dist[neighbour] is None:
                dist[neighbour] = dist[current] + 1
                queue.append(neighbour)
    return dist


def dead_ends(nodes, dist):
    ends = [c for c in nodes if c != (0, 0) and count_neighbours(nodes, c) == 1]
    ends.sort(key=lambda c: -(dist[c] or 0))
    return ends


def place_specials(nodes, ends, floor, dist):
    order = [
        ("Schatz", floor.get("treasure", 0)),
        ("Haendler", floor.get("shop", 0)),
        ("SafeRoom", floor.get("safe", 0)),
        ("MiniBoss", floor.get("miniBoss", 0)),
        ("Challenge", floor.get("challenge", 0)),
        ("Story", floor.get("story", 0)),
        ("Raetsel", floor.get("puzzle", 0)),
        ("Event", floor.get("event", 0)),
        ("Verflucht", floor.get("cursed", 0)),
        ("Opfer", floor.get("sacrifice", 0)),
    ]

    for room_type, count in order:
        for _ in range(count):
            if ends:
                nodes[ends.pop(0)] = room_type
                continue
            candidates = [c for c, t in nodes.items() if t == "Kampf"]
            if not candidates:
                return False
            best = max(candidates, key=lambda c: dist[c] or 0)
            nodes[best] = room_type

    if floor.get("altPath") and ends:
        nodes[ends.pop(0)] = "Treppe"
    return True


def place_secrets(nodes, floor, boss, stream):
    def find(min_n, max_n, far):
        half = GRID // 2
        candidates = []
        for x in range(-half, half + 1):
            for y in range(-half, half + 1):
                coord = (x, y)
                if coord in nodes:
                    continue
                count = count_neighbours(nodes, coord)
                if not min_n <= count <= max_n:
                    continue
                if any(n in (boss, (0, 0)) for n in neighbours(coord)):
                    continue
                candidates.append(coord)

        if not candidates:
            return False
        if far:
            candidates.sort(key=lambda c: -(abs(c[0]) + abs(c[1])))
            index = 0
        else:
            index = stream.rand_range(0, len(candidates) - 1)
        nodes[candidates[index]] = "Geheim" if min_n >= 3 else "SuperGeheim"
        return True

    ok = True
    for _ in range(floor.get("secret", 0)):
        if not find(3, 4, False):
            ok = find(2, 4, False) and ok
    for _ in range(floor.get("superSecret", 0)):
        ok = find(1, 1, True) and ok
    return ok


def generate(floor, seed):
    stream = Stream(seed)
    target = stream.rand_range(floor["rooms"][0], floor["rooms"][1])

    nodes = carve(stream, target)
    dist = distances(nodes)
    ends = dead_ends(nodes, dist)

    if ends:
        boss = ends.pop(0)
    else:
        boss = max(nodes, key=lambda c: dist[c] or 0)
    nodes[boss] = "Boss"

    place_specials(nodes, ends, floor, dist)
    secrets_ok = place_secrets(nodes, floor, boss, stream)

    return nodes, boss, dist, target, secrets_ok


def render(nodes):
    xs = [c[0] for c in nodes]
    ys = [c[1] for c in nodes]
    lines = []
    for y in range(min(ys), max(ys) + 1):
        line = "".join(SYMBOL.get(nodes.get((x, y)), ".") for x in range(min(xs), max(xs) + 1))
        lines.append(line)
    return "\n".join(lines)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show = "--zeige" in sys.argv
    runs = int(args[0]) if args else 500

    floors = json.load(open(os.path.join(ROOT, "Data", "floors.json"), encoding="utf-8"))["floors"]

    problems = 0
    print(f"Etagengenerator - {runs} Seeds je Etage\n")

    for floor in floors:
        sizes = []
        secret_fails = 0
        missing_types = 0
        combat_shares = []

        for seed in range(1, runs + 1):
            nodes, boss, dist, target, secrets_ok = generate(floor, seed * 7919)

            # Zusammenhang: Der BFS muss jeden begehbaren Raum erreicht haben.
            # Geheimraeume werden nachtraeglich gesetzt und haben deshalb keinen Abstand.
            walkable = {c: t for c, t in nodes.items() if t not in ("Geheim", "SuperGeheim")}
            reachable = distances(walkable)
            if any(reachable[c] is None for c in walkable):
                print(f"  FEHLER {floor['id']} Seed {seed}: Etage nicht zusammenhaengend")
                problems += 1

            if nodes[boss] != "Boss" or reachable.get(boss) is None:
                print(f"  FEHLER {floor['id']} Seed {seed}: Bossraum nicht erreichbar")
                problems += 1

            if reachable.get(boss, 0) < 2:
                print(f"  FEHLER {floor['id']} Seed {seed}: Bossraum grenzt an den Start")
                problems += 1

            for room_type, key in (("Schatz", "treasure"), ("Haendler", "shop"), ("SafeRoom", "safe")):
                wanted = floor.get(key, 0)
                got = sum(1 for t in nodes.values() if t == room_type)
                if got < wanted:
                    missing_types += 1

            if not secrets_ok:
                secret_fails += 1

            sizes.append(len(walkable))
            combat_shares.append(sum(1 for t in walkable.values() if t == "Kampf") / len(walkable))

            if show and seed == 1:
                print(f"  Beispiel {floor['id']} (Seed {seed * 7919}):")
                print("    " + render(nodes).replace("\n", "\n    "))

        avg = sum(sizes) / len(sizes)
        combat = sum(combat_shares) / len(combat_shares)

        # Eine Etage, die fast nur aus Sonderraeumen besteht, verliert ihren Rhythmus:
        # Kampfraeume sind die Strecke zwischen den Hoehepunkten.
        if combat < 0.30:
            print(f"  FEHLER {floor['id']}: nur {combat:.0%} normale Kampfraeume "
                  f"- zu viele Sonderraeume fuer diese Raumzahl")
            problems += 1

        status = "ok" if not missing_types and not secret_fails else "Hinweise"
        print(f"  {floor['id']:<14} Raeume {min(sizes)}-{max(sizes)} (Schnitt {avg:.1f})"
              f"  Kampfraeume {combat:.0%}"
              f"  Sonderraeume fehlend: {missing_types}  Geheimraum ohne Platz: {secret_fails}  [{status}]")

        # Ein Geheimraum, der bei mehr als 5 % der Seeds keinen Platz findet, waere
        # ein echtes Layoutproblem - dann muesste das Gitter oder die Raumzahl angepasst werden.
        if secret_fails > runs * 0.05:
            problems += 1

    print()
    if problems:
        print(f"{problems} Problem(e) gefunden.")
        return 1
    print("Alle Etagen erzeugen zusammenhaengende, vollstaendige Layouts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
