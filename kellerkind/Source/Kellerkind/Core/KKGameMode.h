#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Core/KKTypes.h"
#include "Level/KKFloorGenerator.h"
#include "KKGameMode.generated.h"

class UKKFloorData;
class UKKFloorGenerator;
class UKKHorrorEvent;
class AKKRoom;
class AKKKellerkindStalker;
class AKKBossBase;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKKOnFloorStarted, EKKFloor, Floor, EKKCurse, Curse);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnCurseApplied, EKKCurse, Curse);

/**
 * Haelt einen Run zusammen: Etage erzeugen, Raeume fuellen, Fluch wuerfeln,
 * Etagenwechsel abwickeln, Ende bestimmen.
 */
UCLASS()
class KELLERKIND_API AKKGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AKKGameMode();

	virtual void BeginPlay() override;

	/** Baut die naechste Etage auf und setzt den Spieler in den Startraum. */
	UFUNCTION(BlueprintCallable, Category = "Run")
	void EnterFloor(EKKFloor Floor);

	/** Wird von der Treppe im Bossraum gerufen. */
	UFUNCTION(BlueprintCallable, Category = "Run")
	void DescendToNextFloor(bool bAlternatePath = false);

	UFUNCTION(BlueprintPure, Category = "Run")
	const FKKFloorLayout& GetLayout() const { return Layout; }

	UFUNCTION(BlueprintPure, Category = "Run")
	UKKFloorData* GetFloorData(EKKFloor Floor) const;

	/**
	 * Ein Raumlevel ist fertig geladen und meldet sich.
	 *
	 * Raeume werden als Level-Instanzen asynchron geladen - der GameMode kann sie direkt
	 * nach SpawnLayout also noch gar nicht finden. Deshalb meldet sich jeder Raum selbst,
	 * sobald er da ist, und wird erst dann bevoelkert.
	 */
	UFUNCTION(BlueprintCallable, Category = "Run")
	void RegisterRoom(AKKRoom* Room);

	/** Beendet den Run mit einem der Enden. */
	UFUNCTION(BlueprintCallable, Category = "Run")
	void FinishRun(EKKEnding Ending);

	UPROPERTY(BlueprintAssignable, Category = "Run") FKKOnFloorStarted OnFloorStarted;
	UPROPERTY(BlueprintAssignable, Category = "Run") FKKOnCurseApplied OnCurseApplied;

	/** Etagendefinitionen in Reihenfolge der Tiefe. */
	UPROPERTY(EditDefaultsOnly, Category = "Run")
	TArray<TObjectPtr<UKKFloorData>> Floors;

	/** Ereignisse, die der Horror-Director benutzen darf. */
	UPROPERTY(EditDefaultsOnly, Category = "Horror")
	TArray<TSubclassOf<UKKHorrorEvent>> HorrorEvents;

	UPROPERTY(EditDefaultsOnly, Category = "Horror")
	TSoftClassPtr<AKKKellerkindStalker> StalkerClass;

protected:
	/** Wuerfelt den Etagenfluch und wendet ihn an. */
	EKKCurse RollCurse(EKKFloor Floor, FRandomStream& Stream) const;
	void ApplyCurse(EKKCurse Curse);

	void PopulateRoom(AKKRoom* Room);
	void SpawnBoss(AKKRoom* BossRoom);

	UFUNCTION()
	void HandleRoomEntered(AKKRoom* Room);

	UPROPERTY() FKKFloorLayout Layout;
	UPROPERTY() TObjectPtr<UKKFloorGenerator> Generator;
	UPROPERTY() TObjectPtr<AKKKellerkindStalker> Stalker;
};
