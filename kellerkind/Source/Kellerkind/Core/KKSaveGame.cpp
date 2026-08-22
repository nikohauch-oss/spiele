#include "Core/KKSaveGame.h"

const FString UKKSaveGame::SlotName = TEXT("Kellerkind_Profil");

void UKKSaveGame::GrantDefaultUnlocks()
{
	// Der erste Run ist bewusst schmal: ein Charakter, eine Startwaffe, Etage 1.
	UnlockedCharacters.Add(TEXT("Leon"));
	UnlockedStartWeapons.Add(TEXT("Brecheisen"));
	UnlockedFloors.Add(TEXT("AlterKeller"));
}

bool UKKSaveGame::IsUnlocked(FName Id) const
{
	return UnlockedItems.Contains(Id)
		|| UnlockedRooms.Contains(Id)
		|| UnlockedEnemies.Contains(Id)
		|| UnlockedBosses.Contains(Id)
		|| UnlockedCharacters.Contains(Id)
		|| UnlockedStartWeapons.Contains(Id)
		|| UnlockedFloors.Contains(Id)
		|| UnlockedPaths.Contains(Id);
}

bool UKKSaveGame::AdvanceUnlockProgress(FName ProgressId, int32 Amount, int32 Threshold)
{
	int32& Value = UnlockProgress.FindOrAdd(ProgressId);
	const bool bWasBelow = Value < Threshold;
	Value += Amount;
	return bWasBelow && Value >= Threshold;
}

void UKKSaveGame::RegisterCodex(FName Id)
{
	FKKCodexEntry& Entry = Codex.FindOrAdd(Id);
	if (Entry.TimesSeen == 0)
	{
		Entry.Id = Id;
		Entry.FirstSeen = FDateTime::UtcNow();
	}
	++Entry.TimesSeen;
}
