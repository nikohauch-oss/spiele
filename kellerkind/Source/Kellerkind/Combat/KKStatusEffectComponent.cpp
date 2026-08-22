#include "Combat/KKStatusEffectComponent.h"
#include "Combat/KKDamageLibrary.h"
#include "AI/KKCreatureBase.h"
#include "Player/KKCharacter.h"
#include "Kellerkind.h"

UKKStatusEffectComponent::UKKStatusEffectComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.1f;
}

bool UKKStatusEffectComponent::HasStatus(EKKStatus Status) const
{
	const FKKStatusInstance* Instance = Active.Find(Status);
	return Instance && Instance->Remaining > 0.f;
}

int32 UKKStatusEffectComponent::GetStacks(EKKStatus Status) const
{
	const FKKStatusInstance* Instance = Active.Find(Status);
	return Instance ? Instance->Stacks : 0;
}

void UKKStatusEffectComponent::ApplyStatus(EKKStatus Status, float Duration, int32 Stacks, AActor* Source)
{
	if (Status == EKKStatus::Keiner || Duration <= 0.f)
	{
		return;
	}

	FKKStatusInstance& Instance = Active.FindOrAdd(Status);
	Instance.Stacks = FMath::Clamp(Instance.Stacks + Stacks, 1, 10);
	Instance.Remaining = FMath::Max(Instance.Remaining, Duration);
	Instance.Source = Source;

	// --- Reaktionstabelle ---
	switch (Status)
	{
	case EKKStatus::Nass:
		// Wasser loescht Feuer. Umgekehrt verdampft Feuer kein Wasser sofort -
		// dadurch bleibt "erst nass machen, dann Strom" eine verlaessliche Taktik.
		RemoveStatus(EKKStatus::Brennend);
		break;

	case EKKStatus::Brennend:
		if (HasStatus(EKKStatus::Nass))
		{
			// Nasse Ziele fangen nicht an zu brennen; das Wasser verdampft stattdessen.
			RemoveStatus(EKKStatus::Nass);
			Active.Remove(EKKStatus::Brennend);
			return;
		}
		if (HasStatus(EKKStatus::Oelig))
		{
			// Oel brennt deutlich heisser und laenger.
			Instance.Stacks = FMath::Clamp(Instance.Stacks * 2, 1, 10);
			Instance.Remaining *= 1.8f;
			RemoveStatus(EKKStatus::Oelig);
		}
		RemoveStatus(EKKStatus::Unterkuehlt);
		break;

	case EKKStatus::Elektrisiert:
		if (HasStatus(EKKStatus::Nass))
		{
			// Der Kern der Elektro-Wasser-Synergie: nasse Ziele leiten den Schlag weiter.
			Instance.Stacks = FMath::Clamp(Instance.Stacks + 2, 1, 10);
			UKKDamageLibrary::ChainThroughWet(GetOwner(), Source, static_cast<float>(Instance.Stacks));
		}
		break;

	case EKKStatus::Unterkuehlt:
		RemoveStatus(EKKStatus::Brennend);
		break;

	default:
		break;
	}

	OnStatusChanged.Broadcast(Status, Instance.Stacks);
}

void UKKStatusEffectComponent::RemoveStatus(EKKStatus Status)
{
	if (Active.Remove(Status) > 0)
	{
		OnStatusChanged.Broadcast(Status, 0);
	}
}

void UKKStatusEffectComponent::ReactToElement(EKKElement Element, float Magnitude, AActor* Source)
{
	switch (Element)
	{
	case EKKElement::Feuer:   ApplyStatus(EKKStatus::Brennend, 4.f, 1, Source); break;
	case EKKElement::Elektro: ApplyStatus(EKKStatus::Elektrisiert, 2.f, 1, Source); break;
	case EKKElement::Gift:    ApplyStatus(EKKStatus::Vergiftet, 6.f, 1, Source); break;
	case EKKElement::Blut:    ApplyStatus(EKKStatus::Blutend, 5.f, 1, Source); break;
	case EKKElement::Frost:   ApplyStatus(EKKStatus::Unterkuehlt, 3.5f, 1, Source); break;
	case EKKElement::Psyche:  ApplyStatus(EKKStatus::Panisch, 4.f, 1, Source); break;
	case EKKElement::Schatten:ApplyStatus(EKKStatus::Markiert, 6.f, 1, Source); break;
	default: break;
	}
}

float UKKStatusEffectComponent::GetMoveSpeedMultiplier() const
{
	float Multiplier = 1.f;

	if (HasStatus(EKKStatus::Unterkuehlt))
	{
		Multiplier *= FMath::Max(0.35f, 1.f - 0.12f * GetStacks(EKKStatus::Unterkuehlt));
	}
	if (HasStatus(EKKStatus::Vergiftet))
	{
		Multiplier *= 0.9f;
	}
	if (HasStatus(EKKStatus::Panisch))
	{
		// Panik treibt Kreaturen an und macht sie damit gefaehrlicher, aber unberechenbarer.
		Multiplier *= 1.25f;
	}
	return Multiplier;
}

float UKKStatusEffectComponent::GetElementVulnerability(EKKElement Element) const
{
	float Vulnerability = 1.f;

	if (Element == EKKElement::Elektro && HasStatus(EKKStatus::Nass))
	{
		Vulnerability *= 1.75f;
	}
	if (Element == EKKElement::Physisch && HasStatus(EKKStatus::Unterkuehlt))
	{
		Vulnerability *= 1.4f;
	}
	if (Element == EKKElement::Feuer && HasStatus(EKKStatus::Oelig))
	{
		Vulnerability *= 1.6f;
	}
	if (Element == EKKElement::Schatten && HasStatus(EKKStatus::Markiert))
	{
		Vulnerability *= 1.3f;
	}
	return Vulnerability;
}

void UKKStatusEffectComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	TArray<EKKStatus> Expired;
	for (TPair<EKKStatus, FKKStatusInstance>& Pair : Active)
	{
		Pair.Value.Remaining -= DeltaTime;
		if (Pair.Value.Remaining <= 0.f)
		{
			Expired.Add(Pair.Key);
		}
	}

	TickDamageOverTime(DeltaTime);

	for (EKKStatus Status : Expired)
	{
		RemoveStatus(Status);
	}
}

void UKKStatusEffectComponent::TickDamageOverTime(float DeltaTime)
{
	ApplyDot(EKKStatus::Brennend, BurnDamagePerSecond, DeltaTime, EKKElement::Feuer);
	ApplyDot(EKKStatus::Vergiftet, PoisonDamagePerSecond, DeltaTime, EKKElement::Gift);
	ApplyDot(EKKStatus::Blutend, BleedDamagePerSecond, DeltaTime, EKKElement::Blut);
}

void UKKStatusEffectComponent::ApplyDot(EKKStatus Status, float DamagePerSecond, float DeltaTime, EKKElement Element)
{
	FKKStatusInstance* Instance = Active.Find(Status);
	if (!Instance || Instance->Remaining <= 0.f)
	{
		return;
	}

	FKKDamageEvent Event;
	Event.Amount = DamagePerSecond * Instance->Stacks * DeltaTime;
	Event.Element = Element;
	Event.SourceTag = TEXT("Zustand");
	Event.Instigator = Instance->Source.Get();
	Event.HitLocation = GetOwner() ? GetOwner()->GetActorLocation() : FVector::ZeroVector;

	if (AKKCreatureBase* Creature = Cast<AKKCreatureBase>(GetOwner()))
	{
		Creature->ReceiveDamage(Event);
	}
	else if (AKKCharacter* Character = Cast<AKKCharacter>(GetOwner()))
	{
		// Beim Spieler wird Dauerschaden in Halbherzen umgerechnet und deshalb gebuendelt:
		// erst wenn ein volles Halbherz zusammengekommen ist, trifft es ihn.
		Instance->TickAccumulator += Event.Amount;
		if (Instance->TickAccumulator >= 0.5f)
		{
			Event.Amount = 0.5f;
			Instance->TickAccumulator -= 0.5f;
			Character->ReceiveDamage(Event);
		}
	}
}
