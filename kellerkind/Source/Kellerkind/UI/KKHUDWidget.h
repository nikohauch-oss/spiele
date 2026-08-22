#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Core/KKTypes.h"
#include "Level/KKFloorGenerator.h"
#include "KKHUDWidget.generated.h"

class AKKCharacter;
class UKKItemData;
class UTexture2D;

/** Ein Eintrag der kleinen Karte. */
USTRUCT(BlueprintType)
struct FKKMapCell
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FKKGridCoord Coord;
	UPROPERTY(BlueprintReadOnly) EKKRoomType Type = EKKRoomType::Kampf;
	UPROPERTY(BlueprintReadOnly) bool bVisited = false;
	UPROPERTY(BlueprintReadOnly) bool bCurrent = false;

	/** Bekannt, aber noch nicht betreten - so entsteht das schrittweise Kartenbild. */
	UPROPERTY(BlueprintReadOnly) bool bKnown = false;
};

/**
 * Basis fuer das HUD.
 *
 * Das HUD zeigt nur, was das Design vorsieht: Herzen, Schluessel, Bomben, Kellermarken,
 * aktives Item und die kleine Karte. Alles Weitere - Schaden, Trefferzahlen, Questmarker -
 * bleibt bewusst weg, damit der Blick im Raum bleibt und nicht am Bildschirmrand.
 */
UCLASS(Abstract)
class KELLERKIND_API UKKHUDWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	virtual void NativeConstruct() override;

	UFUNCTION(BlueprintPure, Category = "HUD") int32 GetHalfHearts(EKKHeartType Type) const;
	UFUNCTION(BlueprintPure, Category = "HUD") int32 GetHeartContainers() const;
	UFUNCTION(BlueprintPure, Category = "HUD") int32 GetKeys() const;
	UFUNCTION(BlueprintPure, Category = "HUD") int32 GetBombs() const;
	UFUNCTION(BlueprintPure, Category = "HUD") int32 GetKellermarken() const;
	UFUNCTION(BlueprintPure, Category = "HUD") UKKItemData* GetActiveItem() const;
	UFUNCTION(BlueprintPure, Category = "HUD") float GetActiveCooldownFraction() const;
	UFUNCTION(BlueprintPure, Category = "HUD") TArray<UKKItemData*> GetCollectedItems() const;

	/** Karte der aktuellen Etage - unter dem Fluch des Gedaechtnisses bleibt sie leer. */
	UFUNCTION(BlueprintPure, Category = "HUD") TArray<FKKMapCell> GetMapCells() const;

	UFUNCTION(BlueprintPure, Category = "HUD") float GetFear() const;

	/** Blendet den Interaktionstext am Fadenkreuz ein. */
	UFUNCTION(BlueprintImplementableEvent, Category = "HUD")
	void OnFocusPrompt(const FText& Prompt);

	/** Kurzes Einblenden bei Item-Aufnahme oder aktivierter Synergie. */
	UFUNCTION(BlueprintImplementableEvent, Category = "HUD")
	void OnItemBanner(const FText& Title, const FText& Subtitle, UTexture2D* Icon);

protected:
	UFUNCTION() void HandleFocusChanged(AActor* Focus, const FText& Prompt);
	UFUNCTION() void HandleItemAdded(UKKItemData* Item);
	UFUNCTION() void HandleSynergyActivated(class UKKSynergyData* Synergy);

	AKKCharacter* GetPlayer() const;
};
