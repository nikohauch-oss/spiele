#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKHorrorEvent.generated.h"

class UKKHorrorDirector;
class AKKCharacter;

/** Momentaufnahme, auf deren Grundlage der Director entscheidet. */
USTRUCT(BlueprintType)
struct FKKHorrorContext
{
	GENERATED_BODY()

	UPROPERTY() TWeakObjectPtr<AKKCharacter> Player;
	UPROPERTY(BlueprintReadOnly) FVector PlayerLocation = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly) FVector ViewDirection = FVector::ForwardVector;
	UPROPERTY(BlueprintReadOnly) float HealthFraction = 1.f;
	UPROPERTY(BlueprintReadOnly) float LightLevel = 0.5f;
	UPROPERTY(BlueprintReadOnly) float Fear = 0.f;
	UPROPERTY(BlueprintReadOnly) EKKRoomType RoomType = EKKRoomType::Kampf;
	UPROPERTY(BlueprintReadOnly) EKKFloor Floor = EKKFloor::AlterKeller;

	/** Sekunden, die der Spieler schon in diesem Raum steht. */
	UPROPERTY(BlueprintReadOnly) float TimeInRoom = 0.f;

	/** Kreaturen in Sichtweite - waehrend eines Kampfes soll der Director schweigen. */
	UPROPERTY(BlueprintReadOnly) int32 NearbyEnemies = 0;

	UPROPERTY(BlueprintReadOnly) int32 EventsSoFar = 0;
};

/**
 * Ein Horrorereignis.
 *
 * Ereignisse sind eigene Objekte, damit der Director sie bewerten kann, ohne sie zu kennen:
 * Er fragt jedes nach seiner Eignung fuer die aktuelle Lage und waehlt daraus.
 */
UCLASS(Blueprintable, EditInlineNew, DefaultToInstanced, Abstract)
class KELLERKIND_API UKKHorrorEvent : public UObject
{
	GENERATED_BODY()

public:
	virtual UWorld* GetWorld() const override;

	void Initialize(UKKHorrorDirector* InDirector) { Director = InDirector; }

	/**
	 * Wie gut passt das Ereignis gerade? 0 = unmoeglich, hoeher = passender.
	 * Die Basisimplementierung prueft Wiederholung, Abklingzeit und Mindestspannung.
	 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Horror")
	float ScoreFor(const FKKHorrorContext& Context) const;
	virtual float ScoreFor_Implementation(const FKKHorrorContext& Context) const;

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Horror")
	void Execute(const FKKHorrorContext& Context);
	virtual void Execute_Implementation(const FKKHorrorContext& Context) {}

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") FName EventId;

	/** Ereignisse, die den Spieler erschrecken sollen, zaehlen gegen das Jumpscare-Budget. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") bool bIsJumpscare = false;

	/** Spannung, die das Ereignis mindestens braucht (0..1). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") float MinTension = 0.f;

	/** Spannung, oberhalb derer es nicht mehr passt - Kleinigkeiten wirken im Hochpunkt albern. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") float MaxTension = 1.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") float Cooldown = 90.f;

	/** Wie oft dasselbe Ereignis in einem Run hoechstens vorkommen darf. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") int32 MaxPerRun = 3;

	/** Nur in diesen Raumarten (leer = ueberall). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") TArray<EKKRoomType> AllowedRooms;

	/** Braucht das Ereignis Dunkelheit? */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") bool bRequiresDarkness = false;

	/** Soll ausserhalb des Blickfelds stattfinden (Schritte hinter Leon, Tuer im Ruecken). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Horror") bool bBehindPlayer = false;

	double ReadyAt = 0.0;
	int32 TimesUsed = 0;

protected:
	UPROPERTY() TWeakObjectPtr<UKKHorrorDirector> Director;

	/** Sucht einen Punkt hinter dem Spieler, der ausserhalb seines Blickfelds liegt. */
	bool FindPointBehind(const FKKHorrorContext& Context, float Distance, FVector& OutPoint) const;
};
