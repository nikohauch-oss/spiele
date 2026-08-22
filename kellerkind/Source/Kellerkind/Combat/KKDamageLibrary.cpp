#include "Combat/KKDamageLibrary.h"
#include "Combat/KKStatusEffectComponent.h"
#include "Combat/KKElementSurface.h"
#include "Combat/KKBomb.h"
#include "AI/KKCreatureBase.h"
#include "Player/KKCharacter.h"
#include "Engine/OverlapResult.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Kellerkind.h"

bool UKKDamageLibrary::IsWet(AActor* Actor)
{
	if (!Actor)
	{
		return false;
	}
	const UKKStatusEffectComponent* Status = Actor->FindComponentByClass<UKKStatusEffectComponent>();
	return Status && Status->HasStatus(EKKStatus::Nass);
}

int32 UKKDamageLibrary::ApplyDamageTo(AActor* Target, const FKKDamageEvent& Event)
{
	if (AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Target))
	{
		return Creature->ReceiveDamage(Event);
	}
	if (AKKCharacter* Character = Cast<AKKCharacter>(Target))
	{
		return Character->ReceiveDamage(Event);
	}
	return 0;
}

void UKKDamageLibrary::ChainThroughWet(AActor* Origin, AActor* Source, float Power, int32 Depth)
{
	if (!Origin || Depth >= MaxChainDepth)
	{
		return;
	}

	UWorld* World = Origin->GetWorld();
	if (!World)
	{
		return;
	}

	// Die Reichweite eines Ueberschlags haengt daran, ob eine leitende Flaeche dazwischen liegt.
	// In einer Wasserpfuetze springt der Strom deutlich weiter als durch trockene Luft.
	float Reach = 350.f;
	for (TActorIterator<AKKElementSurface> It(World); It; ++It)
	{
		AKKElementSurface* Surface = *It;
		if (Surface && Surface->GetSurfaceType() == EKKStatus::Nass &&
			FVector::DistSquared(Surface->GetActorLocation(), Origin->GetActorLocation()) < FMath::Square(Surface->GetRadius()))
		{
			Reach = FMath::Max(Reach, Surface->GetRadius() * 1.6f);
			break;
		}
	}

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKChain), false, Origin);
	World->OverlapMultiByObjectType(
		Overlaps, Origin->GetActorLocation(), FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeSphere(Reach), Params);

	for (const FOverlapResult& Overlap : Overlaps)
	{
		AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Overlap.GetActor());
		if (!Creature || Creature == Origin || !Creature->IsAlive())
		{
			continue;
		}

		// Der Strom springt nur auf nasse Ziele weiter - trockene Kreaturen unterbrechen die Kette.
		if (!IsWet(Creature))
		{
			continue;
		}

		FKKDamageEvent Event;
		// Jede Station kostet Energie, sonst waere die Kette staerker als der Erstschlag.
		Event.Amount = Power * FMath::Pow(0.72f, static_cast<float>(Depth + 1));
		Event.Element = EKKElement::Elektro;
		Event.SourceTag = TEXT("Kettenblitz");
		Event.Instigator = Source;
		Event.HitLocation = Creature->GetActorLocation();
		Event.ChainDepth = Depth + 1;

		Creature->ReceiveDamage(Event);
		ChainThroughWet(Creature, Source, Power, Depth + 1);
	}
}

void UKKDamageLibrary::ApplyRadialDamage(UObject* WorldContext, const FVector& Center, float Radius,
	float Amount, EKKElement Element, AActor* Source, FName SourceTag)
{
	UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return;
	}

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKRadial), false, Source);
	World->OverlapMultiByObjectType(
		Overlaps, Center, FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeSphere(Radius), Params);

	for (const FOverlapResult& Overlap : Overlaps)
	{
		AActor* Actor = Overlap.GetActor();
		if (!Actor)
		{
			continue;
		}

		const float Distance = FVector::Dist(Actor->GetActorLocation(), Center);
		const float Falloff = FMath::Clamp(1.f - Distance / Radius, 0.f, 1.f);

		FKKDamageEvent Event;
		Event.Amount = Amount * Falloff;
		Event.Element = Element;
		Event.SourceTag = SourceTag;
		Event.Instigator = Source;
		Event.HitLocation = Actor->GetActorLocation();
		ApplyDamageTo(Actor, Event);
	}

	// Flaechen in der Explosion reagieren mit: Oel entzuendet sich, Eis schmilzt.
	for (TActorIterator<AKKElementSurface> It(World); It; ++It)
	{
		AKKElementSurface* Surface = *It;
		if (Surface && FVector::DistSquared(Surface->GetActorLocation(), Center) < FMath::Square(Radius + Surface->GetRadius()))
		{
			Surface->ReactToElement(Element, Source);
		}
	}
}

void UKKDamageLibrary::SpawnBomb(AActor* Placer, const FVector& Location)
{
	UWorld* World = Placer ? Placer->GetWorld() : nullptr;
	if (!World)
	{
		return;
	}

	FActorSpawnParameters Params;
	Params.Owner = Placer;
	Params.Instigator = Cast<APawn>(Placer);
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	World->SpawnActor<AKKBomb>(AKKBomb::StaticClass(), Location, FRotator::ZeroRotator, Params);
}
