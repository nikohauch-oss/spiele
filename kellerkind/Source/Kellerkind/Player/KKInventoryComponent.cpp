#include "Player/KKInventoryComponent.h"
#include "Player/KKStatsComponent.h"
#include "Player/KKHealthComponent.h"
#include "Player/KKAppearanceComponent.h"
#include "Items/KKItemData.h"
#include "Items/KKItemEffect.h"
#include "Items/KKSynergyData.h"
#include "Items/KKFamiliar.h"
#include "Items/KKOrbital.h"
#include "Core/KKGameInstance.h"
#include "Core/KKContentRegistry.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"
#include "Engine/World.h"

UKKInventoryComponent::UKKInventoryComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UKKInventoryComponent::BeginPlay()
{
	Super::BeginPlay();
}

UKKStatsComponent* UKKInventoryComponent::GetStats() const
{
	return GetOwner() ? GetOwner()->FindComponentByClass<UKKStatsComponent>() : nullptr;
}

TArray<UKKItemData*> UKKInventoryComponent::GetItems() const
{
	TArray<UKKItemData*> Result;
	Result.Reserve(Owned.Num());
	for (const TObjectPtr<UKKItemData>& Item : Owned)
	{
		Result.Add(Item);
	}
	return Result;
}

TArray<UKKSynergyData*> UKKInventoryComponent::GetActiveSynergies() const
{
	TArray<UKKSynergyData*> Result;
	for (const TPair<FName, TObjectPtr<UKKSynergyData>>& Pair : ActiveSynergies)
	{
		Result.Add(Pair.Value);
	}
	return Result;
}

int32 UKKInventoryComponent::GetStacks(FName ItemId) const
{
	const TObjectPtr<UKKItemEffect>* Effect = Effects.Find(ItemId);
	return (Effect && *Effect) ? (*Effect)->Stacks : (OwnedIds.Contains(ItemId) ? 1 : 0);
}

bool UKKInventoryComponent::AddItem(UKKItemData* Item)
{
	if (!Item || Item->ItemId.IsNone())
	{
		return false;
	}

	// Zweite Kopie: der Effekt entscheidet selbst, was Stapeln bedeutet.
	if (OwnedIds.Contains(Item->ItemId))
	{
		if (TObjectPtr<UKKItemEffect>* Existing = Effects.Find(Item->ItemId))
		{
			if (*Existing)
			{
				(*Existing)->OnStackAdded();
			}
		}
		ApplyItemPayload(Item);
		OnLoadoutChanged.Broadcast();
		return true;
	}

	Owned.Add(Item);
	OwnedIds.Add(Item->ItemId);

	if (Item->EffectClass)
	{
		UKKItemEffect* Effect = NewObject<UKKItemEffect>(this, Item->EffectClass);
		Effect->Initialize(this, Item);
		Effects.Add(Item->ItemId, Effect);
		Effect->OnGranted();
	}

	ApplyItemPayload(Item);
	SpawnItemActors(Item);

	if (Item->Category == EKKItemCategory::Aktiv)
	{
		ActiveItem = Item;
		ActiveReadyAt = 0.0;
		ActiveChargesLeft = Item->ActiveRoomCharges;
	}

	RebuildOwnedTags();
	ReevaluateSynergies();
	RebuildTickList();

	// Andere Items duerfen auf den Neuzugang reagieren (z. B. "je gefundenem Relikt +1 Schaden").
	for (const TPair<FName, TObjectPtr<UKKItemEffect>>& Pair : Effects)
	{
		if (Pair.Value && Pair.Key != Item->ItemId)
		{
			Pair.Value->OnItemPicked(Item);
		}
	}

	if (const UKKGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance<UKKGameInstance>() : nullptr)
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->CollectedItems.Add(Item);
			Run->ConsumedItemIds.Add(Item->ItemId);
		}
	}

	OnItemAdded.Broadcast(Item);
	OnLoadoutChanged.Broadcast();

	UE_LOG(LogKellerkind, Verbose, TEXT("Item aufgenommen: %s"), *Item->ItemId.ToString());
	return true;
}

void UKKInventoryComponent::ApplyItemPayload(UKKItemData* Item)
{
	if (UKKStatsComponent* Stats = GetStats())
	{
		// Der Quellenschluessel bekommt die Stapelanzahl angehaengt, damit mehrere Kopien
		// desselben Items ihre Modifikatoren nicht gegenseitig ueberschreiben.
		const int32 Stack = GetStacks(Item->ItemId);
		const FName Key = *FString::Printf(TEXT("%s#%d"), *Item->ItemId.ToString(), Stack);
		Stats->AddModifiers(Key, Item->StatMods);
	}

	if (Item->HeartContainerDelta != 0)
	{
		if (UKKHealthComponent* Health = GetOwner()->FindComponentByClass<UKKHealthComponent>())
		{
			Health->AddContainer(Item->HeartContainerDelta, Item->HeartContainerDelta > 0);
		}
	}

	if (!Item->AppearanceLayer.IsNone())
	{
		if (UKKAppearanceComponent* Appearance = GetOwner()->FindComponentByClass<UKKAppearanceComponent>())
		{
			Appearance->AddLayer(Item->AppearanceLayer);
		}
	}
}

void UKKInventoryComponent::SpawnItemActors(UKKItemData* Item)
{
	UWorld* World = GetWorld();
	AActor* Owner = GetOwner();
	if (!World || !Owner)
	{
		return;
	}

	FActorSpawnParameters Params;
	Params.Owner = Owner;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	if (!Item->FamiliarClass.IsNull())
	{
		if (UClass* Class = Item->FamiliarClass.LoadSynchronous())
		{
			if (AKKFamiliar* Familiar = World->SpawnActor<AKKFamiliar>(Class, Owner->GetActorTransform(), Params))
			{
				Familiar->AttachToOwner(Owner, Familiars.Num());
				Familiars.Add(Familiar);
			}
		}
	}

	if (!Item->OrbitalClass.IsNull())
	{
		if (UClass* Class = Item->OrbitalClass.LoadSynchronous())
		{
			if (AKKOrbital* Orbital = World->SpawnActor<AKKOrbital>(Class, Owner->GetActorTransform(), Params))
			{
				Orbitals.Add(Orbital);
				RefreshOrbitalRing();
			}
		}
	}
}

void UKKInventoryComponent::RefreshOrbitalRing()
{
	// Orbitals teilen sich den Kreis gleichmaessig auf, egal wie viele dazukommen.
	const int32 Count = Orbitals.Num();
	for (int32 i = 0; i < Count; ++i)
	{
		if (Orbitals[i])
		{
			Orbitals[i]->Configure(GetOwner(), (360.f / Count) * i);
		}
	}
}

bool UKKInventoryComponent::RemoveItem(FName ItemId)
{
	if (!OwnedIds.Contains(ItemId))
	{
		return false;
	}

	if (TObjectPtr<UKKItemEffect>* Effect = Effects.Find(ItemId))
	{
		if (*Effect)
		{
			(*Effect)->OnRemoved();
		}
		Effects.Remove(ItemId);
	}

	if (UKKStatsComponent* Stats = GetStats())
	{
		// Alle Stapel-Schluessel dieses Items entfernen.
		for (int32 Stack = 1; Stack <= 16; ++Stack)
		{
			Stats->RemoveModifiers(*FString::Printf(TEXT("%s#%d"), *ItemId.ToString(), Stack));
		}
	}

	Owned.RemoveAll([ItemId](const TObjectPtr<UKKItemData>& Item) { return Item && Item->ItemId == ItemId; });
	OwnedIds.Remove(ItemId);

	if (ActiveItem && ActiveItem->ItemId == ItemId)
	{
		ActiveItem = nullptr;
	}

	RebuildOwnedTags();
	ReevaluateSynergies();
	RebuildTickList();
	OnLoadoutChanged.Broadcast();
	return true;
}

void UKKInventoryComponent::RebuildOwnedTags()
{
	OwnedTags.Reset();
	for (const TObjectPtr<UKKItemData>& Item : Owned)
	{
		if (Item)
		{
			OwnedTags.AppendTags(Item->Tags);
		}
	}
	// Von Synergien vergebene Tags kommen dazu, damit Synergien aufeinander aufbauen koennen.
	for (const TPair<FName, TObjectPtr<UKKSynergyData>>& Pair : ActiveSynergies)
	{
		if (Pair.Value && Pair.Value->GrantedTag.IsValid())
		{
			OwnedTags.AddTag(Pair.Value->GrantedTag);
		}
	}
}

void UKKInventoryComponent::ReevaluateSynergies()
{
	const UKKGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance<UKKGameInstance>() : nullptr;
	const UKKContentRegistry* Registry = GI ? GI->GetContent() : nullptr;
	if (!Registry)
	{
		return;
	}

	// Zwei Durchlaeufe: der erste aktiviert Synergien aus Item-Tags, der zweite laesst
	// Synergien greifen, deren Bedingung erst durch einen GrantedTag erfuellt wird.
	for (int32 Pass = 0; Pass < 2; ++Pass)
	{
		TSet<FName> ShouldBeActive;
		for (UKKSynergyData* Synergy : Registry->GetAllSynergies())
		{
			if (Synergy && Synergy->IsSatisfied(OwnedTags, OwnedIds))
			{
				ShouldBeActive.Add(Synergy->SynergyId);
			}
		}

		// Deaktivieren, was nicht mehr passt.
		TArray<FName> ToDeactivate;
		for (const TPair<FName, TObjectPtr<UKKSynergyData>>& Pair : ActiveSynergies)
		{
			if (!ShouldBeActive.Contains(Pair.Key))
			{
				ToDeactivate.Add(Pair.Key);
			}
		}
		for (const FName& Id : ToDeactivate)
		{
			if (TObjectPtr<UKKItemEffect>* Effect = SynergyEffects.Find(Id))
			{
				if (*Effect)
				{
					(*Effect)->OnRemoved();
				}
				SynergyEffects.Remove(Id);
			}
			if (UKKStatsComponent* Stats = GetStats())
			{
				Stats->RemoveModifiers(Id);
			}
			ActiveSynergies.Remove(Id);
		}

		// Neue aktivieren.
		for (UKKSynergyData* Synergy : Registry->GetAllSynergies())
		{
			if (!Synergy || !ShouldBeActive.Contains(Synergy->SynergyId) || ActiveSynergies.Contains(Synergy->SynergyId))
			{
				continue;
			}

			ActiveSynergies.Add(Synergy->SynergyId, Synergy);

			if (Synergy->EffectClass)
			{
				UKKItemEffect* Effect = NewObject<UKKItemEffect>(this, Synergy->EffectClass);
				Effect->Initialize(this, nullptr);
				SynergyEffects.Add(Synergy->SynergyId, Effect);
				Effect->OnGranted();
			}
			if (UKKStatsComponent* Stats = GetStats())
			{
				Stats->AddModifiers(Synergy->SynergyId, Synergy->StatMods);
			}
			if (!Synergy->AppearanceLayer.IsNone())
			{
				if (UKKAppearanceComponent* Appearance = GetOwner()->FindComponentByClass<UKKAppearanceComponent>())
				{
					Appearance->AddLayer(Synergy->AppearanceLayer);
				}
			}

			OnSynergyActivated.Broadcast(Synergy);
			UE_LOG(LogKellerkind, Log, TEXT("Synergie aktiv: %s"), *Synergy->SynergyId.ToString());
		}

		RebuildOwnedTags();
	}
}

void UKKInventoryComponent::RebuildTickList()
{
	TickingEffects.Reset();

	auto Collect = [this](const TMap<FName, TObjectPtr<UKKItemEffect>>& Map)
	{
		for (const TPair<FName, TObjectPtr<UKKItemEffect>>& Pair : Map)
		{
			if (Pair.Value && Pair.Value->WantsTick())
			{
				TickingEffects.Add(Pair.Value);
			}
		}
	};

	Collect(Effects);
	Collect(SynergyEffects);

	SetComponentTickEnabled(TickingEffects.Num() > 0);
}

void UKKInventoryComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	for (const TWeakObjectPtr<UKKItemEffect>& Effect : TickingEffects)
	{
		if (Effect.IsValid())
		{
			Effect->Tick(DeltaTime);
		}
	}
}

bool UKKInventoryComponent::UseActiveItem()
{
	if (!ActiveItem)
	{
		return false;
	}

	const UWorld* World = GetWorld();
	const double Now = World ? World->GetTimeSeconds() : 0.0;

	const bool bUsesCharges = ActiveItem->ActiveRoomCharges > 0;
	if (bUsesCharges)
	{
		if (ActiveChargesLeft <= 0)
		{
			return false;
		}
	}
	else if (Now < ActiveReadyAt)
	{
		return false;
	}

	TObjectPtr<UKKItemEffect>* Effect = Effects.Find(ActiveItem->ItemId);
	if (!Effect || !*Effect || !(*Effect)->OnActivate())
	{
		return false;
	}

	if (bUsesCharges)
	{
		--ActiveChargesLeft;
	}
	else
	{
		ActiveReadyAt = Now + ActiveItem->ActiveCooldown;
	}

	if (const UKKGameInstance* GI = World ? World->GetGameInstance<UKKGameInstance>() : nullptr)
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->RecordAbilityUse(ActiveItem->ItemId);
		}
	}

	OnLoadoutChanged.Broadcast();
	return true;
}

float UKKInventoryComponent::GetActiveCooldownRemaining() const
{
	const UWorld* World = GetWorld();
	const double Now = World ? World->GetTimeSeconds() : 0.0;
	return FMath::Max(0.f, static_cast<float>(ActiveReadyAt - Now));
}

// --- Hook-Verteilung -------------------------------------------------------

#define KK_DISPATCH(FuncCall) \
	for (const TPair<FName, TObjectPtr<UKKItemEffect>>& Pair : Effects) { if (Pair.Value) { Pair.Value->FuncCall; } } \
	for (const TPair<FName, TObjectPtr<UKKItemEffect>>& Pair : SynergyEffects) { if (Pair.Value) { Pair.Value->FuncCall; } }

void UKKInventoryComponent::DispatchPreDealDamage(FKKDamageEvent& Event, AActor* Target)
{
	KK_DISPATCH(PreDealDamage(Event, Target));
}

void UKKInventoryComponent::DispatchPostDealDamage(const FKKDamageEvent& Event, AActor* Target)
{
	KK_DISPATCH(PostDealDamage(Event, Target));
}

void UKKInventoryComponent::DispatchPreTakeDamage(FKKDamageEvent& Event)
{
	KK_DISPATCH(PreTakeDamage(Event));
}

void UKKInventoryComponent::DispatchKill(AActor* Victim)
{
	KK_DISPATCH(OnKill(Victim));
}

void UKKInventoryComponent::DispatchRoomEntered(EKKRoomType RoomType)
{
	KK_DISPATCH(OnRoomEntered(RoomType));
}

void UKKInventoryComponent::DispatchRoomCleared()
{
	KK_DISPATCH(OnRoomCleared());

	// Ladungsbasierte aktive Items laden sich pro geraeumtem Raum auf.
	if (ActiveItem && ActiveItem->ActiveRoomCharges > 0)
	{
		ActiveChargesLeft = FMath::Min(ActiveChargesLeft + 1, ActiveItem->ActiveRoomCharges);
		OnLoadoutChanged.Broadcast();
	}
}

void UKKInventoryComponent::DispatchFloorStarted(EKKFloor Floor)
{
	KK_DISPATCH(OnFloorStarted(Floor));
}

void UKKInventoryComponent::DispatchHeartLost(EKKHeartType Heart)
{
	KK_DISPATCH(OnHeartLost(Heart));
}

#undef KK_DISPATCH
