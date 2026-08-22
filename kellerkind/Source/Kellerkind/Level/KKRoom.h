#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKRoom.generated.h"

class AKKDoor;
class AKKCreatureBase;
class UBoxComponent;
class UKKCreatureData;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnRoomEntered, AKKRoom*, Room);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnRoomCleared, AKKRoom*, Room);

/**
 * Laufzeit-Vertreter eines Raums. Liegt im gebauten Raumlevel und findet beim Start
 * seine Tueren und Spawnpunkte selbst.
 *
 * Er entscheidet, wann ein Raum als geraeumt gilt - und damit, wann die Tueren wieder
 * aufgehen, Belohnungen erscheinen und Item-Hooks feuern.
 */
UCLASS()
class KELLERKIND_API AKKRoom : public AActor
{
	GENERATED_BODY()

public:
	AKKRoom();

	virtual void BeginPlay() override;

	UFUNCTION(BlueprintCallable, Category = "Raum")
	void InitializeRoom(EKKRoomType InType, const FKKGridCoord& InCoord, EKKFloor InFloor);

	/** Fuellt den Raum mit Kreaturen aus dem Pool der Etage, bis das Budget erschoepft ist. */
	UFUNCTION(BlueprintCallable, Category = "Raum")
	void PopulateEnemies(const TArray<UKKCreatureData*>& Pool, int32 Budget, FRandomStream& Stream,
		float HealthScale, float DamageScale);

	UFUNCTION(BlueprintPure, Category = "Raum") bool IsCleared() const { return bCleared; }
	UFUNCTION(BlueprintPure, Category = "Raum") EKKRoomType GetRoomType() const { return RoomType; }
	UFUNCTION(BlueprintPure, Category = "Raum") FKKGridCoord GetCoord() const { return Coord; }
	UFUNCTION(BlueprintPure, Category = "Raum") int32 GetAliveEnemyCount() const;

	/** Wandelt einen Safe Room nachtraeglich um - manche bleiben nicht sicher. */
	UFUNCTION(BlueprintCallable, Category = "Raum")
	void TransformInto(EKKRoomType NewType);

	UPROPERTY(BlueprintAssignable, Category = "Raum") FKKOnRoomEntered OnRoomEntered;
	UPROPERTY(BlueprintAssignable, Category = "Raum") FKKOnRoomCleared OnRoomCleared;

	/** Wird beim Betreten verschlossen, bis alle Kreaturen tot sind. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Raum") bool bLockUntilCleared = true;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Bounds;

	UFUNCTION()
	void HandleBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void HandleEnemyDied(AKKCreatureBase* Creature);

	/** Leitet Gitterposition, Raumart und Etage aus Weltposition und Etagenplan ab. */
	void ResolvePlacement();

	void SetDoorsLocked(bool bLocked);
	void MarkCleared();

	UPROPERTY(BlueprintReadOnly, Category = "Raum") EKKRoomType RoomType = EKKRoomType::Kampf;
	UPROPERTY(BlueprintReadOnly, Category = "Raum") EKKFloor Floor = EKKFloor::AlterKeller;
	UPROPERTY(BlueprintReadOnly, Category = "Raum") FKKGridCoord Coord;

	UPROPERTY(BlueprintReadOnly, Category = "Raum") TArray<TObjectPtr<AKKDoor>> Doors;
	UPROPERTY(BlueprintReadOnly, Category = "Raum") TArray<TObjectPtr<AKKCreatureBase>> Enemies;

	/** Sockelnamen oder Actor-Tags, an denen Kreaturen erscheinen. */
	UPROPERTY(EditAnywhere, Category = "Raum") FName SpawnPointTag = TEXT("KKSpawn");

private:
	bool bEntered = false;
	bool bCleared = false;
};
