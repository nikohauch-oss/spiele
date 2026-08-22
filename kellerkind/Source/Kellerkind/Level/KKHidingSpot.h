#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Player/KKInteractable.h"
#include "KKHidingSpot.generated.h"

class UBoxComponent;
class UStaticMeshComponent;

/** Schrank, Bettunterseite, Regalnische, dunkle Ecke. */
UCLASS()
class KELLERKIND_API AKKHidingSpot : public AActor, public IKKInteractable
{
	GENERATED_BODY()

public:
	AKKHidingSpot();

	UFUNCTION(BlueprintCallable, Category = "Versteck") void SetOccupant(AActor* InOccupant);
	UFUNCTION(BlueprintPure, Category = "Versteck") bool IsOccupied() const { return Occupant.IsValid(); }

	virtual FText GetInteractionText_Implementation(AActor* Interactor) const override;
	virtual bool CanInteract_Implementation(AActor* Interactor) const override;
	virtual float GetHoldDuration_Implementation(AActor* Interactor) const override { return 0.6f; }
	virtual void Interact_Implementation(AActor* Interactor) override;
	virtual float GetInteractionNoise_Implementation() const override { return 0.15f; }

	/** Blickpunkt, aus dem der Spieler im Versteck hinausschaut. */
	UPROPERTY(EditAnywhere, Category = "Versteck") FVector ViewOffset = FVector(0.f, 0.f, 40.f);

	/**
	 * Manche Verstecke sind nicht sicher: Kreaturen, die den Spieler hineingehen sahen,
	 * ziehen ihn heraus. Das verhindert, dass Verstecke zur Pausentaste werden.
	 */
	UPROPERTY(EditAnywhere, Category = "Versteck") bool bCanBeSearched = true;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Trigger;

private:
	TWeakObjectPtr<AActor> Occupant;
};
