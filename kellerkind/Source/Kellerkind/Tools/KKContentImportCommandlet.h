#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "KKContentImportCommandlet.generated.h"

/**
 * Importiert den Inhaltskatalog aus Data/*.json in Data Assets.
 *
 * Der Katalog wird als JSON gepflegt, weil er sich so versionieren, im Text
 * durchsuchen und ausserhalb des Editors pruefen laesst (siehe Tools/validate_content.py).
 * Dieser Commandlet erzeugt daraus die UKKItemData-, UKKSynergyData-, UKKCreatureData-,
 * UKKRoomData- und UKKFloorData-Assets, mit denen das Spiel zur Laufzeit arbeitet.
 *
 * Aufruf:
 *   UnrealEditor-Cmd.exe Kellerkind.uproject -run=KKContentImport
 *      [-DataDir=<Pfad zu Data>] [-OutDir=/Game/Kellerkind/Data] [-DryRun]
 *
 * Bestehende Assets werden aktualisiert, nicht ersetzt: Verweise auf Meshes, Icons und
 * Effektklassen, die im Editor gesetzt wurden, bleiben erhalten. Ueberschrieben werden
 * nur die Felder, die im JSON stehen.
 */
UCLASS()
class UKKContentImportCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UKKContentImportCommandlet();

	virtual int32 Main(const FString& Params) override;

#if WITH_EDITOR
private:
	FString DataDir;
	FString OutDir;
	bool bDryRun = false;

	int32 Created = 0;
	int32 Updated = 0;
	int32 Failed = 0;

	bool LoadJson(const FString& FileName, TSharedPtr<class FJsonObject>& OutObject) const;

	int32 ImportItems();
	int32 ImportSynergies();
	int32 ImportCreatures();
	int32 ImportRooms();
	int32 ImportFloors();

	/** Legt ein Asset an oder laedt das vorhandene. */
	UObject* GetOrCreateAsset(UClass* Class, const FString& AssetName, const FString& SubFolder);

	void SaveDirtyPackages();
#endif
};
