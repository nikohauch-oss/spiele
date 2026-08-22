#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameplayTagContainer.h"
#include "Core/KKTypes.h"
#include "KKInventoryComponent.generated.h"

class UKKItemData;
class UKKItemEffect;
class UKKSynergyData;
class UKKStatsComponent;
class AKKFamiliar;
class AKKOrbital;
class AKKWeapon;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnItemAdded, UKKItemData*, Item);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnSynergyActivated, UKKSynergyData*, Synergy);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FKKOnLoadoutChanged);

/**
 * Traegt alle Items eines Runs, haelt ihre Effektobjekte am Leben und verteilt die Hooks.
 *
 * Synergien werden nach jeder Inventaraenderung komplett neu ausgewertet. Das ist bei
 * <100 Synergiedefinitionen billig und erspart jede Sonderbehandlung beim Entfernen von Items
 * (Opferraum, verfluchte Tauschgeschaefte, Diebstahl durch den Sammler).
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKInventoryComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintCallable, Category = "Inventar")
	bool AddItem(UKKItemData* Item);

	UFUNCTION(BlueprintCallable, Category = "Inventar")
	bool RemoveItem(FName ItemId);

	UFUNCTION(BlueprintPure, Category = "Inventar")
	bool HasItem(FName ItemId) const { return OwnedIds.Contains(ItemId); }

	UFUNCTION(BlueprintPure, Category = "Inventar")
	int32 GetStacks(FName ItemId) const;

	UFUNCTION(BlueprintPure, Category = "Inventar")
	const FGameplayTagContainer& GetOwnedTags() const { return OwnedTags; }

	UFUNCTION(BlueprintPure, Category = "Inventar")
	TArray<UKKItemData*> GetItems() const;

	UFUNCTION(BlueprintPure, Category = "Inventar")
	TArray<UKKSynergyData*> GetActiveSynergies() const;

	// --- Aktives Item ---
	UFUNCTION(BlueprintCallable, Category = "Inventar")
	bool UseActiveItem();

	UFUNCTION(BlueprintPure, Category = "Inventar")
	float GetActiveCooldownRemaining() const;

	UFUNCTION(BlueprintPure, Category = "Inventar")
	UKKItemData* GetActiveItem() const { return ActiveItem; }

	// --- Hook-Verteilung ---
	void DispatchPreDealDamage(FKKDamageEvent& Event, AActor* Target);
	void DispatchPostDealDamage(const FKKDamageEvent& Event, AActor* Target);
	void DispatchPreTakeDamage(FKKDamageEvent& Event);
	void DispatchKill(AActor* Victim);
	void DispatchRoomEntered(EKKRoomType RoomType);
	void DispatchRoomCleared();
	void DispatchFloorStarted(EKKFloor Floor);
	void DispatchHeartLost(EKKHeartType Heart);

	UPROPERTY(BlueprintAssignable, Category = "Inventar") FKKOnItemAdded OnItemAdded;
	UPROPERTY(BlueprintAssignable, Category = "Inventar") FKKOnSynergyActivated OnSynergyActivated;
	UPROPERTY(BlueprintAssignable, Category = "Inventar") FKKOnLoadoutChanged OnLoadoutChanged;

private:
	UPROPERTY() TArray<TObjectPtr<UKKItemData>> Owned;
	UPROPERTY() TSet<FName> OwnedIds;
	UPROPERTY() TMap<FName, TObjectPtr<UKKItemEffect>> Effects;
	UPROPERTY() TMap<FName, TObjectPtr<UKKItemEffect>> SynergyEffects;
	UPROPERTY() TMap<FName, TObjectPtr<UKKSynergyData>> ActiveSynergies;

	UPROPERTY() TObjectPtr<UKKItemData> ActiveItem = nullptr;
	UPROPERTY() TArray<TObjectPtr<AKKFamiliar>> Familiars;
	UPROPERTY() TArray<TObjectPtr<AKKOrbital>> Orbitals;

	FGameplayTagContainer OwnedTags;

	double ActiveReadyAt = 0.0;
	int32 ActiveChargesLeft = 0;

	/** Effekte, die WantsTick() melden - damit der Tick nicht ueber alle Items laeuft. */
	TArray<TWeakObjectPtr<UKKItemEffect>> TickingEffects;

	UKKStatsComponent* GetStats() const;

	void ApplyItemPayload(UKKItemData* Item);
	void SpawnItemActors(UKKItemData* Item);
	void RebuildOwnedTags();
	void ReevaluateSynergies();
	void RebuildTickList();
	void RefreshOrbitalRing();
};
