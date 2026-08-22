#include "Items/KKItemEffects.h"
#include "Items/KKItemData.h"
#include "Player/KKCharacter.h"
#include "Player/KKHealthComponent.h"
#include "Player/KKInventoryComponent.h"
#include "Combat/KKStatusEffectComponent.h"
#include "Combat/KKElementSurface.h"
#include "Combat/KKDamageLibrary.h"
#include "AI/KKCreatureBase.h"
#include "AI/KKPerceptionComponent.h"

#include "EngineUtils.h"

// --- Nasse Sicherung -------------------------------------------------------

void UKKEffect_NasseSicherung::PostDealDamage(const FKKDamageEvent& Event, AActor* Target)
{
	UWorld* World = GetWorld();
	if (!World || !Target)
	{
		return;
	}

	AKKElementSurface::Spawn(World, EKKStatus::Nass, Event.HitLocation,
		PuddleRadius, PuddleDuration, GetCharacter());

	if (UKKStatusEffectComponent* Status = Target->FindComponentByClass<UKKStatusEffectComponent>())
	{
		Status->ApplyStatus(EKKStatus::Nass, WetDuration, 1, GetCharacter());
	}
}

// --- Hochspannung ----------------------------------------------------------

void UKKEffect_Hochspannung::PreDealDamage(FKKDamageEvent& Event, AActor* Target)
{
	// Der Umwandlungsanteil steigt mit der Stapelzahl, bleibt aber unter 100 Prozent:
	// physischer Restschaden haelt die Waffe gegen elektroresistente Kreaturen brauchbar.
	const float Conversion = FMath::Min(0.85f, ConversionPerStack * Stacks);

	if (Event.Element == EKKElement::Physisch)
	{
		Event.Element = EKKElement::Elektro;
		Event.Amount *= 0.7f + Conversion * 0.6f;
	}
	else
	{
		Event.Amount *= 1.f + Conversion * 0.25f;
	}
}

// --- Synergie: Kurzschluss -------------------------------------------------

void UKKSynergy_Kurzschluss::PostDealDamage(const FKKDamageEvent& Event, AActor* Target)
{
	if (Event.Element != EKKElement::Elektro || !Target)
	{
		return;
	}

	// Nur der Erstschlag darf eine Kette starten. Kettenglieder setzen ChainDepth,
	// dadurch kann sich der Ueberschlag nicht selbst nachfuellen.
	if (Event.ChainDepth > 0)
	{
		return;
	}

	UKKDamageLibrary::ChainThroughWet(Target, GetCharacter(), Event.Amount * ChainPowerFactor, 0);
}

// --- Doppelschlag ----------------------------------------------------------

void UKKEffect_Doppelschlag::PostDealDamage(const FKKDamageEvent& Event, AActor* Target)
{
	if (bReentrant || !Target || Event.SourceTag == TEXT("Doppelschlag"))
	{
		return;
	}

	AKKCharacter* Character = GetCharacter();
	if (!Character)
	{
		return;
	}

	bReentrant = true;
	Character->DealDamage(Target, SecondHitFactor * Stacks, Event.Element, TEXT("Doppelschlag"),
		Event.HitLocation, Event.HitNormal, Event.ChainDepth);
	bReentrant = false;
}

// --- Brandmal --------------------------------------------------------------

void UKKEffect_Brandmal::PostDealDamage(const FKKDamageEvent& Event, AActor* Target)
{
	if (!Event.bCritical || !Target)
	{
		return;
	}

	if (UKKStatusEffectComponent* Status = Target->FindComponentByClass<UKKStatusEffectComponent>())
	{
		Status->ApplyStatus(EKKStatus::Brennend, BurnDuration, Stacks, GetCharacter());
	}
}

// --- Blutpakt --------------------------------------------------------------

void UKKEffect_Blutpakt::OnGranted()
{
	if (AKKCharacter* Character = GetCharacter())
	{
		if (UKKHealthComponent* Health = Character->GetHealth())
		{
			Health->AddContainer(-1, false);
		}
	}
}

void UKKEffect_Blutpakt::PreDealDamage(FKKDamageEvent& Event, AActor* Target)
{
	AKKCharacter* Character = GetCharacter();
	const UKKHealthComponent* Health = Character ? Character->GetHealth() : nullptr;
	if (!Health)
	{
		return;
	}

	// Je leerer die Herzleiste, desto haerter schlaegt Leon zu. Der Pakt belohnt Risiko -
	// und macht ihn dabei genau dann stark, wenn ein Fehler toedlich waere.
	const int32 Missing = FMath::Max(0, Health->GetContainers() * 2 - Health->GetHalfHearts(EKKHeartType::Rot));
	Event.Amount *= 1.f + Missing * DamageBonusPerMissingHeart;
}

// --- Schwarzes Gebet -------------------------------------------------------

void UKKEffect_SchwarzesGebet::OnRoomCleared()
{
	if (AKKCharacter* Character = GetCharacter())
	{
		if (UKKHealthComponent* Health = Character->GetHealth())
		{
			Health->AddHearts(EKKHeartType::Schwarz, 1);
		}
	}
}

// --- Aktiv: Notschalter ----------------------------------------------------

bool UKKActive_Notschalter::OnActivate()
{
	UWorld* World = GetWorld();
	AKKCharacter* Character = GetCharacter();
	if (!World || !Character)
	{
		return false;
	}

	const FVector Origin = Character->GetActorLocation();
	int32 Affected = 0;

	// Kein Schaden, keine Betaeubung: Der Notschalter nimmt den Kreaturen die Spur.
	// Ein Fluchtwerkzeug, kein Kampfwerkzeug - so bleibt Stealth eine echte Option.
	for (TActorIterator<AKKCreatureBase> It(World); It; ++It)
	{
		AKKCreatureBase* Creature = *It;
		if (!Creature || !Creature->IsAlive() || !Creature->GetPerception())
		{
			continue;
		}
		if (FVector::DistSquared(Creature->GetActorLocation(), Origin) > FMath::Square(Radius))
		{
			continue;
		}

		Creature->GetPerception()->ForgetTarget();
		++Affected;
	}

	return Affected > 0;
}
