#include "UI/KKHUDWidget.h"
#include "Player/KKCharacter.h"
#include "Player/KKHealthComponent.h"
#include "Player/KKInventoryComponent.h"
#include "Player/KKInteractionComponent.h"
#include "Player/KKFearComponent.h"
#include "Items/KKItemData.h"
#include "Items/KKSynergyData.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Core/KKGameMode.h"

#include "Kismet/GameplayStatics.h"

void UKKHUDWidget::NativeConstruct()
{
	Super::NativeConstruct();

	if (AKKCharacter* Character = GetPlayer())
	{
		if (UKKInteractionComponent* Interaction = Character->FindComponentByClass<UKKInteractionComponent>())
		{
			Interaction->OnFocusChanged.AddDynamic(this, &UKKHUDWidget::HandleFocusChanged);
		}
		if (UKKInventoryComponent* Inventory = Character->GetInventory())
		{
			Inventory->OnItemAdded.AddDynamic(this, &UKKHUDWidget::HandleItemAdded);
			Inventory->OnSynergyActivated.AddDynamic(this, &UKKHUDWidget::HandleSynergyActivated);
		}
	}
}

AKKCharacter* UKKHUDWidget::GetPlayer() const
{
	return Cast<AKKCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
}

int32 UKKHUDWidget::GetHalfHearts(EKKHeartType Type) const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKHealthComponent* Health = Character ? Character->GetHealth() : nullptr;
	return Health ? Health->GetHalfHearts(Type) : 0;
}

int32 UKKHUDWidget::GetHeartContainers() const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKHealthComponent* Health = Character ? Character->GetHealth() : nullptr;
	return Health ? Health->GetContainers() : 0;
}

int32 UKKHUDWidget::GetKeys() const
{
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	const UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	return Run ? Run->Keys : 0;
}

int32 UKKHUDWidget::GetBombs() const
{
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	const UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	return Run ? Run->Bombs : 0;
}

int32 UKKHUDWidget::GetKellermarken() const
{
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	const UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	return Run ? Run->Kellermarken : 0;
}

UKKItemData* UKKHUDWidget::GetActiveItem() const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKInventoryComponent* Inventory = Character ? Character->GetInventory() : nullptr;
	return Inventory ? Inventory->GetActiveItem() : nullptr;
}

float UKKHUDWidget::GetActiveCooldownFraction() const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKInventoryComponent* Inventory = Character ? Character->GetInventory() : nullptr;
	const UKKItemData* Item = Inventory ? Inventory->GetActiveItem() : nullptr;
	if (!Item || Item->ActiveCooldown <= 0.f)
	{
		return 0.f;
	}
	return FMath::Clamp(Inventory->GetActiveCooldownRemaining() / Item->ActiveCooldown, 0.f, 1.f);
}

TArray<UKKItemData*> UKKHUDWidget::GetCollectedItems() const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKInventoryComponent* Inventory = Character ? Character->GetInventory() : nullptr;
	return Inventory ? Inventory->GetItems() : TArray<UKKItemData*>();
}

float UKKHUDWidget::GetFear() const
{
	const AKKCharacter* Character = GetPlayer();
	const UKKFearComponent* Fear = Character ? Character->GetFear() : nullptr;
	return Fear ? Fear->GetFear() : 0.f;
}

TArray<FKKMapCell> UKKHUDWidget::GetMapCells() const
{
	TArray<FKKMapCell> Cells;

	const AKKGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKKGameMode>() : nullptr;
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	const UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	if (!GameMode || !Run)
	{
		return Cells;
	}

	// Fluch des Gedaechtnisses: die Karte verschwindet vollstaendig.
	if (Run->GetCurse() == EKKCurse::Gedaechtnis)
	{
		return Cells;
	}

	const FKKFloorLayout& Layout = GameMode->GetLayout();
	const AKKCharacter* Character = GetPlayer();
	const FVector PlayerLocation = Character ? Character->GetActorLocation() : FVector::ZeroVector;

	for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		// Geheimraeume erscheinen erst, wenn sie gefunden wurden.
		if (Pair.Value.bHidden && !Pair.Value.bVisited)
		{
			continue;
		}

		FKKMapCell Cell;
		Cell.Coord = Pair.Key;
		Cell.Type = Pair.Value.Type;
		Cell.bVisited = Pair.Value.bVisited;

		// Angrenzende Raeume sind bekannt, aber noch unbetreten.
		Cell.bKnown = Pair.Value.bVisited;
		if (!Cell.bKnown)
		{
			for (EKKDir Dir : KKDir::All)
			{
				const FKKRoomNode* Neighbour = Layout.Find(Pair.Key.Offset(Dir));
				if (Neighbour && Neighbour->bVisited)
				{
					Cell.bKnown = true;
					break;
				}
			}
		}

		const FVector RoomCenter = UKKFloorGenerator::CoordToWorld(Pair.Key);
		Cell.bCurrent = FVector::DistSquared2D(RoomCenter, PlayerLocation) < FMath::Square(1300.f);

		Cells.Add(Cell);
	}

	return Cells;
}

void UKKHUDWidget::HandleFocusChanged(AActor* Focus, const FText& Prompt)
{
	OnFocusPrompt(Prompt);
}

void UKKHUDWidget::HandleItemAdded(UKKItemData* Item)
{
	if (Item)
	{
		OnItemBanner(Item->DisplayName, Item->PickupLine, Item->Icon.LoadSynchronous());
	}
}

void UKKHUDWidget::HandleSynergyActivated(UKKSynergyData* Synergy)
{
	if (Synergy)
	{
		OnItemBanner(Synergy->DisplayName, Synergy->Description, Synergy->Icon.LoadSynchronous());
	}
}
