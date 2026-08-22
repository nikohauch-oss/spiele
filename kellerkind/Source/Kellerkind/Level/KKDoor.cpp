#include "Level/KKDoor.h"
#include "Player/KKCharacter.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"

#include "Components/StaticMeshComponent.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"

#define LOCTEXT_NAMESPACE "Kellerkind"

AKKDoor::AKKDoor()
{
	PrimaryActorTick.bCanEverTick = true;

	Frame = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Frame"));
	SetRootComponent(Frame);

	Leaf = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Leaf"));
	Leaf->SetupAttachment(Frame);
	Leaf->SetCollisionProfileName(TEXT("BlockAllDynamic"));
}

void AKKDoor::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (FMath::IsNearlyEqual(CurrentAngle, TargetAngle, 0.1f))
	{
		return;
	}

	CurrentAngle = FMath::FInterpConstantTo(CurrentAngle, TargetAngle, DeltaTime, Speed);
	Leaf->SetRelativeRotation(FRotator(0.f, CurrentAngle, 0.f));
}

void AKKDoor::SetLocked(bool bInLocked)
{
	bLocked = bInLocked;
	if (bLocked && IsOpen())
	{
		Close(true);
	}
}

void AKKDoor::Open(bool bSlow)
{
	TargetAngle = OpenAngle;
	Speed = bSlow ? SlowSpeed : FastSpeed;
	PendingNoise = bSlow ? 0.05f : 0.45f;

	if (!CreakSound.IsNull())
	{
		UGameplayStatics::PlaySoundAtLocation(this, CreakSound.LoadSynchronous(), GetActorLocation(),
			bSlow ? 0.35f : 1.f);
	}
}

void AKKDoor::Close(bool bSlam)
{
	TargetAngle = 0.f;
	Speed = bSlam ? FastSpeed * 3.f : FastSpeed;
	PendingNoise = bSlam ? 0.9f : 0.3f;

	if (bSlam && !SlamSound.IsNull())
	{
		UGameplayStatics::PlaySoundAtLocation(this, SlamSound.LoadSynchronous(), GetActorLocation());
	}
}

FText AKKDoor::GetInteractionText_Implementation(AActor* Interactor) const
{
	if (bLocked)
	{
		return LOCTEXT("DoorLocked", "Verriegelt");
	}
	if (bNeedsKey)
	{
		return LOCTEXT("DoorKey", "Aufschliessen");
	}
	return IsOpen() ? LOCTEXT("DoorClose", "Schliessen") : LOCTEXT("DoorOpen", "Tuer langsam oeffnen");
}

bool AKKDoor::CanInteract_Implementation(AActor* Interactor) const
{
	return !bLocked;
}

float AKKDoor::GetHoldDuration_Implementation(AActor* Interactor) const
{
	// Geschlossene Tueren gehen langsam auf - das ist die leise Variante und braucht Zeit.
	return IsOpen() ? 0.f : SlowHoldDuration;
}

void AKKDoor::Interact_Implementation(AActor* Interactor)
{
	if (bLocked)
	{
		if (!LockedSound.IsNull())
		{
			UGameplayStatics::PlaySoundAtLocation(this, LockedSound.LoadSynchronous(), GetActorLocation());
		}
		return;
	}

	if (bNeedsKey)
	{
		const UKKGameInstance* GI = Interactor ? Interactor->GetGameInstance<UKKGameInstance>() : nullptr;
		UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
		if (!Run || Run->Keys <= 0)
		{
			if (!LockedSound.IsNull())
			{
				UGameplayStatics::PlaySoundAtLocation(this, LockedSound.LoadSynchronous(), GetActorLocation());
			}
			return;
		}
		--Run->Keys;
		bNeedsKey = false;
	}

	IsOpen() ? Close(false) : Open(true);
}

float AKKDoor::GetInteractionNoise_Implementation() const
{
	return PendingNoise;
}

#undef LOCTEXT_NAMESPACE
