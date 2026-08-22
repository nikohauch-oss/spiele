#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Core/KKTypes.h"
#include "KKSaveGame.generated.h"

/** Ein Eintrag im Kellerbuch: gefundene Story-Fragmente, gesehene Kreaturen, Enden. */
USTRUCT(BlueprintType)
struct FKKCodexEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FName Id;
	UPROPERTY(BlueprintReadOnly) int32 TimesSeen = 0;
	UPROPERTY(BlueprintReadOnly) FDateTime FirstSeen;
};

/** Persistenter Fortschritt ueber alle Runs hinweg. */
UCLASS(BlueprintType)
class KELLERKIND_API UKKSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	static const FString SlotName;

	UPROPERTY(BlueprintReadOnly) int32 TotalRuns = 0;
	UPROPERTY(BlueprintReadOnly) int32 TotalDeaths = 0;
	UPROPERTY(BlueprintReadOnly) int32 DeepestFloorReached = 0;
	UPROPERTY(BlueprintReadOnly) double TotalPlayTime = 0.0;
	UPROPERTY(BlueprintReadOnly) int32 NewGamePlusLevel = 0;

	/** Freigeschaltete Inhalte. Der Generator zieht nur aus diesen Mengen. */
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedItems;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedRooms;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedEnemies;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedBosses;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedCharacters;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedStartWeapons;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedFloors;
	UPROPERTY(BlueprintReadOnly) TSet<FName> UnlockedPaths;

	/** Fortschritt in Richtung einer Freischaltung, z. B. "Toete 50 Blinde". */
	UPROPERTY(BlueprintReadOnly) TMap<FName, int32> UnlockProgress;

	UPROPERTY(BlueprintReadOnly) TSet<EKKEnding> SeenEndings;
	UPROPERTY(BlueprintReadOnly) TMap<FName, FKKCodexEntry> Codex;

	/** Grafik- und Spieloptionen. */
	UPROPERTY(BlueprintReadOnly) TMap<FName, float> Options;

	void GrantDefaultUnlocks();

	UFUNCTION(BlueprintCallable, Category = "Save")
	bool IsUnlocked(FName Id) const;

	/** Erhoeht einen Fortschrittszaehler und meldet, ob die Schwelle in diesem Aufruf erreicht wurde. */
	bool AdvanceUnlockProgress(FName ProgressId, int32 Amount, int32 Threshold);

	void RegisterCodex(FName Id);
};
