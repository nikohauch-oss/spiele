#include "Player/KKInteractionComponent.h"
#include "Player/KKInteractable.h"
#include "Player/KKStatsComponent.h"
#include "Player/KKCharacter.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "GameFramework/Character.h"

UKKInteractionComponent::UKKInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

bool UKKInteractionComponent::GetViewPoint(FVector& OutLocation, FRotator& OutRotation) const
{
	const AKKCharacter* Character = Cast<AKKCharacter>(GetOwner());
	if (!Character || !Character->GetCamera())
	{
		return false;
	}
	OutLocation = Character->GetCamera()->GetComponentLocation();
	OutRotation = Character->GetControlRotation();
	return true;
}

void UKKInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	UpdateFocus();

	if (bHolding)
	{
		UpdateHold(DeltaTime);
	}
}

void UKKInteractionComponent::UpdateFocus()
{
	FVector Start;
	FRotator Rotation;
	if (!GetViewPoint(Start, Rotation))
	{
		return;
	}

	const FVector End = Start + Rotation.Vector() * Reach;

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKInteract), false, GetOwner());
	const bool bHit = GetWorld()->SweepSingleByChannel(
		Hit, Start, End, FQuat::Identity, ECC_Visibility,
		FCollisionShape::MakeSphere(TraceRadius), Params);

	AActor* NewFocus = nullptr;
	FText Prompt;

	if (bHit && Hit.GetActor() && Hit.GetActor()->Implements<UKKInteractable>())
	{
		AActor* Candidate = Hit.GetActor();
		if (IKKInteractable::Execute_CanInteract(Candidate, GetOwner()))
		{
			NewFocus = Candidate;
			Prompt = IKKInteractable::Execute_GetInteractionText(Candidate, GetOwner());
		}
	}

	if (NewFocus != Focus.Get())
	{
		// Fokuswechsel bricht eine laufende Halte-Interaktion ab.
		if (bHolding)
		{
			CancelInteract();
		}
		Focus = NewFocus;
		OnFocusChanged.Broadcast(NewFocus, Prompt);
	}
}

bool UKKInteractionComponent::TryInteract()
{
	AActor* Target = Focus.Get();
	if (!Target)
	{
		return false;
	}

	float Duration = IKKInteractable::Execute_GetHoldDuration(Target, GetOwner());

	if (const UKKStatsComponent* Stats = GetOwner()->FindComponentByClass<UKKStatsComponent>())
	{
		Duration /= FMath::Max(0.1f, Stats->GetStat(EKKStat::InteractionSpeed));
	}

	if (Duration <= 0.f)
	{
		CompleteInteract();
		return true;
	}

	bHolding = true;
	HoldElapsed = 0.f;
	HoldRequired = Duration;
	return true;
}

void UKKInteractionComponent::UpdateHold(float DeltaTime)
{
	HoldElapsed += DeltaTime;
	OnHoldProgress.Broadcast(FMath::Clamp(HoldElapsed / HoldRequired, 0.f, 1.f));

	if (HoldElapsed >= HoldRequired)
	{
		CompleteInteract();
	}
}

void UKKInteractionComponent::CompleteInteract()
{
	bHolding = false;
	HoldElapsed = 0.f;
	OnHoldProgress.Broadcast(0.f);

	AActor* Target = Focus.Get();
	if (!Target)
	{
		return;
	}

	IKKInteractable::Execute_Interact(Target, GetOwner());

	const float Noise = IKKInteractable::Execute_GetInteractionNoise(Target);
	if (Noise > 0.f)
	{
		if (AKKCharacter* Character = Cast<AKKCharacter>(GetOwner()))
		{
			Character->EmitNoise(Noise, 400.f + Noise * 1600.f, Target->GetActorLocation());
		}
	}
}

void UKKInteractionComponent::CancelInteract()
{
	bHolding = false;
	HoldElapsed = 0.f;
	OnHoldProgress.Broadcast(0.f);
}

bool UKKInteractionComponent::PickUpObject(AActor* Object)
{
	if (!Object || Held.IsValid())
	{
		return false;
	}

	Held = Object;
	Object->SetActorEnableCollision(false);

	if (const ACharacter* Character = Cast<ACharacter>(GetOwner()))
	{
		Object->AttachToComponent(Character->GetMesh(),
			FAttachmentTransformRules::SnapToTargetIncludingScale, TEXT("hand_l_carry"));
	}
	return true;
}

void UKKInteractionComponent::ThrowHeldObject(float Strength)
{
	AActor* Object = Held.Get();
	if (!Object)
	{
		return;
	}

	FVector Start;
	FRotator Rotation;
	GetViewPoint(Start, Rotation);

	Object->DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
	Object->SetActorEnableCollision(true);

	if (UPrimitiveComponent* Root = Cast<UPrimitiveComponent>(Object->GetRootComponent()))
	{
		Root->SetSimulatePhysics(true);
		Root->AddImpulse(Rotation.Vector() * Strength, NAME_None, true);
	}

	Held = nullptr;

	// Der Wurf selbst ist leise - erst der Aufschlag lockt Kreaturen an.
	// Den Hoerreiz erzeugt der geworfene Gegenstand in seinem Hit-Handler.
}
