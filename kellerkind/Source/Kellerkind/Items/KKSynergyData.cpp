#include "Items/KKSynergyData.h"

bool UKKSynergyData::IsSatisfied(const FGameplayTagContainer& OwnedTags, const TSet<FName>& OwnedItemIds) const
{
	if (BlockedByTags.Num() > 0 && OwnedTags.HasAny(BlockedByTags))
	{
		return false;
	}

	if (RequiredTags.Num() > 0 && !OwnedTags.HasAll(RequiredTags))
	{
		return false;
	}

	for (const FName& RequiredId : RequiredItemIds)
	{
		if (!OwnedItemIds.Contains(RequiredId))
		{
			return false;
		}
	}

	// Eine Synergie ohne jede Bedingung waere immer aktiv - das ist ein Datenfehler.
	return RequiredTags.Num() > 0 || RequiredItemIds.Num() > 0;
}
