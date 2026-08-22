#include "Systems/KKShopkeeper.h"
#include "Items/KKItemData.h"
#include "Items/KKItemPickup.h"
#include "Core/KKGameInstance.h"
#include "Core/KKContentRegistry.h"
#include "Core/KKRunState.h"
#include "Player/KKCharacter.h"
#include "Player/KKStatsComponent.h"

#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "Kismet/GameplayStatics.h"

AKKShopkeeper::AKKShopkeeper()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);

	HeadLamp = CreateDefaultSubobject<USpotLightComponent>(TEXT("HeadLamp"));
	HeadLamp->SetupAttachment(Mesh, TEXT("head"));
	HeadLamp->SetIntensity(3200.f);
	HeadLamp->SetOuterConeAngle(28.f);
	HeadLamp->SetLightColor(FLinearColor(1.f, 0.92f, 0.78f));

	SlotOffsets = { FVector(160.f, -120.f, 40.f), FVector(190.f, 0.f, 40.f), FVector(160.f, 120.f, 40.f) };
}

void AKKShopkeeper::BeginPlay()
{
	Super::BeginPlay();
}

void AKKShopkeeper::BuildStock(int32 SlotCount)
{
	if (Stock.Num() > 0)
	{
		return;
	}

	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	UKKContentRegistry* Registry = GI ? GI->GetContent() : nullptr;
	if (!Run || !Registry)
	{
		return;
	}

	float Luck = 0.f;
	if (const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		if (const UKKStatsComponent* Stats = Player->FindComponentByClass<UKKStatsComponent>())
		{
			Luck = Stats->GetStat(EKKStat::Luck);
		}
	}

	for (int32 i = 0; i < SlotCount; ++i)
	{
		UKKItemData* Item = Registry->RollItem(EKKItemPool::Laden, Run->ItemStream(), Luck,
			Run->ConsumedItemIds, GI->GetSave());
		if (!Item)
		{
			continue;
		}

		// Verkaufte Ware ist fuer diesen Run vergeben - auch wenn sie niemand kauft.
		Run->ConsumedItemIds.Add(Item->ItemId);

		const FVector Offset = SlotOffsets.IsValidIndex(i) ? SlotOffsets[i] : FVector(160.f, i * 120.f, 40.f);
		const int32 Price = FMath::Max(1, FMath::RoundToInt(Item->GetEffectivePrice() * PriceMultiplier));

		if (AKKItemPickup* Pickup = AKKItemPickup::SpawnFor(GetWorld(), Item,
			GetActorLocation() + GetActorRotation().RotateVector(Offset), Price))
		{
			Stock.Add(Pickup);
		}
	}
}

void AKKShopkeeper::Flee()
{
	// Er wehrt sich nicht. Er geht - und nimmt sein Angebot mit.
	for (const TObjectPtr<AKKItemPickup>& Pickup : Stock)
	{
		if (Pickup)
		{
			Pickup->Destroy();
		}
	}
	Stock.Reset();
	Destroy();
}
