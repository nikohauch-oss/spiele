#include "Core/KKGameMode.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Core/KKSaveGame.h"
#include "Core/KKContentRegistry.h"
#include "Core/KKGameSettings.h"
#include "Level/KKFloorData.h"
#include "Level/KKRoom.h"
#include "Horror/KKHorrorDirector.h"
#include "Horror/KKKellerkindStalker.h"
#include "Player/KKCharacter.h"
#include "Player/KKInventoryComponent.h"
#include "Player/KKHealthComponent.h"
#include "AI/KKCreatureData.h"
#include "AI/KKBossBase.h"
#include "Kellerkind.h"

#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"

AKKGameMode::AKKGameMode()
{
	PrimaryActorTick.bCanEverTick = false;
	DefaultPawnClass = AKKCharacter::StaticClass();
}

void AKKGameMode::BeginPlay()
{
	Super::BeginPlay();

	Generator = NewObject<UKKFloorGenerator>(this, TEXT("FloorGenerator"));

	UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	if (!GI)
	{
		UE_LOG(LogKellerkind, Error, TEXT("KKGameMode ohne KKGameInstance - Run kann nicht starten."));
		return;
	}

	if (!GI->GetRunState())
	{
		GI->BeginRun();
	}

	if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
	{
		Director->ConfigureEvents(HorrorEvents);
	}

	if (!StalkerClass.IsNull())
	{
		if (UClass* Class = StalkerClass.LoadSynchronous())
		{
			Stalker = GetWorld()->SpawnActor<AKKKellerkindStalker>(Class, FVector::ZeroVector, FRotator::ZeroRotator);
			if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
			{
				Director->SetStalker(Stalker);
			}
		}
	}

	EnterFloor(GI->GetRunState()->GetFloor());
}

UKKFloorData* AKKGameMode::GetFloorData(EKKFloor Floor) const
{
	for (const TObjectPtr<UKKFloorData>& Data : Floors)
	{
		if (Data && Data->Floor == Floor)
		{
			return Data;
		}
	}
	return nullptr;
}

void AKKGameMode::EnterFloor(EKKFloor Floor)
{
	UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	UKKFloorData* FloorData = GetFloorData(Floor);

	if (!Run || !FloorData)
	{
		UE_LOG(LogKellerkind, Error, TEXT("Etage %d hat keine Definition."), static_cast<int32>(Floor));
		return;
	}

	Run->SetFloor(Floor);

	// Der Etagen-Seed wird aus dem Run-Seed abgeleitet: derselbe Run erzeugt immer
	// dieselben Etagen, auch wenn der Spieler sie in anderer Reihenfolge betritt.
	const int32 FloorSeed = Run->GetSeed() ^ (static_cast<int32>(Floor) * 0x9e3779b9);

	Layout = Generator->GenerateLayout(FloorData, FloorSeed,
		GI->GetSave() ? GI->GetSave()->NewGamePlusLevel : 0,
		GI->GetContent(), GI->GetSave());

	Generator->SpawnLayout(this, Layout);

	const EKKCurse Curse = RollCurse(Floor, Run->LayoutStream());
	Run->SetCurse(Curse);
	ApplyCurse(Curse);

	// Bevoelkert wird nicht hier: Die Raumlevel laden asynchron und melden sich
	// ueber RegisterRoom, sobald sie tatsaechlich in der Welt sind.

	if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
	{
		Director->SetFloorIntensity(FloorData->HorrorIntensity);
		Director->SetActive(true);
	}

	if (AKKCharacter* Character = Cast<AKKCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		Character->SetActorLocation(UKKFloorGenerator::CoordToWorld(Layout.StartCoord) + FVector(0.f, 0.f, 120.f));
		if (Character->GetInventory())
		{
			Character->GetInventory()->DispatchFloorStarted(Floor);
		}
	}

	OnFloorStarted.Broadcast(Floor, Curse);

	UE_LOG(LogKKGen, Log, TEXT("Etagenplan:\n%s"), *UKKFloorGenerator::DescribeLayout(Layout));
}

EKKCurse AKKGameMode::RollCurse(EKKFloor Floor, FRandomStream& Stream) const
{
	const UKKGameSettings& Settings = UKKGameSettings::Get();
	const float Chance = Settings.BaseCurseChance + Settings.CurseChancePerFloor * static_cast<int32>(Floor);

	if (Stream.FRand() > Chance)
	{
		return EKKCurse::Keiner;
	}

	// Gleichverteilt ueber alle Fluecke ausser "Keiner".
	const int32 Count = static_cast<int32>(EKKCurse::MAX) - 1;
	return static_cast<EKKCurse>(Stream.RandRange(1, Count));
}

void AKKGameMode::ApplyCurse(EKKCurse Curse)
{
	if (Curse == EKKCurse::Keiner)
	{
		return;
	}

	// Die eigentliche Wirkung sitzt dort, wo sie hingehoert: Der Fluch der Dunkelheit
	// senkt die Lichter, der Fluch der Tueren verdreht Ziele, der Fluch des Kindes
	// erhoeht die Auftrittsrate des Stalkers. Der GameMode verteilt nur die Ansage.
	OnCurseApplied.Broadcast(Curse);
	UE_LOG(LogKellerkind, Log, TEXT("Etagenfluch aktiv: %d"), static_cast<int32>(Curse));
}

void AKKGameMode::RegisterRoom(AKKRoom* Room)
{
	if (!Room)
	{
		return;
	}

	Room->OnRoomEntered.AddDynamic(this, &AKKGameMode::HandleRoomEntered);

	if (Room->GetRoomType() == EKKRoomType::Boss)
	{
		SpawnBoss(Room);
		return;
	}

	PopulateRoom(Room);
}

void AKKGameMode::PopulateRoom(AKKRoom* Room)
{
	const EKKRoomType Type = Room->GetRoomType();
	if (Type != EKKRoomType::Kampf && Type != EKKRoomType::Challenge && Type != EKKRoomType::MiniBoss)
	{
		return;
	}

	UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	UKKFloorData* FloorData = Run ? GetFloorData(Run->GetFloor()) : nullptr;
	if (!Run || !FloorData || !GI->GetContent())
	{
		return;
	}

	TArray<UKKCreatureData*> Pool = GI->GetContent()->GetCreatures(Run->GetFloor(), GI->GetSave());

	// Mini-Boss-Raeume ziehen nur aus den teuren Kreaturen der Etage; ein Raum voller
	// gewoehnlicher Gegner waere keine Begegnung.
	if (Type == EKKRoomType::MiniBoss)
	{
		TArray<UKKCreatureData*> Elite = Pool.FilterByPredicate([](const UKKCreatureData* Creature)
		{
			return Creature && Creature->SpawnCost >= 5;
		});
		if (Elite.Num() > 0)
		{
			Pool = MoveTemp(Elite);
		}
	}

	const FKKRoomNode* Node = Layout.Find(Room->GetCoord());
	int32 Budget = (Node && Node->RoomData) ? Node->RoomData->EnemyBudget : 4;

	// Challenge-Raeume sind bewusst deutlich voller - dafuer ist die Belohnung hoeher.
	if (Type == EKKRoomType::Challenge)
	{
		Budget *= 3;
	}

	Room->PopulateEnemies(Pool, Budget, Run->EnemyStream(),
		FloorData->EnemyHealthScale, FloorData->EnemyDamageScale);
}

void AKKGameMode::SpawnBoss(AKKRoom* BossRoom)
{
	UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	UKKFloorData* FloorData = Run ? GetFloorData(Run->GetFloor()) : nullptr;
	if (!BossRoom || !FloorData || FloorData->BossClass.IsNull())
	{
		return;
	}

	UClass* BossClass = FloorData->BossClass.LoadSynchronous();
	if (!BossClass)
	{
		return;
	}

	// Der Boss erscheint erst, wenn seine Arena geladen ist - sonst faende er keinen
	// Boden unter sich.
	const FVector Location = BossRoom->GetActorLocation() + FVector(0.f, 0.f, 120.f);

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	GetWorld()->SpawnActor<AKKBossBase>(BossClass, Location, FRotator::ZeroRotator, Params);
}

void AKKGameMode::HandleRoomEntered(AKKRoom* Room)
{
	if (!Room)
	{
		return;
	}

	if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
	{
		Director->NotifyRoomEntered(Room->GetRoomType());
	}
}

void AKKGameMode::DescendToNextFloor(bool bAlternatePath)
{
	UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	if (!Run)
	{
		return;
	}

	// Weisse Herzen, die die Etage ueberlebt haben, werden hier zu Containern.
	if (AKKCharacter* Character = Cast<AKKCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		if (UKKHealthComponent* Health = Character->GetHealth())
		{
			Health->ResolveWhiteHeartsAtFloorEnd();
		}
	}

	UKKFloorData* Current = GetFloorData(Run->GetFloor());
	EKKFloor Next = Run->GetFloor();

	if (bAlternatePath && Current && Current->bHasAlternatePath)
	{
		Next = Current->AlternateTarget;
	}
	else
	{
		const int32 NextIndex = static_cast<int32>(Run->GetFloor()) + 1;
		if (NextIndex >= static_cast<int32>(EKKFloor::MAX))
		{
			// Nach dem Nest endet der Run - welches Ende, entscheidet der Storyzustand.
			FinishRun(EKKEnding::Flucht);
			return;
		}
		Next = static_cast<EKKFloor>(NextIndex);
	}

	EnterFloor(Next);
}

void AKKGameMode::FinishRun(EKKEnding Ending)
{
	if (UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		GI->EndRun(true, Ending);
	}

	if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
	{
		Director->SetActive(false);
	}

	UE_LOG(LogKellerkind, Log, TEXT("Run beendet mit Ende %d"), static_cast<int32>(Ending));
}
