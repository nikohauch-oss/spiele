#include "Core/KKContentRegistry.h"
#include "Core/KKSaveGame.h"
#include "Items/KKItemData.h"
#include "Items/KKSynergyData.h"
#include "Level/KKRoomData.h"
#include "AI/KKCreatureData.h"
#include "Engine/AssetManager.h"
#include "Kellerkind.h"

template <typename T>
void UKKContentRegistry::LoadType(FPrimaryAssetType Type, TArray<TObjectPtr<T>>& Out)
{
	UAssetManager& Manager = UAssetManager::Get();

	TArray<FPrimaryAssetId> Ids;
	Manager.GetPrimaryAssetIdList(Type, Ids);

	for (const FPrimaryAssetId& Id : Ids)
	{
		// Content dieser Groessenordnung (einige hundert kleine Definitionen) laden wir
		// bewusst synchron beim Start - das ist einmalig und haelt Runstart frei von Hitches.
		if (T* Asset = Cast<T>(Manager.GetPrimaryAssetObject(Id)))
		{
			Out.Add(Asset);
			continue;
		}
		if (T* Loaded = Cast<T>(Manager.GetPrimaryAssetPath(Id).TryLoad()))
		{
			Out.Add(Loaded);
		}
	}
}

void UKKContentRegistry::BuildRegistry()
{
	Items.Reset();
	Synergies.Reset();
	Rooms.Reset();
	Creatures.Reset();
	ItemsById.Reset();
	RoomsById.Reset();
	CreaturesById.Reset();

	LoadType<UKKItemData>(TEXT("KKItem"), Items);
	LoadType<UKKSynergyData>(TEXT("KKSynergy"), Synergies);
	LoadType<UKKRoomData>(TEXT("KKRoom"), Rooms);
	LoadType<UKKCreatureData>(TEXT("KKCreature"), Creatures);

	for (UKKItemData* Item : Items)
	{
		if (Item && !Item->ItemId.IsNone())
		{
			ItemsById.Add(Item->ItemId, Item);
		}
	}
	for (UKKRoomData* Room : Rooms)
	{
		if (Room && !Room->RoomId.IsNone())
		{
			RoomsById.Add(Room->RoomId, Room);
		}
	}
	for (UKKCreatureData* Creature : Creatures)
	{
		if (Creature && !Creature->CreatureId.IsNone())
		{
			CreaturesById.Add(Creature->CreatureId, Creature);
		}
	}

	LogSummary();
}

void UKKContentRegistry::LogSummary() const
{
	UE_LOG(LogKellerkind, Log, TEXT("Content geladen: %d Items, %d Synergien, %d Raeume, %d Kreaturen"),
		Items.Num(), Synergies.Num(), Rooms.Num(), Creatures.Num());
}

UKKItemData* UKKContentRegistry::FindItem(FName ItemId) const
{
	const TObjectPtr<UKKItemData>* Found = ItemsById.Find(ItemId);
	return Found ? Found->Get() : nullptr;
}

UKKRoomData* UKKContentRegistry::FindRoom(FName RoomId) const
{
	const TObjectPtr<UKKRoomData>* Found = RoomsById.Find(RoomId);
	return Found ? Found->Get() : nullptr;
}

UKKCreatureData* UKKContentRegistry::FindCreature(FName CreatureId) const
{
	const TObjectPtr<UKKCreatureData>* Found = CreaturesById.Find(CreatureId);
	return Found ? Found->Get() : nullptr;
}

bool UKKContentRegistry::IsAvailable(FName RequiredUnlock, const UKKSaveGame* Save) const
{
	if (RequiredUnlock.IsNone())
	{
		return true;
	}
	return Save && Save->IsUnlocked(RequiredUnlock);
}

TArray<UKKRoomData*> UKKContentRegistry::GetRooms(EKKFloor Floor, EKKRoomType Type, const UKKSaveGame* Save) const
{
	TArray<UKKRoomData*> Result;
	for (const TObjectPtr<UKKRoomData>& Room : Rooms)
	{
		if (Room && Room->RoomType == Type && Room->Floors.Contains(Floor) && IsAvailable(Room->RequiredUnlock, Save))
		{
			Result.Add(Room);
		}
	}
	return Result;
}

TArray<UKKCreatureData*> UKKContentRegistry::GetCreatures(EKKFloor Floor, const UKKSaveGame* Save) const
{
	TArray<UKKCreatureData*> Result;
	for (const TObjectPtr<UKKCreatureData>& Creature : Creatures)
	{
		if (Creature && Creature->Floors.Contains(Floor) && IsAvailable(Creature->RequiredUnlock, Save))
		{
			Result.Add(Creature);
		}
	}
	return Result;
}

UKKItemData* UKKContentRegistry::RollItem(EKKItemPool Pool, FRandomStream& Stream, float Luck,
	const TSet<FName>& Excluded, const UKKSaveGame* Save) const
{
	TArray<UKKItemData*> Candidates;
	TArray<float> Weights;
	float Total = 0.f;

	for (const TObjectPtr<UKKItemData>& Item : Items)
	{
		if (!Item || !Item->IsInPool(Pool) || Excluded.Contains(Item->ItemId))
		{
			continue;
		}
		if (!IsAvailable(Item->RequiredUnlock, Save))
		{
			continue;
		}

		// Glueck hebt seltene Qualitaeten an, statt nur die Trefferchance zu erhoehen.
		const float LuckFactor = FMath::Pow(1.f + FMath::Max(0.f, Luck) * 0.15f, static_cast<float>(Item->Quality));
		const float W = FMath::Max(0.001f, Item->Weight * LuckFactor);

		Candidates.Add(Item);
		Weights.Add(W);
		Total += W;
	}

	if (Candidates.Num() == 0)
	{
		UE_LOG(LogKellerkind, Warning, TEXT("Item-Pool %d ist leer - Fallback auf nichts."), static_cast<int32>(Pool));
		return nullptr;
	}

	float Pick = Stream.FRandRange(0.f, Total);
	for (int32 i = 0; i < Candidates.Num(); ++i)
	{
		Pick -= Weights[i];
		if (Pick <= 0.f)
		{
			return Candidates[i];
		}
	}
	return Candidates.Last();
}
