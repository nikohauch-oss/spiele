#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/KKTypes.h"
#include "KKStatusEffectComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKKOnStatusChanged, EKKStatus, Status, int32, Stacks);

USTRUCT()
struct FKKStatusInstance
{
	GENERATED_BODY()

	UPROPERTY() int32 Stacks = 0;
	UPROPERTY() float Remaining = 0.f;
	UPROPERTY() float TickAccumulator = 0.f;
	UPROPERTY() TWeakObjectPtr<AActor> Source = nullptr;
};

/**
 * Zustaende auf einem Koerper - und vor allem: wie sie aufeinander reagieren.
 *
 * Die Reaktionstabelle ist der Kern der Elementsynergien. Sie steht bewusst an einer
 * Stelle, damit "Wasser leitet Strom" und "Oel brennt heisser" nicht in 20 Items
 * einzeln nachprogrammiert werden muessen.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKStatusEffectComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKStatusEffectComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Legt einen Zustand an oder verlaengert ihn und loest die Reaktionen aus. */
	UFUNCTION(BlueprintCallable, Category = "Status")
	void ApplyStatus(EKKStatus Status, float Duration, int32 Stacks = 1, AActor* Source = nullptr);

	UFUNCTION(BlueprintCallable, Category = "Status")
	void RemoveStatus(EKKStatus Status);

	UFUNCTION(BlueprintPure, Category = "Status")
	bool HasStatus(EKKStatus Status) const;

	UFUNCTION(BlueprintPure, Category = "Status")
	int32 GetStacks(EKKStatus Status) const;

	/** Zustaende bremsen (Frost) oder treiben (Panik) - der Character multipliziert damit. */
	UFUNCTION(BlueprintPure, Category = "Status")
	float GetMoveSpeedMultiplier() const;

	/** Verwundbarkeitsfaktor: Nass verstaerkt Elektro, Unterkuehlt verstaerkt Physisch. */
	UFUNCTION(BlueprintPure, Category = "Status")
	float GetElementVulnerability(EKKElement Element) const;

	/** Ein Element trifft diesen Koerper: setzt den passenden Zustand und wertet Reaktionen aus. */
	UFUNCTION(BlueprintCallable, Category = "Status")
	void ReactToElement(EKKElement Element, float Magnitude, AActor* Source);

	UPROPERTY(BlueprintAssignable, Category = "Status")
	FKKOnStatusChanged OnStatusChanged;

	/** Schaden pro Sekunde je Stapel fuer die Zustaende, die ueber Zeit wehtun. */
	UPROPERTY(EditDefaultsOnly, Category = "Status") float BurnDamagePerSecond = 3.f;
	UPROPERTY(EditDefaultsOnly, Category = "Status") float PoisonDamagePerSecond = 2.f;
	UPROPERTY(EditDefaultsOnly, Category = "Status") float BleedDamagePerSecond = 4.f;

private:
	UPROPERTY() TMap<EKKStatus, FKKStatusInstance> Active;

	void TickDamageOverTime(float DeltaTime);
	void ApplyDot(EKKStatus Status, float DamagePerSecond, float DeltaTime, EKKElement Element);
};
