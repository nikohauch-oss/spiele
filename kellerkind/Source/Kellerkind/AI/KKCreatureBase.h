#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/KKTypes.h"
#include "KKCreatureBase.generated.h"

class UKKCreatureData;
class UKKPerceptionComponent;
class UKKStatusEffectComponent;
class UAudioComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnCreatureDied, AKKCreatureBase*, Creature);

/**
 * Basis fuer alle Kreaturen des Kellers.
 *
 * Die Klasse haelt Zustand, Werte und Treffer; das Verhalten steckt im KKAIController,
 * gesteuert von der Taktik aus KKCreatureData. Spezialfaelle (Wandmann, Maske, Sammler)
 * erben und ueberschreiben nur die Stellen, an denen sie wirklich anders sind.
 */
UCLASS()
class KELLERKIND_API AKKCreatureBase : public ACharacter
{
	GENERATED_BODY()

public:
	AKKCreatureBase();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Uebertraegt die Definition auf diese Instanz. Wird direkt nach dem Spawn aufgerufen. */
	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	virtual void ApplyCreatureData(UKKCreatureData* Data);

	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	virtual int32 ReceiveDamage(const FKKDamageEvent& Event);

	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	virtual void Die(AActor* Killer);

	/** Angriff auf das aktuelle Ziel. Ueberschreibbar fuer Sonderangriffe. */
	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	virtual bool PerformAttack(AActor* AttackTarget);

	UFUNCTION(BlueprintPure, Category = "Kreatur") bool IsAlive() const { return bAlive; }
	UFUNCTION(BlueprintPure, Category = "Kreatur") bool IsHunting() const;
	UFUNCTION(BlueprintPure, Category = "Kreatur") float GetHealth() const { return Health; }
	UFUNCTION(BlueprintPure, Category = "Kreatur") float GetHealthFraction() const;
	UFUNCTION(BlueprintPure, Category = "Kreatur") UKKCreatureData* GetData() const { return Data; }
	UFUNCTION(BlueprintPure, Category = "Kreatur") UKKPerceptionComponent* GetPerception() const { return Perception; }
	UFUNCTION(BlueprintPure, Category = "Kreatur") EKKAIState GetAIState() const { return AIState; }

	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	void SetAIState(EKKAIState NewState);

	/** Wird der Spieler von diesem Punkt aus gerade angesehen? Fuer Die Maske und Die Marionetten. */
	UFUNCTION(BlueprintPure, Category = "Kreatur")
	bool IsObservedByPlayer(float ScreenMargin = 0.1f) const;

	UPROPERTY(BlueprintAssignable, Category = "Kreatur")
	FKKOnCreatureDied OnDied;

	/** Skalierung durch Etagentiefe und New Game+. */
	UFUNCTION(BlueprintCallable, Category = "Kreatur")
	void ApplyDifficultyScale(float HealthScale, float DamageScale);

protected:
	UPROPERTY(VisibleAnywhere, Category = "Kreatur") TObjectPtr<UKKPerceptionComponent> Perception;
	UPROPERTY(VisibleAnywhere, Category = "Kreatur") TObjectPtr<UKKStatusEffectComponent> Status;
	UPROPERTY(VisibleAnywhere, Category = "Kreatur") TObjectPtr<UAudioComponent> VoiceAudio;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Kreatur") TObjectPtr<UKKCreatureData> Data;

	UPROPERTY(BlueprintReadOnly, Category = "Kreatur") float Health = 40.f;
	UPROPERTY(BlueprintReadOnly, Category = "Kreatur") float MaxHealth = 40.f;
	UPROPERTY(BlueprintReadOnly, Category = "Kreatur") float DamageScale = 1.f;

	UPROPERTY(BlueprintReadOnly, Category = "Kreatur") EKKAIState AIState = EKKAIState::Idle;

	bool bAlive = true;
	double NextAttackAt = 0.0;

	void PlayCreatureSound(const TSoftObjectPtr<class USoundBase>& Sound);
	void SpawnDeathBrood();
	void BleedInto(const FVector& Location, float Strength);
};
