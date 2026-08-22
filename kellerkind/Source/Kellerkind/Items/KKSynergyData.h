#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GameplayTagContainer.h"
#include "Core/KKTypes.h"
#include "KKSynergyData.generated.h"

class UKKItemEffect;
class UTexture2D;

/**
 * Eine Synergie ist kein Sonderfall im Code, sondern ein eigener Datensatz:
 * Bedingung (Items und/oder Tags) -> zusaetzlicher Effekt.
 *
 * Beispiel "Kurzschluss":
 *   RequiredTags = { Element.Wasser, Element.Elektro }
 *   EffectClass  = UKKSynergy_Kurzschluss  (Elektroschaden springt ueber Wasserflaechen weiter)
 *
 * Weil Bedingungen ueber Tags laufen, greift dieselbe Synergie auch fuer spaeter
 * hinzugefuegte Items mit denselben Tags - ohne dass eine Tabelle gepflegt werden muss.
 */
UCLASS(BlueprintType)
class KELLERKIND_API UKKSynergyData : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	FName SynergyId;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
	FText DisplayName;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet", meta = (MultiLine = true))
	FText Description;

	/** Alle diese Tags muessen im Inventar vorhanden sein. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Bedingung")
	FGameplayTagContainer RequiredTags;

	/** Zusaetzlich koennen konkrete Items gefordert werden (fuer benannte Kombinationen). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Bedingung")
	TArray<FName> RequiredItemIds;

	/** Sperrt die Synergie, wenn einer dieser Tags vorhanden ist (z. B. Frost blockt Brand-Synergien). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Bedingung")
	FGameplayTagContainer BlockedByTags;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	TSubclassOf<UKKItemEffect> EffectClass;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	TArray<FKKStatMod> StatMods;

	/** Tag, den die Synergie selbst setzt - so koennen Synergien aufeinander aufbauen. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Wirkung")
	FGameplayTag GrantedTag;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	TSoftObjectPtr<UTexture2D> Icon;

	/** Optische Schicht auf Leon, wenn die Synergie aktiv ist. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik")
	FName AppearanceLayer;

	UFUNCTION(BlueprintPure, Category = "Synergie")
	bool IsSatisfied(const FGameplayTagContainer& OwnedTags, const TSet<FName>& OwnedItemIds) const;

	virtual FPrimaryAssetId GetPrimaryAssetId() const override
	{
		return FPrimaryAssetId(TEXT("KKSynergy"), SynergyId);
	}
};
