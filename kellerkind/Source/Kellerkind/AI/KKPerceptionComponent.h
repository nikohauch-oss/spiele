#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/KKTypes.h"
#include "KKPerceptionComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnTargetSpotted, AActor*, Target);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnStimulusHeard, FVector, Location);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FKKOnTargetLost);

/**
 * Die Sinne einer Kreatur.
 *
 * Jede Kreatur gewichtet die Kanaele anders: Die Blinden haben SightWeight 0 und eine
 * sehr niedrige Hoerschwelle, Der Kellerhund riecht Blut, Das Fluestern reagiert auf Licht.
 * Dadurch entsteht der Unterschied im Verhalten aus Daten, nicht aus Sonderklassen.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKPerceptionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKPerceptionComponent();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void ReceiveStimulus(const FKKStimulus& Stimulus);

	UFUNCTION(BlueprintPure, Category = "Sinne") AActor* GetTarget() const { return Target.Get(); }
	UFUNCTION(BlueprintPure, Category = "Sinne") bool HasTarget() const { return Target.IsValid(); }
	UFUNCTION(BlueprintPure, Category = "Sinne") FVector GetLastKnownLocation() const { return LastKnownLocation; }
	UFUNCTION(BlueprintPure, Category = "Sinne") bool HasLastKnownLocation() const { return bHasLastKnown; }
	UFUNCTION(BlueprintPure, Category = "Sinne") float GetAwareness() const { return Awareness; }

	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void ForgetTarget();

	/** Von aussen gesetzt, z. B. wenn das Kellerkind eine Kreatur auf Leon hetzt. */
	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void ForceTarget(AActor* NewTarget);

	// --- Konfiguration (kommt aus KKCreatureData) ---
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sicht") float SightRange = 1800.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sicht") float SightHalfAngle = 60.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sicht") float SightWeight = 1.f;

	/** Reiz, ab dem ein Geraeusch ueberhaupt wahrgenommen wird. Niedrig = feines Gehoer. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gehoer") float HearingThreshold = 0.2f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gehoer") float HearingWeight = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Geruch") float BloodSmellWeight = 0.f;

	/** >0: Licht zieht an (Motten), <0: Licht schreckt ab (Das Fluestern). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Licht") float LightReaction = 0.f;

	/** Wie schnell die Kreatur ein Ziel wieder vergisst. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gedaechtnis") float MemorySeconds = 9.f;

	/** Zeit, die eine Kreatur den Spieler im Blick braucht, bis sie ihn sicher erkennt. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Sicht") float TimeToNotice = 0.55f;

	UPROPERTY(BlueprintAssignable, Category = "Sinne") FKKOnTargetSpotted OnTargetSpotted;
	UPROPERTY(BlueprintAssignable, Category = "Sinne") FKKOnStimulusHeard OnStimulusHeard;
	UPROPERTY(BlueprintAssignable, Category = "Sinne") FKKOnTargetLost OnTargetLost;

private:
	TWeakObjectPtr<AActor> Target;
	FVector LastKnownLocation = FVector::ZeroVector;
	bool bHasLastKnown = false;

	/** 0..1 - wie sicher die Kreatur ist, dass da jemand ist. */
	float Awareness = 0.f;
	double LastSeenTime = 0.0;

	void UpdateSight(float DeltaTime);
	bool CanSee(AActor* Actor, float& OutVisibility) const;
};
