#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/KKTypes.h"
#include "Horror/KKHorrorEvent.h"
#include "KKHorrorDirector.generated.h"

class AKKCharacter;
class AKKKellerkindStalker;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnHorrorEvent, FName, EventId);

/**
 * DER HORROR-DIRECTOR.
 *
 * Beobachtet Blickrichtung, Position, Leben, Ausruestung, Raum, Aufenthaltsdauer und
 * die bisherigen Ereignisse - und entscheidet daraus, wann etwas passiert.
 *
 * Zwei Regeln bestimmen sein Verhalten:
 *
 * 1. Spannungskurve statt Zufall. Die Spannung steigt, waehrend nichts geschieht, und
 *    faellt nach jedem Ereignis. Dadurch entsteht Rhythmus: lange Ruhe, dann etwas,
 *    dann wieder Ruhe. Ein reiner Zufallsgenerator wuerde Haeufungen und Leerlauf erzeugen.
 *
 * 2. Jumpscare-Budget. Hoechstens der in den Einstellungen festgelegte Anteil aller
 *    Ereignisse darf ein Schreckmoment sein. Alles andere arbeitet mit Licht, Klang,
 *    Bewegung und Ungewissheit. Das ist die wichtigste Designregel von KELLERKIND,
 *    und sie steht deshalb hier als harte Grenze im Code.
 */
UCLASS()
class KELLERKIND_API UKKHorrorDirector : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;
	virtual bool IsTickable() const override { return bActive; }

	/** Registriert die verfuegbaren Ereignisklassen. Wird vom GameMode beim Etagenstart gerufen. */
	UFUNCTION(BlueprintCallable, Category = "Horror")
	void ConfigureEvents(const TArray<TSubclassOf<UKKHorrorEvent>>& EventClasses);

	UFUNCTION(BlueprintCallable, Category = "Horror")
	void SetActive(bool bInActive) { bActive = bInActive; }

	/** Intensitaet der aktuellen Etage; skaliert, wie schnell Spannung aufgebaut wird. */
	UFUNCTION(BlueprintCallable, Category = "Horror")
	void SetFloorIntensity(float Intensity) { FloorIntensity = FMath::Max(0.f, Intensity); }

	UFUNCTION(BlueprintPure, Category = "Horror") float GetTension() const { return Tension; }
	UFUNCTION(BlueprintPure, Category = "Horror") int32 GetEventCount() const { return EventCount; }
	UFUNCTION(BlueprintPure, Category = "Horror") int32 GetJumpscareCount() const { return JumpscareCount; }

	/** Meldet dem Director, dass der Spieler einen neuen Raum betreten hat. */
	UFUNCTION(BlueprintCallable, Category = "Horror")
	void NotifyRoomEntered(EKKRoomType RoomType);

	/** Erzwingt ein bestimmtes Ereignis (Story-Momente, Bossintros, Fluch des Kindes). */
	UFUNCTION(BlueprintCallable, Category = "Horror")
	bool TriggerEvent(FName EventId);

	UFUNCTION(BlueprintCallable, Category = "Horror")
	void PlayDeathSequence(AKKCharacter* Character);

	UFUNCTION(BlueprintCallable, Category = "Horror")
	AKKKellerkindStalker* GetStalker() const { return Stalker.Get(); }

	UFUNCTION(BlueprintCallable, Category = "Horror")
	void SetStalker(AKKKellerkindStalker* InStalker) { Stalker = InStalker; }

	UPROPERTY(BlueprintAssignable, Category = "Horror")
	FKKOnHorrorEvent OnHorrorEvent;

	/** Saetze, die eine Kinderstimme nach Leons Tod sagen kann. */
	UPROPERTY(EditAnywhere, Category = "Horror")
	TArray<FText> DeathLines;

private:
	UPROPERTY() TArray<TObjectPtr<UKKHorrorEvent>> Events;
	TWeakObjectPtr<AKKKellerkindStalker> Stalker;

	bool bActive = true;
	float Tension = 0.f;
	float FloorIntensity = 1.f;
	float TimeInRoom = 0.f;
	double NextEventEarliest = 0.0;

	int32 EventCount = 0;
	int32 JumpscareCount = 0;

	EKKRoomType CurrentRoomType = EKKRoomType::Start;
	FRandomStream Stream;

	FKKHorrorContext BuildContext() const;
	void UpdateTension(const FKKHorrorContext& Context, float DeltaTime);
	bool TrySelectAndRun(const FKKHorrorContext& Context);
	bool IsJumpscareAllowed() const;
};
