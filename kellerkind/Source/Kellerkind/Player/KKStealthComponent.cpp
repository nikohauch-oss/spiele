#include "Player/KKStealthComponent.h"
#include "Level/KKHidingSpot.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/Light.h"
#include "Components/LightComponent.h"

UKKStealthComponent::UKKStealthComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.15f;
}

void UKKStealthComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	SampleLight();
}

void UKKStealthComponent::SampleLight()
{
	const AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (!Owner || !World)
	{
		return;
	}

	const FVector Head = Owner->GetActorLocation() + FVector(0.f, 0.f, 60.f);
	float Brightness = 0.f;

	// Naeherung statt echtem Lichtsample: Wir summieren die Beitraege der Lichter im Keller,
	// pruefen aber jeweils die Sichtlinie. Das ist billig genug fuer jeden Frame-Bruchteil
	// und verhaelt sich fuer Stealth genau richtig - eine Lampe hinter einer Wand zaehlt nicht.
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKLightSample), false, Owner);

	for (TActorIterator<ALight> It(World); It; ++It)
	{
		const ALight* Light = *It;
		const ULightComponent* Component = Light ? Light->GetLightComponent() : nullptr;
		if (!Component || !Component->IsVisible() || Component->Intensity <= 0.f)
		{
			continue;
		}

		const FVector LightPos = Light->GetActorLocation();
		const float Distance = FVector::Dist(LightPos, Head);
		const float Radius = FMath::Max(200.f, Component->GetBoundingSphere().W);
		if (Distance > Radius)
		{
			continue;
		}

		bool bBlocked = World->LineTraceTestByChannel(Head, LightPos, ECC_Visibility, Params);
		if (bBlocked)
		{
			continue;
		}

		Brightness += (1.f - Distance / Radius) * FMath::Min(1.f, Component->Intensity / 2000.f);
	}

	LightLevel = FMath::FInterpTo(LightLevel, FMath::Clamp(Brightness, 0.f, 1.f), 0.15f, 6.f);
}

float UKKStealthComponent::GetVisibilityMultiplier() const
{
	if (CurrentHidingSpot)
	{
		return 0.f;
	}
	// Im Dunkeln bleibt ein Rest Sichtbarkeit: Kreaturen sollen nie voellig blind werden,
	// sonst wird Dunkelheit zur Unsichtbarkeitstaste.
	return FMath::Clamp(0.15f + LightLevel * 0.85f + VisibilityBonus, 0.f, 2.f);
}

void UKKStealthComponent::EnterHidingSpot(AKKHidingSpot* Spot)
{
	CurrentHidingSpot = Spot;
	if (Spot)
	{
		Spot->SetOccupant(GetOwner());
	}
}

void UKKStealthComponent::LeaveHidingSpot()
{
	if (CurrentHidingSpot)
	{
		CurrentHidingSpot->SetOccupant(nullptr);
		CurrentHidingSpot = nullptr;
	}
}
