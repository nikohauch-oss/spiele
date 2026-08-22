#include "Combat/KKBomb.h"
#include "Combat/KKDamageLibrary.h"
#include "Level/KKBreakableWall.h"
#include "Player/KKCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "EngineUtils.h"
#include "TimerManager.h"

AKKBomb::AKKBomb()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionProfileName(TEXT("PhysicsActor"));
	Mesh->SetSimulatePhysics(true);
	SetRootComponent(Mesh);
}

void AKKBomb::BeginPlay()
{
	Super::BeginPlay();
	GetWorldTimerManager().SetTimer(FuseHandle, this, &AKKBomb::Explode, FuseTime, false);
}

void AKKBomb::Explode()
{
	const FVector Center = GetActorLocation();

	UKKDamageLibrary::ApplyRadialDamage(this, Center, Radius, Damage, EKKElement::Physisch, GetOwner(), TEXT("Bombe"));

	// Sprengbare Waende in Reichweite oeffnen - so findet man Geheimraeume.
	for (TActorIterator<AKKBreakableWall> It(GetWorld()); It; ++It)
	{
		AKKBreakableWall* Wall = *It;
		if (Wall && FVector::DistSquared(Wall->GetActorLocation(), Center) < FMath::Square(Radius))
		{
			Wall->Break(GetOwner());
		}
	}

	if (!ExplosionEffect.IsNull())
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), ExplosionEffect.LoadSynchronous(), Center);
	}

	// Eine Explosion ist das lauteste Ereignis im Keller.
	if (AKKCharacter* Character = Cast<AKKCharacter>(GetOwner()))
	{
		Character->EmitNoise(1.f, 4500.f, Center);
	}

	Destroy();
}
