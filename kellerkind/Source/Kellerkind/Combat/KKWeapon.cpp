#include "Combat/KKWeapon.h"
#include "Player/KKCharacter.h"
#include "Player/KKStatsComponent.h"
#include "AI/KKCreatureBase.h"
#include "Components/SkeletalMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "NiagaraFunctionLibrary.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "Camera/CameraComponent.h"
#include "Engine/OverlapResult.h"
#include "TimerManager.h"

AKKWeapon::AKKWeapon()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(true);
	SetRootComponent(Mesh);
}

void AKKWeapon::SetWielder(AKKCharacter* InWielder)
{
	Wielder = InWielder;
}

void AKKWeapon::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
}

float AKKWeapon::GetAttackInterval() const
{
	float Speed = BaseAttacksPerSecond;
	if (Wielder && Wielder->GetStats())
	{
		Speed *= Wielder->GetStats()->GetStat(EKKStat::AttackSpeed);
	}
	return 1.f / FMath::Max(0.1f, Speed);
}

bool AKKWeapon::IsReady() const
{
	const UWorld* World = GetWorld();
	return World && !bWindingUp && World->GetTimeSeconds() >= NextAttackAt;
}

bool AKKWeapon::TryAttack(bool bHeavy)
{
	if (!Wielder || !IsReady())
	{
		return false;
	}

	const UWorld* World = GetWorld();
	NextAttackAt = World->GetTimeSeconds() + GetAttackInterval() * (bHeavy ? 1.8f : 1.f);

	if (UAnimInstance* Anim = Wielder->GetMesh() ? Wielder->GetMesh()->GetAnimInstance() : nullptr)
	{
		if (UAnimMontage* Montage = bHeavy ? HeavyAttackMontage : LightAttackMontage)
		{
			Anim->Montage_Play(Montage, bHeavy ? 1.f : FMath::Max(0.5f, 1.f / GetAttackInterval()));
		}
	}

	if (!AttackSound.IsNull())
	{
		UGameplayStatics::PlaySoundAtLocation(this, AttackSound.LoadSynchronous(), GetActorLocation());
	}
	Wielder->EmitNoise(AttackNoise, 300.f + AttackNoise * 2200.f, GetActorLocation());

	const bool bMelee = (Mode == EKKWeaponMode::Nahkampf);

	if (bHeavy && HeavyWindup > 0.f)
	{
		// Schwere Angriffe haben eine sichtbare Ausholphase - Kreaturen koennen darauf reagieren.
		bWindingUp = true;
		FTimerDelegate Delegate;
		Delegate.BindLambda([this, bMelee, bHeavy]()
		{
			bWindingUp = false;
			bMelee ? PerformMelee(bHeavy) : PerformShot(bHeavy);
		});
		GetWorldTimerManager().SetTimer(WindupHandle, Delegate, HeavyWindup, false);
	}
	else
	{
		bMelee ? PerformMelee(bHeavy) : PerformShot(bHeavy);
	}
	return true;
}

void AKKWeapon::PerformMelee(bool bHeavy)
{
	if (!Wielder || !Wielder->GetStats())
	{
		return;
	}

	const float Reach = Wielder->GetStats()->GetStat(EKKStat::Range);
	const FVector Origin = Wielder->GetActorLocation();
	const FVector Forward = Wielder->GetControlRotation().Vector();

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKMelee), false, Wielder);
	GetWorld()->OverlapMultiByObjectType(
		Overlaps, Origin + Forward * Reach * 0.5f, FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeSphere(Reach * 0.5f + SwingRadius), Params);

	const float CosLimit = FMath::Cos(FMath::DegreesToRadians(SwingHalfAngle));
	const float Factor = bHeavy ? HeavyDamageFactor : DamageFactor;

	for (const FOverlapResult& Overlap : Overlaps)
	{
		AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Overlap.GetActor());
		if (!Creature || !Creature->IsAlive())
		{
			continue;
		}

		// Nur was im Schwungkegel liegt, wird getroffen - Rundumschlaege gibt es nur per Item.
		const FVector ToTarget = (Creature->GetActorLocation() - Origin).GetSafeNormal();
		if (FVector::DotProduct(ToTarget, Forward) < CosLimit)
		{
			continue;
		}

		const FVector HitPoint = Creature->GetActorLocation();
		Wielder->DealDamage(Creature, Factor, Element, WeaponId, HitPoint, -ToTarget);

		if (!ImpactEffect.IsNull())
		{
			UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), ImpactEffect.LoadSynchronous(), HitPoint);
		}
	}
}

void AKKWeapon::PerformShot(bool bHeavy)
{
	if (!Wielder || !Wielder->GetCamera() || !Wielder->GetStats())
	{
		return;
	}

	const FVector Start = Wielder->GetCamera()->GetComponentLocation();
	const FRotator BaseRotation = Wielder->GetControlRotation();
	const float Distance = Wielder->GetStats()->GetStat(EKKStat::Range) * ShotRangeMultiplier;
	const float Factor = (bHeavy ? HeavyDamageFactor : DamageFactor) / FMath::Max(1, PelletCount);

	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKShot), true, Wielder);

	for (int32 i = 0; i < FMath::Max(1, PelletCount); ++i)
	{
		FRotator Rotation = BaseRotation;
		if (SpreadDegrees > 0.f)
		{
			Rotation.Yaw += FMath::FRandRange(-SpreadDegrees, SpreadDegrees);
			Rotation.Pitch += FMath::FRandRange(-SpreadDegrees, SpreadDegrees);
		}

		FHitResult Hit;
		const FVector End = Start + Rotation.Vector() * Distance;
		if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
		{
			if (AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Hit.GetActor()))
			{
				Wielder->DealDamage(Creature, Factor, Element, WeaponId, Hit.ImpactPoint, Hit.ImpactNormal);
			}

			if (!ImpactEffect.IsNull())
			{
				UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), ImpactEffect.LoadSynchronous(), Hit.ImpactPoint);
			}
		}
	}
}

void AKKWeapon::AddWeaponLayer(FName LayerId, float Strength)
{
	float& Value = WeaponLayers.FindOrAdd(LayerId);
	Value = FMath::Clamp(Value + Strength, 0.f, 1.f);
	ApplyWeaponLayersToMaterials();
}

void AKKWeapon::ApplyWeaponLayersToMaterials()
{
	for (int32 i = 0; i < Mesh->GetNumMaterials(); ++i)
	{
		UMaterialInstanceDynamic* Material = Cast<UMaterialInstanceDynamic>(Mesh->GetMaterial(i));
		if (!Material)
		{
			Material = Mesh->CreateAndSetMaterialInstanceDynamic(i);
		}
		if (!Material)
		{
			continue;
		}
		for (const TPair<FName, float>& Layer : WeaponLayers)
		{
			Material->SetScalarParameterValue(Layer.Key, Layer.Value);
		}
	}
}
