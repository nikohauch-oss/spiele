#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKItemEffect.generated.h"

class UKKInventoryComponent;
class UKKItemData;
class AKKCharacter;

/**
 * Basisklasse fuer Itemverhalten. Das Inventar ruft die Hooks an den passenden Stellen auf.
 * Ein Effekt darf Zustand halten (Ladungen, Zaehler) - er lebt genau so lange wie das Item im Run.
 */
UCLASS(Blueprintable, EditInlineNew, DefaultToInstanced, Abstract)
class KELLERKIND_API UKKItemEffect : public UObject
{
	GENERATED_BODY()

public:
	virtual UWorld* GetWorld() const override;

	void Initialize(UKKInventoryComponent* InOwner, UKKItemData* InData);

	UFUNCTION(BlueprintPure, Category = "Item") UKKInventoryComponent* GetInventory() const { return Inventory.Get(); }
	UFUNCTION(BlueprintPure, Category = "Item") UKKItemData* GetItemData() const { return Data.Get(); }
	UFUNCTION(BlueprintPure, Category = "Item") AKKCharacter* GetCharacter() const;

	/** Anzahl Kopien dieses Items. Effekte skalieren selbst, wenn Stapeln sinnvoll ist. */
	UPROPERTY(BlueprintReadOnly, Category = "Item")
	int32 Stacks = 1;

	// --- Lebenszyklus ---
	virtual void OnGranted() {}
	virtual void OnRemoved() {}
	virtual void OnStackAdded() { ++Stacks; }

	// --- Kampf-Hooks. Amount/Element duerfen veraendert werden. ---
	virtual void PreDealDamage(FKKDamageEvent& Event, AActor* Target) {}
	virtual void PostDealDamage(const FKKDamageEvent& Event, AActor* Target) {}
	virtual void PreTakeDamage(FKKDamageEvent& Event) {}
	virtual void OnKill(AActor* Victim) {}

	// --- Run-Hooks ---
	virtual void OnRoomEntered(EKKRoomType RoomType) {}
	virtual void OnRoomCleared() {}
	virtual void OnFloorStarted(EKKFloor Floor) {}
	virtual void OnHeartLost(EKKHeartType Heart) {}
	virtual void OnItemPicked(UKKItemData* Other) {}

	/** Nur fuer aktive Items. Rueckgabe false = Aktivierung fehlgeschlagen, Cooldown bleibt stehen. */
	virtual bool OnActivate() { return false; }

	virtual void Tick(float DeltaTime) {}
	virtual bool WantsTick() const { return false; }

protected:
	UPROPERTY() TWeakObjectPtr<UKKInventoryComponent> Inventory;
	UPROPERTY() TWeakObjectPtr<UKKItemData> Data;
};
