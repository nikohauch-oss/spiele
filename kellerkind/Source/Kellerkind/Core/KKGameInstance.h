#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "Core/KKTypes.h"
#include "KKGameInstance.generated.h"

class UKKRunState;
class UKKSaveGame;
class UKKContentRegistry;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKKOnUnlock, FName, UnlockId);

/**
 * Ueberlebt Level-Wechsel und haelt damit den laufenden Run zusammen, waehrend
 * einzelne Etagen als eigene Level gestreamt werden.
 */
UCLASS()
class KELLERKIND_API UKKGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	virtual void Init() override;
	virtual void Shutdown() override;

	UFUNCTION(BlueprintPure, Category = "Kellerkind") UKKRunState* GetRunState() const { return RunState; }
	UFUNCTION(BlueprintPure, Category = "Kellerkind") UKKSaveGame* GetSave() const { return Save; }
	UFUNCTION(BlueprintPure, Category = "Kellerkind") UKKContentRegistry* GetContent() const { return Content; }

	/** Startet einen neuen Run. Seed <= 0 erzeugt einen zufaelligen Seed. */
	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	UKKRunState* BeginRun(int32 Seed = 0, FName CharacterId = TEXT("Leon"));

	/** Beendet den Run, schreibt Statistiken in das Profil und speichert. */
	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	void EndRun(bool bVictory, EKKEnding Ending = EKKEnding::Keines);

	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	void Unlock(FName UnlockId, EKKItemCategory Category);

	UFUNCTION(BlueprintCallable, Category = "Kellerkind")
	void SaveProfile();

	UPROPERTY(BlueprintAssignable, Category = "Kellerkind")
	FKKOnUnlock OnUnlock;

private:
	UPROPERTY() TObjectPtr<UKKRunState> RunState = nullptr;
	UPROPERTY() TObjectPtr<UKKSaveGame> Save = nullptr;
	UPROPERTY() TObjectPtr<UKKContentRegistry> Content = nullptr;

	void LoadProfile();
};
