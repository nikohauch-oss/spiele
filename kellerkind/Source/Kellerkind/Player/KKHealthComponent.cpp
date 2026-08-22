#include "Player/KKHealthComponent.h"
#include "Player/KKStatsComponent.h"
#include "Core/KKGameSettings.h"
#include "AI/KKCreatureBase.h"
#include "Kellerkind.h"
#include "Engine/World.h"
#include "Engine/OverlapResult.h"

UKKHealthComponent::UKKHealthComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.25f;
}

void UKKHealthComponent::BeginPlay()
{
	Super::BeginPlay();
	InitializeHearts(Containers);
}

void UKKHealthComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	// Der Tick existiert nur, damit die HUD-Blinkphase der Unverwundbarkeit sauber endet.
	if (!IsInvulnerable() && InvulnerableUntil > 0.0)
	{
		InvulnerableUntil = 0.0;
		OnHealthChanged.Broadcast();
	}
}

double UKKHealthComponent::GetTimeSeconds() const
{
	const UWorld* World = GetWorld();
	return World ? World->GetTimeSeconds() : 0.0;
}

int32& UKKHealthComponent::PoolRef(EKKHeartType Type)
{
	switch (Type)
	{
	case EKKHeartType::Rot:     return RedHalf;
	case EKKHeartType::Blau:    return BlueHalf;
	case EKKHeartType::Schwarz: return BlackHalf;
	default:                    return WhiteHalf;
	}
}

int32 UKKHealthComponent::GetHalfHearts(EKKHeartType Type) const
{
	return const_cast<UKKHealthComponent*>(this)->PoolRef(Type);
}

int32 UKKHealthComponent::GetTotalHalfHearts() const
{
	return RedHalf + BlueHalf + BlackHalf + WhiteHalf;
}

float UKKHealthComponent::GetHealthFraction() const
{
	const int32 MaxRed = FMath::Max(1, Containers * 2);
	return FMath::Clamp(static_cast<float>(RedHalf) / static_cast<float>(MaxRed), 0.f, 1.f);
}

void UKKHealthComponent::InitializeHearts(int32 InContainers)
{
	Containers = FMath::Clamp(InContainers, 1, UKKGameSettings::Get().MaxHeartContainers);
	RedHalf = Containers * 2;
	BlueHalf = 0;
	BlackHalf = 0;
	WhiteHalf = 0;
	bAlive = true;
	InvulnerableUntil = 0.0;
	OnHealthChanged.Broadcast();
}

void UKKHealthComponent::AddContainer(int32 Count, bool bFill)
{
	const int32 Before = Containers;
	Containers = FMath::Clamp(Containers + Count, 1, UKKGameSettings::Get().MaxHeartContainers);

	if (bFill && Containers > Before)
	{
		RedHalf += (Containers - Before) * 2;
	}
	RedHalf = FMath::Min(RedHalf, Containers * 2);
	OnHealthChanged.Broadcast();
}

int32 UKKHealthComponent::AddHearts(EKKHeartType Type, int32 HalfHearts)
{
	if (HalfHearts <= 0)
	{
		return 0;
	}

	int32& Pool = PoolRef(Type);
	const int32 Before = Pool;

	if (Type == EKKHeartType::Rot)
	{
		Pool = FMath::Min(Pool + HalfHearts, Containers * 2);
	}
	else
	{
		const int32 SoulTotal = BlueHalf + BlackHalf + WhiteHalf;
		const int32 Room = FMath::Max(0, MaxSoulHalfHearts - SoulTotal);
		Pool += FMath::Min(HalfHearts, Room);
	}

	if (Pool != Before)
	{
		OnHealthChanged.Broadcast();
	}
	return Pool - Before;
}

int32 UKKHealthComponent::DrainPool(EKKHeartType Type, int32 Remaining)
{
	if (Remaining <= 0)
	{
		return 0;
	}

	int32& Pool = PoolRef(Type);
	if (Pool <= 0)
	{
		return Remaining;
	}

	const int32 BlackFullBefore = (Type == EKKHeartType::Schwarz) ? Pool / 2 : 0;

	const int32 Taken = FMath::Min(Pool, Remaining);
	Pool -= Taken;

	OnHeartLost.Broadcast(Type);

	if (Type == EKKHeartType::Schwarz)
	{
		const int32 BlackFullAfter = Pool / 2;
		for (int32 i = BlackFullAfter; i < BlackFullBefore; ++i)
		{
			FireBlackHeartShockwave();
		}
	}

	return Remaining - Taken;
}

int32 UKKHealthComponent::ApplyDamage(const FKKDamageEvent& Event)
{
	if (!bAlive || IsInvulnerable() || Event.Amount <= 0.f)
	{
		return 0;
	}

	float Amount = Event.Amount;

	if (const UKKStatsComponent* Stats = GetOwner() ? GetOwner()->FindComponentByClass<UKKStatsComponent>() : nullptr)
	{
		FRandomStream Stream(GetOwner()->GetUniqueID() ^ static_cast<int32>(GetTimeSeconds() * 1000.0));
		if (Stats->RollDodge(Stream))
		{
			GrantInvulnerability(0.35f);
			return 0;
		}
		Amount *= (1.f - Stats->GetDamageReduction());
	}

	// Ein Treffer kostet mindestens ein Halbherz - sonst waeren hohe Ruestungswerte
	// gleichbedeutend mit Unverwundbarkeit.
	int32 Remaining = FMath::Max(1, FMath::CeilToInt(Amount * 2.f));
	const int32 Requested = Remaining;

	Remaining = DrainPool(EKKHeartType::Weiss, Remaining);
	Remaining = DrainPool(EKKHeartType::Blau, Remaining);
	Remaining = DrainPool(EKKHeartType::Schwarz, Remaining);
	Remaining = DrainPool(EKKHeartType::Rot, Remaining);

	const int32 Lost = Requested - Remaining;

	GrantInvulnerability(UKKGameSettings::Get().InvulnerabilityTime);
	OnDamaged.Broadcast(static_cast<float>(Lost));
	OnHealthChanged.Broadcast();

	if (RedHalf <= 0 && BlueHalf <= 0 && BlackHalf <= 0 && WhiteHalf <= 0)
	{
		bAlive = false;
		OnDeath.Broadcast();
	}

	return Lost;
}

void UKKHealthComponent::GrantInvulnerability(float Seconds)
{
	InvulnerableUntil = FMath::Max(InvulnerableUntil, GetTimeSeconds() + Seconds);
}

int32 UKKHealthComponent::ResolveWhiteHeartsAtFloorEnd()
{
	// Zwei ueberlebte weisse Halbherzen = ein Container. Ein einzelnes Halbherz verfaellt.
	const int32 Gained = WhiteHalf / 2;
	if (Gained > 0)
	{
		WhiteHalf -= Gained * 2;
		AddContainer(Gained, true);
		UE_LOG(LogKellerkind, Log, TEXT("Weisse Herzen ueberlebt: +%d Herzcontainer"), Gained);
	}
	WhiteHalf = 0;
	OnHealthChanged.Broadcast();
	return Gained;
}

void UKKHealthComponent::FireBlackHeartShockwave()
{
	UWorld* World = GetWorld();
	AActor* Owner = GetOwner();
	if (!World || !Owner)
	{
		return;
	}

	const UKKGameSettings& S = UKKGameSettings::Get();
	const FVector Origin = Owner->GetActorLocation();

	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKBlackHeart), false, Owner);
	World->OverlapMultiByObjectType(
		Overlaps, Origin, FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn),
		FCollisionShape::MakeSphere(S.SchwarzesHerzSchockwelleRadius), Params);

	int32 Hits = 0;
	for (const FOverlapResult& Overlap : Overlaps)
	{
		AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Overlap.GetActor());
		if (!Creature)
		{
			continue;
		}

		FKKDamageEvent Blast;
		Blast.Amount = S.SchwarzesHerzSchockwelleSchaden;
		Blast.Element = EKKElement::Schatten;
		Blast.SourceTag = TEXT("SchwarzesHerz");
		Blast.Instigator = Owner;
		Blast.HitLocation = Creature->GetActorLocation();
		Creature->ReceiveDamage(Blast);
		++Hits;
	}

	UE_LOG(LogKellerkind, Log, TEXT("Schwarzes Herz zerbricht - Schockwelle trifft %d Kreaturen"), Hits);
}
