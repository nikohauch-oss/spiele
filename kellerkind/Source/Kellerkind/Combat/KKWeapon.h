#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKWeapon.generated.h"

class AKKCharacter;
class USkeletalMeshComponent;
class UAnimMontage;
class UNiagaraSystem;
class USoundBase;

UENUM(BlueprintType)
enum class EKKWeaponMode : uint8
{
	Nahkampf	UMETA(DisplayName = "Nahkampf"),
	Schuss		UMETA(DisplayName = "Schuss"),
	Streuung	UMETA(DisplayName = "Streuung"),
	Dauerfeuer	UMETA(DisplayName = "Dauerfeuer"),
	MAX			UMETA(Hidden)
};

/**
 * Basis fuer alle Waffen: Brecheisen, Hammer, Axt, Metallrohr, Nagelpistole,
 * Bolzenwerfer, Elektrowaffe, Signalpistole, Schrotwaffe, Kettensaege, Industriewerkzeug.
 *
 * Items veraendern die Waffe sichtbar: WeaponLayers werden vom Inventar gesetzt und
 * schalten Materialparameter und Aufsaetze am Waffenmesh frei.
 */
UCLASS()
class KELLERKIND_API AKKWeapon : public AActor
{
	GENERATED_BODY()

public:
	AKKWeapon();

	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "Waffe")
	void SetWielder(AKKCharacter* InWielder);

	/** Startet einen Angriff, wenn der Takt es zulaesst. */
	UFUNCTION(BlueprintCallable, Category = "Waffe")
	bool TryAttack(bool bHeavy);

	UFUNCTION(BlueprintPure, Category = "Waffe") EKKWeaponMode GetMode() const { return Mode; }
	UFUNCTION(BlueprintPure, Category = "Waffe") FName GetWeaponId() const { return WeaponId; }
	UFUNCTION(BlueprintPure, Category = "Waffe") bool IsReady() const;

	/** Optische Aufwertung durch Items (gluehende Schneide, Kabel, Blutkanaele). */
	UFUNCTION(BlueprintCallable, Category = "Waffe")
	void AddWeaponLayer(FName LayerId, float Strength);

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Waffe") FName WeaponId;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Waffe") FText DisplayName;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Waffe") EKKWeaponMode Mode = EKKWeaponMode::Nahkampf;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Waffe") EKKElement Element = EKKElement::Physisch;

	/** Grundschaden als Faktor auf den Damage-Stat des Traegers. */
	UPROPERTY(EditDefaultsOnly, Category = "Waffe") float DamageFactor = 1.f;
	UPROPERTY(EditDefaultsOnly, Category = "Waffe") float HeavyDamageFactor = 2.2f;

	/** Angriffe pro Sekunde bei AttackSpeed 1.0. */
	UPROPERTY(EditDefaultsOnly, Category = "Waffe") float BaseAttacksPerSecond = 1.35f;
	UPROPERTY(EditDefaultsOnly, Category = "Waffe") float HeavyWindup = 0.45f;

	/** Nahkampf: halber Oeffnungswinkel des Schwungs in Grad. */
	UPROPERTY(EditDefaultsOnly, Category = "Nahkampf") float SwingHalfAngle = 55.f;
	UPROPERTY(EditDefaultsOnly, Category = "Nahkampf") float SwingRadius = 45.f;

	/** Fernkampf: Anzahl Projektile je Schuss und Streuung in Grad. */
	UPROPERTY(EditDefaultsOnly, Category = "Fernkampf") int32 PelletCount = 1;
	UPROPERTY(EditDefaultsOnly, Category = "Fernkampf") float SpreadDegrees = 0.f;
	UPROPERTY(EditDefaultsOnly, Category = "Fernkampf") float ShotRangeMultiplier = 8.f;

	UPROPERTY(EditDefaultsOnly, Category = "Optik") TObjectPtr<UAnimMontage> LightAttackMontage;
	UPROPERTY(EditDefaultsOnly, Category = "Optik") TObjectPtr<UAnimMontage> HeavyAttackMontage;
	UPROPERTY(EditDefaultsOnly, Category = "Optik") TSoftObjectPtr<UNiagaraSystem> ImpactEffect;
	UPROPERTY(EditDefaultsOnly, Category = "Optik") TSoftObjectPtr<USoundBase> AttackSound;

	/** Laerm, den ein Angriff erzeugt. Eine Kettensaege ist im Keller nicht zu ueberhoeren. */
	UPROPERTY(EditDefaultsOnly, Category = "Stealth") float AttackNoise = 0.5f;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkeletalMeshComponent> Mesh;

	void PerformMelee(bool bHeavy);
	void PerformShot(bool bHeavy);

private:
	UPROPERTY() TObjectPtr<AKKCharacter> Wielder;

	double NextAttackAt = 0.0;
	bool bWindingUp = false;
	FTimerHandle WindupHandle;

	UPROPERTY() TMap<FName, float> WeaponLayers;

	float GetAttackInterval() const;
	void ApplyWeaponLayersToMaterials();
};
