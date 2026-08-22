#pragma once

#include "CoreMinimal.h"
#include "AI/KKBossBase.h"
#include "KKBoss_AnderesKind.generated.h"

/**
 * DAS ANDERE KIND - finaler Boss.
 *
 * Vier Phasen: menschlich, deformiert, Mischform aus Leon und gesammelten Horrorformen,
 * zerbrechende Arena.
 *
 * Die Besonderheit: Ab Phase 3 imitiert es die Faehigkeiten, die Leon in diesem Run am
 * haeufigsten benutzt hat. Die Datengrundlage dafuer sammelt UKKRunState waehrend des
 * gesamten Runs (jeder Waffenschlag, jedes aktive Item, jedes Ausweichen).
 */
UCLASS()
class KELLERKIND_API AKKBoss_AnderesKind : public AKKBossBase
{
	GENERATED_BODY()

public:
	AKKBoss_AnderesKind();

	/** Welche Faehigkeiten es gerade imitiert - die UI nennt sie beim Namen. */
	UFUNCTION(BlueprintPure, Category = "Boss")
	const TArray<FName>& GetImitatedAbilities() const { return Imitated; }

protected:
	virtual void OnPhaseEntered(int32 NewPhaseIndex) override;

	/** Ab dieser Phase beginnt die Imitation. */
	UPROPERTY(EditDefaultsOnly, Category = "Boss") int32 ImitationPhase = 2;

	/** Wie viele Faehigkeiten es uebernimmt. */
	UPROPERTY(EditDefaultsOnly, Category = "Boss") int32 ImitationCount = 3;

	/**
	 * Zuordnung von Spieler-Faehigkeit zu Bossangriff. Was hier nicht steht, kann nicht
	 * imitiert werden - so bleibt die Imitation lesbar statt beliebig.
	 */
	UPROPERTY(EditDefaultsOnly, Category = "Boss") TMap<FName, FName> AbilityToAttack;

private:
	UPROPERTY() TArray<FName> Imitated;

	void BuildImitation();
};
