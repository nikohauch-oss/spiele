#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Core/KKTypes.h"
#include "KKRunState.generated.h"

class UKKItemData;

/** Was der Spieler waehrend eines Runs mit sich traegt und was der Run ueber sich selbst weiss. */
UCLASS(BlueprintType)
class KELLERKIND_API UKKRunState : public UObject
{
	GENERATED_BODY()

public:
	/** Setzt den Run auf Anfang und verankert alle Zufallsstroeme im Seed. */
	void StartRun(int32 InSeed, FName InCharacterId);

	UFUNCTION(BlueprintPure, Category = "Run") int32 GetSeed() const { return Seed; }
	UFUNCTION(BlueprintPure, Category = "Run") EKKFloor GetFloor() const { return CurrentFloor; }
	UFUNCTION(BlueprintPure, Category = "Run") EKKCurse GetCurse() const { return CurrentCurse; }
	UFUNCTION(BlueprintPure, Category = "Run") FName GetCharacterId() const { return CharacterId; }
	UFUNCTION(BlueprintPure, Category = "Run") double GetRunTime() const { return RunTimeSeconds; }

	void SetFloor(EKKFloor InFloor) { CurrentFloor = InFloor; }
	void SetCurse(EKKCurse InCurse) { CurrentCurse = InCurse; }
	void AddRunTime(double Delta) { RunTimeSeconds += Delta; }

	/**
	 * Getrennte Zufallsstroeme: Wenn der Spieler einen Raum anders spielt, soll sich der
	 * Item-Pool des naechsten Schatzraums nicht verschieben. Deshalb hat jedes System
	 * seinen eigenen Stream, alle abgeleitet aus demselben Run-Seed.
	 */
	FRandomStream& LayoutStream() { return Layout; }
	FRandomStream& ItemStream() { return Items; }
	FRandomStream& EnemyStream() { return Enemies; }
	FRandomStream& EventStream() { return Events; }
	FRandomStream& HorrorStream() { return Horror; }

	// --- Ressourcen ---
	UPROPERTY(BlueprintReadWrite, Category = "Run") int32 Kellermarken = 0;
	UPROPERTY(BlueprintReadWrite, Category = "Run") int32 Keys = 0;
	UPROPERTY(BlueprintReadWrite, Category = "Run") int32 Bombs = 0;

	// --- Statistik fuer Run-Auswertung und Das Andere Kind ---
	UPROPERTY(BlueprintReadOnly, Category = "Run") int32 RoomsCleared = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Run") int32 EnemiesKilled = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Run") int32 DamageTaken = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Run") int32 SecretsFound = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Run") int32 BossesKilled = 0;

	/** Gesammelte Items in Aufnahmereihenfolge (wichtig fuer Synergie-Reihenfolge und Auswertung). */
	UPROPERTY(BlueprintReadOnly, Category = "Run") TArray<TObjectPtr<UKKItemData>> CollectedItems;

	/** Item-IDs, die in diesem Run bereits vergeben wurden - kein Item erscheint zweimal. */
	UPROPERTY() TSet<FName> ConsumedItemIds;

	/**
	 * Nutzungszaehler pro Aktionstyp. Das Andere Kind liest diese Tabelle in Phase 3 aus
	 * und imitiert die drei am haeufigsten genutzten Faehigkeiten des Spielers.
	 */
	UPROPERTY() TMap<FName, int32> AbilityUsage;

	void RecordAbilityUse(FName AbilityTag, int32 Count = 1);
	TArray<FName> GetTopAbilities(int32 Num) const;

	/** Zaehlt Horrorereignisse pro Typ, damit sich der Director nicht wiederholt. */
	UPROPERTY() TMap<FName, int32> HorrorEventCounts;

private:
	UPROPERTY() int32 Seed = 0;
	UPROPERTY() FName CharacterId = TEXT("Leon");
	UPROPERTY() EKKFloor CurrentFloor = EKKFloor::AlterKeller;
	UPROPERTY() EKKCurse CurrentCurse = EKKCurse::Keiner;
	UPROPERTY() double RunTimeSeconds = 0.0;

	FRandomStream Layout;
	FRandomStream Items;
	FRandomStream Enemies;
	FRandomStream Events;
	FRandomStream Horror;
};
