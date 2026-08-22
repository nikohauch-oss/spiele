#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKBossAttack.generated.h"

class AKKBossBase;
class UAnimMontage;

/**
 * Ein einzelner Bossangriff.
 *
 * Designregel: Bosse sind keine Schadensschwaemme. Jeder Angriff hat deshalb eine
 * sichtbare Ankuendigung (Telegraph), eine Bedingung, unter der er ueberhaupt gewaehlt wird,
 * und ein Zeitfenster, in dem der Spieler antworten kann.
 */
UCLASS(Blueprintable, EditInlineNew, DefaultToInstanced, Abstract)
class KELLERKIND_API UKKBossAttack : public UObject
{
	GENERATED_BODY()

public:
	virtual UWorld* GetWorld() const override;

	void Initialize(AKKBossBase* InBoss) { Boss = InBoss; }

	/** Darf der Angriff jetzt gewaehlt werden? Distanz, Phase, Cooldown, Arenazustand. */
	virtual bool CanUse(AActor* Target) const;

	/** Fuehrt den Angriff aus. Rueckgabe: Dauer, fuer die der Boss gebunden ist. */
	virtual float Execute(AActor* Target) { return 1.f; }

	UPROPERTY(EditDefaultsOnly, Category = "Angriff") FName AttackId;

	/** Ankuendigungsdauer. Unter 0.35 s ist ein Angriff nicht mehr fair lesbar. */
	UPROPERTY(EditDefaultsOnly, Category = "Angriff", meta = (ClampMin = "0.35")) float TelegraphTime = 0.8f;

	UPROPERTY(EditDefaultsOnly, Category = "Angriff") float Cooldown = 6.f;
	UPROPERTY(EditDefaultsOnly, Category = "Angriff") float MinRange = 0.f;
	UPROPERTY(EditDefaultsOnly, Category = "Angriff") float MaxRange = 100000.f;

	/** In welchen Phasen der Angriff verfuegbar ist (leer = alle). */
	UPROPERTY(EditDefaultsOnly, Category = "Angriff") TArray<int32> AllowedPhases;

	/** Auswahlgewicht gegenueber anderen moeglichen Angriffen. */
	UPROPERTY(EditDefaultsOnly, Category = "Angriff") float Weight = 1.f;

	UPROPERTY(EditDefaultsOnly, Category = "Angriff") TObjectPtr<UAnimMontage> Montage;

	double ReadyAt = 0.0;

protected:
	UPROPERTY() TWeakObjectPtr<AKKBossBase> Boss;
};
