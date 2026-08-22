#include "Items/KKItemData.h"

int32 UKKItemData::GetEffectivePrice() const
{
	if (ShopPrice > 0)
	{
		return ShopPrice;
	}

	// Qualitaetsstufe -> Richtpreis. Fluchitems sind billig, weil sie einen Preis in Fleisch fordern.
	static const int32 ByQuality[5] = { 7, 15, 25, 40, 66 };
	const int32 Base = ByQuality[FMath::Clamp(Quality, 0, 4)];
	return bCursed ? FMath::Max(3, Base / 2) : Base;
}
