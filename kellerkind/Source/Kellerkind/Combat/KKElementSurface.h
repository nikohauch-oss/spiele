#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKElementSurface.generated.h"

class UBoxComponent;
class UDecalComponent;
class UNiagaraComponent;

/**
 * Eine Flaeche auf dem Boden: Wasser, Oel, Feuer, Blut, Gift, Eis.
 *
 * Flaechen sind der physische Traeger der Elementsynergien. Wer in einer Wasserflaeche
 * steht, ist nass; wer in einer brennenden Flaeche steht, brennt. Ein Elektroschlag in
 * eine Wasserflaeche trifft alles, was darin steht - genau die Kombination aus dem
 * Design-Beispiel "Nasse Sicherung + Hochspannung".
 */
UCLASS()
class KELLERKIND_API AKKElementSurface : public AActor
{
	GENERATED_BODY()

public:
	AKKElementSurface();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Erzeugt eine Flaeche zur Laufzeit. Ueberlappende gleiche Flaechen verschmelzen. */
	static AKKElementSurface* Spawn(UWorld* World, EKKStatus SurfaceType, const FVector& Location,
		float Radius, float Duration, AActor* Instigator);

	UFUNCTION(BlueprintPure, Category = "Flaeche") EKKStatus GetSurfaceType() const { return SurfaceType; }
	UFUNCTION(BlueprintPure, Category = "Flaeche") float GetRadius() const { return Radius; }

	/** Alle Akteure, die gerade in der Flaeche stehen. */
	UFUNCTION(BlueprintPure, Category = "Flaeche")
	const TArray<TWeakObjectPtr<AActor>>& GetOccupants() const { return Occupants; }

	/** Feuer trifft Oel, Frost trifft Wasser: die Flaeche wandelt sich um. */
	UFUNCTION(BlueprintCallable, Category = "Flaeche")
	void ReactToElement(EKKElement Element, AActor* Source);

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Volume;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDecalComponent> Decal;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UNiagaraComponent> Effect;

	UPROPERTY(EditAnywhere, Category = "Flaeche") EKKStatus SurfaceType = EKKStatus::Nass;
	UPROPERTY(EditAnywhere, Category = "Flaeche") float Radius = 200.f;
	UPROPERTY(EditAnywhere, Category = "Flaeche") float Lifetime = 12.f;

	/** Wie oft der Zustand auf Stehende erneuert wird. */
	UPROPERTY(EditAnywhere, Category = "Flaeche") float ApplyInterval = 0.5f;

private:
	float Age = 0.f;
	float ApplyTimer = 0.f;
	TArray<TWeakObjectPtr<AActor>> Occupants;

	void RefreshOccupants();
	EKKStatus StatusForSurface() const;
};
