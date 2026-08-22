#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Core/KKTypes.h"
#include "KKFloorData.generated.h"

class AKKBossBase;
class UKKCreatureData;
class UMaterialParameterCollection;

/** Definition einer Kellerebene. */
UCLASS(BlueprintType)
class KELLERKIND_API UKKFloorData : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") EKKFloor Floor = EKKFloor::AlterKeller;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FText DisplayName;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet") FName RequiredUnlock;

	// --- Umfang ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Umfang") int32 MinRooms = 10;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Umfang") int32 MaxRooms = 15;

	/** Zusaetzliche Raeume pro New-Game+-Stufe. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Umfang") int32 RoomsPerNGPlus = 2;

	// --- Sonderraeume: wie viele davon garantiert vorkommen ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 TreasureRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 ShopRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 SecretRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 SuperSecretRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 MiniBossRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 ChallengeRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 SafeRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 StoryRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 PuzzleRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 EventRooms = 1;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 CursedRooms = 0;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") int32 SacrificeRooms = 0;

	/** Zweiter Ausgang der Etage - fuehrt auf einen alternativen Weg. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") bool bHasAlternatePath = false;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Sonderraeume") EKKFloor AlternateTarget = EKKFloor::AlterKeller;

	// --- Gegner ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gegner") float EnemyHealthScale = 1.f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gegner") float EnemyDamageScale = 1.f;

	/** Boss dieser Etage. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss") TSoftClassPtr<AKKBossBase> BossClass;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss") TSoftClassPtr<AKKBossBase> AlternateBossClass;

	// --- Stimmung ---
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Stimmung") FLinearColor FogColor = FLinearColor(0.02f, 0.02f, 0.025f);
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Stimmung") float FogDensity = 0.06f;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Stimmung") float AmbientLightScale = 1.f;

	/** Wie stark der Horror-Director auf dieser Etage arbeiten darf. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Stimmung") float HorrorIntensity = 1.f;

	virtual FPrimaryAssetId GetPrimaryAssetId() const override
	{
		return FPrimaryAssetId(TEXT("KKFloor"), *UEnum::GetValueAsString(Floor));
	}
};
