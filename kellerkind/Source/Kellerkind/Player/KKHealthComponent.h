#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/KKTypes.h"
#include "KKHealthComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FKKOnHealthChanged);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnHeartLost, EKKHeartType, Heart);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnDamaged, float, HalfHearts);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FKKOnDeath);

/**
 * Das Herzsystem.
 *
 * Alle Werte sind Halbherzen (2 = ein volles Herz), weil das Spiel in Halbherzen
 * austeilt und Rundungsfragen damit gar nicht erst entstehen.
 *
 * Schadensreihenfolge - WEISS, BLAU, SCHWARZ, ROT:
 *  - Weiss zuerst, weil weisse Herzen eine Wette sind: Wer eine Etage sauber spielt,
 *    behaelt sie und bekommt am Etagenende einen permanenten Container fuer den Run.
 *    Wer getroffen wird, verliert zuerst genau diese Belohnung.
 *  - Blau als normaler Puffer.
 *  - Schwarz als letzte Schicht vor dem Fleisch, damit die Schockwelle in dem Moment
 *    zuendet, in dem es fuer den Spieler wirklich eng wird.
 *  - Rot zuletzt.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKHealthComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKHealthComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Setzt Container und fuellt rote Herzen auf. */
	UFUNCTION(BlueprintCallable, Category = "Herzen")
	void InitializeHearts(int32 Containers);

	/**
	 * Schaden in Herzen (1.0 = ein volles Herz). Gibt zurueck, wie viele Halbherzen
	 * tatsaechlich verloren gingen (0 bei Ausweichen oder Unverwundbarkeit).
	 */
	UFUNCTION(BlueprintCallable, Category = "Herzen")
	int32 ApplyDamage(const FKKDamageEvent& Event);

	UFUNCTION(BlueprintCallable, Category = "Herzen")
	int32 AddHearts(EKKHeartType Type, int32 HalfHearts);

	UFUNCTION(BlueprintCallable, Category = "Herzen")
	void AddContainer(int32 Count, bool bFill = true);

	/** Am Etagenende: jedes ueberlebte weisse Herz wird zu einem Container fuer diesen Run. */
	UFUNCTION(BlueprintCallable, Category = "Herzen")
	int32 ResolveWhiteHeartsAtFloorEnd();

	UFUNCTION(BlueprintPure, Category = "Herzen") int32 GetHalfHearts(EKKHeartType Type) const;
	UFUNCTION(BlueprintPure, Category = "Herzen") int32 GetContainers() const { return Containers; }
	UFUNCTION(BlueprintPure, Category = "Herzen") int32 GetTotalHalfHearts() const;
	UFUNCTION(BlueprintPure, Category = "Herzen") bool IsAlive() const { return bAlive; }
	UFUNCTION(BlueprintPure, Category = "Herzen") bool IsInvulnerable() const { return InvulnerableUntil > GetTimeSeconds(); }

	UFUNCTION(BlueprintCallable, Category = "Herzen")
	void GrantInvulnerability(float Seconds);

	/** Wieviel Prozent Leben noch da sind - der Horror-Director liest das mit. */
	UFUNCTION(BlueprintPure, Category = "Herzen")
	float GetHealthFraction() const;

	UPROPERTY(BlueprintAssignable, Category = "Herzen") FKKOnHealthChanged OnHealthChanged;
	UPROPERTY(BlueprintAssignable, Category = "Herzen") FKKOnHeartLost OnHeartLost;
	UPROPERTY(BlueprintAssignable, Category = "Herzen") FKKOnDamaged OnDamaged;
	UPROPERTY(BlueprintAssignable, Category = "Herzen") FKKOnDeath OnDeath;

	/** Obergrenze fuer Schutzherzen, damit die HUD-Leiste nicht unendlich waechst. */
	UPROPERTY(EditDefaultsOnly, Category = "Herzen")
	int32 MaxSoulHalfHearts = 24;

protected:
	/** Schwarzes Herz vollstaendig zerstoert: Horror-Schockwelle gegen alle Gegner in Reichweite. */
	void FireBlackHeartShockwave();

private:
	UPROPERTY() int32 Containers = 3;
	UPROPERTY() int32 RedHalf = 6;
	UPROPERTY() int32 BlueHalf = 0;
	UPROPERTY() int32 BlackHalf = 0;
	UPROPERTY() int32 WhiteHalf = 0;

	bool bAlive = true;
	double InvulnerableUntil = 0.0;

	double GetTimeSeconds() const;
	int32& PoolRef(EKKHeartType Type);

	/** Zieht aus einem Pool ab und meldet, wie viele Halbherzen noch offen sind. */
	int32 DrainPool(EKKHeartType Type, int32 Remaining);
};
