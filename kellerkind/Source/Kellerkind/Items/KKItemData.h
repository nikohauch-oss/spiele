#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GameplayTagContainer.h"
#include "Core/KKTypes.h"
#include "KKItemData.generated.h"

class UKKItemEffect;
class AKKFamiliar;
class AKKOrbital;
class AKKWeapon;
class UTexture2D;
class UStaticMesh;
class UNiagaraSystem;

/**
 * Definition eines Items. Enthaelt nur Daten - das Verhalten steckt in EffectClass.
 * Item-IDs sind stabil, weil Saves, Synergien und Freischaltungen ueber sie referenzieren.
 */
UCLASS(BlueprintType)
class KELLERKIND_API UKKItemData : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	FName ItemId;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	FText DisplayName;

	/** Kurzer Aufnahmetext, wie er beim Aufheben eingeblendet wird. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	FText PickupLine;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet", meta = (MultiLine = true))
	FText Description;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	EKKItemCategory Category = EKKItemCategory::Passiv;

	/** 0 = Grundfund, 4 = legendaeres Relikt. Steuert Preis, Pool-Gewicht und Praesentation. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet", meta = (ClampMin = "0", ClampMax = "4"))
	int32 Quality = 1;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Pool")
	TArray<EKKItemPool> Pools;

	/** Relatives Gewicht innerhalb seiner Pools. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Pool", meta = (ClampMin = "0.01"))
	float Weight = 1.f;

	/** Wird erst gezogen, wenn diese Freischaltung im Profil vorhanden ist. Leer = von Anfang an dabei. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Pool")
	FName RequiredUnlock;

	// --- Wirkung ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	TArray<FKKStatMod> StatMods;

	/** Herzcontainer, die das Item dauerhaft hinzufuegt oder entfernt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	int32 HeartContainerDelta = 0;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	EKKElement Element = EKKElement::Physisch;

	/** Tags treiben die Synergien: Synergien fordern Tags, nicht zwingend konkrete Items. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	FGameplayTagContainer Tags;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	TSubclassOf<UKKItemEffect> EffectClass;

	// --- Aktives Item ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Aktiv")
	float ActiveCooldown = 0.f;

	/** Alternative zum Cooldown: Aufladung durch geraeumte Raeume. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Aktiv")
	int32 ActiveRoomCharges = 0;

	// --- Spawns ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Spawn")
	TSoftClassPtr<AKKFamiliar> FamiliarClass;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Spawn")
	TSoftClassPtr<AKKOrbital> OrbitalClass;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Spawn")
	TSoftClassPtr<AKKWeapon> WeaponClass;

	// --- Praesentation ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	TSoftObjectPtr<UTexture2D> Icon;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	TSoftObjectPtr<UStaticMesh> WorldMesh;

	/** Sichtbare Veraenderung an Leon (Brandspuren, Kabel, schwarze Adern ...). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	FName AppearanceLayer;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	TSoftObjectPtr<UNiagaraSystem> AuraEffect;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Fluch")
	bool bCursed = false;

	/** Preis in Kellermarken; 0 = aus Quality abgeleitet. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Handel")
	int32 ShopPrice = 0;

	UFUNCTION(BlueprintPure, Category = "Handel")
	int32 GetEffectivePrice() const;

	UFUNCTION(BlueprintPure, Category = "Pool")
	bool IsInPool(EKKItemPool Pool) const { return Pools.Contains(Pool); }

	virtual FPrimaryAssetId GetPrimaryAssetId() const override
	{
		return FPrimaryAssetId(TEXT("KKItem"), ItemId);
	}
};
