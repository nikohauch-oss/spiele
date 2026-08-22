#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KKInteractionComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKKOnFocusChanged, AActor*, Focus, const FText&, Prompt);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnHoldProgress, float, Progress);

/**
 * Sucht jeden Frame das Objekt vor Leon und wickelt Halte-Interaktionen ab.
 * Zusaetzlich verwaltet sie den getragenen Gegenstand (Aufheben, Werfen zur Ablenkung).
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKInteractionComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintCallable, Category = "Interaktion")
	bool TryInteract();

	UFUNCTION(BlueprintCallable, Category = "Interaktion")
	void CancelInteract();

	UFUNCTION(BlueprintCallable, Category = "Interaktion")
	bool PickUpObject(AActor* Object);

	/** Wirft den getragenen Gegenstand - der Aufschlag erzeugt einen Hoerreiz. */
	UFUNCTION(BlueprintCallable, Category = "Interaktion")
	void ThrowHeldObject(float Strength = 1200.f);

	UFUNCTION(BlueprintPure, Category = "Interaktion") AActor* GetFocus() const { return Focus.Get(); }
	UFUNCTION(BlueprintPure, Category = "Interaktion") AActor* GetHeldObject() const { return Held.Get(); }

	UPROPERTY(BlueprintAssignable, Category = "Interaktion") FKKOnFocusChanged OnFocusChanged;
	UPROPERTY(BlueprintAssignable, Category = "Interaktion") FKKOnHoldProgress OnHoldProgress;

	UPROPERTY(EditDefaultsOnly, Category = "Interaktion") float Reach = 220.f;
	UPROPERTY(EditDefaultsOnly, Category = "Interaktion") float TraceRadius = 12.f;

private:
	TWeakObjectPtr<AActor> Focus;
	TWeakObjectPtr<AActor> Held;

	bool bHolding = false;
	float HoldElapsed = 0.f;
	float HoldRequired = 0.f;

	void UpdateFocus();
	void UpdateHold(float DeltaTime);
	void CompleteInteract();
	bool GetViewPoint(FVector& OutLocation, FRotator& OutRotation) const;
};
