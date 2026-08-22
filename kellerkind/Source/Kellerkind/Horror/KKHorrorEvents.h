#pragma once

#include "CoreMinimal.h"
#include "Horror/KKHorrorEvent.h"
#include "KKHorrorEvents.generated.h"

class USoundBase;
class UNiagaraSystem;

/**
 * Die Ereignisbibliothek des Horror-Directors.
 *
 * Fast alle Ereignisse arbeiten mit Klang, Licht und Bewegung am Rand der Wahrnehmung.
 * Nur zwei davon sind als Jumpscare markiert - und die duerfen nur zuenden, wenn das
 * Budget im Director es zulaesst.
 */

/** Das Licht faellt aus. Nach einigen Sekunden kommt es zurueck - nicht immer vollstaendig. */
UCLASS()
class KELLERKIND_API UKKHorror_LichtFaelltAus : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_LichtFaelltAus();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") float BlackoutDuration = 4.5f;

	/** Anteil der Lampen, die danach kaputt bleiben. */
	UPROPERTY(EditDefaultsOnly, Category = "Horror") float PermanentLossChance = 0.25f;

private:
	void RestoreLights(TArray<TWeakObjectPtr<class ULightComponent>> Lights, TArray<float> Intensities);
};

/** Eine Tuer im Ruecken des Spielers faellt zu. Der Knall zieht Kreaturen an. */
UCLASS()
class KELLERKIND_API UKKHorror_TuerSchlaegtZu : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_TuerSchlaegtZu();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;
};

/** Schritte hinter Leon. Es ist niemand da - der Hoerreiz ist trotzdem echt. */
UCLASS()
class KELLERKIND_API UKKHorror_SchritteHinterLeon : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_SchritteHinterLeon();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") TSoftObjectPtr<USoundBase> FootstepSound;
	UPROPERTY(EditDefaultsOnly, Category = "Horror") int32 StepCount = 4;
};

/** Ein Schatten an der Wand bewegt sich, obwohl nichts ihn wirft. */
UCLASS()
class KELLERKIND_API UKKHorror_SchattenBewegtSich : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_SchattenBewegtSich();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") TSoftObjectPtr<UNiagaraSystem> ShadowEffect;
};

/** Irgendwo klingelt ein Telefon. Wer abnimmt, hoert etwas. */
UCLASS()
class KELLERKIND_API UKKHorror_TelefonKlingelt : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_TelefonKlingelt();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;
};

/** Das Spiegelbild reagiert falsch - eine Sekunde zu spaet, oder gar nicht. */
UCLASS()
class KELLERKIND_API UKKHorror_SpiegelbildFalsch : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_SpiegelbildFalsch();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") float MirrorDelay = 0.8f;
};

/** Das Kellerkind steht ploetzlich in Entfernung. */
UCLASS()
class KELLERKIND_API UKKHorror_KellerkindErscheint : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_KellerkindErscheint();
	virtual float ScoreFor_Implementation(const FKKHorrorContext& Context) const override;
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") float AppearDistance = 1400.f;
};

/** Ein Spielzeug im Raum bewegt sich - nur, wenn niemand direkt hinsieht. */
UCLASS()
class KELLERKIND_API UKKHorror_SpielzeugBewegtSich : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_SpielzeugBewegtSich();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	/** Tag, mit dem bewegliche Requisiten im Raumlevel markiert sind. */
	UPROPERTY(EditDefaultsOnly, Category = "Horror") FName PropTag = TEXT("KKSpielzeug");
};

/** Ein Radio schaltet sich ein. Zwischen dem Rauschen ist manchmal eine Stimme. */
UCLASS()
class KELLERKIND_API UKKHorror_RadioAktiviert : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_RadioAktiviert();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") TSoftObjectPtr<USoundBase> RadioSound;
};

/** Es klopft in der Wand. Dreimal. Wie am Anfang. */
UCLASS()
class KELLERKIND_API UKKHorror_WandKlopft : public UKKHorrorEvent
{
	GENERATED_BODY()

public:
	UKKHorror_WandKlopft();
	virtual void Execute_Implementation(const FKKHorrorContext& Context) override;

	UPROPERTY(EditDefaultsOnly, Category = "Horror") TSoftObjectPtr<USoundBase> KnockSound;
	UPROPERTY(EditDefaultsOnly, Category = "Horror") int32 KnockCount = 3;
};
