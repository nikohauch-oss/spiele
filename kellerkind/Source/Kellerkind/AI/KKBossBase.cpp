#include "AI/KKBossBase.h"
#include "AI/KKBossAttack.h"
#include "AI/KKPerceptionComponent.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"

AKKBossBase::AKKBossBase()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.05f;
}

void AKKBossBase::BeginPlay()
{
	Super::BeginPlay();

	BossStream.Initialize(GetUniqueID() ^ 0x85ebca6b);

	for (UKKBossAttack* Attack : Attacks)
	{
		if (Attack)
		{
			Attack->Initialize(this);
		}
	}

	// Phasen absteigend nach Schwelle sortieren, damit der Vergleich unten stimmt,
	// egal in welcher Reihenfolge sie im Editor eingetragen wurden.
	Phases.Sort([](const FKKBossPhase& A, const FKKBossPhase& B)
	{
		return A.HealthThreshold > B.HealthThreshold;
	});
}

const FKKBossPhase& AKKBossBase::GetPhase() const
{
	static const FKKBossPhase Fallback;
	return Phases.IsValidIndex(PhaseIndex) ? Phases[PhaseIndex] : Fallback;
}

bool AKKBossBase::IsInTransition() const
{
	const UWorld* World = GetWorld();
	return World && World->GetTimeSeconds() < TransitionUntil;
}

void AKKBossBase::BeginEncounter(AActor* InTarget)
{
	EncounterTarget = InTarget;
	bEncounterActive = true;

	if (Perception && InTarget)
	{
		Perception->ForceTarget(InTarget);
	}

	EnterPhase(0);
	UE_LOG(LogKellerkind, Log, TEXT("Bosskampf beginnt: %s"), *BossName.ToString());
}

void AKKBossBase::EnterPhase(int32 NewPhaseIndex)
{
	if (!Phases.IsValidIndex(NewPhaseIndex))
	{
		return;
	}

	PhaseIndex = NewPhaseIndex;
	const FKKBossPhase& Phase = Phases[PhaseIndex];

	if (Data)
	{
		GetCharacterMovement()->MaxWalkSpeed = Data->SprintSpeed * Phase.MoveSpeedMultiplier;
	}

	// Der Phasenwechsel ist ein Fenster: Der Boss ist kurz gebunden und verwundbar.
	TransitionUntil = GetWorld()->GetTimeSeconds() + Phase.TransitionDuration;
	BusyUntil = TransitionUntil;

	if (Phase.TransitionMontage && GetMesh() && GetMesh()->GetAnimInstance())
	{
		GetMesh()->GetAnimInstance()->Montage_Play(Phase.TransitionMontage);
	}

	if (!Phase.ArenaEventTag.IsNone())
	{
		OnArenaEvent.Broadcast(Phase.ArenaEventTag, PhaseIndex);
	}

	OnPhaseChanged.Broadcast(PhaseIndex);
	OnPhaseEntered(PhaseIndex);

	UE_LOG(LogKellerkind, Log, TEXT("%s - Phase %d (%s)"), *BossName.ToString(), PhaseIndex + 1, *Phase.PhaseId.ToString());
}

int32 AKKBossBase::ReceiveDamage(const FKKDamageEvent& Event)
{
	FKKDamageEvent Modified = Event;

	const FKKBossPhase& Phase = GetPhase();
	Modified.Amount *= Phase.DamageTakenMultiplier;

	// Waehrend des Phasenuebergangs trifft es den Boss haerter - das belohnt Aufmerksamkeit.
	if (IsInTransition())
	{
		Modified.Amount *= 1.5f;
	}

	const int32 Dealt = Super::ReceiveDamage(Modified);

	// Phasenwechsel pruefen: naechste Phase, sobald die Schwelle unterschritten ist.
	const float Fraction = GetHealthFraction();
	for (int32 i = Phases.Num() - 1; i > PhaseIndex; --i)
	{
		if (Fraction <= Phases[i].HealthThreshold)
		{
			EnterPhase(i);
			break;
		}
	}

	return Dealt;
}

void AKKBossBase::RegisterWeakPointHit(FName WeakPointId, const FKKDamageEvent& Event)
{
	const float* Multiplier = WeakPointMultipliers.Find(WeakPointId);
	if (!Multiplier)
	{
		return;
	}

	FKKDamageEvent WeakHit = Event;
	WeakHit.Amount *= *Multiplier;
	WeakHit.SourceTag = TEXT("Schwachstelle");
	ReceiveDamage(WeakHit);
}

void AKKBossBase::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!bEncounterActive || !IsAlive())
	{
		return;
	}

	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < BusyUntil)
	{
		return;
	}

	AActor* Target = EncounterTarget.Get();
	if (!Target)
	{
		return;
	}

	if (UKKBossAttack* Attack = SelectAttack(Target))
	{
		const float Duration = Attack->Execute(Target);
		Attack->ReadyAt = Now + Attack->Cooldown / FMath::Max(0.1f, GetPhase().AttackRateMultiplier);
		BusyUntil = Now + Attack->TelegraphTime + Duration;
	}
}

UKKBossAttack* AKKBossBase::SelectAttack(AActor* InTarget)
{
	TArray<UKKBossAttack*> Usable;
	TArray<float> Weights;
	float Total = 0.f;

	for (UKKBossAttack* Attack : Attacks)
	{
		if (Attack && Attack->CanUse(InTarget))
		{
			Usable.Add(Attack);
			Weights.Add(FMath::Max(0.01f, Attack->Weight));
			Total += Weights.Last();
		}
	}

	if (Usable.Num() == 0)
	{
		return nullptr;
	}

	float Pick = BossStream.FRandRange(0.f, Total);
	for (int32 i = 0; i < Usable.Num(); ++i)
	{
		Pick -= Weights[i];
		if (Pick <= 0.f)
		{
			return Usable[i];
		}
	}
	return Usable.Last();
}

void AKKBossBase::Die(AActor* Killer)
{
	bEncounterActive = false;

	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			++Run->BossesKilled;
		}
	}

	Super::Die(Killer);
}
