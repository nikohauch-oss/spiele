#include "Level/KKRoom.h"
#include "Level/KKDoor.h"
#include "Level/KKFloorGenerator.h"
#include "Core/KKGameMode.h"
#include "Core/KKGameSettings.h"
#include "AI/KKCreatureBase.h"
#include "AI/KKCreatureData.h"
#include "Level/KKRoomData.h"
#include "Player/KKCharacter.h"
#include "Player/KKInventoryComponent.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

#include "Components/BoxComponent.h"
#include "EngineUtils.h"
#include "Engine/TargetPoint.h"

AKKRoom::AKKRoom()
{
	PrimaryActorTick.bCanEverTick = false;

	Bounds = CreateDefaultSubobject<UBoxComponent>(TEXT("Bounds"));
	Bounds->SetBoxExtent(FVector(1200.f, 1200.f, 400.f));
	Bounds->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Bounds->SetCollisionResponseToAllChannels(ECR_Ignore);
	Bounds->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	SetRootComponent(Bounds);
}

void AKKRoom::BeginPlay()
{
	Super::BeginPlay();

	Bounds->OnComponentBeginOverlap.AddDynamic(this, &AKKRoom::HandleBeginOverlap);

	ResolvePlacement();

	if (AKKGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKKGameMode>() : nullptr)
	{
		GameMode->RegisterRoom(this);
	}

	// Tueren im eigenen Raumvolumen einsammeln - so muss niemand sie per Hand verknuepfen.
	for (TActorIterator<AKKDoor> It(GetWorld()); It; ++It)
	{
		AKKDoor* Door = *It;
		if (Door && Bounds->Bounds.GetBox().IsInsideOrOn(Door->GetActorLocation()))
		{
			Doors.AddUnique(Door);
		}
	}
}

void AKKRoom::ResolvePlacement()
{
	// Raumlevel werden an Gitterposition * RoomWorldSize geladen. Aus der eigenen
	// Weltposition laesst sich die Gitterzelle deshalb direkt zurueckrechnen - so muss
	// niemand die Instanz nachtraeglich verknuepfen.
	const float Size = UKKGameSettings::Get().RoomWorldSize;
	const FVector Location = GetActorLocation();
	Coord = FKKGridCoord(FMath::RoundToInt(Location.X / Size), FMath::RoundToInt(Location.Y / Size));

	const AKKGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKKGameMode>() : nullptr;
	if (!GameMode)
	{
		return;
	}

	const FKKFloorLayout& Layout = GameMode->GetLayout();
	if (const FKKRoomNode* Node = Layout.Find(Coord))
	{
		RoomType = Node->Type;
		Floor = Layout.Floor;
		if (Node->RoomData)
		{
			bLockUntilCleared = Node->RoomData->bLockUntilCleared;
		}
	}
	else
	{
		UE_LOG(LogKellerkind, Warning,
			TEXT("Raum bei %d/%d hat keinen Knoten im Etagenplan - Typ bleibt %d."),
			Coord.X, Coord.Y, static_cast<int32>(RoomType));
	}
}

void AKKRoom::InitializeRoom(EKKRoomType InType, const FKKGridCoord& InCoord, EKKFloor InFloor)
{
	RoomType = InType;
	Coord = InCoord;
	Floor = InFloor;
}

int32 AKKRoom::GetAliveEnemyCount() const
{
	int32 Count = 0;
	for (const TObjectPtr<AKKCreatureBase>& Enemy : Enemies)
	{
		if (Enemy && Enemy->IsAlive())
		{
			++Count;
		}
	}
	return Count;
}

void AKKRoom::PopulateEnemies(const TArray<UKKCreatureData*>& Pool, int32 Budget, FRandomStream& Stream,
	float HealthScale, float DamageScale)
{
	if (Pool.Num() == 0 || Budget <= 0)
	{
		return;
	}

	// Spawnpunkte im Raum einsammeln.
	TArray<FVector> SpawnPoints;
	for (TActorIterator<ATargetPoint> It(GetWorld()); It; ++It)
	{
		ATargetPoint* Point = *It;
		if (Point && Point->ActorHasTag(SpawnPointTag) &&
			Bounds->Bounds.GetBox().IsInsideOrOn(Point->GetActorLocation()))
		{
			SpawnPoints.Add(Point->GetActorLocation());
		}
	}

	if (SpawnPoints.Num() == 0)
	{
		SpawnPoints.Add(GetActorLocation());
	}

	int32 Remaining = Budget;
	int32 Guard = 0;

	while (Remaining > 0 && Guard++ < 64)
	{
		UKKCreatureData* Data = Pool[Stream.RandRange(0, Pool.Num() - 1)];
		if (!Data || !Data->CreatureClass || Data->SpawnCost > Remaining)
		{
			continue;
		}

		const int32 GroupSize = Stream.RandRange(Data->MinGroupSize, FMath::Max(Data->MinGroupSize, Data->MaxGroupSize));

		for (int32 i = 0; i < GroupSize && Remaining >= Data->SpawnCost; ++i)
		{
			const FVector Location = SpawnPoints[Stream.RandRange(0, SpawnPoints.Num() - 1)]
				+ FVector(Stream.FRandRange(-120.f, 120.f), Stream.FRandRange(-120.f, 120.f), 0.f);

			FActorSpawnParameters Params;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

			AKKCreatureBase* Creature = GetWorld()->SpawnActor<AKKCreatureBase>(
				Data->CreatureClass, Location, FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f), Params);

			if (!Creature)
			{
				continue;
			}

			Creature->ApplyCreatureData(Data);
			Creature->ApplyDifficultyScale(HealthScale, DamageScale);
			Creature->OnDied.AddDynamic(this, &AKKRoom::HandleEnemyDied);

			Enemies.Add(Creature);
			Remaining -= Data->SpawnCost;
		}
	}
}

void AKKRoom::HandleBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	AKKCharacter* Character = Cast<AKKCharacter>(OtherActor);
	if (!Character || bEntered)
	{
		return;
	}

	bEntered = true;

	if (Character->GetInventory())
	{
		Character->GetInventory()->DispatchRoomEntered(RoomType);
	}

	OnRoomEntered.Broadcast(this);

	if (GetAliveEnemyCount() == 0)
	{
		MarkCleared();
	}
	else if (bLockUntilCleared)
	{
		SetDoorsLocked(true);
	}
}

void AKKRoom::HandleEnemyDied(AKKCreatureBase* Creature)
{
	if (GetAliveEnemyCount() == 0)
	{
		MarkCleared();
	}
}

void AKKRoom::MarkCleared()
{
	if (bCleared)
	{
		return;
	}

	bCleared = true;
	SetDoorsLocked(false);

	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			++Run->RoomsCleared;
		}
	}

	for (TActorIterator<AKKCharacter> It(GetWorld()); It; ++It)
	{
		if (AKKCharacter* Character = *It)
		{
			if (Character->GetInventory())
			{
				Character->GetInventory()->DispatchRoomCleared();
			}
		}
	}

	OnRoomCleared.Broadcast(this);
}

void AKKRoom::SetDoorsLocked(bool bLocked)
{
	for (const TObjectPtr<AKKDoor>& Door : Doors)
	{
		if (Door)
		{
			Door->SetLocked(bLocked);
		}
	}
}

void AKKRoom::TransformInto(EKKRoomType NewType)
{
	UE_LOG(LogKellerkind, Log, TEXT("Raum %d/%d veraendert sich: %d -> %d"),
		Coord.X, Coord.Y, static_cast<int32>(RoomType), static_cast<int32>(NewType));

	RoomType = NewType;
	bCleared = false;
	bEntered = false;
}
