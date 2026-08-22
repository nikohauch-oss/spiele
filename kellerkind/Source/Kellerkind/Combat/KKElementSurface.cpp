#include "Combat/KKElementSurface.h"
#include "Combat/KKStatusEffectComponent.h"
#include "Components/BoxComponent.h"
#include "Components/DecalComponent.h"
#include "NiagaraComponent.h"
#include "Engine/OverlapResult.h"
#include "EngineUtils.h"

AKKElementSurface::AKKElementSurface()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.1f;

	Volume = CreateDefaultSubobject<UBoxComponent>(TEXT("Volume"));
	Volume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Volume->SetCollisionResponseToAllChannels(ECR_Overlap);
	Volume->SetGenerateOverlapEvents(true);
	SetRootComponent(Volume);

	Decal = CreateDefaultSubobject<UDecalComponent>(TEXT("Decal"));
	Decal->SetupAttachment(Volume);
	Decal->SetRelativeRotation(FRotator(-90.f, 0.f, 0.f));

	Effect = CreateDefaultSubobject<UNiagaraComponent>(TEXT("Effect"));
	Effect->SetupAttachment(Volume);
}

void AKKElementSurface::BeginPlay()
{
	Super::BeginPlay();
	Volume->SetBoxExtent(FVector(Radius, Radius, 60.f));
	Decal->DecalSize = FVector(70.f, Radius, Radius);
}

AKKElementSurface* AKKElementSurface::Spawn(UWorld* World, EKKStatus InType, const FVector& Location,
	float InRadius, float InDuration, AActor* Instigator)
{
	if (!World)
	{
		return nullptr;
	}

	// Bestehende Flaeche desselben Typs in Reichweite wird nur vergroessert und verlaengert,
	// damit ein Wasser-Build nicht hunderte Aktoren erzeugt.
	for (TActorIterator<AKKElementSurface> It(World); It; ++It)
	{
		AKKElementSurface* Existing = *It;
		if (Existing && Existing->SurfaceType == InType &&
			FVector::DistSquared(Existing->GetActorLocation(), Location) < FMath::Square(InRadius))
		{
			Existing->Radius = FMath::Min(Existing->Radius + InRadius * 0.25f, 900.f);
			Existing->Volume->SetBoxExtent(FVector(Existing->Radius, Existing->Radius, 60.f));
			Existing->Age = 0.f;
			Existing->Lifetime = FMath::Max(Existing->Lifetime, InDuration);
			return Existing;
		}
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.Instigator = Cast<APawn>(Instigator);

	AKKElementSurface* Surface = World->SpawnActor<AKKElementSurface>(
		AKKElementSurface::StaticClass(), Location, FRotator::ZeroRotator, Params);

	if (Surface)
	{
		Surface->SurfaceType = InType;
		Surface->Radius = InRadius;
		Surface->Lifetime = InDuration;
	}
	return Surface;
}

EKKStatus AKKElementSurface::StatusForSurface() const
{
	switch (SurfaceType)
	{
	case EKKStatus::Nass:     return EKKStatus::Nass;
	case EKKStatus::Brennend: return EKKStatus::Brennend;
	case EKKStatus::Oelig:    return EKKStatus::Oelig;
	case EKKStatus::Vergiftet:return EKKStatus::Vergiftet;
	case EKKStatus::Unterkuehlt: return EKKStatus::Unterkuehlt;
	default: return EKKStatus::Keiner;
	}
}

void AKKElementSurface::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	Age += DeltaTime;
	if (Age >= Lifetime)
	{
		Destroy();
		return;
	}

	ApplyTimer -= DeltaTime;
	if (ApplyTimer > 0.f)
	{
		return;
	}
	ApplyTimer = ApplyInterval;

	RefreshOccupants();

	const EKKStatus Status = StatusForSurface();
	if (Status == EKKStatus::Keiner)
	{
		return;
	}

	for (const TWeakObjectPtr<AActor>& Occupant : Occupants)
	{
		if (AActor* Actor = Occupant.Get())
		{
			if (UKKStatusEffectComponent* StatusComp = Actor->FindComponentByClass<UKKStatusEffectComponent>())
			{
				StatusComp->ApplyStatus(Status, ApplyInterval * 3.f, 1, GetInstigator());
			}
		}
	}
}

void AKKElementSurface::RefreshOccupants()
{
	Occupants.Reset();

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKSurface), false, this);
	GetWorld()->OverlapMultiByObjectType(
		Overlaps, GetActorLocation(), FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeBox(Volume->GetScaledBoxExtent()), Params);

	for (const FOverlapResult& Overlap : Overlaps)
	{
		if (AActor* Actor = Overlap.GetActor())
		{
			Occupants.AddUnique(Actor);
		}
	}
}

void AKKElementSurface::ReactToElement(EKKElement Element, AActor* Source)
{
	switch (SurfaceType)
	{
	case EKKStatus::Oelig:
		if (Element == EKKElement::Feuer)
		{
			SurfaceType = EKKStatus::Brennend;
			Lifetime = FMath::Max(Lifetime, 8.f);
			Age = 0.f;
		}
		break;

	case EKKStatus::Nass:
		if (Element == EKKElement::Frost)
		{
			SurfaceType = EKKStatus::Unterkuehlt;
			Age = 0.f;
		}
		break;

	case EKKStatus::Brennend:
		if (Element == EKKElement::Frost)
		{
			Destroy();
		}
		break;

	default:
		break;
	}
}
