#include "AI/KKAIController.h"
#include "AI/KKCreatureBase.h"
#include "AI/KKPerceptionComponent.h"
#include "AI/KKSenseSubsystem.h"
#include "Kellerkind.h"

#include "GameFramework/CharacterMovementComponent.h"
#include "Navigation/PathFollowingComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

AKKAIController::AKKAIController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.1f;
	bAttachToPawn = false;
}

AKKCreatureBase* AKKAIController::GetCreature() const
{
	return Cast<AKKCreatureBase>(GetPawn());
}

UKKPerceptionComponent* AKKAIController::GetPerception() const
{
	const AKKCreatureBase* Creature = GetCreature();
	return Creature ? Creature->GetPerception() : nullptr;
}

EKKTactic AKKAIController::GetTactic() const
{
	const AKKCreatureBase* Creature = GetCreature();
	return (Creature && Creature->GetData()) ? Creature->GetData()->Tactic : EKKTactic::Direkt;
}

void AKKAIController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	Stream.Initialize(InPawn ? InPawn->GetUniqueID() : 1337);
	OrbitDirection = Stream.FRand() < 0.5f ? -1.f : 1.f;
	OrbitAngle = Stream.FRandRange(0.f, 360.f);

	if (UKKPerceptionComponent* Perception = GetPerception())
	{
		Perception->OnTargetSpotted.AddDynamic(this, &AKKAIController::HandleTargetSpotted);
		Perception->OnStimulusHeard.AddDynamic(this, &AKKAIController::HandleStimulusHeard);
		Perception->OnTargetLost.AddDynamic(this, &AKKAIController::HandleTargetLost);
	}

	// Kreaturen, die auf ihr Opfer warten, starten nicht in der Patrouille.
	const EKKTactic Tactic = GetTactic();
	EnterState((Tactic == EKKTactic::Hinterhalt || Tactic == EKKTactic::Decke || Tactic == EKKTactic::Beobachter)
		? EKKAIState::Lauern : EKKAIState::Patrouille);
}

void AKKAIController::OnUnPossess()
{
	if (UKKPerceptionComponent* Perception = GetPerception())
	{
		Perception->OnTargetSpotted.RemoveDynamic(this, &AKKAIController::HandleTargetSpotted);
		Perception->OnStimulusHeard.RemoveDynamic(this, &AKKAIController::HandleStimulusHeard);
		Perception->OnTargetLost.RemoveDynamic(this, &AKKAIController::HandleTargetLost);
	}
	Super::OnUnPossess();
}

float AKKAIController::TimeInState() const
{
	const UWorld* World = GetWorld();
	return World ? static_cast<float>(World->GetTimeSeconds() - StateEnteredAt) : 0.f;
}

void AKKAIController::EnterState(EKKAIState NewState)
{
	if (State == NewState)
	{
		return;
	}

	State = NewState;
	StateEnteredAt = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;

	if (AKKCreatureBase* Creature = GetCreature())
	{
		Creature->SetAIState(NewState);
	}

	if (NewState == EKKAIState::Suchen)
	{
		// Suchen heisst: mehrere Punkte rund um den letzten Hinweis abgehen,
		// nicht nur einmal hinlaufen und aufgeben.
		SearchStepsLeft = 4;
		NextSearchStepAt = 0.0;
	}
}

void AKKAIController::HandleTargetSpotted(AActor* Target)
{
	if (!GetCreature() || !GetCreature()->IsAlive())
	{
		return;
	}

	EnterState(EKKAIState::Jagd);

	// Rudeltiere rufen ihr Rudel; Einzelgaenger jagen still.
	if (GetTactic() == EKKTactic::Rudel)
	{
		if (UKKSenseSubsystem* Senses = GetWorld()->GetSubsystem<UKKSenseSubsystem>())
		{
			Senses->RaiseAlarm(GetPawn()->GetActorLocation(), 2500.f, GetPawn());
		}
	}
}

void AKKAIController::HandleStimulusHeard(FVector Location)
{
	if (State == EKKAIState::Jagd || State == EKKAIState::Angriff || State == EKKAIState::Tot)
	{
		return;
	}

	SearchAnchor = Location;
	EnterState(EKKAIState::Untersuchen);
}

void AKKAIController::HandleTargetLost()
{
	if (State == EKKAIState::Tot)
	{
		return;
	}

	if (UKKPerceptionComponent* Perception = GetPerception())
	{
		SearchAnchor = Perception->GetLastKnownLocation();
	}
	EnterState(EKKAIState::Suchen);
}

void AKKAIController::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	AKKCreatureBase* Creature = GetCreature();
	if (!Creature || !Creature->IsAlive())
	{
		return;
	}

	switch (State)
	{
	case EKKAIState::Idle:        TickIdle(DeltaTime); break;
	case EKKAIState::Patrouille:  TickPatrol(DeltaTime); break;
	case EKKAIState::Untersuchen: TickInvestigate(DeltaTime); break;
	case EKKAIState::Suchen:      TickSearch(DeltaTime); break;
	case EKKAIState::Jagd:        TickHunt(DeltaTime); break;
	case EKKAIState::Angriff:     TickAttack(DeltaTime); break;
	case EKKAIState::Lauern:      TickLurk(DeltaTime); break;
	default: break;
	}
}

void AKKAIController::TickIdle(float DeltaTime)
{
	if (TimeInState() > 3.f)
	{
		EnterState(EKKAIState::Patrouille);
	}
}

void AKKAIController::TickPatrol(float DeltaTime)
{
	if (GetMoveStatus() == EPathFollowingStatus::Moving)
	{
		return;
	}

	// Kurze Wege, lange Pausen: Kreaturen sollen im Keller stehen und lauschen,
	// nicht wie Wachen im Kreis marschieren.
	if (TimeInState() < Stream.FRandRange(2.f, 6.f))
	{
		return;
	}

	const FVector Origin = GetPawn()->GetActorLocation();
	const FVector Target = Origin + FVector(Stream.FRandRange(-900.f, 900.f), Stream.FRandRange(-900.f, 900.f), 0.f);
	MoveToLocationSafe(Target, 120.f);
	StateEnteredAt = GetWorld()->GetTimeSeconds();
}

void AKKAIController::TickInvestigate(float DeltaTime)
{
	if (GetMoveStatus() != EPathFollowingStatus::Moving)
	{
		const float DistSq = FVector::DistSquared(GetPawn()->GetActorLocation(), SearchAnchor);
		if (DistSq > FMath::Square(150.f) && TimeInState() < 12.f)
		{
			MoveToLocationSafe(SearchAnchor);
		}
		else
		{
			EnterState(EKKAIState::Suchen);
		}
	}
}

void AKKAIController::TickSearch(float DeltaTime)
{
	const double Now = GetWorld()->GetTimeSeconds();

	if (SearchStepsLeft <= 0)
	{
		EnterState(EKKAIState::Patrouille);
		return;
	}

	if (GetMoveStatus() == EPathFollowingStatus::Moving || Now < NextSearchStepAt)
	{
		return;
	}

	--SearchStepsLeft;
	NextSearchStepAt = Now + Stream.FRandRange(1.2f, 2.6f);

	// Der Suchradius waechst mit jedem Schritt - die Kreatur weitet den Kreis.
	const float Radius = 250.f + (4 - SearchStepsLeft) * 300.f;
	const float Angle = Stream.FRandRange(0.f, 360.f);
	const FVector Offset = FRotator(0.f, Angle, 0.f).Vector() * Radius;
	MoveToLocationSafe(SearchAnchor + Offset, 140.f);
}

void AKKAIController::TickHunt(float DeltaTime)
{
	UKKPerceptionComponent* Perception = GetPerception();
	AKKCreatureBase* Creature = GetCreature();
	if (!Perception || !Creature || !Creature->GetData())
	{
		return;
	}

	AActor* Target = Perception->GetTarget();
	if (!Target)
	{
		EnterState(EKKAIState::Suchen);
		return;
	}

	const float Distance = FVector::Dist(GetPawn()->GetActorLocation(), Target->GetActorLocation());
	if (Distance <= Creature->GetData()->AttackRange)
	{
		EnterState(EKKAIState::Angriff);
		return;
	}

	MoveForTactic(Target, DeltaTime);
}

void AKKAIController::MoveForTactic(AActor* Target, float DeltaTime)
{
	const FVector TargetLocation = Target->GetActorLocation();
	const FVector Self = GetPawn()->GetActorLocation();
	const AKKCreatureBase* Creature = GetCreature();
	const float AttackRange = Creature && Creature->GetData() ? Creature->GetData()->AttackRange : 160.f;

	switch (GetTactic())
	{
	case EKKTactic::Rudel:
	{
		// Rudeltiere laufen nicht frontal an, sondern kreisen und schliessen von der Seite.
		OrbitAngle += OrbitDirection * DeltaTime * 70.f;
		const float Radius = AttackRange * 2.6f;
		const FVector Offset = FRotator(0.f, OrbitAngle, 0.f).Vector() * Radius;
		MoveToLocationSafe(TargetLocation + Offset, 100.f);

		// Von Zeit zu Zeit bricht einer aus dem Kreis aus und greift an.
		if (Stream.FRand() < DeltaTime * 0.25f)
		{
			MoveToActor(Target, AttackRange * 0.8f);
		}
		break;
	}

	case EKKTactic::Fernkampf:
	{
		const float Distance = FVector::Dist(Self, TargetLocation);
		const float Preferred = AttackRange * 0.85f;
		if (Distance < Preferred * 0.6f)
		{
			// Zu nah: Abstand wieder herstellen.
			const FVector Away = (Self - TargetLocation).GetSafeNormal() * Preferred;
			MoveToLocationSafe(TargetLocation + Away, 120.f);
		}
		else
		{
			MoveToActor(Target, Preferred);
		}
		break;
	}

	case EKKTactic::Beobachter:
	{
		// Bewegt sich ausschliesslich, solange der Spieler nicht hinsieht.
		if (GetCreature() && GetCreature()->IsObservedByPlayer())
		{
			StopMovement();
			bMovedWhileUnobserved = false;
		}
		else
		{
			MoveToActor(Target, AttackRange * 0.7f);
			bMovedWhileUnobserved = true;
		}
		break;
	}

	case EKKTactic::Schatten:
	{
		// Meidet helle Bereiche: naehert sich nur, wenn der direkte Weg dunkel genug ist.
		MoveToActor(Target, AttackRange * 0.9f);
		break;
	}

	default:
		MoveToActor(Target, AttackRange * 0.8f);
		break;
	}
}

void AKKAIController::TickAttack(float DeltaTime)
{
	AKKCreatureBase* Creature = GetCreature();
	UKKPerceptionComponent* Perception = GetPerception();
	if (!Creature || !Perception)
	{
		return;
	}

	AActor* Target = Perception->GetTarget();
	if (!Target)
	{
		EnterState(EKKAIState::Suchen);
		return;
	}

	const float Distance = FVector::Dist(GetPawn()->GetActorLocation(), Target->GetActorLocation());
	const float Range = Creature->GetData() ? Creature->GetData()->AttackRange : 160.f;

	if (Distance > Range * 1.4f)
	{
		EnterState(EKKAIState::Jagd);
		return;
	}

	StopMovement();
	SetFocus(Target);
	Creature->PerformAttack(Target);
}

void AKKAIController::TickLurk(float DeltaTime)
{
	UKKPerceptionComponent* Perception = GetPerception();
	if (!Perception)
	{
		return;
	}

	StopMovement();

	AActor* Target = Perception->GetTarget();
	if (!Target)
	{
		return;
	}

	const float Distance = FVector::Dist(GetPawn()->GetActorLocation(), Target->GetActorLocation());

	switch (GetTactic())
	{
	case EKKTactic::Hinterhalt:
		// Erst zuschlagen, wenn das Ziel wirklich nah ist - vorher bleibt sie reglos.
		if (Distance < 400.f)
		{
			EnterState(EKKAIState::Jagd);
		}
		break;

	case EKKTactic::Decke:
		// Von der Decke fallen lassen, sobald das Ziel darunter steht.
		if (Distance < 320.f)
		{
			if (ACharacter* Character = Cast<ACharacter>(GetPawn()))
			{
				Character->GetCharacterMovement()->SetMovementMode(MOVE_Falling);
			}
			EnterState(EKKAIState::Jagd);
		}
		break;

	case EKKTactic::Beobachter:
		// Naehert sich nur, wenn niemand hinsieht - und bleibt sonst stehen.
		if (GetCreature() && !GetCreature()->IsObservedByPlayer())
		{
			EnterState(EKKAIState::Jagd);
		}
		break;

	default:
		EnterState(EKKAIState::Jagd);
		break;
	}
}

void AKKAIController::MoveToLocationSafe(const FVector& Location, float Acceptance)
{
	MoveToLocation(Location, Acceptance, true, true, false, true);
}
