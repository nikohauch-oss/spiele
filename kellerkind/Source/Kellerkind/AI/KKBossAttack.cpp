#include "AI/KKBossAttack.h"
#include "AI/KKBossBase.h"

UWorld* UKKBossAttack::GetWorld() const
{
	return Boss.IsValid() ? Boss->GetWorld() : nullptr;
}

bool UKKBossAttack::CanUse(AActor* Target) const
{
	if (!Boss.IsValid() || !Target)
	{
		return false;
	}

	const UWorld* World = Boss->GetWorld();
	if (World && World->GetTimeSeconds() < ReadyAt)
	{
		return false;
	}

	if (AllowedPhases.Num() > 0 && !AllowedPhases.Contains(Boss->GetPhaseIndex()))
	{
		return false;
	}

	const float Distance = FVector::Dist(Boss->GetActorLocation(), Target->GetActorLocation());
	return Distance >= MinRange && Distance <= MaxRange;
}
