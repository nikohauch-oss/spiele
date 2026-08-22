#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "Core/KKTypes.h"
#include "AI/KKCreatureData.h"
#include "KKAIController.generated.h"

class AKKCreatureBase;
class UKKPerceptionComponent;

/**
 * Die Kellerkind-KI.
 *
 * Bewusst eine kompakte Zustandsmaschine statt eines Behavior Trees: Die Zustandskette
 * Ruhe -> Untersuchen -> Suchen -> Alarm -> Jagd -> Angriff ist fuer alle Kreaturen gleich,
 * nur die Taktik faerbt sie ein. Das macht das Verhalten fuer Spieler lesbar - man kann
 * lernen, wie eine Kreatur denkt - und es bleibt im Code an einer Stelle nachvollziehbar.
 */
UCLASS()
class KELLERKIND_API AKKAIController : public AAIController
{
	GENERATED_BODY()

public:
	AKKAIController();

	virtual void OnPossess(APawn* InPawn) override;
	virtual void OnUnPossess() override;
	virtual void Tick(float DeltaTime) override;

protected:
	UFUNCTION() void HandleTargetSpotted(AActor* Target);
	UFUNCTION() void HandleStimulusHeard(FVector Location);
	UFUNCTION() void HandleTargetLost();

	// --- Zustaende ---
	void TickIdle(float DeltaTime);
	void TickPatrol(float DeltaTime);
	void TickInvestigate(float DeltaTime);
	void TickSearch(float DeltaTime);
	void TickHunt(float DeltaTime);
	void TickAttack(float DeltaTime);
	void TickLurk(float DeltaTime);

	/** Taktikabhaengige Bewegung waehrend der Jagd (Rudel umkreist, Fernkampf haelt Abstand). */
	void MoveForTactic(AActor* Target, float DeltaTime);

	void EnterState(EKKAIState NewState);

	AKKCreatureBase* GetCreature() const;
	UKKPerceptionComponent* GetPerception() const;
	EKKTactic GetTactic() const;

private:
	EKKAIState State = EKKAIState::Idle;
	double StateEnteredAt = 0.0;

	FVector SearchAnchor = FVector::ZeroVector;
	int32 SearchStepsLeft = 0;
	double NextSearchStepAt = 0.0;

	/** Fuer Rudeltaktik: aktuelle Umkreisungsrichtung und Winkel. */
	float OrbitAngle = 0.f;
	float OrbitDirection = 1.f;

	/** Fuer Beobachter (Die Maske, Die Marionetten): Reststrecke, die unbeobachtet zurueckgelegt wird. */
	bool bMovedWhileUnobserved = false;

	FRandomStream Stream;

	float TimeInState() const;
	void MoveToLocationSafe(const FVector& Location, float Acceptance = 90.f);
};
