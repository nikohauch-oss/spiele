#!/usr/bin/env python3
"""Erzeugt Config/Tags/KellerkindTags.ini aus den Tags in Data/*.json."""
import json, glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    tags = set()
    for path in sorted(glob.glob(os.path.join(ROOT, "Data", "items_*.json"))):
        for item in json.load(open(path, encoding="utf-8"))["items"]:
            tags.update(item.get("tags", []))
    for syn in json.load(open(os.path.join(ROOT, "Data", "synergies.json"), encoding="utf-8"))["synergies"]:
        tags.update(syn.get("tags", []))
        tags.update(syn.get("blocked", []))
        if syn.get("grants"):
            tags.add(syn["grants"])

    # Ein Kindtag ohne registrierten Elterntag wird von Unreal abgelehnt.
    full = set()
    for tag in tags:
        parts = tag.split(".")
        for i in range(1, len(parts) + 1):
            full.add(".".join(parts[:i]))

    lines = ["; KELLERKIND Gameplay-Tags.",
             "; Erzeugt aus Data/*.json - Aenderungen bitte dort vornehmen und",
             "; Tools/export_tags.py erneut laufen lassen.",
             "",
             "[/Script/GameplayTags.GameplayTagsSettings]",
             "ImportTagsFromConfig=True",
             "WarnOnInvalidTags=True",
             "FastReplication=False",
             ""]
    for tag in sorted(full):
        lines.append(f'+GameplayTagList=(Tag="Kellerkind.{tag}",DevComment="")')

    out = os.path.join(ROOT, "Config", "Tags", "KellerkindTags.ini")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    print(f"{len(full)} Tags nach {os.path.relpath(out, ROOT)} geschrieben.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
