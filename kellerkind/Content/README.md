# Content

Dieser Ordner nimmt die Unreal-Assets auf. Er ist noch leer, weil hier ausschliesslich
Binaerdaten liegen, die im Editor entstehen.

Erwartete Struktur:

```
Content/Kellerkind/
  Data/            von -run=KKContentImport erzeugte Data Assets
    Items/         DA_Item_*
    Synergien/     DA_Syn_*
    Kreaturen/     DA_Kreatur_*
    Raeume/        DA_Raum_*
    Etagen/        DA_Etage_*
  Maps/            L_MainMenu, L_Prolog_Haus, Raumlevel je Etage
  Characters/      Leon, Kreaturen, Bosse (Meshes, Skelette, Animationen)
  Weapons/
  Materials/       Master-Materialien mit Dirt/Wetness/Rust/Blood/Age
  VFX/             Niagara
  Audio/           Klangbibliothek, Sound Classes, Submixes
  UI/              UMG-Widgets auf Basis von UKKHUDWidget
```

Der Inhaltskatalog selbst wird nicht hier gepflegt, sondern als JSON in `Data/`
(siehe `Docs/04_Produktionsplan.md`).
