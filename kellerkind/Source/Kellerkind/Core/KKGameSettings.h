#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "KKGameSettings.generated.h"

/**
 * Zentrale Balance-Konfiguration. Liegt in DefaultGame.ini, damit Designer Werte ohne
 * Code-Aenderung kuratieren koennen. Alles, was ein Run als Basiswert braucht, steht hier.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Kellerkind - Balance"))
class KELLERKIND_API UKKGameSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	static const UKKGameSettings& Get() { return *GetDefault<UKKGameSettings>(); }

	// --- Start ---
	UPROPERTY(Config, EditAnywhere, Category = "Start")
	int32 StartingHeartContainers = 3;

	UPROPERTY(Config, EditAnywhere, Category = "Start")
	int32 StartingKellermarken = 0;

	UPROPERTY(Config, EditAnywhere, Category = "Start")
	int32 StartingKeys = 0;

	UPROPERTY(Config, EditAnywhere, Category = "Start")
	int32 StartingBombs = 1;

	// --- Basiswerte der zehn Stats ---
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseDamage = 3.5f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseAttackSpeed = 1.0f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseMoveSpeed = 380.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseRange = 220.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseCritChance = 0.03f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseLuck = 0.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseArmor = 0.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseDodge = 0.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float BaseInteractionSpeed = 1.0f;

	// --- Obergrenzen, damit Builds nicht das Spiel zerlegen ---
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float MaxCritChance = 0.95f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float MaxDodge = 0.60f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float MaxArmorReduction = 0.75f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") float MaxMoveSpeed = 900.f;
	UPROPERTY(Config, EditAnywhere, Category = "Stats") int32 MaxHeartContainers = 12;

	// --- Herzsystem ---
	UPROPERTY(Config, EditAnywhere, Category = "Herzen")
	float SchwarzesHerzSchockwelleRadius = 700.f;

	UPROPERTY(Config, EditAnywhere, Category = "Herzen")
	float SchwarzesHerzSchockwelleSchaden = 32.f;

	/** Unverwundbarkeit nach Treffer, in Sekunden. */
	UPROPERTY(Config, EditAnywhere, Category = "Herzen")
	float InvulnerabilityTime = 1.1f;

	// --- Etagengenerierung ---
	UPROPERTY(Config, EditAnywhere, Category = "Generierung")
	int32 GridSize = 13;

	UPROPERTY(Config, EditAnywhere, Category = "Generierung")
	float RoomWorldSize = 2600.f;

	/** Grundchance auf einen Etagenfluch; steigt je Etage um CurseChancePerFloor. */
	UPROPERTY(Config, EditAnywhere, Category = "Generierung")
	float BaseCurseChance = 0.08f;

	UPROPERTY(Config, EditAnywhere, Category = "Generierung")
	float CurseChancePerFloor = 0.04f;

	// --- Horror-Director ---
	UPROPERTY(Config, EditAnywhere, Category = "Horror")
	float HorrorBaseCooldown = 55.f;

	UPROPERTY(Config, EditAnywhere, Category = "Horror")
	float HorrorTensionDecayPerSecond = 0.9f;

	/** Anteil aller Horrorereignisse, die ueberhaupt ein Jumpscare sein duerfen. */
	UPROPERTY(Config, EditAnywhere, Category = "Horror", meta = (ClampMin = "0.0", ClampMax = "0.3"))
	float JumpscareBudget = 0.07f;
};
