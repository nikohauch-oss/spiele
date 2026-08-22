#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Core/KKTypes.h"
#include "KKDamageLibrary.generated.h"

/** Gemeinsame Schadensroutinen, die Items, Synergien, Bosse und Fallen teilen. */
UCLASS()
class KELLERKIND_API UKKDamageLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Maximale Kettenlaenge, damit Elektro-Builds nicht ins Unendliche springen. */
	static constexpr int32 MaxChainDepth = 4;

	/**
	 * Elektrischer Ueberschlag: springt von Origin auf alle nassen Ziele in Reichweite
	 * und von dort weiter. Das ist die Umsetzung der Beispiel-Synergie
	 * "Nasse Sicherung + Hochspannung" aus dem Design.
	 */
	UFUNCTION(BlueprintCallable, Category = "Kampf")
	static void ChainThroughWet(AActor* Origin, AActor* Source, float Power, int32 Depth = 0);

	UFUNCTION(BlueprintCallable, Category = "Kampf")
	static void ApplyRadialDamage(UObject* WorldContext, const FVector& Center, float Radius,
		float Amount, EKKElement Element, AActor* Source, FName SourceTag);

	UFUNCTION(BlueprintCallable, Category = "Kampf")
	static void SpawnBomb(AActor* Placer, const FVector& Location);

	/** Schaden an einem beliebigen Ziel - kuemmert sich um Kreatur/Spieler-Unterschiede. */
	UFUNCTION(BlueprintCallable, Category = "Kampf")
	static int32 ApplyDamageTo(AActor* Target, const FKKDamageEvent& Event);

	UFUNCTION(BlueprintPure, Category = "Kampf")
	static bool IsWet(AActor* Actor);
};
