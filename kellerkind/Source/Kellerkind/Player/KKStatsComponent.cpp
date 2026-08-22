#include "Player/KKStatsComponent.h"
#include "Core/KKGameSettings.h"

UKKStatsComponent::UKKStatsComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	bWantsInitializeComponent = true;
	ApplyDefaults();
}

void UKKStatsComponent::InitializeComponent()
{
	Super::InitializeComponent();
	Recalculate();
}

void UKKStatsComponent::ApplyDefaults()
{
	const UKKGameSettings& S = UKKGameSettings::Get();

	Base[static_cast<int32>(EKKStat::Damage)] = S.BaseDamage;
	Base[static_cast<int32>(EKKStat::AttackSpeed)] = S.BaseAttackSpeed;
	Base[static_cast<int32>(EKKStat::MoveSpeed)] = S.BaseMoveSpeed;
	Base[static_cast<int32>(EKKStat::Range)] = S.BaseRange;
	Base[static_cast<int32>(EKKStat::CritChance)] = S.BaseCritChance;
	Base[static_cast<int32>(EKKStat::Luck)] = S.BaseLuck;
	Base[static_cast<int32>(EKKStat::Armor)] = S.BaseArmor;
	Base[static_cast<int32>(EKKStat::MaxHP)] = static_cast<float>(S.StartingHeartContainers);
	Base[static_cast<int32>(EKKStat::Dodge)] = S.BaseDodge;
	Base[static_cast<int32>(EKKStat::InteractionSpeed)] = S.BaseInteractionSpeed;

	FMemory::Memcpy(Cached, Base, sizeof(Base));
}

void UKKStatsComponent::AddModifiers(FName SourceId, const TArray<FKKStatMod>& Mods)
{
	if (Mods.Num() == 0)
	{
		return;
	}

	FModSource& Source = Sources.FindOrAdd(SourceId);
	Source.Mods.Append(Mods);
	Recalculate();
}

void UKKStatsComponent::RemoveModifiers(FName SourceId)
{
	if (Sources.Remove(SourceId) > 0)
	{
		Recalculate();
	}
}

void UKKStatsComponent::SetBase(EKKStat Stat, float Value)
{
	Base[static_cast<int32>(Stat)] = Value;
	Recalculate();
}

void UKKStatsComponent::Recalculate()
{
	const UKKGameSettings& S = UKKGameSettings::Get();

	float Additive[static_cast<int32>(EKKStat::MAX)] = { 0.f };
	float Multi[static_cast<int32>(EKKStat::MAX)] = { 0.f };

	for (const TPair<FName, FModSource>& Pair : Sources)
	{
		for (const FKKStatMod& Mod : Pair.Value.Mods)
		{
			const int32 Index = static_cast<int32>(Mod.Stat);
			Additive[Index] += Mod.Additive;
			Multi[Index] += Mod.Multiplier;
		}
	}

	for (int32 i = 0; i < static_cast<int32>(EKKStat::MAX); ++i)
	{
		// Erst alle flachen Zugaben, dann die Summe der Multiplikatoren einmal anwenden.
		// Additiv gestapelte Multiplikatoren halten Builds lesbar; multiplikative Stapelung
		// wuerde bei 200+ Items sehr schnell entgleisen.
		Cached[i] = (Base[i] + Additive[i]) * (1.f + Multi[i]);
	}

	Cached[static_cast<int32>(EKKStat::CritChance)] = FMath::Clamp(Cached[static_cast<int32>(EKKStat::CritChance)], 0.f, S.MaxCritChance);
	Cached[static_cast<int32>(EKKStat::Dodge)] = FMath::Clamp(Cached[static_cast<int32>(EKKStat::Dodge)], 0.f, S.MaxDodge);
	Cached[static_cast<int32>(EKKStat::MoveSpeed)] = FMath::Clamp(Cached[static_cast<int32>(EKKStat::MoveSpeed)], 120.f, S.MaxMoveSpeed);
	Cached[static_cast<int32>(EKKStat::AttackSpeed)] = FMath::Max(0.2f, Cached[static_cast<int32>(EKKStat::AttackSpeed)]);
	Cached[static_cast<int32>(EKKStat::Damage)] = FMath::Max(0.5f, Cached[static_cast<int32>(EKKStat::Damage)]);
	Cached[static_cast<int32>(EKKStat::Range)] = FMath::Max(60.f, Cached[static_cast<int32>(EKKStat::Range)]);
	Cached[static_cast<int32>(EKKStat::MaxHP)] = FMath::Clamp(Cached[static_cast<int32>(EKKStat::MaxHP)], 1.f, static_cast<float>(S.MaxHeartContainers));

	OnStatsChanged.Broadcast(this);
}

float UKKStatsComponent::GetStat(EKKStat Stat) const
{
	return Cached[static_cast<int32>(Stat)];
}

bool UKKStatsComponent::RollCrit(FRandomStream& Stream) const
{
	return Stream.FRand() < GetStat(EKKStat::CritChance);
}

bool UKKStatsComponent::RollDodge(FRandomStream& Stream) const
{
	return Stream.FRand() < GetStat(EKKStat::Dodge);
}

float UKKStatsComponent::GetDamageReduction() const
{
	const float Armor = FMath::Max(0.f, GetStat(EKKStat::Armor));
	// Abnehmender Ertrag: 10 Ruestung ~ 33 %, 30 ~ 60 %, Deckel bei MaxArmorReduction.
	const float Reduction = Armor / (Armor + 20.f);
	return FMath::Min(Reduction, UKKGameSettings::Get().MaxArmorReduction);
}
