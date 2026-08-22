#include "Horror/KKHorrorEvent.h"
#include "Horror/KKHorrorDirector.h"
#include "Engine/World.h"

UWorld* UKKHorrorEvent::GetWorld() const
{
	return Director.IsValid() ? Director->GetWorld() : nullptr;
}

float UKKHorrorEvent::ScoreFor_Implementation(const FKKHorrorContext& Context) const
{
	const UWorld* World = GetWorld();
	if (!World || World->GetTimeSeconds() < ReadyAt)
	{
		return 0.f;
	}

	if (TimesUsed >= MaxPerRun)
	{
		return 0.f;
	}

	// Waehrend eines Kampfes hat der Director nichts zu suchen: Horror und Gefecht
	// wuerden sich gegenseitig entwerten.
	if (Context.NearbyEnemies > 0)
	{
		return 0.f;
	}

	const float Tension = Director.IsValid() ? Director->GetTension() : 0.f;
	if (Tension < MinTension || Tension > MaxTension)
	{
		return 0.f;
	}

	if (bRequiresDarkness && Context.LightLevel > 0.35f)
	{
		return 0.f;
	}

	if (AllowedRooms.Num() > 0 && !AllowedRooms.Contains(Context.RoomType))
	{
		return 0.f;
	}

	// Grundeignung: mittig im erlaubten Spannungsfenster ist am besten,
	// und was in diesem Run seltener kam, wird bevorzugt.
	const float Middle = (MinTension + MaxTension) * 0.5f;
	const float Fit = 1.f - FMath::Abs(Tension - Middle) / FMath::Max(0.01f, (MaxTension - MinTension) * 0.5f);
	const float Freshness = 1.f - static_cast<float>(TimesUsed) / FMath::Max(1, MaxPerRun);

	return FMath::Max(0.05f, Fit * 0.6f + Freshness * 0.4f);
}

bool UKKHorrorEvent::FindPointBehind(const FKKHorrorContext& Context, float Distance, FVector& OutPoint) const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return false;
	}

	const FVector Back = -Context.ViewDirection.GetSafeNormal2D();

	// Mehrere Winkel hinter dem Spieler probieren und den ersten nehmen, der frei liegt.
	for (int32 i = 0; i < 6; ++i)
	{
		const float Angle = -60.f + i * 24.f;
		const FVector Direction = FRotator(0.f, Angle, 0.f).RotateVector(Back);
		const FVector Candidate = Context.PlayerLocation + Direction * Distance;

		FHitResult Hit;
		FCollisionQueryParams Params(SCENE_QUERY_STAT(KKHorrorPoint), false);
		if (!World->LineTraceSingleByChannel(Hit, Context.PlayerLocation, Candidate, ECC_Visibility, Params))
		{
			OutPoint = Candidate;
			return true;
		}
	}
	return false;
}
