#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/KKTypes.h"
#include "KKSenseSubsystem.generated.h"

class UKKPerceptionComponent;

/**
 * Verteilt Sinnesreize an alle Kreaturen, die zuhoeren.
 *
 * Statt dass jede Kreatur jeden Frame die Welt abfragt, schreiben Ereignisse
 * (Schritte, Tueren, Schuesse, Explosionen, Horrorereignisse) hier einen Reiz hinein.
 * Das haelt die KI-Kosten auch bei vielen Kreaturen niedrig und macht Stealth lesbar:
 * Was keinen Reiz erzeugt, kann auch niemand hoeren.
 */
UCLASS()
class KELLERKIND_API UKKSenseSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	void RegisterListener(UKKPerceptionComponent* Listener);
	void UnregisterListener(UKKPerceptionComponent* Listener);

	/** Reiz an alle Zuhoerer in Reichweite. Die Daempfung ueber die Distanz passiert hier. */
	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void BroadcastStimulus(const FKKStimulus& Stimulus);

	/** Bequemer Kurzweg fuer Geraeusche. */
	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void MakeNoise(const FVector& Location, float Strength, float Radius, AActor* Source);

	/** Blut an einem Ort - Kreaturen mit Blutgeruch finden verletzte Spieler. */
	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void LeaveBloodTrace(const FVector& Location, float Strength, AActor* Source);

	/** Alle Kreaturen in Reichweite alarmieren (Boss-Ruf, Alarmanlage, Der Sammler). */
	UFUNCTION(BlueprintCallable, Category = "Sinne")
	void RaiseAlarm(const FVector& Location, float Radius, AActor* Source);

private:
	TArray<TWeakObjectPtr<UKKPerceptionComponent>> Listeners;
};
