#pragma once

#include "CoreMinimal.h"
#include "Items/KKItemEffect.h"
#include "KKItemEffects.generated.h"

/**
 * Beispielhafte Itemverhalten.
 *
 * Diese Klassen zeigen, wie die drei Bausteine zusammenspielen:
 * Item setzt einen Tag -> Effekt veraendert Schaden oder Welt -> Synergie liest die Tags.
 *
 * Die im Design genannte Beispielkette
 *   Nasse Sicherung (Wasser) + Hochspannung (Elektro) = Kurzschluss
 * ist hier vollstaendig umgesetzt.
 */

/** Angriffe hinterlassen Wasser und machen Ziele nass. */
UCLASS()
class KELLERKIND_API UKKEffect_NasseSicherung : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void PostDealDamage(const FKKDamageEvent& Event, AActor* Target) override;

	UPROPERTY(EditDefaultsOnly, Category = "Item") float PuddleRadius = 220.f;
	UPROPERTY(EditDefaultsOnly, Category = "Item") float PuddleDuration = 14.f;
	UPROPERTY(EditDefaultsOnly, Category = "Item") float WetDuration = 6.f;
};

/** Angriffe fuegen Elektroschaden hinzu. */
UCLASS()
class KELLERKIND_API UKKEffect_Hochspannung : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void PreDealDamage(FKKDamageEvent& Event, AActor* Target) override;

	/** Anteil des Schadens, der in Elektro umgewandelt wird - waechst mit jeder Kopie. */
	UPROPERTY(EditDefaultsOnly, Category = "Item") float ConversionPerStack = 0.35f;
};

/**
 * SYNERGIE: KURZSCHLUSS.
 * Wasser + Elektrizitaet. Der Schlag springt ueber nasse Ziele und Wasserflaechen weiter.
 */
UCLASS()
class KELLERKIND_API UKKSynergy_Kurzschluss : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void PostDealDamage(const FKKDamageEvent& Event, AActor* Target) override;

	UPROPERTY(EditDefaultsOnly, Category = "Synergie") float ChainPowerFactor = 0.6f;
};

/** Jeder Treffer wird ein zweites Mal ausgefuehrt, mit reduziertem Schaden. */
UCLASS()
class KELLERKIND_API UKKEffect_Doppelschlag : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void PostDealDamage(const FKKDamageEvent& Event, AActor* Target) override;

	UPROPERTY(EditDefaultsOnly, Category = "Item") float SecondHitFactor = 0.45f;

private:
	/** Schuetzt vor Endlosschleife: der Zweitschlag darf sich nicht selbst ausloesen. */
	bool bReentrant = false;
};

/** Kritische Treffer setzen das Ziel in Brand. */
UCLASS()
class KELLERKIND_API UKKEffect_Brandmal : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void PostDealDamage(const FKKDamageEvent& Event, AActor* Target) override;

	UPROPERTY(EditDefaultsOnly, Category = "Item") float BurnDuration = 5.f;
};

/** Verflucht: ein Herzcontainer weniger, dafuer deutlich mehr Schaden. */
UCLASS()
class KELLERKIND_API UKKEffect_Blutpakt : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void OnGranted() override;
	virtual void PreDealDamage(FKKDamageEvent& Event, AActor* Target) override;

	UPROPERTY(EditDefaultsOnly, Category = "Item") float DamageBonusPerMissingHeart = 0.12f;
};

/** Jeder geraeumte Raum gibt ein halbes schwarzes Herz. */
UCLASS()
class KELLERKIND_API UKKEffect_SchwarzesGebet : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual void OnRoomCleared() override;
};

/** Aktives Item: Notschalter - kappt kurz den Strom und blendet alle Kreaturen. */
UCLASS()
class KELLERKIND_API UKKActive_Notschalter : public UKKItemEffect
{
	GENERATED_BODY()

public:
	virtual bool OnActivate() override;

	UPROPERTY(EditDefaultsOnly, Category = "Item") float BlindDuration = 6.f;
	UPROPERTY(EditDefaultsOnly, Category = "Item") float Radius = 2500.f;
};
