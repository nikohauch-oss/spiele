#include "Items/KKFamiliar.h"
#include "Player/KKCharacter.h"
#include "AI/KKCreatureBase.h"
#include "Level/KKBreakableWall.h"
#include "Items/KKItemPickup.h"

#include "Components/SkeletalMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "EngineUtils.h"

AKKFamiliar::AKKFamiliar()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SetRootComponent(Mesh);

	Light = CreateDefaultSubobject<UPointLightComponent>(TEXT("Light"));
	Light->SetupAttachment(Mesh);
	Light->SetIntensity(0.f);
	Light->SetAttenuationRadius(900.f);
}

void AKKFamiliar::AttachToOwner(AActor* InOwner, int32 SlotIndex)
{
	Carrier = InOwner;
	Slot = SlotIndex;

	if (Role == EKKFamiliarRole::Licht)
	{
		Light->SetIntensity(2600.f);
		Light->SetLightColor(FLinearColor(1.f, 0.86f, 0.62f));
		Light->SetCastShadows(true);
	}
}

void AKKFamiliar::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	AActor* Owner = Carrier.Get();
	if (!Owner)
	{
		Destroy();
		return;
	}

	// Jeder Begleiter bekommt einen eigenen Platz hinter Leon, damit sie sich nicht ueberlagern.
	BobPhase += DeltaTime;
	const float SlotAngle = 140.f + Slot * 55.f;
	const FVector Offset = Owner->GetActorRotation().RotateVector(
		FRotator(0.f, SlotAngle, 0.f).Vector() * FollowDistance)
		+ FVector(0.f, 0.f, FollowHeight + FMath::Sin(BobPhase * 2.2f + Slot) * 12.f);

	const FVector Desired = Owner->GetActorLocation() + Offset;
	SetActorLocation(FMath::VInterpTo(GetActorLocation(), Desired, DeltaTime, FollowSpeed));

	PerformRole(DeltaTime);
}

AActor* AKKFamiliar::FindNearestEnemy() const
{
	AActor* Best = nullptr;
	float BestDistSq = FMath::Square(ActionRange);

	for (TActorIterator<AKKCreatureBase> It(GetWorld()); It; ++It)
	{
		AKKCreatureBase* Creature = *It;
		if (!Creature || !Creature->IsAlive())
		{
			continue;
		}
		const float DistSq = FVector::DistSquared(Creature->GetActorLocation(), GetActorLocation());
		if (DistSq < BestDistSq)
		{
			BestDistSq = DistSq;
			Best = Creature;
		}
	}
	return Best;
}

void AKKFamiliar::PerformRole(float DeltaTime)
{
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextActionAt)
	{
		return;
	}

	AKKCharacter* Character = Cast<AKKCharacter>(Carrier.Get());
	if (!Character)
	{
		return;
	}

	switch (Role)
	{
	case EKKFamiliarRole::Schuetze:
	case EKKFamiliarRole::Nahkampf:
		if (AActor* Enemy = FindNearestEnemy())
		{
			NextActionAt = Now + ActionCooldown;
			// Der Schaden laeuft ueber Leon, damit Item- und Synergie-Hooks auch fuer
			// Begleiter gelten - ein Feuer-Build faerbt so auch die Puppe ein.
			Character->DealDamage(Enemy, ActionDamage, Element, FamiliarId,
				Enemy->GetActorLocation(), FVector::UpVector);
		}
		break;

	case EKKFamiliarRole::Spuerer:
		NextActionAt = Now + 2.f;
		for (TActorIterator<AKKBreakableWall> It(GetWorld()); It; ++It)
		{
			AKKBreakableWall* Wall = *It;
			if (Wall && Wall->bLeadsToSecret && !Wall->IsBroken() &&
				FVector::DistSquared(Wall->GetActorLocation(), GetActorLocation()) < FMath::Square(2500.f))
			{
				Wall->Reveal();
			}
		}
		break;

	case EKKFamiliarRole::Sammler:
		NextActionAt = Now + 0.5f;
		for (TActorIterator<AKKItemPickup> It(GetWorld()); It; ++It)
		{
			AKKItemPickup* Pickup = *It;
			if (Pickup && Pickup->GetPrice() <= 0 &&
				FVector::DistSquared(Pickup->GetActorLocation(), GetActorLocation()) < FMath::Square(400.f))
			{
				// Die Kleine Hand traegt Gegenstaende zu Leon, nimmt sie ihm aber nicht ab:
				// aufnehmen muss er selbst.
				Pickup->SetActorLocation(FMath::VInterpTo(Pickup->GetActorLocation(),
					Character->GetActorLocation(), DeltaTime, 2.f));
			}
		}
		break;

	default:
		NextActionAt = Now + 1.f;
		break;
	}
}
