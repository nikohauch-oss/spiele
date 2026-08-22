#include "Core/KKRunState.h"
#include "Kellerkind.h"

void UKKRunState::StartRun(int32 InSeed, FName InCharacterId)
{
	Seed = InSeed;
	CharacterId = InCharacterId;
	CurrentFloor = EKKFloor::AlterKeller;
	CurrentCurse = EKKCurse::Keiner;
	RunTimeSeconds = 0.0;

	Kellermarken = 0;
	Keys = 0;
	Bombs = 0;
	RoomsCleared = 0;
	EnemiesKilled = 0;
	DamageTaken = 0;
	SecretsFound = 0;
	BossesKilled = 0;

	CollectedItems.Reset();
	ConsumedItemIds.Reset();
	AbilityUsage.Reset();
	HorrorEventCounts.Reset();

	// Feste Ableitungen, damit derselbe Seed immer denselben Run erzeugt.
	Layout.Initialize(Seed);
	Items.Initialize(Seed ^ 0x5bf03635);
	Enemies.Initialize(Seed ^ 0x27d4eb2f);
	Events.Initialize(Seed ^ 0x165667b1);
	Horror.Initialize(Seed ^ 0x9e3779b9);

	UE_LOG(LogKellerkind, Log, TEXT("Run gestartet. Seed=%d Charakter=%s"), Seed, *CharacterId.ToString());
}

void UKKRunState::RecordAbilityUse(FName AbilityTag, int32 Count)
{
	if (AbilityTag.IsNone())
	{
		return;
	}
	AbilityUsage.FindOrAdd(AbilityTag) += Count;
}

TArray<FName> UKKRunState::GetTopAbilities(int32 Num) const
{
	TArray<TPair<FName, int32>> Sorted;
	Sorted.Reserve(AbilityUsage.Num());
	for (const TPair<FName, int32>& Pair : AbilityUsage)
	{
		Sorted.Add(Pair);
	}
	Sorted.Sort([](const TPair<FName, int32>& A, const TPair<FName, int32>& B)
	{
		return A.Value > B.Value;
	});

	TArray<FName> Result;
	for (int32 i = 0; i < FMath::Min(Num, Sorted.Num()); ++i)
	{
		Result.Add(Sorted[i].Key);
	}
	return Result;
}
