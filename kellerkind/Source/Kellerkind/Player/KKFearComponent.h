#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KKFearComponent.generated.h"

class UAudioComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnFearChanged, float, Fear);

/**
 * Leons Angst.
 *
 * Wichtige Regel aus dem Design: Angst ist sichtbar und hoerbar, aber sie darf die
 * Steuerung nicht verwaschen. Deshalb wirkt Fear ausschliesslich auf Praesentation
 * (Atmung, Herzschlag, Handzittern in der Animation, Kameraatmung) - niemals auf
 * Eingabeverzoegerung, Trefferzonen oder Zielgenauigkeit.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKFearComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKFearComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintCallable, Category = "Angst")
	void AddFear(float Amount);

	UFUNCTION(BlueprintPure, Category = "Angst")
	float GetFear() const { return Fear; }

	/** 0..1 - wie schnell Leon atmet. Der AnimBP liest das direkt aus. */
	UFUNCTION(BlueprintPure, Category = "Angst")
	float GetBreathRate() const;

	/** Amplitude des Handzitterns fuer die Additive-Animation. */
	UFUNCTION(BlueprintPure, Category = "Angst")
	float GetHandTremor() const;

	/** Lautstaerke des Herzschlags im Mix. */
	UFUNCTION(BlueprintPure, Category = "Angst")
	float GetHeartbeatVolume() const;

	UPROPERTY(BlueprintAssignable, Category = "Angst")
	FKKOnFearChanged OnFearChanged;

	/** Angst pro Sekunde, solange eine Kreatur in Sichtweite ist. */
	UPROPERTY(EditDefaultsOnly, Category = "Angst") float FearPerSecondNearCreature = 0.22f;
	UPROPERTY(EditDefaultsOnly, Category = "Angst") float FearDecayPerSecond = 0.09f;
	UPROPERTY(EditDefaultsOnly, Category = "Angst") float DarknessFearPerSecond = 0.05f;

private:
	float Fear = 0.f;
	float LastBroadcast = -1.f;

	void SampleEnvironment(float DeltaTime);
};
