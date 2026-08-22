#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKShopkeeper.generated.h"

class UKKItemData;
class USkeletalMeshComponent;
class USpotLightComponent;
class AKKItemPickup;

/**
 * DER KELLERHAENDLER.
 *
 * Er verkauft Items, Herzen, Schluessel, Bomben und Relikte gegen Kellermarken.
 * Er redet nicht viel. Sein Angebot haengt am Zufallsstrom des Runs, damit ein Laden
 * bei gleichem Seed immer dasselbe fuehrt.
 */
UCLASS()
class KELLERKIND_API AKKShopkeeper : public AActor
{
	GENERATED_BODY()

public:
	AKKShopkeeper();

	virtual void BeginPlay() override;

	/** Baut das Angebot auf. Wird vom Raum beim Betreten aufgerufen. */
	UFUNCTION(BlueprintCallable, Category = "Haendler")
	void BuildStock(int32 SlotCount = 3);

	/** Preisaufschlag oder -nachlass, z. B. durch Items oder Fluch. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Haendler")
	float PriceMultiplier = 1.f;

	/** Wird der Haendler angegriffen, verschwindet er - und hinterlaesst etwas. */
	UFUNCTION(BlueprintCallable, Category = "Haendler")
	void Flee();

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkeletalMeshComponent> Mesh;

	/** Das kleine Licht an seinem Kopf - oft das Einzige, was man von ihm sieht. */
	UPROPERTY(VisibleAnywhere) TObjectPtr<USpotLightComponent> HeadLamp;

	UPROPERTY(EditAnywhere, Category = "Haendler") TArray<FVector> SlotOffsets;

	UPROPERTY(BlueprintReadOnly, Category = "Haendler") TArray<TObjectPtr<AKKItemPickup>> Stock;
};
