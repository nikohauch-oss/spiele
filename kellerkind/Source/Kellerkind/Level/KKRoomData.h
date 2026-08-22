#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Core/KKTypes.h"
#include "KKRoomData.generated.h"

class UWorld;

/**
 * Ein handgebauter Raum.
 *
 * Die Etage wird prozedural zusammengesetzt, die Raeume selbst sind gebaut - so bleibt
 * jeder Raum lesbar und gestaltet, waehrend die Etage bei jedem Run anders ist.
 */
UCLASS(BlueprintType)
class KELLERKIND_API UKKRoomData : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FName RoomId;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") EKKRoomType RoomType = EKKRoomType::Kampf;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") TArray<EKKFloor> Floors;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FName RequiredUnlock;

	/** Das gebaute Level, das als Instanz geladen wird. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Level") TSoftObjectPtr<UWorld> RoomLevel;

	/**
	 * Welche Tueren dieser Raum besitzt, als Bitmaske ueber EKKDir
	 * (1 = Nord, 2 = Ost, 4 = Sued, 8 = West).
	 * Der Generator setzt nur Raeume ein, deren Maske die benoetigten Ausgaenge enthaelt;
	 * ueberzaehlige Tueren werden zugemauert.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Form", meta = (Bitmask))
	uint8 DoorMask = 15;

	/** Groesse in Gitterzellen. Bossraeume und die Siedlung nutzen 2x2. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Form") FIntPoint GridSize = FIntPoint(1, 1);

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Auswahl") float Weight = 1.f;

	/** Gegnerbudget dieses Raums. Der Spawner fuellt es mit Kreaturen der Etage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gegner") int32 EnemyBudget = 4;

	/** Raum bleibt nach dem Betreten verschlossen, bis er geraeumt ist. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gegner") bool bLockUntilCleared = true;

	UFUNCTION(BlueprintPure, Category = "Form")
	bool HasDoor(EKKDir Dir) const { return (DoorMask & (1 << static_cast<uint8>(Dir))) != 0; }

	/** Passt der Raum an eine Stelle, die genau diese Ausgaenge braucht? */
	UFUNCTION(BlueprintPure, Category = "Form")
	bool Fits(uint8 RequiredMask) const { return (DoorMask & RequiredMask) == RequiredMask; }

	virtual FPrimaryAssetId GetPrimaryAssetId() const override
	{
		return FPrimaryAssetId(TEXT("KKRoom"), RoomId);
	}
};
