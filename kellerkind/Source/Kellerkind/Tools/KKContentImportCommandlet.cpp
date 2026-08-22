#include "Tools/KKContentImportCommandlet.h"
#include "Kellerkind.h"

#if WITH_EDITOR
#include "Items/KKItemData.h"
#include "Items/KKSynergyData.h"
#include "AI/KKCreatureData.h"
#include "Level/KKRoomData.h"
#include "Level/KKFloorData.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Dom/JsonObject.h"
#include "GameplayTagsManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "HAL/FileManager.h"
#endif

UKKContentImportCommandlet::UKKContentImportCommandlet()
{
	IsClient = false;
	IsServer = false;
	IsEditor = true;
	LogToConsole = true;
}

#if !WITH_EDITOR

int32 UKKContentImportCommandlet::Main(const FString& Params)
{
	UE_LOG(LogKellerkind, Error, TEXT("KKContentImport laeuft nur im Editor-Build."));
	return 1;
}

#else

namespace
{
	/** Liest einen Enum-Wert anhand seines Namens; gibt Fallback zurueck, wenn unbekannt. */
	template <typename TEnum>
	TEnum ParseEnum(const FString& Name, const TCHAR* EnumName, TEnum Fallback)
	{
		const UEnum* Enum = FindObject<UEnum>(nullptr, EnumName, true);
		if (!Enum)
		{
			return Fallback;
		}
		const int64 Value = Enum->GetValueByNameString(Name);
		return (Value == INDEX_NONE) ? Fallback : static_cast<TEnum>(Value);
	}

	float GetNumber(const TSharedPtr<FJsonObject>& Object, const FString& Field, float Default)
	{
		double Value = Default;
		return Object->TryGetNumberField(Field, Value) ? static_cast<float>(Value) : Default;
	}

	int32 GetInt(const TSharedPtr<FJsonObject>& Object, const FString& Field, int32 Default)
	{
		int32 Value = Default;
		return Object->TryGetNumberField(Field, Value) ? Value : Default;
	}

	FString GetString(const TSharedPtr<FJsonObject>& Object, const FString& Field)
	{
		FString Value;
		Object->TryGetStringField(Field, Value);
		return Value;
	}
}

int32 UKKContentImportCommandlet::Main(const FString& Params)
{
	TArray<FString> Tokens;
	TArray<FString> Switches;
	TMap<FString, FString> Arguments;
	ParseCommandLine(*Params, Tokens, Switches, Arguments);

	DataDir = Arguments.FindRef(TEXT("DataDir"));
	if (DataDir.IsEmpty())
	{
		DataDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Data"));
	}

	OutDir = Arguments.FindRef(TEXT("OutDir"));
	if (OutDir.IsEmpty())
	{
		OutDir = TEXT("/Game/Kellerkind/Data");
	}

	bDryRun = Switches.Contains(TEXT("DryRun"));

	UE_LOG(LogKellerkind, Display, TEXT("KKContentImport: Data=%s Ziel=%s%s"),
		*DataDir, *OutDir, bDryRun ? TEXT(" (Probelauf)") : TEXT(""));

	const int32 Items = ImportItems();
	const int32 Synergies = ImportSynergies();
	const int32 Creatures = ImportCreatures();
	const int32 Rooms = ImportRooms();
	const int32 Floors = ImportFloors();

	if (!bDryRun)
	{
		SaveDirtyPackages();
	}

	UE_LOG(LogKellerkind, Display,
		TEXT("KKContentImport fertig: %d Items, %d Synergien, %d Kreaturen, %d Raeume, %d Etagen "
			 "(%d neu, %d aktualisiert, %d fehlgeschlagen)"),
		Items, Synergies, Creatures, Rooms, Floors, Created, Updated, Failed);

	return Failed > 0 ? 1 : 0;
}

bool UKKContentImportCommandlet::LoadJson(const FString& FileName, TSharedPtr<FJsonObject>& OutObject) const
{
	const FString Path = FPaths::Combine(DataDir, FileName);

	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		UE_LOG(LogKellerkind, Error, TEXT("Datei nicht lesbar: %s"), *Path);
		return false;
	}

	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, OutObject) || !OutObject.IsValid())
	{
		UE_LOG(LogKellerkind, Error, TEXT("JSON fehlerhaft: %s"), *Path);
		return false;
	}
	return true;
}

UObject* UKKContentImportCommandlet::GetOrCreateAsset(UClass* Class, const FString& AssetName, const FString& SubFolder)
{
	const FString PackagePath = FString::Printf(TEXT("%s/%s/%s"), *OutDir, *SubFolder, *AssetName);

	if (UObject* Existing = LoadObject<UObject>(nullptr, *(PackagePath + TEXT(".") + AssetName)))
	{
		++Updated;
		return Existing;
	}

	if (bDryRun)
	{
		++Created;
		return NewObject<UObject>(GetTransientPackage(), Class, *AssetName);
	}

	UPackage* Package = CreatePackage(*PackagePath);
	if (!Package)
	{
		++Failed;
		return nullptr;
	}

	UObject* Asset = NewObject<UObject>(Package, Class, *AssetName, RF_Public | RF_Standalone);
	if (!Asset)
	{
		++Failed;
		return nullptr;
	}

	FAssetRegistryModule::AssetCreated(Asset);
	Package->MarkPackageDirty();
	++Created;
	return Asset;
}

int32 UKKContentImportCommandlet::ImportItems()
{
	int32 Count = 0;

	TArray<FString> Files;
	IFileManager::Get().FindFiles(Files, *FPaths::Combine(DataDir, TEXT("items_*.json")), true, false);
	Files.Sort();

	for (const FString& File : Files)
	{
		TSharedPtr<FJsonObject> Root;
		if (!LoadJson(File, Root))
		{
			++Failed;
			continue;
		}

		const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
		if (!Root->TryGetArrayField(TEXT("items"), Entries))
		{
			continue;
		}

		for (const TSharedPtr<FJsonValue>& Entry : *Entries)
		{
			const TSharedPtr<FJsonObject> Object = Entry->AsObject();
			if (!Object.IsValid())
			{
				continue;
			}

			const FString Id = GetString(Object, TEXT("id"));
			if (Id.IsEmpty())
			{
				++Failed;
				continue;
			}

			UKKItemData* Item = Cast<UKKItemData>(
				GetOrCreateAsset(UKKItemData::StaticClass(), FString::Printf(TEXT("DA_Item_%s"), *Id), TEXT("Items")));
			if (!Item)
			{
				continue;
			}

			Item->ItemId = *Id;
			Item->DisplayName = FText::FromString(GetString(Object, TEXT("name")));
			Item->PickupLine = FText::FromString(GetString(Object, TEXT("pickup")));
			Item->Description = FText::FromString(GetString(Object, TEXT("desc")));
			Item->Category = ParseEnum<EKKItemCategory>(GetString(Object, TEXT("category")),
				TEXT("/Script/Kellerkind.EKKItemCategory"), EKKItemCategory::Passiv);
			Item->Quality = GetInt(Object, TEXT("quality"), 1);
			Item->Weight = GetNumber(Object, TEXT("weight"), 1.f);
			Item->HeartContainerDelta = GetInt(Object, TEXT("hearts"), 0);
			Item->Element = ParseEnum<EKKElement>(GetString(Object, TEXT("element")),
				TEXT("/Script/Kellerkind.EKKElement"), EKKElement::Physisch);
			Item->bCursed = false;
			Object->TryGetBoolField(TEXT("cursed"), Item->bCursed);
			Item->ActiveCooldown = GetNumber(Object, TEXT("cooldown"), 0.f);
			Item->ActiveRoomCharges = GetInt(Object, TEXT("charges"), 0);
			Item->AppearanceLayer = *GetString(Object, TEXT("layer"));

			Item->Pools.Reset();
			const TArray<TSharedPtr<FJsonValue>>* Pools = nullptr;
			if (Object->TryGetArrayField(TEXT("pools"), Pools))
			{
				for (const TSharedPtr<FJsonValue>& Pool : *Pools)
				{
					// "Verfluchter Raum" traegt im JSON ein Leerzeichen, im Enum nicht.
					const FString Name = Pool->AsString().Replace(TEXT(" "), TEXT(""));
					Item->Pools.Add(ParseEnum<EKKItemPool>(Name,
						TEXT("/Script/Kellerkind.EKKItemPool"), EKKItemPool::Schatzraum));
				}
			}

			Item->Tags.Reset();
			const TArray<TSharedPtr<FJsonValue>>* Tags = nullptr;
			if (Object->TryGetArrayField(TEXT("tags"), Tags))
			{
				for (const TSharedPtr<FJsonValue>& Tag : *Tags)
				{
					const FGameplayTag Resolved = FGameplayTag::RequestGameplayTag(
						*FString::Printf(TEXT("Kellerkind.%s"), *Tag->AsString()), false);
					if (Resolved.IsValid())
					{
						Item->Tags.AddTag(Resolved);
					}
					else
					{
						UE_LOG(LogKellerkind, Warning, TEXT("Item %s: Tag %s ist nicht registriert."),
							*Id, *Tag->AsString());
					}
				}
			}

			Item->StatMods.Reset();
			const TArray<TSharedPtr<FJsonValue>>* Stats = nullptr;
			if (Object->TryGetArrayField(TEXT("stats"), Stats))
			{
				for (const TSharedPtr<FJsonValue>& StatValue : *Stats)
				{
					const TSharedPtr<FJsonObject> StatObject = StatValue->AsObject();
					if (!StatObject.IsValid())
					{
						continue;
					}
					FKKStatMod Mod;
					Mod.Stat = ParseEnum<EKKStat>(GetString(StatObject, TEXT("stat")),
						TEXT("/Script/Kellerkind.EKKStat"), EKKStat::Damage);
					Mod.Additive = GetNumber(StatObject, TEXT("add"), 0.f);
					Mod.Multiplier = GetNumber(StatObject, TEXT("mul"), 0.f);
					Item->StatMods.Add(Mod);
				}
			}

			// EffectClass, Meshes und Icons werden im Editor gesetzt und hier bewusst
			// nicht angefasst - sonst wuerde jeder Import die Handarbeit ueberschreiben.
			if (!bDryRun)
			{
				Item->MarkPackageDirty();
			}
			++Count;
		}
	}

	return Count;
}

int32 UKKContentImportCommandlet::ImportSynergies()
{
	TSharedPtr<FJsonObject> Root;
	if (!LoadJson(TEXT("synergies.json"), Root))
	{
		++Failed;
		return 0;
	}

	const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
	if (!Root->TryGetArrayField(TEXT("synergies"), Entries))
	{
		return 0;
	}

	int32 Count = 0;
	for (const TSharedPtr<FJsonValue>& Entry : *Entries)
	{
		const TSharedPtr<FJsonObject> Object = Entry->AsObject();
		const FString Id = Object.IsValid() ? GetString(Object, TEXT("id")) : FString();
		if (Id.IsEmpty())
		{
			continue;
		}

		UKKSynergyData* Synergy = Cast<UKKSynergyData>(
			GetOrCreateAsset(UKKSynergyData::StaticClass(), FString::Printf(TEXT("DA_Syn_%s"), *Id), TEXT("Synergien")));
		if (!Synergy)
		{
			continue;
		}

		Synergy->SynergyId = *Id;
		Synergy->DisplayName = FText::FromString(GetString(Object, TEXT("name")));
		Synergy->Description = FText::FromString(GetString(Object, TEXT("desc")));
		Synergy->AppearanceLayer = *GetString(Object, TEXT("layer"));

		auto ReadTags = [&Object](const TCHAR* Field, FGameplayTagContainer& Out)
		{
			Out.Reset();
			const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
			if (Object->TryGetArrayField(Field, Values))
			{
				for (const TSharedPtr<FJsonValue>& Value : *Values)
				{
					const FGameplayTag Tag = FGameplayTag::RequestGameplayTag(
						*FString::Printf(TEXT("Kellerkind.%s"), *Value->AsString()), false);
					if (Tag.IsValid())
					{
						Out.AddTag(Tag);
					}
				}
			}
		};

		ReadTags(TEXT("tags"), Synergy->RequiredTags);
		ReadTags(TEXT("blocked"), Synergy->BlockedByTags);

		Synergy->RequiredItemIds.Reset();
		const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
		if (Object->TryGetArrayField(TEXT("items"), Items))
		{
			for (const TSharedPtr<FJsonValue>& Value : *Items)
			{
				Synergy->RequiredItemIds.Add(*Value->AsString());
			}
		}

		const FString Grants = GetString(Object, TEXT("grants"));
		if (!Grants.IsEmpty())
		{
			Synergy->GrantedTag = FGameplayTag::RequestGameplayTag(
				*FString::Printf(TEXT("Kellerkind.%s"), *Grants), false);
		}

		if (!bDryRun)
		{
			Synergy->MarkPackageDirty();
		}
		++Count;
	}
	return Count;
}

int32 UKKContentImportCommandlet::ImportCreatures()
{
	TSharedPtr<FJsonObject> Root;
	if (!LoadJson(TEXT("creatures.json"), Root))
	{
		++Failed;
		return 0;
	}

	const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
	if (!Root->TryGetArrayField(TEXT("creatures"), Entries))
	{
		return 0;
	}

	int32 Count = 0;
	for (const TSharedPtr<FJsonValue>& Entry : *Entries)
	{
		const TSharedPtr<FJsonObject> Object = Entry->AsObject();
		const FString Id = Object.IsValid() ? GetString(Object, TEXT("id")) : FString();
		if (Id.IsEmpty())
		{
			continue;
		}

		UKKCreatureData* Creature = Cast<UKKCreatureData>(
			GetOrCreateAsset(UKKCreatureData::StaticClass(), FString::Printf(TEXT("DA_Kreatur_%s"), *Id), TEXT("Kreaturen")));
		if (!Creature)
		{
			continue;
		}

		Creature->CreatureId = *Id;
		Creature->DisplayName = FText::FromString(GetString(Object, TEXT("name")));
		Creature->CodexText = FText::FromString(GetString(Object, TEXT("silhouette")));
		Creature->Tactic = ParseEnum<EKKTactic>(GetString(Object, TEXT("tactic")),
			TEXT("/Script/Kellerkind.EKKTactic"), EKKTactic::Direkt);

		Creature->MaxHealth = GetNumber(Object, TEXT("health"), 40.f);
		Creature->MoveSpeed = GetNumber(Object, TEXT("speed"), 300.f);
		Creature->SprintSpeed = GetNumber(Object, TEXT("sprint"), 520.f);
		Creature->AttackDamage = GetNumber(Object, TEXT("damage"), 1.f);
		Creature->AttackRange = GetNumber(Object, TEXT("range"), 160.f);
		Creature->AttackCooldown = GetNumber(Object, TEXT("cooldown"), 1.8f);
		Creature->DamageElement = ParseEnum<EKKElement>(GetString(Object, TEXT("element")),
			TEXT("/Script/Kellerkind.EKKElement"), EKKElement::Physisch);

		Creature->SightRange = GetNumber(Object, TEXT("sight"), 1800.f);
		Creature->SightHalfAngle = GetNumber(Object, TEXT("sightAngle"), 60.f) * 0.5f;
		Creature->SightWeight = GetNumber(Object, TEXT("sightWeight"), 1.f);
		Creature->HearingThreshold = GetNumber(Object, TEXT("hearing"), 0.2f);
		Creature->HearingWeight = GetNumber(Object, TEXT("hearingWeight"), 1.f);
		Creature->BloodSmellWeight = GetNumber(Object, TEXT("blood"), 0.f);
		Creature->LightReaction = GetNumber(Object, TEXT("light"), 0.f);
		Creature->MemorySeconds = GetNumber(Object, TEXT("memory"), 9.f);
		Creature->SpawnCost = GetInt(Object, TEXT("cost"), 1);

		const TArray<TSharedPtr<FJsonValue>>* Group = nullptr;
		if (Object->TryGetArrayField(TEXT("group"), Group) && Group->Num() == 2)
		{
			Creature->MinGroupSize = static_cast<int32>((*Group)[0]->AsNumber());
			Creature->MaxGroupSize = static_cast<int32>((*Group)[1]->AsNumber());
		}

		Creature->Floors.Reset();
		const TArray<TSharedPtr<FJsonValue>>* Floors = nullptr;
		if (Object->TryGetArrayField(TEXT("floors"), Floors))
		{
			for (const TSharedPtr<FJsonValue>& Floor : *Floors)
			{
				Creature->Floors.Add(ParseEnum<EKKFloor>(Floor->AsString(),
					TEXT("/Script/Kellerkind.EKKFloor"), EKKFloor::AlterKeller));
			}
		}

		const TSharedPtr<FJsonObject>* Brood = nullptr;
		if (Object->TryGetObjectField(TEXT("spawnOnDeath"), Brood))
		{
			Creature->SpawnOnDeathId = *GetString(*Brood, TEXT("id"));
			Creature->SpawnOnDeathCount = GetInt(*Brood, TEXT("count"), 0);
		}

		if (!bDryRun)
		{
			Creature->MarkPackageDirty();
		}
		++Count;
	}
	return Count;
}

int32 UKKContentImportCommandlet::ImportRooms()
{
	TSharedPtr<FJsonObject> Root;
	if (!LoadJson(TEXT("rooms.json"), Root))
	{
		++Failed;
		return 0;
	}

	const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
	if (!Root->TryGetArrayField(TEXT("rooms"), Entries))
	{
		return 0;
	}

	int32 Count = 0;
	for (const TSharedPtr<FJsonValue>& Entry : *Entries)
	{
		const TSharedPtr<FJsonObject> Object = Entry->AsObject();
		const FString Id = Object.IsValid() ? GetString(Object, TEXT("id")) : FString();
		if (Id.IsEmpty())
		{
			continue;
		}

		UKKRoomData* Room = Cast<UKKRoomData>(
			GetOrCreateAsset(UKKRoomData::StaticClass(), FString::Printf(TEXT("DA_Raum_%s"), *Id), TEXT("Raeume")));
		if (!Room)
		{
			continue;
		}

		Room->RoomId = *Id;
		Room->RoomType = ParseEnum<EKKRoomType>(GetString(Object, TEXT("type")),
			TEXT("/Script/Kellerkind.EKKRoomType"), EKKRoomType::Kampf);
		Room->DoorMask = static_cast<uint8>(GetInt(Object, TEXT("doors"), 15));
		Room->EnemyBudget = GetInt(Object, TEXT("budget"), 4);

		const TArray<TSharedPtr<FJsonValue>>* Grid = nullptr;
		if (Object->TryGetArrayField(TEXT("grid"), Grid) && Grid->Num() == 2)
		{
			Room->GridSize = FIntPoint(static_cast<int32>((*Grid)[0]->AsNumber()),
									   static_cast<int32>((*Grid)[1]->AsNumber()));
		}

		Room->Floors.Reset();
		const TArray<TSharedPtr<FJsonValue>>* Floors = nullptr;
		if (Object->TryGetArrayField(TEXT("floors"), Floors))
		{
			for (const TSharedPtr<FJsonValue>& Floor : *Floors)
			{
				Room->Floors.Add(ParseEnum<EKKFloor>(Floor->AsString(),
					TEXT("/Script/Kellerkind.EKKFloor"), EKKFloor::AlterKeller));
			}
		}

		if (!bDryRun)
		{
			Room->MarkPackageDirty();
		}
		++Count;
	}
	return Count;
}

int32 UKKContentImportCommandlet::ImportFloors()
{
	TSharedPtr<FJsonObject> Root;
	if (!LoadJson(TEXT("floors.json"), Root))
	{
		++Failed;
		return 0;
	}

	const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
	if (!Root->TryGetArrayField(TEXT("floors"), Entries))
	{
		return 0;
	}

	int32 Count = 0;
	for (const TSharedPtr<FJsonValue>& Entry : *Entries)
	{
		const TSharedPtr<FJsonObject> Object = Entry->AsObject();
		const FString Id = Object.IsValid() ? GetString(Object, TEXT("id")) : FString();
		if (Id.IsEmpty())
		{
			continue;
		}

		UKKFloorData* Floor = Cast<UKKFloorData>(
			GetOrCreateAsset(UKKFloorData::StaticClass(), FString::Printf(TEXT("DA_Etage_%s"), *Id), TEXT("Etagen")));
		if (!Floor)
		{
			continue;
		}

		Floor->Floor = ParseEnum<EKKFloor>(Id, TEXT("/Script/Kellerkind.EKKFloor"), EKKFloor::AlterKeller);
		Floor->DisplayName = FText::FromString(GetString(Object, TEXT("name")));

		const TArray<TSharedPtr<FJsonValue>>* Rooms = nullptr;
		if (Object->TryGetArrayField(TEXT("rooms"), Rooms) && Rooms->Num() == 2)
		{
			Floor->MinRooms = static_cast<int32>((*Rooms)[0]->AsNumber());
			Floor->MaxRooms = static_cast<int32>((*Rooms)[1]->AsNumber());
		}

		Floor->TreasureRooms = GetInt(Object, TEXT("treasure"), 1);
		Floor->ShopRooms = GetInt(Object, TEXT("shop"), 1);
		Floor->SecretRooms = GetInt(Object, TEXT("secret"), 1);
		Floor->SuperSecretRooms = GetInt(Object, TEXT("superSecret"), 1);
		Floor->MiniBossRooms = GetInt(Object, TEXT("miniBoss"), 1);
		Floor->ChallengeRooms = GetInt(Object, TEXT("challenge"), 1);
		Floor->SafeRooms = GetInt(Object, TEXT("safe"), 1);
		Floor->StoryRooms = GetInt(Object, TEXT("story"), 1);
		Floor->PuzzleRooms = GetInt(Object, TEXT("puzzle"), 1);
		Floor->EventRooms = GetInt(Object, TEXT("event"), 1);
		Floor->CursedRooms = GetInt(Object, TEXT("cursed"), 0);
		Floor->SacrificeRooms = GetInt(Object, TEXT("sacrifice"), 0);

		Floor->EnemyHealthScale = GetNumber(Object, TEXT("enemyHealth"), 1.f);
		Floor->EnemyDamageScale = GetNumber(Object, TEXT("enemyDamage"), 1.f);
		Floor->HorrorIntensity = GetNumber(Object, TEXT("horror"), 1.f);
		Floor->FogDensity = GetNumber(Object, TEXT("fogDensity"), 0.06f);
		Floor->AmbientLightScale = GetNumber(Object, TEXT("ambient"), 1.f);

		const TArray<TSharedPtr<FJsonValue>>* Fog = nullptr;
		if (Object->TryGetArrayField(TEXT("fog"), Fog) && Fog->Num() == 3)
		{
			Floor->FogColor = FLinearColor(
				static_cast<float>((*Fog)[0]->AsNumber()),
				static_cast<float>((*Fog)[1]->AsNumber()),
				static_cast<float>((*Fog)[2]->AsNumber()));
		}

		Object->TryGetBoolField(TEXT("altPath"), Floor->bHasAlternatePath);
		const FString AltTarget = GetString(Object, TEXT("altTarget"));
		if (!AltTarget.IsEmpty())
		{
			Floor->AlternateTarget = ParseEnum<EKKFloor>(AltTarget,
				TEXT("/Script/Kellerkind.EKKFloor"), EKKFloor::AlterKeller);
		}

		if (!bDryRun)
		{
			Floor->MarkPackageDirty();
		}
		++Count;
	}
	return Count;
}

void UKKContentImportCommandlet::SaveDirtyPackages()
{
	TArray<UPackage*> Dirty;
	for (TObjectIterator<UPackage> It; It; ++It)
	{
		UPackage* Package = *It;
		if (Package && Package->IsDirty() && Package->GetName().StartsWith(OutDir))
		{
			Dirty.Add(Package);
		}
	}

	for (UPackage* Package : Dirty)
	{
		const FString FileName = FPackageName::LongPackageNameToFilename(
			Package->GetName(), FPackageName::GetAssetPackageExtension());

		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		Args.SaveFlags = SAVE_NoError;

		if (!UPackage::SavePackage(Package, nullptr, *FileName, Args))
		{
			UE_LOG(LogKellerkind, Error, TEXT("Paket konnte nicht gespeichert werden: %s"), *Package->GetName());
			++Failed;
		}
	}
}

#endif // WITH_EDITOR
