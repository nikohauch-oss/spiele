#include "AI/KKBoss_AnderesKind.h"
#include "AI/KKBossAttack.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

AKKBoss_AnderesKind::AKKBoss_AnderesKind()
{
	BossName = NSLOCTEXT("Kellerkind", "AnderesKind", "Das Andere Kind");
}

void AKKBoss_AnderesKind::OnPhaseEntered(int32 NewPhaseIndex)
{
	Super::OnPhaseEntered(NewPhaseIndex);

	if (NewPhaseIndex >= ImitationPhase && Imitated.Num() == 0)
	{
		BuildImitation();
	}
}

void AKKBoss_AnderesKind::BuildImitation()
{
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	if (!Run)
	{
		return;
	}

	// Die haeufigsten Aktionen des Spielers in diesem Run - nicht die staerksten.
	// Das Andere Kind imitiert Gewohnheiten, keine Zahlenwerte.
	const TArray<FName> Top = Run->GetTopAbilities(ImitationCount * 2);

	for (const FName& Ability : Top)
	{
		const FName* AttackId = AbilityToAttack.Find(Ability);
		if (!AttackId)
		{
			continue;
		}

		for (UKKBossAttack* Attack : Attacks)
		{
			if (Attack && Attack->AttackId == *AttackId)
			{
				// Freigeschaltete Imitationen werden gewichtet bevorzugt eingesetzt.
				Attack->AllowedPhases.AddUnique(PhaseIndex);
				Attack->AllowedPhases.AddUnique(PhaseIndex + 1);
				Attack->Weight *= 2.f;
				Imitated.AddUnique(Ability);
				break;
			}
		}

		if (Imitated.Num() >= ImitationCount)
		{
			break;
		}
	}

	UE_LOG(LogKellerkind, Log, TEXT("Das Andere Kind imitiert %d Faehigkeiten des Spielers."), Imitated.Num());
}
