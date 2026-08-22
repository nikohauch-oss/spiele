#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKFamiliar.generated.h"

class USkeletalMeshComponent;
class UPointLightComponent;

/** Was ein Begleiter tut. */
UENUM(BlueprintType)
enum class EKKFamiliarRole : uint8
{
	Schuetze		UMETA(DisplayName = "Schiesst auf nahe Gegner"),
	Nahkampf		UMETA(DisplayName = "Greift selbst an"),
	Licht			UMETA(DisplayName = "Erzeugt Licht"),
	Sammler			UMETA(DisplayName = "Sammelt Gegenstaende ein"),
	Spuerer			UMETA(DisplayName = "Markiert Geheimraeume"),
	Schild			UMETA(DisplayName = "Faengt Treffer ab"),
	MAX				UMETA(Hidden)
};

/**
 * Begleiter: Kaputte Puppe, Kellerfliege, Mechanisches Auge, Gluehbirne, Kleine Hand.
 *
 * Sie folgen Leon mit Verzoegerung und auf eigener Bahn - mehrere Begleiter sollen
 * nicht in einem Punkt uebereinander haengen.
 */
UCLASS()
class KELLERKIND_API AKKFamiliar : public AActor
{
	GENERATED_BODY()

public:
	AKKFamiliar();

	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "Begleiter")
	void AttachToOwner(AActor* InOwner, int32 SlotIndex);

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Begleiter") FName FamiliarId;
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Begleiter") EKKFamiliarRole Role = EKKFamiliarRole::Schuetze;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float FollowDistance = 150.f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float FollowHeight = 110.f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float FollowSpeed = 3.2f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float ActionRange = 900.f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float ActionCooldown = 1.4f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") float ActionDamage = 3.f;
	UPROPERTY(EditDefaultsOnly, Category = "Begleiter") EKKElement Element = EKKElement::Physisch;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkeletalMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> Light;

	void PerformRole(float DeltaTime);
	AActor* FindNearestEnemy() const;

private:
	TWeakObjectPtr<AActor> Carrier;
	int32 Slot = 0;
	double NextActionAt = 0.0;
	float BobPhase = 0.f;
};
