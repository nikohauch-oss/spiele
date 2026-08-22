#pragma once

#include "CoreMinimal.h"
#include "AI/KKCreatureBase.h"
#include "KKBossBase.generated.h"

class UKKBossAttack;
class UAnimMontage;
class ULevelSequence;

/** Eine Phase eines Bosskampfs. */
USTRUCT(BlueprintType)
struct FKKBossPhase
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) FName PhaseId;

	/** Ab welchem Lebensanteil die Phase beginnt (1.0 = Start, 0.5 = halbes Leben). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HealthThreshold = 1.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) float MoveSpeedMultiplier = 1.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) float AttackRateMultiplier = 1.f;

	/** Erhoehte Schadensresistenz in dieser Phase, z. B. waehrend Panzerung intakt ist. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) float DamageTakenMultiplier = 1.f;

	/** Arena-Ereignis, das beim Phasenwechsel ausgeloest wird (Feuer, Flutung, Dunkelheit). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) FName ArenaEventTag;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) TObjectPtr<UAnimMontage> TransitionMontage;

	/** Dauer der Phasenuebergangs-Animation, in der der Boss verwundbar ist. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly) float TransitionDuration = 2.5f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnBossPhaseChanged, int32, PhaseIndex);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKKOnBossArenaEvent, FName, EventTag, int32, PhaseIndex);

/**
 * Basis fuer alle sieben Bosse plus Minibosse und Der Vater.
 *
 * Gemeinsam ist allen: mehrere Phasen, Schwachstellen, angekuendigte Angriffe und
 * Arena-Mechaniken. Was ein Boss konkret tut, steckt in seinen Angriffsobjekten und
 * in der Ableitung - nicht in dieser Klasse.
 */
UCLASS()
class KELLERKIND_API AKKBossBase : public AKKCreatureBase
{
	GENERATED_BODY()

public:
	AKKBossBase();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;
	virtual int32 ReceiveDamage(const FKKDamageEvent& Event) override;
	virtual void Die(AActor* Killer) override;

	UFUNCTION(BlueprintPure, Category = "Boss") int32 GetPhaseIndex() const { return PhaseIndex; }
	UFUNCTION(BlueprintPure, Category = "Boss") const FKKBossPhase& GetPhase() const;
	UFUNCTION(BlueprintPure, Category = "Boss") bool IsInTransition() const;
	UFUNCTION(BlueprintPure, Category = "Boss") FText GetBossName() const { return BossName; }

	/** Startet den Kampf nach dem kurzen filmischen Intro. */
	UFUNCTION(BlueprintCallable, Category = "Boss")
	void BeginEncounter(AActor* InTarget);

	/** Schwachstelle getroffen: Der Treffer zaehlt mehrfach und kann eine Phase verkuerzen. */
	UFUNCTION(BlueprintCallable, Category = "Boss")
	void RegisterWeakPointHit(FName WeakPointId, const FKKDamageEvent& Event);

	UPROPERTY(BlueprintAssignable, Category = "Boss") FKKOnBossPhaseChanged OnPhaseChanged;
	UPROPERTY(BlueprintAssignable, Category = "Boss") FKKOnBossArenaEvent OnArenaEvent;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss") FText BossName;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss") TArray<FKKBossPhase> Phases;

	/** Angriffe dieses Bosses. Instanziert, damit jeder Angriff eigenen Zustand halten kann. */
	UPROPERTY(EditDefaultsOnly, Instanced, Category = "Boss") TArray<TObjectPtr<UKKBossAttack>> Attacks;

	/** Sockelnamen der Schwachstellen (Rohre am Ruecken, Maske, Gesichter im Fleisch). */
	UPROPERTY(EditDefaultsOnly, Category = "Boss") TMap<FName, float> WeakPointMultipliers;

	/** Kurzes filmisches Intro. Bewusst kein langes Video - der Kampf beginnt direkt danach. */
	UPROPERTY(EditDefaultsOnly, Category = "Boss") TSoftObjectPtr<ULevelSequence> IntroSequence;
	UPROPERTY(EditDefaultsOnly, Category = "Boss") float IntroMaxDuration = 12.f;

protected:
	/** Waehlt den naechsten Angriff gewichtet aus allen, die gerade moeglich sind. */
	virtual UKKBossAttack* SelectAttack(AActor* InTarget);

	virtual void EnterPhase(int32 NewPhaseIndex);

	/** Haken fuer Ableitungen: Der Schlaefer verformt hier die Arena, Die Mutter teleportiert. */
	virtual void OnPhaseEntered(int32 NewPhaseIndex) {}

	UPROPERTY(BlueprintReadOnly, Category = "Boss") int32 PhaseIndex = 0;
	UPROPERTY() TWeakObjectPtr<AActor> EncounterTarget;

	bool bEncounterActive = false;
	double BusyUntil = 0.0;
	double TransitionUntil = 0.0;

	FRandomStream BossStream;
};
