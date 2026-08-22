#include "Player/KKFearComponent.h"
#include "Player/KKHealthComponent.h"
#include "AI/KKCreatureBase.h"
#include "EngineUtils.h"
#include "Engine/World.h"

UKKFearComponent::UKKFearComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.2f;
}

void UKKFearComponent::BeginPlay()
{
	Super::BeginPlay();
}

void UKKFearComponent::AddFear(float Amount)
{
	Fear = FMath::Clamp(Fear + Amount, 0.f, 1.f);
}

void UKKFearComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	SampleEnvironment(DeltaTime);

	Fear = FMath::Clamp(Fear - FearDecayPerSecond * DeltaTime, 0.f, 1.f);

	if (!FMath::IsNearlyEqual(Fear, LastBroadcast, 0.02f))
	{
		LastBroadcast = Fear;
		OnFearChanged.Broadcast(Fear);
	}
}

void UKKFearComponent::SampleEnvironment(float DeltaTime)
{
	const AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (!Owner || !World)
	{
		return;
	}

	// Naehe zu einer jagenden Kreatur treibt die Angst - nicht ihre blosse Existenz.
	for (TActorIterator<AKKCreatureBase> It(World); It; ++It)
	{
		const AKKCreatureBase* Creature = *It;
		if (!Creature || !Creature->IsAlive())
		{
			continue;
		}

		const float DistSq = FVector::DistSquared(Creature->GetActorLocation(), Owner->GetActorLocation());
		if (DistSq < FMath::Square(1400.f) && Creature->IsHunting())
		{
			const float Proximity = 1.f - FMath::Sqrt(DistSq) / 1400.f;
			AddFear(FearPerSecondNearCreature * Proximity * DeltaTime);
		}
	}

	// Wenig Leben allein macht schon nervoes.
	if (const UKKHealthComponent* Health = Owner->FindComponentByClass<UKKHealthComponent>())
	{
		if (Health->GetHealthFraction() < 0.34f)
		{
			AddFear(0.06f * DeltaTime);
		}
	}
}

float UKKFearComponent::GetBreathRate() const
{
	return FMath::Lerp(0.2f, 1.f, Fear);
}

float UKKFearComponent::GetHandTremor() const
{
	// Erst ab spuerbarer Angst, und nie so stark, dass die Waffe unruhig zielt.
	return FMath::GetMappedRangeValueClamped(FVector2D(0.35f, 1.f), FVector2D(0.f, 0.6f), Fear);
}

float UKKFearComponent::GetHeartbeatVolume() const
{
	return FMath::GetMappedRangeValueClamped(FVector2D(0.25f, 1.f), FVector2D(0.f, 1.f), Fear);
}
