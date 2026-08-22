#include "Horror/KKKellerkindStalker.h"
#include "Items/KKItemPickup.h"
#include "AI/KKCreatureBase.h"
#include "AI/KKPerceptionComponent.h"
#include "Player/KKCharacter.h"
#include "Kellerkind.h"

#include "Components/SkeletalMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"

AKKKellerkindStalker::AKKKellerkindStalker()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.1f;

	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SetRootComponent(Mesh);
}

void AKKKellerkindStalker::BeginPlay()
{
	Super::BeginPlay();
	Stream.Initialize(GetUniqueID() ^ 0xc2b2ae35);
	Mesh->SetVisibility(false);
}

bool AKKKellerkindStalker::IsHelpful(EKKStalkerAction Action)
{
	switch (Action)
	{
	case EKKStalkerAction::TuerOeffnen:
	case EKKStalkerAction::ItemHinterlassen:
	case EKKStalkerAction::Retten:
		return true;
	case EKKStalkerAction::InFalleFuehren:
		return false;
	default:
		// Beobachten, Folgen, Gegner lenken und Raumveraenderung sind bewusst zweideutig.
		return true;
	}
}

EKKStalkerAction AKKKellerkindStalker::ChooseAction(float PlayerHealthFraction, bool bPlayerInDanger)
{
	// Ein fast toter Spieler wird gerettet - aber nicht immer. Genau diese Luecke
	// haelt die Frage offen, ob das Kellerkind auf Leons Seite steht.
	if (PlayerHealthFraction <= 0.2f && bPlayerInDanger && Stream.FRand() < 0.55f)
	{
		return EKKStalkerAction::Retten;
	}

	// Wenn es sich zu lange gleich verhalten hat, kippt es bewusst - der Spieler
	// soll kein verlaessliches Muster ablesen koennen.
	const bool bForceFlip = SameKindStreak >= 3;
	const bool bHelpful = bForceFlip ? !bLastWasHelpful : (Stream.FRand() < Benevolence);

	TArray<EKKStalkerAction> Pool;
	if (bHelpful)
	{
		Pool = { EKKStalkerAction::Beobachten, EKKStalkerAction::TuerOeffnen,
				 EKKStalkerAction::ItemHinterlassen, EKKStalkerAction::Folgen };
	}
	else
	{
		Pool = { EKKStalkerAction::Beobachten, EKKStalkerAction::GegnerLenken,
				 EKKStalkerAction::RaumVeraendern, EKKStalkerAction::InFalleFuehren };
	}

	return Pool[Stream.RandRange(0, Pool.Num() - 1)];
}

bool AKKKellerkindStalker::Appear(EKKStalkerAction Action, const FVector& Location)
{
	if (bVisible)
	{
		return false;
	}

	SetActorLocation(Location);
	CurrentAction = Action;
	bVisible = true;
	VisibleTime = 0.f;
	++Appearances;

	Mesh->SetVisibility(true);

	const bool bHelpful = IsHelpful(Action);
	SameKindStreak = (bHelpful == bLastWasHelpful) ? SameKindStreak + 1 : 1;
	bLastWasHelpful = bHelpful;

	// Das Verhaeltnis bewegt sich langsam in die Gegenrichtung des letzten Auftritts.
	Benevolence = FMath::Clamp(Benevolence + (bHelpful ? -0.06f : 0.06f), 0.25f, 0.75f);

	ExecuteAction();

	UE_LOG(LogKKHorror, Log, TEXT("Kellerkind erscheint (%d. Mal), Handlung=%d"),
		Appearances, static_cast<int32>(Action));
	return true;
}

void AKKKellerkindStalker::ExecuteAction()
{
	UWorld* World = GetWorld();
	APawn* Player = UGameplayStatics::GetPlayerPawn(World, 0);

	switch (CurrentAction)
	{
	case EKKStalkerAction::ItemHinterlassen:
		if (GiftItem)
		{
			AKKItemPickup::SpawnFor(World, GiftItem, GetActorLocation() + FVector(0.f, 0.f, 20.f));
		}
		break;

	case EKKStalkerAction::GegnerLenken:
		// Es zeigt den Kreaturen, wo Leon ist - oder lenkt sie von ihm weg.
		for (TActorIterator<AKKCreatureBase> It(World); It; ++It)
		{
			AKKCreatureBase* Creature = *It;
			if (!Creature || !Creature->IsAlive() || !Creature->GetPerception())
			{
				continue;
			}
			if (FVector::DistSquared(Creature->GetActorLocation(), GetActorLocation()) > FMath::Square(3000.f))
			{
				continue;
			}

			if (Player && Stream.FRand() < 0.5f)
			{
				Creature->GetPerception()->ForceTarget(Player);
			}
			else
			{
				Creature->GetPerception()->ForgetTarget();
			}
		}
		break;

	case EKKStalkerAction::Retten:
		// Es raeumt den Weg: alles in unmittelbarer Naehe verliert Leon aus den Augen.
		for (TActorIterator<AKKCreatureBase> It(World); It; ++It)
		{
			AKKCreatureBase* Creature = *It;
			if (Creature && Creature->GetPerception() &&
				FVector::DistSquared(Creature->GetActorLocation(), Player ? Player->GetActorLocation() : FVector::ZeroVector) < FMath::Square(1600.f))
			{
				Creature->GetPerception()->ForgetTarget();
			}
		}
		break;

	default:
		break;
	}
}

void AKKKellerkindStalker::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!bVisible)
	{
		return;
	}

	VisibleTime += DeltaTime;

	const APawn* Player = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	const float Distance = Player ? FVector::Dist(Player->GetActorLocation(), GetActorLocation()) : 100000.f;

	// Es laesst sich nie einholen. Wer darauf zugeht, findet einen leeren Raum.
	if (Distance < VanishDistance || VisibleTime > MaxVisibleTime)
	{
		Vanish();
		return;
	}

	if (CurrentAction == EKKStalkerAction::Folgen && Player)
	{
		const FVector Desired = Player->GetActorLocation() - Player->GetActorForwardVector() * 900.f;
		SetActorLocation(FMath::VInterpTo(GetActorLocation(), Desired, DeltaTime, 0.6f));
	}

	if (Player)
	{
		FVector Look = Player->GetActorLocation() - GetActorLocation();
		Look.Z = 0.f;
		SetActorRotation(Look.Rotation());
	}
}

void AKKKellerkindStalker::Vanish()
{
	bVisible = false;
	VisibleTime = 0.f;
	Mesh->SetVisibility(false);
}
