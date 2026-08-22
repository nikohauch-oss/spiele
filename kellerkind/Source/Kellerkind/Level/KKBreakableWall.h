#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KKBreakableWall.generated.h"

class UStaticMeshComponent;
class UNiagaraSystem;
class USoundBase;

/**
 * Sprengbare Wand.
 *
 * Hinter ihr liegen Geheimraeume. Damit die Suche kein Abklopfen aller Waende wird,
 * gibt eine Wand mit Geheimraum dahinter Hinweise: feine Risse, Zugluft, ein anderer
 * Klang - und Items wie das Mechanische Auge markieren sie.
 */
UCLASS()
class KELLERKIND_API AKKBreakableWall : public AActor
{
	GENERATED_BODY()

public:
	AKKBreakableWall();

	UFUNCTION(BlueprintCallable, Category = "Wand")
	void Break(AActor* Breaker);

	/** Markiert die Wand sichtbar - Mechanisches Auge, Karte, Kellerkind-Hinweis. */
	UFUNCTION(BlueprintCallable, Category = "Wand")
	void Reveal();

	UFUNCTION(BlueprintPure, Category = "Wand") bool IsBroken() const { return bBroken; }

	/** Liegt hinter dieser Wand tatsaechlich ein Geheimraum? */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Wand") bool bLeadsToSecret = false;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(EditDefaultsOnly, Category = "Wand") TSoftObjectPtr<UNiagaraSystem> DebrisEffect;
	UPROPERTY(EditDefaultsOnly, Category = "Wand") TSoftObjectPtr<USoundBase> BreakSound;

private:
	bool bBroken = false;
};
