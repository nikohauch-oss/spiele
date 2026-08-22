#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KKInteractable.generated.h"

UINTERFACE(MinimalAPI, Blueprintable)
class UKKInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Alles, was Leon anfassen kann: Tueren, Schubladen, Ventile, Generatoren,
 * Sicherungskaesten, Kisten, Bretter, Items, Verstecke, Haendlerware.
 */
class KELLERKIND_API IKKInteractable
{
	GENERATED_BODY()

public:
	/** Text am Fadenkreuz, z. B. "Tuer langsam oeffnen". */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaktion")
	FText GetInteractionText(AActor* Interactor) const;
	virtual FText GetInteractionText_Implementation(AActor* Interactor) const { return FText::GetEmpty(); }

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaktion")
	bool CanInteract(AActor* Interactor) const;
	virtual bool CanInteract_Implementation(AActor* Interactor) const { return true; }

	/** Haltezeit in Sekunden; 0 = sofort. Wird durch InteractionSpeed geteilt. */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaktion")
	float GetHoldDuration(AActor* Interactor) const;
	virtual float GetHoldDuration_Implementation(AActor* Interactor) const { return 0.f; }

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaktion")
	void Interact(AActor* Interactor);
	virtual void Interact_Implementation(AActor* Interactor) {}

	/** Laerm, den die Interaktion erzeugt - eine zugeschlagene Tuer verraet Leon. */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaktion")
	float GetInteractionNoise() const;
	virtual float GetInteractionNoise_Implementation() const { return 0.2f; }
};
