#include "Horror/KKHorrorEvents.h"
#include "Horror/KKHorrorDirector.h"
#include "Horror/KKKellerkindStalker.h"
#include "Level/KKDoor.h"
#include "AI/KKSenseSubsystem.h"
#include "Player/KKCharacter.h"
#include "Player/KKFearComponent.h"
#include "Kellerkind.h"

#include "Components/LightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Light.h"
#include "EngineUtils.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "NiagaraFunctionLibrary.h"
#include "TimerManager.h"

// --- Licht faellt aus ------------------------------------------------------

UKKHorror_LichtFaelltAus::UKKHorror_LichtFaelltAus()
{
	EventId = TEXT("LichtFaelltAus");
	MinTension = 0.3f;
	Cooldown = 120.f;
	MaxPerRun = 4;
}

void UKKHorror_LichtFaelltAus::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	TArray<TWeakObjectPtr<ULightComponent>> Affected;
	TArray<float> Intensities;

	for (TActorIterator<ALight> It(World); It; ++It)
	{
		ALight* Light = *It;
		ULightComponent* Component = Light ? Light->GetLightComponent() : nullptr;
		if (!Component || !Component->IsVisible())
		{
			continue;
		}
		if (FVector::DistSquared(Light->GetActorLocation(), Context.PlayerLocation) > FMath::Square(4000.f))
		{
			continue;
		}

		Affected.Add(Component);
		Intensities.Add(Component->Intensity);
		Component->SetIntensity(0.f);
	}

	if (Affected.Num() == 0)
	{
		return;
	}

	if (Context.Player.IsValid() && Context.Player->GetFear())
	{
		Context.Player->GetFear()->AddFear(0.3f);
	}

	// Das Licht kommt zurueck - aber ein Teil der Lampen bleibt kaputt. Der Raum ist
	// nach dem Ereignis dauerhaft dunkler als vorher.
	FTimerHandle Handle;
	TWeakObjectPtr<UKKHorror_LichtFaelltAus> WeakThis(this);
	World->GetTimerManager().SetTimer(Handle, [WeakThis, Affected, Intensities]()
	{
		if (WeakThis.IsValid())
		{
			WeakThis->RestoreLights(Affected, Intensities);
		}
	}, BlackoutDuration, false);
}

void UKKHorror_LichtFaelltAus::RestoreLights(TArray<TWeakObjectPtr<ULightComponent>> Lights, TArray<float> Intensities)
{
	for (int32 i = 0; i < Lights.Num(); ++i)
	{
		if (!Lights[i].IsValid())
		{
			continue;
		}
		const bool bStaysBroken = FMath::FRand() < PermanentLossChance;
		Lights[i]->SetIntensity(bStaysBroken ? 0.f : Intensities[i]);
	}
}

// --- Tuer schlaegt zu ------------------------------------------------------

UKKHorror_TuerSchlaegtZu::UKKHorror_TuerSchlaegtZu()
{
	EventId = TEXT("TuerSchlaegtZu");
	bBehindPlayer = true;
	MinTension = 0.2f;
	Cooldown = 70.f;
	MaxPerRun = 5;
}

void UKKHorror_TuerSchlaegtZu::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	AKKDoor* Best = nullptr;
	float BestScore = -1.f;

	for (TActorIterator<AKKDoor> It(World); It; ++It)
	{
		AKKDoor* Door = *It;
		if (!Door || !Door->IsOpen() || Door->IsLocked())
		{
			continue;
		}

		const FVector ToDoor = Door->GetActorLocation() - Context.PlayerLocation;
		const float Distance = ToDoor.Size();
		if (Distance > 2200.f)
		{
			continue;
		}

		// Am besten eine Tuer im Ruecken: der Knall kommt von dort, wo Leon nicht hinsieht.
		const float Behind = -FVector::DotProduct(ToDoor.GetSafeNormal(), Context.ViewDirection);
		const float Score = Behind * 2.f + (1.f - Distance / 2200.f);
		if (Score > BestScore)
		{
			BestScore = Score;
			Best = Door;
		}
	}

	if (!Best)
	{
		return;
	}

	Best->Close(true);

	// Der Knall ist ein echter Reiz - er zieht alles an, was in Hoerweite ist.
	if (UKKSenseSubsystem* Senses = World->GetSubsystem<UKKSenseSubsystem>())
	{
		Senses->MakeNoise(Best->GetActorLocation(), 0.8f, 2400.f, Best);
	}
}

// --- Schritte hinter Leon --------------------------------------------------

UKKHorror_SchritteHinterLeon::UKKHorror_SchritteHinterLeon()
{
	EventId = TEXT("SchritteHinterLeon");
	bBehindPlayer = true;
	MinTension = 0.25f;
	Cooldown = 60.f;
	MaxPerRun = 6;
}

void UKKHorror_SchritteHinterLeon::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World || FootstepSound.IsNull())
	{
		return;
	}

	FVector Start;
	if (!FindPointBehind(Context, 700.f, Start))
	{
		return;
	}

	// Die Schritte kommen naeher und hoeren dann auf. Es folgt nichts. Genau das ist der Punkt.
	USoundBase* Sound = FootstepSound.LoadSynchronous();
	for (int32 i = 0; i < StepCount; ++i)
	{
		const float Alpha = static_cast<float>(i) / FMath::Max(1, StepCount - 1);
		const FVector Position = FMath::Lerp(Start, Context.PlayerLocation, Alpha * 0.7f);

		FTimerHandle Handle;
		FTimerDelegate Delegate;
		Delegate.BindLambda([World, Sound, Position]()
		{
			UGameplayStatics::PlaySoundAtLocation(World, Sound, Position);
		});
		World->GetTimerManager().SetTimer(Handle, Delegate, 0.55f * (i + 1), false);
	}

	if (Context.Player.IsValid() && Context.Player->GetFear())
	{
		Context.Player->GetFear()->AddFear(0.2f);
	}
}

// --- Schatten bewegt sich --------------------------------------------------

UKKHorror_SchattenBewegtSich::UKKHorror_SchattenBewegtSich()
{
	EventId = TEXT("SchattenBewegtSich");
	bRequiresDarkness = true;
	MinTension = 0.2f;
	Cooldown = 80.f;
	MaxPerRun = 5;
}

void UKKHorror_SchattenBewegtSich::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World || ShadowEffect.IsNull())
	{
		return;
	}

	// Der Schatten laeuft am Rand des Blickfelds ueber die Wand - sichtbar genug,
	// um bemerkt zu werden, zu kurz, um sicher zu sein.
	const FVector Side = FVector::CrossProduct(Context.ViewDirection, FVector::UpVector).GetSafeNormal();
	const FVector Origin = Context.PlayerLocation + Context.ViewDirection * 900.f + Side * 600.f;

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKShadow), false);
	if (World->LineTraceSingleByChannel(Hit, Origin, Origin + Side * 1200.f, ECC_Visibility, Params))
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(World, ShadowEffect.LoadSynchronous(),
			Hit.ImpactPoint, Hit.ImpactNormal.Rotation());
	}
}

// --- Telefon klingelt ------------------------------------------------------

UKKHorror_TelefonKlingelt::UKKHorror_TelefonKlingelt()
{
	EventId = TEXT("TelefonKlingelt");
	MinTension = 0.35f;
	Cooldown = 200.f;
	MaxPerRun = 2;
}

void UKKHorror_TelefonKlingelt::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Das Telefon steht immer in einem Nebenraum. Man muss hingehen, um abzunehmen -
	// und weiss vorher nicht, was einen dort erwartet.
	FVector Position;
	if (!FindPointBehind(Context, 1500.f, Position))
	{
		Position = Context.PlayerLocation + Context.ViewDirection * 1500.f;
	}

	if (UKKSenseSubsystem* Senses = World->GetSubsystem<UKKSenseSubsystem>())
	{
		Senses->MakeNoise(Position, 0.5f, 3000.f, nullptr);
	}
}

// --- Spiegelbild reagiert falsch ------------------------------------------

UKKHorror_SpiegelbildFalsch::UKKHorror_SpiegelbildFalsch()
{
	EventId = TEXT("SpiegelbildFalsch");
	MinTension = 0.4f;
	Cooldown = 240.f;
	MaxPerRun = 2;
}

void UKKHorror_SpiegelbildFalsch::Execute_Implementation(const FKKHorrorContext& Context)
{
	// Der Spiegel ist ein eigener Akteur im Raumlevel. Er bekommt hier nur die Anweisung,
	// Leons Bewegung verzoegert oder gar nicht zu uebernehmen; die Umsetzung liegt im
	// Spiegel-Blueprint, weil sie an die Aufnahme des Spiegelbilds gebunden ist.
	if (Director.IsValid())
	{
		Director->OnHorrorEvent.Broadcast(EventId);
	}

	UE_LOG(LogKKHorror, Verbose, TEXT("Spiegelbild verzoegert um %.2f s"), MirrorDelay);
}

// --- Kellerkind erscheint --------------------------------------------------

UKKHorror_KellerkindErscheint::UKKHorror_KellerkindErscheint()
{
	EventId = TEXT("KellerkindErscheint");
	MinTension = 0.45f;
	Cooldown = 150.f;
	MaxPerRun = 4;
}

float UKKHorror_KellerkindErscheint::ScoreFor_Implementation(const FKKHorrorContext& Context) const
{
	const float Base = Super::ScoreFor_Implementation(Context);
	if (Base <= 0.f)
	{
		return 0.f;
	}

	// Ohne Stalker in der Welt kann das Ereignis nicht stattfinden.
	if (!Director.IsValid() || !Director->GetStalker())
	{
		return 0.f;
	}
	return Base;
}

void UKKHorror_KellerkindErscheint::Execute_Implementation(const FKKHorrorContext& Context)
{
	AKKKellerkindStalker* Stalker = Director.IsValid() ? Director->GetStalker() : nullptr;
	if (!Stalker)
	{
		return;
	}

	// Es erscheint am Rand des Sichtbaren, nie direkt vor Leon.
	const FVector Position = Context.PlayerLocation + Context.ViewDirection * AppearDistance;
	const bool bInDanger = Context.NearbyEnemies > 0 || Context.HealthFraction < 0.4f;

	Stalker->Appear(Stalker->ChooseAction(Context.HealthFraction, bInDanger), Position);
}

// --- Spielzeug bewegt sich -------------------------------------------------

UKKHorror_SpielzeugBewegtSich::UKKHorror_SpielzeugBewegtSich()
{
	EventId = TEXT("SpielzeugBewegtSich");
	MinTension = 0.2f;
	Cooldown = 90.f;
	MaxPerRun = 5;
	AllowedRooms = { EKKRoomType::Kampf, EKKRoomType::Story, EKKRoomType::SafeRoom, EKKRoomType::Raetsel };
}

void UKKHorror_SpielzeugBewegtSich::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Prop = *It;
		if (!Prop || !Prop->ActorHasTag(PropTag))
		{
			continue;
		}
		if (FVector::DistSquared(Prop->GetActorLocation(), Context.PlayerLocation) > FMath::Square(1500.f))
		{
			continue;
		}

		// Nur ausserhalb des Blickfelds - der Spieler soll die Veraenderung erst danach bemerken.
		const FVector ToProp = (Prop->GetActorLocation() - Context.PlayerLocation).GetSafeNormal();
		if (FVector::DotProduct(ToProp, Context.ViewDirection) > 0.3f)
		{
			continue;
		}

		Prop->AddActorWorldRotation(FRotator(0.f, FMath::FRandRange(60.f, 180.f), 0.f));
		Prop->AddActorWorldOffset(FVector(FMath::FRandRange(-40.f, 40.f), FMath::FRandRange(-40.f, 40.f), 0.f), true);
		return;
	}
}

// --- Radio aktiviert sich --------------------------------------------------

UKKHorror_RadioAktiviert::UKKHorror_RadioAktiviert()
{
	EventId = TEXT("RadioAktiviert");
	MinTension = 0.25f;
	Cooldown = 160.f;
	MaxPerRun = 3;
}

void UKKHorror_RadioAktiviert::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World || RadioSound.IsNull())
	{
		return;
	}

	FVector Position;
	if (!FindPointBehind(Context, 1100.f, Position))
	{
		Position = Context.PlayerLocation;
	}

	UGameplayStatics::PlaySoundAtLocation(World, RadioSound.LoadSynchronous(), Position);

	if (UKKSenseSubsystem* Senses = World->GetSubsystem<UKKSenseSubsystem>())
	{
		Senses->MakeNoise(Position, 0.35f, 1800.f, nullptr);
	}
}

// --- Wand klopft -----------------------------------------------------------

UKKHorror_WandKlopft::UKKHorror_WandKlopft()
{
	EventId = TEXT("WandKlopft");
	MinTension = 0.3f;
	Cooldown = 110.f;
	MaxPerRun = 4;
}

void UKKHorror_WandKlopft::Execute_Implementation(const FKKHorrorContext& Context)
{
	UWorld* World = GetWorld();
	if (!World || KnockSound.IsNull())
	{
		return;
	}

	// Es klopft dreimal - dasselbe Klopfen wie am Anfang, vor der Kellertuer.
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKKnock), false);
	const FVector End = Context.PlayerLocation + Context.ViewDirection * 1200.f;

	const FVector Position = World->LineTraceSingleByChannel(Hit, Context.PlayerLocation, End, ECC_Visibility, Params)
		? Hit.ImpactPoint
		: End;

	USoundBase* Sound = KnockSound.LoadSynchronous();
	for (int32 i = 0; i < KnockCount; ++i)
	{
		FTimerHandle Handle;
		FTimerDelegate Delegate;
		Delegate.BindLambda([World, Sound, Position]()
		{
			UGameplayStatics::PlaySoundAtLocation(World, Sound, Position);
		});
		World->GetTimerManager().SetTimer(Handle, Delegate, 0.7f * (i + 1), false);
	}
}
