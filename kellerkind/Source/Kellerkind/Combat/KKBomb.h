#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKBomb.generated.h"

class UStaticMeshComponent;
class UNiagaraSystem;

/**
 * Kellerbombe. Raeumt Gegner weg, sprengt Risse in Waende (Geheimraeume) und macht Laerm,
 * der alles in Hoerweite anzieht - Bomben sind deshalb nie folgenlos.
 */
UCLASS()
class KELLERKIND_API AKKBomb : public AActor
{
	GENERATED_BODY()

public:
	AKKBomb();

	virtual void BeginPlay() override;

	UPROPERTY(EditDefaultsOnly, Category = "Bombe") float FuseTime = 1.6f;
	UPROPERTY(EditDefaultsOnly, Category = "Bombe") float Radius = 420.f;
	UPROPERTY(EditDefaultsOnly, Category = "Bombe") float Damage = 60.f;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(EditDefaultsOnly, Category = "Bombe")
	TSoftObjectPtr<UNiagaraSystem> ExplosionEffect;

	UFUNCTION()
	void Explode();

private:
	FTimerHandle FuseHandle;
};
