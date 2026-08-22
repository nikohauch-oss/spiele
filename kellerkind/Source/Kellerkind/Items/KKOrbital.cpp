#include "Items/KKOrbital.h"
#include "Player/KKCharacter.h"
#include "AI/KKCreatureBase.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/OverlapResult.h"

AKKOrbital::AKKOrbital()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(true);
	SetRootComponent(Mesh);
}

void AKKOrbital::Configure(AActor* InOwner, float InPhaseDegrees)
{
	Carrier = InOwner;
	Phase = InPhaseDegrees;
}

void AKKOrbital::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	AActor* Owner = Carrier.Get();
	if (!Owner)
	{
		Destroy();
		return;
	}

	Phase = FMath::Fmod(Phase + OrbitSpeed * DeltaTime, 360.f);

	const FVector Offset = FRotator(0.f, Phase, 0.f).Vector() * OrbitRadius + FVector(0.f, 0.f, OrbitHeight);
	SetActorLocation(Owner->GetActorLocation() + Offset);
	SetActorRotation(FRotator(0.f, Phase + 90.f, 0.f));

	CheckContacts();
}

void AKKOrbital::CheckContacts()
{
	AKKCharacter* Character = Cast<AKKCharacter>(Carrier.Get());
	if (!Character)
	{
		return;
	}

	const double Now = GetWorld()->GetTimeSeconds();

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKOrbital), false, this);
	Params.AddIgnoredActor(Character);
	GetWorld()->OverlapMultiByObjectType(
		Overlaps, GetActorLocation(), FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeSphere(45.f), Params);

	for (const FOverlapResult& Overlap : Overlaps)
	{
		AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Overlap.GetActor());
		if (!Creature || !Creature->IsAlive())
		{
			continue;
		}

		const double* Last = LastHitTimes.Find(Creature);
		if (Last && (Now - *Last) < HitInterval)
		{
			continue;
		}
		LastHitTimes.Add(Creature, Now);

		Character->DealDamage(Creature, ContactDamage, Element, TEXT("Orbital"),
			Creature->GetActorLocation(), FVector::UpVector);
	}
}
