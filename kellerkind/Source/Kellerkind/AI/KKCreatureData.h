#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Core/KKTypes.h"
#include "KKCreatureData.generated.h"

class AKKCreatureBase;
class USkeletalMesh;
class UAnimBlueprint;
class USoundBase;
class UNiagaraSystem;

/**
 * Taktik einer Kreatur. Die Designregel lautet: keine Kreatur ist die Farbvariante
 * einer anderen. Deshalb bestimmt die Taktik, wie sich eine Kreatur im Raum verhaelt -
 * nicht nur ihre Werte.
 */
UENUM(BlueprintType)
enum class EKKTactic : uint8
{
	Direkt			UMETA(DisplayName = "Direkt - laeuft an und schlaegt zu"),
	Hinterhalt		UMETA(DisplayName = "Hinterhalt - wartet reglos, bis das Ziel nah ist"),
	Decke			UMETA(DisplayName = "Decke - haengt oben und laesst sich fallen"),
	Rudel			UMETA(DisplayName = "Rudel - umkreist und greift abgestimmt an"),
	Schwarm			UMETA(DisplayName = "Schwarm - viele schwache, ungeordnet"),
	Fernkampf		UMETA(DisplayName = "Fernkampf - haelt Abstand"),
	Wand			UMETA(DisplayName = "Wand - bewegt sich durch Waende"),
	Schacht			UMETA(DisplayName = "Schacht - nutzt Lueftungen"),
	Dieb			UMETA(DisplayName = "Dieb - stiehlt statt zu toeten"),
	Beobachter		UMETA(DisplayName = "Beobachter - bewegt sich nur unbeobachtet"),
	Blind			UMETA(DisplayName = "Blind - reagiert ausschliesslich auf Geraeusch"),
	Waechter		UMETA(DisplayName = "Waechter - langsam, schwer, zerstoert Hindernisse"),
	Bruthelfer		UMETA(DisplayName = "Bruthelfer - erzeugt kleinere Kreaturen"),
	Schatten		UMETA(DisplayName = "Schatten - wechselt zwischen dunklen Bereichen"),
	MAX				UMETA(Hidden)
};

/** Definition einer Kreatur. Optik, Sinne, Werte und Taktik an einer Stelle. */
UCLASS(BlueprintType)
class KELLERKIND_API UKKCreatureData : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FName CreatureId;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FText DisplayName;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet", meta = (MultiLine = true)) FText CodexText;

	/** Auf welchen Etagen die Kreatur auftaucht. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Vorkommen") TArray<EKKFloor> Floors;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Vorkommen") FName RequiredUnlock;

	/** Punktekosten im Raumbudget - starke Kreaturen fuellen einen Raum schneller. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Vorkommen", meta = (ClampMin = "1")) int32 SpawnCost = 1;

	/** Mindest- und Hoechstzahl, wenn diese Kreatur in einem Raum vorkommt. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Vorkommen") int32 MinGroupSize = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Vorkommen") int32 MaxGroupSize = 1;

	// --- Werte ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float MaxHealth = 40.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float MoveSpeed = 300.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float SprintSpeed = 520.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float AttackDamage = 1.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float AttackRange = 160.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") float AttackCooldown = 1.8f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") EKKElement DamageElement = EKKElement::Physisch;

	/** Widerstaende je Element; 1.0 = normal, 0.5 = halber Schaden, 2.0 = doppelter. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Werte") TMap<EKKElement, float> ElementModifiers;

	// --- Verhalten ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Verhalten") EKKTactic Tactic = EKKTactic::Direkt;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Verhalten") TSubclassOf<AKKCreatureBase> CreatureClass;

	// --- Sinne ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float SightRange = 1800.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float SightHalfAngle = 60.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float SightWeight = 1.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float HearingThreshold = 0.2f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float HearingWeight = 1.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float BloodSmellWeight = 0.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float LightReaction = 0.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sinne") float MemorySeconds = 9.f;

	// --- Optik und Klang ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik") TSoftObjectPtr<USkeletalMesh> Mesh;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik") TSoftClassPtr<UAnimInstance> AnimClass;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Optik") FVector MeshScale = FVector(1.f);

	/** Eigene Geraeusche - Pflicht laut Designregel: keine geteilten Kreaturensounds. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Klang") TSoftObjectPtr<USoundBase> IdleSound;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Klang") TSoftObjectPtr<USoundBase> AlertSound;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Klang") TSoftObjectPtr<USoundBase> AttackSound;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Klang") TSoftObjectPtr<USoundBase> HurtSound;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Klang") TSoftObjectPtr<USoundBase> DeathSound;

	/** Kreatur, die beim Tod erzeugt wird (Kriechmutter -> kleine Kriecher). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tod") FName SpawnOnDeathId;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tod") int32 SpawnOnDeathCount = 0;

	virtual FPrimaryAssetId GetPrimaryAssetId() const override
	{
		return FPrimaryAssetId(TEXT("KKCreature"), CreatureId);
	}
};
