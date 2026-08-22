#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/KKTypes.h"
#include "KKCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UKKStatsComponent;
class UKKHealthComponent;
class UKKInventoryComponent;
class UKKAppearanceComponent;
class UKKFearComponent;
class UKKInteractionComponent;
class UKKStealthComponent;
class UKKStatusEffectComponent;
class AKKWeapon;
class UInputMappingContext;
class UInputAction;
struct FInputActionValue;

UENUM(BlueprintType)
enum class EKKStance : uint8
{
	Stehend, Geduckt, Kriechend, Kletternd, MAX UMETA(Hidden)
};

/**
 * Leon Keller.
 *
 * Echtes First Person mit vollem Koerper: Die Kamera haengt am Kopfsocket desselben
 * Skeletal Mesh, das auch in Spiegeln, Zwischensequenzen und beim Blick nach unten zu sehen ist.
 * Es gibt bewusst kein zweites "Arme"-Mesh - dadurch stimmen Schatten, Reflexionen und
 * Item-Veraenderungen an Leon in jeder Ansicht ueberein.
 */
UCLASS()
class KELLERKIND_API AKKCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AKKCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	// --- Komponenten ---
	UFUNCTION(BlueprintPure, Category = "Leon") UKKStatsComponent* GetStats() const { return Stats; }
	UFUNCTION(BlueprintPure, Category = "Leon") UKKHealthComponent* GetHealth() const { return Health; }
	UFUNCTION(BlueprintPure, Category = "Leon") UKKInventoryComponent* GetInventory() const { return Inventory; }
	UFUNCTION(BlueprintPure, Category = "Leon") UKKAppearanceComponent* GetAppearance() const { return Appearance; }
	UFUNCTION(BlueprintPure, Category = "Leon") UKKFearComponent* GetFear() const { return Fear; }
	UFUNCTION(BlueprintPure, Category = "Leon") UKKStatusEffectComponent* GetStatus() const { return Status; }
	UFUNCTION(BlueprintPure, Category = "Leon") UCameraComponent* GetCamera() const { return Camera; }

	UFUNCTION(BlueprintPure, Category = "Leon") EKKStance GetStance() const { return Stance; }
	UFUNCTION(BlueprintPure, Category = "Leon") bool IsSprinting() const { return bSprinting; }
	UFUNCTION(BlueprintPure, Category = "Leon") AKKWeapon* GetWeapon() const { return Weapon; }

	/** Setzt eine neue Waffe ein und gibt die alte zurueck (die dann fallen gelassen wird). */
	UFUNCTION(BlueprintCallable, Category = "Leon")
	AKKWeapon* EquipWeapon(TSubclassOf<AKKWeapon> WeaponClass);

	/**
	 * Zentraler Ausgang fuer Spielerschaden. Baut das Ereignis, laesst alle Item- und
	 * Synergie-Hooks daran arbeiten und reicht es dann an das Ziel weiter.
	 */
	UFUNCTION(BlueprintCallable, Category = "Kampf")
	void DealDamage(AActor* Target, float BaseAmount, EKKElement Element, FName SourceTag,
		const FVector& HitLocation, const FVector& HitNormal, int32 ChainDepth = 0);

	/** Eingehender Schaden. Geht durch die Item-Hooks und dann in das Herzsystem. */
	UFUNCTION(BlueprintCallable, Category = "Kampf")
	int32 ReceiveDamage(FKKDamageEvent Event);

	/** Erzeugt einen Hoerreiz in der Welt (Schritte, Wurf, Tuer, Schuss). */
	UFUNCTION(BlueprintCallable, Category = "Stealth")
	void EmitNoise(float Strength, float Radius, const FVector& Location);

	/** Sichtbarkeit fuer die KI: 0 = unsichtbar (dunkel, geduckt, still), 1 = voll sichtbar. */
	UFUNCTION(BlueprintPure, Category = "Stealth")
	float GetVisibility() const;

	FRandomStream& GetCombatStream() { return CombatStream; }

protected:
	// --- Eingabe ---
	void Input_Move(const FInputActionValue& Value);
	void Input_Look(const FInputActionValue& Value);
	void Input_SprintStart();
	void Input_SprintStop();
	void Input_CrouchToggle();
	void Input_Attack();
	void Input_HeavyAttack();
	void Input_Block(const FInputActionValue& Value);
	void Input_Dodge();
	void Input_Interact();
	void Input_UseActive();
	void Input_PlaceBomb();
	void Input_Throw();

	void UpdateStance(float DeltaTime);
	void UpdateFootstepNoise(float DeltaTime);

	UFUNCTION()
	void HandleDeath();

	UFUNCTION()
	void HandleHeartLost(EKKHeartType Heart);

	// --- Aufbau ---
	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UCameraComponent> Camera;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKStatsComponent> Stats;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKHealthComponent> Health;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKInventoryComponent> Inventory;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKAppearanceComponent> Appearance;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKFearComponent> Fear;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKInteractionComponent> Interaction;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKStealthComponent> Stealth;

	UPROPERTY(VisibleAnywhere, Category = "Leon")
	TObjectPtr<UKKStatusEffectComponent> Status;

	UPROPERTY(EditDefaultsOnly, Category = "Leon")
	FName CameraSocket = TEXT("head");

	/** Sprintfaktor auf das Bewegungstempo. */
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float SprintMultiplier = 1.55f;
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float CrouchMultiplier = 0.45f;
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float CrawlMultiplier = 0.22f;
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float DodgeImpulse = 900.f;
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float DodgeCooldown = 1.2f;
	UPROPERTY(EditDefaultsOnly, Category = "Bewegung") float DodgeIFrames = 0.35f;

	// --- Eingabe-Assets ---
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputMappingContext> DefaultMapping;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Move;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Look;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Sprint;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Crouch;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Jump;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Attack;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_HeavyAttack;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Block;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Dodge;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Interact;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_UseActive;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Bomb;
	UPROPERTY(EditDefaultsOnly, Category = "Eingabe") TObjectPtr<UInputAction> IA_Throw;

private:
	UPROPERTY() TObjectPtr<AKKWeapon> Weapon;

	EKKStance Stance = EKKStance::Stehend;
	bool bSprinting = false;
	bool bBlocking = false;
	double NextDodgeAt = 0.0;
	float FootstepTimer = 0.f;

	/** Eigener Zufallsstrom fuer Crit/Dodge, damit Kampfwuerfe die Layoutgenerierung nicht beeinflussen. */
	FRandomStream CombatStream;

	void ApplyMovementSpeed();
};
