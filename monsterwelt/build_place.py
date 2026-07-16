#!/usr/bin/env python3
"""Baut Monsterwelt.rbxlx aus den Quelldateien in src/.

Die .rbxlx-Datei kann direkt in Roblox Studio geoeffnet werden
(Datei -> Open from File). Aufruf:  python3 build_place.py
"""

import pathlib
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "Monsterwelt.rbxlx"

# (Klasse, Name, Quelldatei)
SHARED = [
    ("ModuleScript", "GameData", "shared/GameData.luau"),
    ("ModuleScript", "MonsterFactory", "shared/MonsterFactory.luau"),
    ("ModuleScript", "Remotes", "shared/Remotes.luau"),
]
SERVER = [
    ("Script", "Main", "server/Main.server.luau"),
    ("ModuleScript", "PlayerData", "server/PlayerData.luau"),
    ("ModuleScript", "WorldBuilder", "server/WorldBuilder.luau"),
    ("ModuleScript", "CompanionService", "server/CompanionService.luau"),
    ("ModuleScript", "BattleService", "server/BattleService.luau"),
    ("ModuleScript", "RoamService", "server/RoamService.luau"),
    ("ModuleScript", "TrainerService", "server/TrainerService.luau"),
    ("ModuleScript", "FarmService", "server/FarmService.luau"),
]
CLIENT = [
    ("LocalScript", "Main", "client/Main.client.luau"),
    ("ModuleScript", "UiKit", "client/UiKit.luau"),
    ("ModuleScript", "HudUi", "client/HudUi.luau"),
    ("ModuleScript", "MenuUi", "client/MenuUi.luau"),
    ("ModuleScript", "BattleUi", "client/BattleUi.luau"),
]

_ref = 0


def next_ref() -> str:
    global _ref
    _ref += 1
    return f"RBX{_ref}"


def script_item(cls: str, name: str, rel_path: str, indent: int) -> str:
    source = (SRC / rel_path).read_text(encoding="utf-8")
    pad = "\t" * indent
    return (
        f'{pad}<Item class="{cls}" referent="{next_ref()}">\n'
        f"{pad}\t<Properties>\n"
        f'{pad}\t\t<string name="Name">{escape(name)}</string>\n'
        f'{pad}\t\t<ProtectedString name="Source">{escape(source)}</ProtectedString>\n'
        f"{pad}\t</Properties>\n"
        f"{pad}</Item>\n"
    )


def folder_item(name: str, children: str, indent: int) -> str:
    pad = "\t" * indent
    return (
        f'{pad}<Item class="Folder" referent="{next_ref()}">\n'
        f"{pad}\t<Properties>\n"
        f'{pad}\t\t<string name="Name">{escape(name)}</string>\n'
        f"{pad}\t</Properties>\n"
        f"{children}"
        f"{pad}</Item>\n"
    )


def service_item(cls: str, children: str = "", indent: int = 1) -> str:
    pad = "\t" * indent
    return (
        f'{pad}<Item class="{cls}" referent="{next_ref()}">\n'
        f"{children}"
        f"{pad}</Item>\n"
    )


def build() -> None:
    shared_scripts = "".join(script_item(c, n, p, 3) for c, n, p in SHARED)
    server_scripts = "".join(script_item(c, n, p, 3) for c, n, p in SERVER)
    client_scripts = "".join(script_item(c, n, p, 4) for c, n, p in CLIENT)

    xml = (
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" '
        'version="4">\n'
        + service_item("Workspace")
        + service_item("Players")
        + service_item("Lighting")
        + service_item("ReplicatedStorage", folder_item("Shared", shared_scripts, 2))
        + service_item("ServerScriptService", folder_item("Server", server_scripts, 2))
        + service_item("ServerStorage")
        + service_item("StarterGui")
        + service_item("StarterPack")
        + service_item(
            "StarterPlayer",
            service_item(
                "StarterPlayerScripts",
                folder_item("Client", client_scripts, 3),
                2,
            ),
        )
        + service_item("SoundService")
        + "</roblox>\n"
    )

    OUT.write_text(xml, encoding="utf-8")

    tree = ET.parse(OUT)
    sources = tree.getroot().findall(".//ProtectedString")
    expected = len(SHARED) + len(SERVER) + len(CLIENT)
    assert len(sources) == expected, f"{len(sources)} von {expected} Skripten enthalten!"
    print(f"OK: {OUT.name} gebaut ({OUT.stat().st_size // 1024} KB, {expected} Skripte)")


if __name__ == "__main__":
    build()
