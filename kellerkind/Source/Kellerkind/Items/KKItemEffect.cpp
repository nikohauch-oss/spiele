#include "Items/KKItemEffect.h"
#include "Player/KKInventoryComponent.h"
#include "Player/KKCharacter.h"

UWorld* UKKItemEffect::GetWorld() const
{
	if (Inventory.IsValid())
	{
		return Inventory->GetWorld();
	}
	return nullptr;
}

void UKKItemEffect::Initialize(UKKInventoryComponent* InOwner, UKKItemData* InData)
{
	Inventory = InOwner;
	Data = InData;
}

AKKCharacter* UKKItemEffect::GetCharacter() const
{
	return Inventory.IsValid() ? Cast<AKKCharacter>(Inventory->GetOwner()) : nullptr;
}
