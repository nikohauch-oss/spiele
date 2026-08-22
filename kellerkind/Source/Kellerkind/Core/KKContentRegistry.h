#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKContentRegistry.generated.h"

class UKKItemData;
class UKKSynergyData;
class UKKRoomData;
class UKKCreatureData;
class UKKSaveGame;

/**
 * Haelt alle Inhaltsdefinitionen und zieht daraus gewichtet.
 * Der Registry ist egal, ob Items im Editor als Data Asset angelegt oder
 * aus Data/items.json importiert wurden - beide landen als UKKItemData hier.
 */
UCLASS()
class KELLERKIND_API UKKContentRegistry : public UObject
{
	GENERATED_BODY()

public:
	/** Laedt alle Primaerassets der bekannten Typen aus dem AssetManager. */
	void BuildRegistry();

	UFUNCTION(BlueprintPure, Category = "Content") UKKItemData* FindItem(FName ItemId) const;
	UFUNCTION(BlueprintPure, Category = "Content") UKKRoomData* FindRoom(FName RoomId) const;
	UFUNCTION(BlueprintPure, Category = "Content") UKKCreatureData* FindCreature(FName CreatureId) const;

	const TArray<UKKSynergyData*>& GetAllSynergies() const { return Synergies; }
	const TArray<UKKItemData*>& GetAllItems() const { return Items; }

	/** Alle Raeume einer Etage, die zum gewuenschten Typ passen. */
	TArray<UKKRoomData*> GetRooms(EKKFloor Floor, EKKRoomType Type, const UKKSaveGame* Save) const;

	TArray<UKKCreatureData*> GetCreatures(EKKFloor Floor, const UKKSaveGame* Save) const;

	/**
	 * Zieht ein Item aus einem Pool.
	 * Luck verschiebt die Gewichtung zu hoeherer Qualitaet, statt einfach nur seltene
	 * Items haeufiger zu machen: jeder Qualitaetspunkt wird mit (1 + Luck * 0.15) skaliert.
	 * Bereits im Run vergebene Items werden uebersprungen.
	 */
	UKKItemData* RollItem(EKKItemPool Pool, FRandomStream& Stream, float Luck,
		const TSet<FName>& Excluded, const UKKSaveGame* Save) const;

	/** Wie viele Definitionen geladen wurden - fuer Startup-Log und Content-Checks. */
	void LogSummary() const;

private:
	UPROPERTY() TArray<TObjectPtr<UKKItemData>> Items;
	UPROPERTY() TArray<TObjectPtr<UKKSynergyData>> Synergies;
	UPROPERTY() TArray<TObjectPtr<UKKRoomData>> Rooms;
	UPROPERTY() TArray<TObjectPtr<UKKCreatureData>> Creatures;

	UPROPERTY() TMap<FName, TObjectPtr<UKKItemData>> ItemsById;
	UPROPERTY() TMap<FName, TObjectPtr<UKKRoomData>> RoomsById;
	UPROPERTY() TMap<FName, TObjectPtr<UKKCreatureData>> CreaturesById;

	template <typename T>
	void LoadType(FPrimaryAssetType Type, TArray<TObjectPtr<T>>& Out);

	bool IsAvailable(FName RequiredUnlock, const UKKSaveGame* Save) const;
};
