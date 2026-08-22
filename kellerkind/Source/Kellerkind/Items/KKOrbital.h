#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKOrbital.generated.h"

class UStaticMeshComponent;

/**
 * Ein Gegenstand, der sichtbar um Leon kreist: Glasscherbe, Kreissaege, Knochen,
 * Messer, Schraube, Gluehbirne, Maschinenteil.
 *
 * Orbitals treffen beim Beruehren und haben pro Ziel einen eigenen kurzen Cooldown -
 * sonst wuerden sie in einem einzigen Frame alles ausloeschen.
 */
UCLASS()
class KELLERKIND_API AKKOrbital : public AActor
{
	GENERATED_BODY()

public:
	AKKOrbital();

	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "Orbital")
	void Configure(AActor* InOwner, float InPhaseDegrees);

	UPROPERTY(EditDefaultsOnly, Category = "Orbital") float OrbitRadius = 180.f;
	UPROPERTY(EditDefaultsOnly, Category = "Orbital") float OrbitSpeed = 130.f;
	UPROPERTY(EditDefaultsOnly, Category = "Orbital") float OrbitHeight = 60.f;
	UPROPERTY(EditDefaultsOnly, Category = "Orbital") float ContactDamage = 4.f;
	UPROPERTY(EditDefaultsOnly, Category = "Orbital") float HitInterval = 0.6f;
	UPROPERTY(EditDefaultsOnly, Category = "Orbital") EKKElement Element = EKKElement::Physisch;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	TWeakObjectPtr<AActor> Carrier;
	float Phase = 0.f;

	/** Letzter Treffer je Ziel, damit ein Orbital nicht jeden Frame trifft. */
	TMap<TWeakObjectPtr<AActor>, double> LastHitTimes;

	void CheckContacts();
};
