#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Core/KKSaveGame.h"
#include "Core/KKContentRegistry.h"
#include "Kellerkind.h"
#include "Kismet/GameplayStatics.h"

void UKKGameInstance::Init()
{
	Super::Init();

	Content = NewObject<UKKContentRegistry>(this, TEXT("ContentRegistry"));
	Content->BuildRegistry();

	LoadProfile();
}

void UKKGameInstance::Shutdown()
{
	SaveProfile();
	Super::Shutdown();
}

void UKKGameInstance::LoadProfile()
{
	if (UGameplayStatics::DoesSaveGameExist(UKKSaveGame::SlotName, 0))
	{
		Save = Cast<UKKSaveGame>(UGameplayStatics::LoadGameFromSlot(UKKSaveGame::SlotName, 0));
	}

	if (!Save)
	{
		Save = Cast<UKKSaveGame>(UGameplayStatics::CreateSaveGameObject(UKKSaveGame::StaticClass()));
		Save->GrantDefaultUnlocks();
		SaveProfile();
	}
}

void UKKGameInstance::SaveProfile()
{
	if (Save)
	{
		UGameplayStatics::SaveGameToSlot(Save, UKKSaveGame::SlotName, 0);
	}
}

UKKRunState* UKKGameInstance::BeginRun(int32 Seed, FName CharacterId)
{
	if (!RunState)
	{
		RunState = NewObject<UKKRunState>(this, TEXT("RunState"));
	}

	const int32 UsedSeed = (Seed > 0) ? Seed : FMath::Rand() ^ static_cast<int32>(FDateTime::UtcNow().GetTicks() & 0x7fffffff);
	RunState->StartRun(UsedSeed, CharacterId);

	if (Save)
	{
		++Save->TotalRuns;
	}
	return RunState;
}

void UKKGameInstance::EndRun(bool bVictory, EKKEnding Ending)
{
	if (!RunState || !Save)
	{
		return;
	}

	if (!bVictory)
	{
		++Save->TotalDeaths;
	}
	if (Ending != EKKEnding::Keines)
	{
		Save->SeenEndings.Add(Ending);
	}

	Save->DeepestFloorReached = FMath::Max(Save->DeepestFloorReached, static_cast<int32>(RunState->GetFloor()));
	Save->TotalPlayTime += RunState->GetRunTime();

	UE_LOG(LogKellerkind, Log, TEXT("Run beendet. Sieg=%d Etage=%d Raeume=%d"),
		bVictory ? 1 : 0, static_cast<int32>(RunState->GetFloor()), RunState->RoomsCleared);

	SaveProfile();
}

void UKKGameInstance::Unlock(FName UnlockId, EKKItemCategory Category)
{
	if (!Save || UnlockId.IsNone() || Save->IsUnlocked(UnlockId))
	{
		return;
	}

	switch (Category)
	{
	case EKKItemCategory::Waffe: Save->UnlockedStartWeapons.Add(UnlockId); break;
	case EKKItemCategory::Quest: Save->UnlockedPaths.Add(UnlockId); break;
	default: Save->UnlockedItems.Add(UnlockId); break;
	}

	OnUnlock.Broadcast(UnlockId);
	SaveProfile();
}
