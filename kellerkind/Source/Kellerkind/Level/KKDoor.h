#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Player/KKInteractable.h"
#include "Core/KKTypes.h"
#include "KKDoor.generated.h"

class UStaticMeshComponent;
class USoundBase;

/**
 * Kellertuer.
 *
 * Sie kann normal geoeffnet oder langsam aufgedrueckt werden - langsam macht kaum Laerm,
 * kostet aber Zeit. Genau diese Wahl ist der Kern des Stealth-Spiels an Tueren.
 */
UCLASS()
class KELLERKIND_API AKKDoor : public AActor, public IKKInteractable
{
	GENERATED_BODY()

public:
	AKKDoor();

	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "Tuer") void SetLocked(bool bInLocked);
	UFUNCTION(BlueprintCallable, Category = "Tuer") void Open(bool bSlow);
	UFUNCTION(BlueprintCallable, Category = "Tuer") void Close(bool bSlam);

	UFUNCTION(BlueprintPure, Category = "Tuer") bool IsOpen() const { return TargetAngle != 0.f; }
	UFUNCTION(BlueprintPure, Category = "Tuer") bool IsLocked() const { return bLocked; }

	/** Braucht einen Schluessel; verbraucht ihn beim Oeffnen. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tuer") bool bNeedsKey = false;

	/** Richtung, in die diese Tuer aus dem Raum fuehrt. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tuer") EKKDir Direction = EKKDir::Nord;

	// IKKInteractable
	virtual FText GetInteractionText_Implementation(AActor* Interactor) const override;
	virtual bool CanInteract_Implementation(AActor* Interactor) const override;
	virtual float GetHoldDuration_Implementation(AActor* Interactor) const override;
	virtual void Interact_Implementation(AActor* Interactor) override;
	virtual float GetInteractionNoise_Implementation() const override;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Frame;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Leaf;

	UPROPERTY(EditDefaultsOnly, Category = "Tuer") float OpenAngle = 95.f;
	UPROPERTY(EditDefaultsOnly, Category = "Tuer") float FastSpeed = 220.f;
	UPROPERTY(EditDefaultsOnly, Category = "Tuer") float SlowSpeed = 45.f;

	/** Haltezeit fuer das langsame Oeffnen. */
	UPROPERTY(EditDefaultsOnly, Category = "Tuer") float SlowHoldDuration = 1.8f;

	UPROPERTY(EditDefaultsOnly, Category = "Klang") TSoftObjectPtr<USoundBase> CreakSound;
	UPROPERTY(EditDefaultsOnly, Category = "Klang") TSoftObjectPtr<USoundBase> SlamSound;
	UPROPERTY(EditDefaultsOnly, Category = "Klang") TSoftObjectPtr<USoundBase> LockedSound;

private:
	bool bLocked = false;
	float CurrentAngle = 0.f;
	float TargetAngle = 0.f;
	float Speed = 220.f;
	float PendingNoise = 0.2f;
};
