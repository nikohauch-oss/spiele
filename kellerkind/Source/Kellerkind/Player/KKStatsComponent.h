#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/KKTypes.h"
#include "KKStatsComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnStatsChanged, UKKStatsComponent*, Stats);

/**
 * Haelt die zehn Kernwerte. Modifikatoren werden nicht direkt in den Wert gerechnet,
 * sondern als Quellen gespeichert und bei Bedarf neu ausgewertet. Dadurch kann ein Item
 * jederzeit entfernt werden (verfluchte Items, Opferraum), ohne dass Rundungsfehler bleiben.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKStatsComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKStatsComponent();

	virtual void InitializeComponent() override;

	/** Fuegt Modifikatoren unter einem Quellenschluessel hinzu (Item-ID, Synergie-ID, Fluch). */
	UFUNCTION(BlueprintCallable, Category = "Stats")
	void AddModifiers(FName SourceId, const TArray<FKKStatMod>& Mods);

	UFUNCTION(BlueprintCallable, Category = "Stats")
	void RemoveModifiers(FName SourceId);

	UFUNCTION(BlueprintPure, Category = "Stats")
	float GetStat(EKKStat Stat) const;

	/** Basiswerte je Charakter (Leon, Mira, Hausmeister, Kellerkind). */
	UFUNCTION(BlueprintCallable, Category = "Stats")
	void SetBase(EKKStat Stat, float Value);

	UFUNCTION(BlueprintPure, Category = "Stats")
	float GetBase(EKKStat Stat) const { return Base[static_cast<int32>(Stat)]; }

	/** Wuerfelt einen kritischen Treffer anhand der aktuellen Crit-Chance. */
	bool RollCrit(FRandomStream& Stream) const;

	/** Wuerfelt Ausweichen. */
	bool RollDodge(FRandomStream& Stream) const;

	/** Wandelt Ruestung in prozentuale Schadensreduktion (abnehmender Ertrag, gedeckelt). */
	UFUNCTION(BlueprintPure, Category = "Stats")
	float GetDamageReduction() const;

	UPROPERTY(BlueprintAssignable, Category = "Stats")
	FKKOnStatsChanged OnStatsChanged;

private:
	struct FModSource
	{
		TArray<FKKStatMod> Mods;
	};

	TMap<FName, FModSource> Sources;

	float Base[static_cast<int32>(EKKStat::MAX)];
	float Cached[static_cast<int32>(EKKStat::MAX)];

	void Recalculate();
	void ApplyDefaults();
};
