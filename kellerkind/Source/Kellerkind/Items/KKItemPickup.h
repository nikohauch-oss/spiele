#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Player/KKInteractable.h"
#include "KKItemPickup.generated.h"

class UKKItemData;
class UStaticMeshComponent;
class UPointLightComponent;

/** Ein Item, das im Keller liegt. Auch Ladenware ist ein Pickup - nur mit Preisschild. */
UCLASS()
class KELLERKIND_API AKKItemPickup : public AActor, public IKKInteractable
{
	GENERATED_BODY()

public:
	AKKItemPickup();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	static AKKItemPickup* SpawnFor(UWorld* World, UKKItemData* Item, const FVector& Location, int32 Price = 0);

	UFUNCTION(BlueprintCallable, Category = "Item") void SetItem(UKKItemData* InItem, int32 InPrice = 0);
	UFUNCTION(BlueprintPure, Category = "Item") UKKItemData* GetItem() const { return Item; }
	UFUNCTION(BlueprintPure, Category = "Item") int32 GetPrice() const { return Price; }

	virtual FText GetInteractionText_Implementation(AActor* Interactor) const override;
	virtual bool CanInteract_Implementation(AActor* Interactor) const override;
	virtual void Interact_Implementation(AActor* Interactor) override;
	virtual float GetInteractionNoise_Implementation() const override { return 0.1f; }

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

	/** Jedes Item liegt in seinem eigenen kleinen Licht - im dunklen Keller die einzige Orientierung. */
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> Glow;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Item") TObjectPtr<UKKItemData> Item;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Item") int32 Price = 0;

private:
	float BobPhase = 0.f;
	FVector BaseLocation = FVector::ZeroVector;
};
