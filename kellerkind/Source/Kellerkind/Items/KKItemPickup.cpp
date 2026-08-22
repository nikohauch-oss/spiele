#include "Items/KKItemPickup.h"
#include "Items/KKItemData.h"
#include "Player/KKCharacter.h"
#include "Player/KKInventoryComponent.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"

#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"

#define LOCTEXT_NAMESPACE "Kellerkind"

AKKItemPickup::AKKItemPickup()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionProfileName(TEXT("BlockAllDynamic"));
	SetRootComponent(Mesh);

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Mesh);
	Glow->SetIntensity(180.f);
	Glow->SetAttenuationRadius(320.f);
	Glow->SetCastShadows(false);
}

void AKKItemPickup::BeginPlay()
{
	Super::BeginPlay();
	BaseLocation = GetActorLocation();

	if (Item)
	{
		SetItem(Item, Price);
	}
}

AKKItemPickup* AKKItemPickup::SpawnFor(UWorld* World, UKKItemData* InItem, const FVector& Location, int32 InPrice)
{
	if (!World || !InItem)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	AKKItemPickup* Pickup = World->SpawnActor<AKKItemPickup>(AKKItemPickup::StaticClass(), Location, FRotator::ZeroRotator, Params);
	if (Pickup)
	{
		Pickup->SetItem(InItem, InPrice);
	}
	return Pickup;
}

void AKKItemPickup::SetItem(UKKItemData* InItem, int32 InPrice)
{
	Item = InItem;
	Price = InPrice;

	if (!Item)
	{
		return;
	}

	if (!Item->WorldMesh.IsNull())
	{
		Mesh->SetStaticMesh(Item->WorldMesh.LoadSynchronous());
	}

	// Qualitaet faerbt das Licht: je seltener, desto kaelter und heller.
	static const FLinearColor ByQuality[5] = {
		FLinearColor(1.f, 0.82f, 0.55f),
		FLinearColor(1.f, 0.9f, 0.7f),
		FLinearColor(0.75f, 0.85f, 1.f),
		FLinearColor(0.6f, 0.75f, 1.f),
		FLinearColor(1.f, 0.55f, 0.45f)
	};
	Glow->SetLightColor(ByQuality[FMath::Clamp(Item->Quality, 0, 4)]);
	Glow->SetIntensity(140.f + Item->Quality * 60.f);
}

void AKKItemPickup::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Leichtes Schweben, damit Items im Halbdunkel auffallen, ohne wie Spielzeug zu wirken.
	BobPhase += DeltaTime;
	SetActorLocation(BaseLocation + FVector(0.f, 0.f, FMath::Sin(BobPhase * 1.6f) * 4.f));
	AddActorLocalRotation(FRotator(0.f, DeltaTime * 22.f, 0.f));
}

FText AKKItemPickup::GetInteractionText_Implementation(AActor* Interactor) const
{
	if (!Item)
	{
		return FText::GetEmpty();
	}

	if (Price > 0)
	{
		return FText::Format(LOCTEXT("BuyItem", "{0} kaufen ({1} Kellermarken)"), Item->DisplayName, FText::AsNumber(Price));
	}
	return FText::Format(LOCTEXT("TakeItem", "{0} nehmen"), Item->DisplayName);
}

bool AKKItemPickup::CanInteract_Implementation(AActor* Interactor) const
{
	if (!Item)
	{
		return false;
	}
	if (Price <= 0)
	{
		return true;
	}

	const UKKGameInstance* GI = Interactor ? Interactor->GetGameInstance<UKKGameInstance>() : nullptr;
	const UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	return Run && Run->Kellermarken >= Price;
}

void AKKItemPickup::Interact_Implementation(AActor* Interactor)
{
	AKKCharacter* Character = Cast<AKKCharacter>(Interactor);
	if (!Character || !Item || !Character->GetInventory())
	{
		return;
	}

	if (Price > 0)
	{
		const UKKGameInstance* GI = Character->GetGameInstance<UKKGameInstance>();
		UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
		if (!Run || Run->Kellermarken < Price)
		{
			return;
		}
		Run->Kellermarken -= Price;
	}

	if (Character->GetInventory()->AddItem(Item))
	{
		Destroy();
	}
}

#undef LOCTEXT_NAMESPACE
