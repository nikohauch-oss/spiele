#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KKStealthComponent.generated.h"

class AKKHidingSpot;

/**
 * Sichtbarkeit und Laerm des Spielers.
 *
 * Die Lichtmessung ist der Kern: Kreaturen, die auf Sicht reagieren, fragen ueber
 * GetVisibilityMultiplier() ab, wie gut Leon zu erkennen ist. Gemessen wird die
 * Helligkeit am Spieler, nicht ein abstrakter "Stealth-Wert".
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKStealthComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKStealthComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintPure, Category = "Stealth") float GetVisibilityMultiplier() const;
	UFUNCTION(BlueprintPure, Category = "Stealth") float GetNoiseMultiplier() const { return NoiseMultiplier; }
	UFUNCTION(BlueprintPure, Category = "Stealth") float GetLightLevel() const { return LightLevel; }
	UFUNCTION(BlueprintPure, Category = "Stealth") bool IsHidden() const { return CurrentHidingSpot != nullptr; }

	UFUNCTION(BlueprintCallable, Category = "Stealth")
	void EnterHidingSpot(AKKHidingSpot* Spot);

	UFUNCTION(BlueprintCallable, Category = "Stealth")
	void LeaveHidingSpot();

	/** Items koennen Leon leiser oder lauter machen (Gummisohlen, Ketten am Guertel). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stealth")
	float NoiseMultiplier = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stealth")
	float VisibilityBonus = 0.f;

private:
	UPROPERTY() TObjectPtr<AKKHidingSpot> CurrentHidingSpot = nullptr;

	/** 0 = stockdunkel, 1 = direkt unter einer Lampe. */
	float LightLevel = 0.5f;

	void SampleLight();
};
