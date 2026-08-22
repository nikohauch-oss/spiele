#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKFloorGenerator.generated.h"

class UKKFloorData;
class UKKRoomData;
class UKKContentRegistry;
class UKKSaveGame;
class AKKRoom;

/** Ein Knoten im Etagenplan. */
USTRUCT(BlueprintType)
struct FKKRoomNode
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FKKGridCoord Coord;
	UPROPERTY(BlueprintReadOnly) EKKRoomType Type = EKKRoomType::Kampf;

	/** Bitmaske ueber EKKDir: welche Ausgaenge dieser Raum haben muss. */
	UPROPERTY(BlueprintReadOnly) uint8 DoorMask = 0;

	/** Schritte vom Startraum entfernt. */
	UPROPERTY(BlueprintReadOnly) int32 Distance = 0;

	/** Geheimraeume haben keine normale Tuer - der Zugang muss gesprengt werden. */
	UPROPERTY(BlueprintReadOnly) bool bHidden = false;

	UPROPERTY(BlueprintReadOnly) bool bCleared = false;
	UPROPERTY(BlueprintReadOnly) bool bVisited = false;

	UPROPERTY(BlueprintReadOnly) TObjectPtr<UKKRoomData> RoomData = nullptr;
};

/** Der fertige Plan einer Etage - reine Daten, unabhaengig von der Welt. */
USTRUCT(BlueprintType)
struct FKKFloorLayout
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) TMap<FKKGridCoord, FKKRoomNode> Nodes;
	UPROPERTY(BlueprintReadOnly) FKKGridCoord StartCoord;
	UPROPERTY(BlueprintReadOnly) FKKGridCoord BossCoord;
	UPROPERTY(BlueprintReadOnly) EKKFloor Floor = EKKFloor::AlterKeller;

	bool IsValid() const { return Nodes.Num() > 0; }

	const FKKRoomNode* Find(const FKKGridCoord& Coord) const { return Nodes.Find(Coord); }

	int32 Num() const { return Nodes.Num(); }

	int32 CountOfType(EKKRoomType Type) const
	{
		int32 Count = 0;
		for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Nodes)
		{
			if (Pair.Value.Type == Type)
			{
				++Count;
			}
		}
		return Count;
	}
};

/**
 * Baut eine Etage aus handgebauten Raeumen zusammen.
 *
 * Zwei getrennte Schritte:
 *  1. GenerateLayout - reiner Datenplan aus dem Zufallsstrom des Runs. Kein Weltzugriff,
 *     dadurch reproduzierbar und testbar: derselbe Seed ergibt immer dieselbe Etage.
 *  2. SpawnLayout - laedt fuer jeden Knoten das passende Raumlevel als Instanz.
 */
UCLASS(BlueprintType)
class KELLERKIND_API UKKFloorGenerator : public UObject
{
	GENERATED_BODY()

public:
	/** Erzeugt den Plan. Registry und Save duerfen null sein - dann bleiben RoomData leer. */
	UFUNCTION(BlueprintCallable, Category = "Generierung")
	FKKFloorLayout GenerateLayout(const UKKFloorData* FloorData, int32 Seed, int32 NewGamePlusLevel,
		UKKContentRegistry* Registry, const UKKSaveGame* Save);

	/** Laedt die Raeume des Plans als Level-Instanzen in die Welt. */
	UFUNCTION(BlueprintCallable, Category = "Generierung")
	void SpawnLayout(UObject* WorldContext, const FKKFloorLayout& Layout);

	UFUNCTION(BlueprintPure, Category = "Generierung")
	static FVector CoordToWorld(const FKKGridCoord& Coord);

	/** Textbild des Plans fuer Log und Debug-Anzeige. */
	UFUNCTION(BlueprintPure, Category = "Generierung")
	static FString DescribeLayout(const FKKFloorLayout& Layout);

private:
	// --- Schritte der Generierung ---
	void CarveRooms(FKKFloorLayout& Layout, FRandomStream& Stream, int32 TargetRooms, int32 GridSize);
	void ComputeDistances(FKKFloorLayout& Layout);
	void ComputeDoorMasks(FKKFloorLayout& Layout);
	TArray<FKKGridCoord> CollectDeadEnds(const FKKFloorLayout& Layout) const;
	void PlaceBossRoom(FKKFloorLayout& Layout, TArray<FKKGridCoord>& DeadEnds);
	void PlaceSpecialRooms(FKKFloorLayout& Layout, TArray<FKKGridCoord>& DeadEnds,
		const UKKFloorData* FloorData, FRandomStream& Stream);
	void PlaceSecretRooms(FKKFloorLayout& Layout, const UKKFloorData* FloorData, FRandomStream& Stream, int32 GridSize);
	void AssignRoomAssets(FKKFloorLayout& Layout, FRandomStream& Stream,
		UKKContentRegistry* Registry, const UKKSaveGame* Save);

	int32 CountNeighbours(const FKKFloorLayout& Layout, const FKKGridCoord& Coord) const;
	bool IsInsideGrid(const FKKGridCoord& Coord, int32 GridSize) const;
};
