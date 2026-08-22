#include "AI/KKPerceptionComponent.h"
#include "AI/KKSenseSubsystem.h"
#include "Player/KKCharacter.h"
#include "Player/KKStealthComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

UKKPerceptionComponent::UKKPerceptionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	// 10 Hz reichen fuer Wahrnehmung und halten die Kosten auch bei vielen Kreaturen klein.
	PrimaryComponentTick.TickInterval = 0.1f;
}

void UKKPerceptionComponent::BeginPlay()
{
	Super::BeginPlay();

	if (UKKSenseSubsystem* Senses = GetWorld() ? GetWorld()->GetSubsystem<UKKSenseSubsystem>() : nullptr)
	{
		Senses->RegisterListener(this);
	}
}

void UKKPerceptionComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UKKSenseSubsystem* Senses = GetWorld() ? GetWorld()->GetSubsystem<UKKSenseSubsystem>() : nullptr)
	{
		Senses->UnregisterListener(this);
	}
	Super::EndPlay(EndPlayReason);
}

void UKKPerceptionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	UpdateSight(DeltaTime);

	const double Now = GetWorld()->GetTimeSeconds();

	if (Target.IsValid() && (Now - LastSeenTime) > MemorySeconds)
	{
		// Das Ziel ist vergessen - der letzte bekannte Ort bleibt aber bestehen,
		// damit die Kreatur dort weitersucht statt einfach stehen zu bleiben.
		Target = nullptr;
		Awareness = FMath::Min(Awareness, 0.4f);
		OnTargetLost.Broadcast();
	}

	if (!Target.IsValid())
	{
		Awareness = FMath::Max(0.f, Awareness - DeltaTime * 0.15f);
	}
}

bool UKKPerceptionComponent::CanSee(AActor* Actor, float& OutVisibility) const
{
	OutVisibility = 0.f;

	const AActor* Owner = GetOwner();
	if (!Owner || !Actor || SightWeight <= 0.f)
	{
		return false;
	}

	const FVector Eyes = Owner->GetActorLocation() + FVector(0.f, 0.f, 60.f);
	const FVector ToTarget = Actor->GetActorLocation() - Eyes;
	const float Distance = ToTarget.Size();

	if (Distance > SightRange)
	{
		return false;
	}

	const float Cos = FVector::DotProduct(ToTarget.GetSafeNormal(), Owner->GetActorForwardVector());
	if (Cos < FMath::Cos(FMath::DegreesToRadians(SightHalfAngle)))
	{
		return false;
	}

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKSight), false, Owner);
	Params.AddIgnoredActor(Actor);
	if (GetWorld()->LineTraceSingleByChannel(Hit, Eyes, Actor->GetActorLocation() + FVector(0.f, 0.f, 40.f), ECC_Visibility, Params))
	{
		return false;
	}

	// Sichtbarkeit haengt an Licht, Haltung und Tempo des Spielers - und an der Distanz.
	float Visibility = 1.f;
	if (const AKKCharacter* Character = Cast<AKKCharacter>(Actor))
	{
		Visibility = Character->GetVisibility();
	}

	const float DistanceFactor = 1.f - (Distance / SightRange) * 0.6f;
	OutVisibility = Visibility * DistanceFactor * SightWeight;

	// Kreaturen, die auf Licht reagieren, sehen im Hellen besser bzw. meiden es.
	if (LightReaction != 0.f)
	{
		if (const AKKCharacter* Character = Cast<AKKCharacter>(Actor))
		{
			if (const UKKStealthComponent* Stealth = Character->FindComponentByClass<UKKStealthComponent>())
			{
				OutVisibility *= FMath::Max(0.1f, 1.f + LightReaction * (Stealth->GetLightLevel() - 0.5f));
			}
		}
	}

	return OutVisibility > 0.05f;
}

void UKKPerceptionComponent::UpdateSight(float DeltaTime)
{
	APawn* Player = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	if (!Player)
	{
		return;
	}

	float Visibility = 0.f;
	if (!CanSee(Player, Visibility))
	{
		return;
	}

	// Erkennen braucht Zeit: Awareness steigt, bis die Kreatur sicher ist.
	Awareness = FMath::Clamp(Awareness + (Visibility / FMath::Max(0.05f, TimeToNotice)) * DeltaTime, 0.f, 1.f);
	LastKnownLocation = Player->GetActorLocation();
	bHasLastKnown = true;

	if (Awareness >= 1.f && Target.Get() != Player)
	{
		Target = Player;
		OnTargetSpotted.Broadcast(Player);
	}

	if (Target.IsValid())
	{
		LastSeenTime = GetWorld()->GetTimeSeconds();
	}
}

void UKKPerceptionComponent::ReceiveStimulus(const FKKStimulus& Stimulus)
{
	float Weight = 0.f;

	switch (Stimulus.Sense)
	{
	case EKKSense::Gehoer:
		if (Stimulus.Strength < HearingThreshold)
		{
			return;
		}
		Weight = HearingWeight;
		break;

	case EKKSense::Blutgeruch:
		if (BloodSmellWeight <= 0.f)
		{
			return;
		}
		Weight = BloodSmellWeight;
		break;

	default:
		Weight = 0.5f;
		break;
	}

	// Ein Geraeusch verraet den Ort, nicht den Spieler. Die Kreatur geht hin und sucht.
	LastKnownLocation = Stimulus.Location;
	bHasLastKnown = true;
	Awareness = FMath::Clamp(Awareness + Stimulus.Strength * Weight * 0.6f, 0.f, 1.f);

	OnStimulusHeard.Broadcast(Stimulus.Location);

	// Sehr laute Reize (Explosion, Alarm) machen sofort ein Ziel daraus.
	if (Stimulus.Strength * Weight >= 1.5f && Stimulus.Source.IsValid())
	{
		ForceTarget(Stimulus.Source.Get());
	}
}

void UKKPerceptionComponent::ForceTarget(AActor* NewTarget)
{
	if (!NewTarget)
	{
		return;
	}

	Target = NewTarget;
	Awareness = 1.f;
	LastKnownLocation = NewTarget->GetActorLocation();
	bHasLastKnown = true;
	LastSeenTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	OnTargetSpotted.Broadcast(NewTarget);
}

void UKKPerceptionComponent::ForgetTarget()
{
	if (Target.IsValid())
	{
		Target = nullptr;
		OnTargetLost.Broadcast();
	}
	Awareness = 0.f;
	bHasLastKnown = false;
}
