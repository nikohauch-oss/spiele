#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/KKTypes.h"
#include "KKKellerkindStalker.generated.h"

class USkeletalMeshComponent;
class UKKItemData;

/** Was das Kellerkind bei einem Auftritt tut. */
UENUM(BlueprintType)
enum class EKKStalkerAction : uint8
{
	Beobachten		UMETA(DisplayName = "Beobachten - steht in Entfernung und sieht zu"),
	Folgen			UMETA(DisplayName = "Folgen - haelt Abstand und bleibt in Sichtweite"),
	TuerOeffnen		UMETA(DisplayName = "Tuer oeffnen - macht einen Weg frei"),
	GegnerLenken	UMETA(DisplayName = "Gegner lenken - hetzt oder beruhigt Kreaturen"),
	ItemHinterlassen UMETA(DisplayName = "Item hinterlassen - legt etwas ab und verschwindet"),
	RaumVeraendern	UMETA(DisplayName = "Raum veraendern - der Raum ist danach anders"),
	Retten			UMETA(DisplayName = "Retten - greift ein, wenn Leon fast tot ist"),
	InFalleFuehren	UMETA(DisplayName = "In Falle fuehren - lockt in einen gefaehrlichen Raum"),
	MAX				UMETA(Hidden)
};

/**
 * DAS KELLERKIND als Stalker.
 *
 * Kernregel des Designs: Der Spieler soll nie sicher wissen, ob es Freund oder Feind ist.
 * Deshalb waehlt der Stalker seine Handlung nicht rein zufaellig, sondern haelt ein
 * inneres Verhaeltnis von hilfreichen zu schaedlichen Auftritten - und weicht davon
 * gezielt ab, sobald der Spieler sich sicher zu sein scheint.
 */
UCLASS()
class KELLERKIND_API AKKKellerkindStalker : public AActor
{
	GENERATED_BODY()

public:
	AKKKellerkindStalker();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Laesst das Kellerkind an einer passenden Stelle erscheinen. */
	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	bool Appear(EKKStalkerAction Action, const FVector& Location);

	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	void Vanish();

	UFUNCTION(BlueprintPure, Category = "Kellerkind") bool IsVisible() const { return bVisible; }
	UFUNCTION(BlueprintPure, Category = "Kellerkind") EKKStalkerAction GetCurrentAction() const { return CurrentAction; }

	/** Verhaeltnis hilfreicher Auftritte, 0..1. Startet bei 0.5 und schwankt bewusst. */
	UFUNCTION(BlueprintPure, Category = "Kellerkind") float GetBenevolence() const { return Benevolence; }

	/** Waehlt die naechste Handlung anhand von Spielerzustand und bisherigen Auftritten. */
	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	EKKStalkerAction ChooseAction(float PlayerHealthFraction, bool bPlayerInDanger);

	/** Wie oft es in diesem Run schon aufgetaucht ist. */
	UPROPERTY(BlueprintReadOnly, Category = "Kellerkind") int32 Appearances = 0;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkeletalMeshComponent> Mesh;

	/** Verschwindet, sobald der Spieler naeher als dieser Abstand kommt. */
	UPROPERTY(EditDefaultsOnly, Category = "Kellerkind") float VanishDistance = 550.f;

	/** Sichtdauer, wenn der Spieler nicht naeher kommt. */
	UPROPERTY(EditDefaultsOnly, Category = "Kellerkind") float MaxVisibleTime = 6.f;

	/** Item, das es bei ItemHinterlassen ablegt. */
	UPROPERTY(EditDefaultsOnly, Category = "Kellerkind") TObjectPtr<UKKItemData> GiftItem;

private:
	bool bVisible = false;
	float VisibleTime = 0.f;
	EKKStalkerAction CurrentAction = EKKStalkerAction::Beobachten;

	float Benevolence = 0.5f;

	/** Wie oft hintereinander es zuletzt gleichartig gehandelt hat. */
	int32 SameKindStreak = 0;
	bool bLastWasHelpful = true;

	FRandomStream Stream;

	void ExecuteAction();
	static bool IsHelpful(EKKStalkerAction Action);
};
