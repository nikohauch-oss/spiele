#include "Level/KKHidingSpot.h"
#include "Player/KKStealthComponent.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"

#define LOCTEXT_NAMESPACE "Kellerkind"

AKKHidingSpot::AKKHidingSpot()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);

	Trigger = CreateDefaultSubobject<UBoxComponent>(TEXT("Trigger"));
	Trigger->SetupAttachment(Mesh);
	Trigger->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Trigger->SetCollisionResponseToAllChannels(ECR_Overlap);
}

void AKKHidingSpot::SetOccupant(AActor* InOccupant)
{
	Occupant = InOccupant;
}

FText AKKHidingSpot::GetInteractionText_Implementation(AActor* Interactor) const
{
	return IsOccupied() ? LOCTEXT("HideLeave", "Herauskommen") : LOCTEXT("HideEnter", "Verstecken");
}

bool AKKHidingSpot::CanInteract_Implementation(AActor* Interactor) const
{
	return !IsOccupied() || Occupant.Get() == Interactor;
}

void AKKHidingSpot::Interact_Implementation(AActor* Interactor)
{
	UKKStealthComponent* Stealth = Interactor ? Interactor->FindComponentByClass<UKKStealthComponent>() : nullptr;
	if (!Stealth)
	{
		return;
	}

	if (Stealth->IsHidden())
	{
		Stealth->LeaveHidingSpot();
	}
	else
	{
		Stealth->EnterHidingSpot(this);
	}
}

#undef LOCTEXT_NAMESPACE
