#pragma once

#include "CoreMinimal.h"
#include "KKTypes.generated.h"

/** Schadensarten. Jedes Element hat eine eigene Statuswirkung und eigene Synergie-Regeln. */
UENUM(BlueprintType)
enum class EKKElement : uint8
{
	Physisch	UMETA(DisplayName = "Physisch"),
	Feuer		UMETA(DisplayName = "Feuer"),
	Elektro		UMETA(DisplayName = "Elektrizitaet"),
	Blut		UMETA(DisplayName = "Blut"),
	Gift		UMETA(DisplayName = "Gift"),
	Frost		UMETA(DisplayName = "Frost"),
	Schatten	UMETA(DisplayName = "Schatten"),
	Psyche		UMETA(DisplayName = "Psychisch"),
	MAX			UMETA(Hidden)
};

/** Umgebungs-/Koerperzustaende, die Elemente hinterlassen und aufeinander reagieren lassen. */
UENUM(BlueprintType)
enum class EKKStatus : uint8
{
	Keiner		UMETA(DisplayName = "Keiner"),
	Nass		UMETA(DisplayName = "Nass"),
	Brennend	UMETA(DisplayName = "Brennend"),
	Elektrisiert UMETA(DisplayName = "Elektrisiert"),
	Vergiftet	UMETA(DisplayName = "Vergiftet"),
	Blutend		UMETA(DisplayName = "Blutend"),
	Unterkuehlt	UMETA(DisplayName = "Unterkuehlt"),
	Markiert	UMETA(DisplayName = "Markiert"),
	Panisch		UMETA(DisplayName = "Panisch"),
	Oelig		UMETA(DisplayName = "Oelig"),
	MAX			UMETA(Hidden)
};

/** Herztypen des KELLERKIND-Herzsystems. Reihenfolge = Schadensreihenfolge (siehe KKHealthComponent). */
UENUM(BlueprintType)
enum class EKKHeartType : uint8
{
	Rot			UMETA(DisplayName = "Rotes Herz"),
	Blau		UMETA(DisplayName = "Blaues Herz"),
	Schwarz		UMETA(DisplayName = "Schwarzes Herz"),
	Weiss		UMETA(DisplayName = "Weisses Herz"),
	MAX			UMETA(Hidden)
};

/** Die zehn Kernwerte von Leon. */
UENUM(BlueprintType)
enum class EKKStat : uint8
{
	Damage				UMETA(DisplayName = "Schaden"),
	AttackSpeed			UMETA(DisplayName = "Angriffstempo"),
	MoveSpeed			UMETA(DisplayName = "Bewegungstempo"),
	Range				UMETA(DisplayName = "Reichweite"),
	CritChance			UMETA(DisplayName = "Kritische Chance"),
	Luck				UMETA(DisplayName = "Glueck"),
	Armor				UMETA(DisplayName = "Ruestung"),
	MaxHP				UMETA(DisplayName = "Maximale Herzcontainer"),
	Dodge				UMETA(DisplayName = "Ausweichen"),
	InteractionSpeed	UMETA(DisplayName = "Interaktionstempo"),
	MAX					UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKItemCategory : uint8
{
	Passiv			UMETA(DisplayName = "Passiv"),
	Aktiv			UMETA(DisplayName = "Aktives Item"),
	Begleiter		UMETA(DisplayName = "Begleiter"),
	Orbital			UMETA(DisplayName = "Orbital"),
	Waffe			UMETA(DisplayName = "Waffe"),
	Verflucht		UMETA(DisplayName = "Verflucht"),
	Relikt			UMETA(DisplayName = "Legendaeres Relikt"),
	Verbrauch		UMETA(DisplayName = "Verbrauchsgegenstand"),
	Quest			UMETA(DisplayName = "Questgegenstand"),
	MAX				UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKItemPool : uint8
{
	Schatzraum, Laden, Bossbelohnung, Teufelspakt, Engelsraum, Geheimraum,
	Opferraum, Challenge, Kellerkind, Start, MAX UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKRoomType : uint8
{
	Start			UMETA(DisplayName = "Startraum"),
	Kampf			UMETA(DisplayName = "Kampfraum"),
	Schatz			UMETA(DisplayName = "Schatzraum"),
	Haendler		UMETA(DisplayName = "Haendlerraum"),
	Geheim			UMETA(DisplayName = "Geheimraum"),
	SuperGeheim		UMETA(DisplayName = "Super-Geheimraum"),
	Raetsel			UMETA(DisplayName = "Raetselraum"),
	Story			UMETA(DisplayName = "Storyraum"),
	SafeRoom		UMETA(DisplayName = "Safe Room"),
	Challenge		UMETA(DisplayName = "Challenge Room"),
	MiniBoss		UMETA(DisplayName = "Mini-Boss-Raum"),
	Verflucht		UMETA(DisplayName = "Verfluchter Raum"),
	Opfer			UMETA(DisplayName = "Opferraum"),
	Event			UMETA(DisplayName = "Eventraum"),
	Boss			UMETA(DisplayName = "Bossraum"),
	Treppe			UMETA(DisplayName = "Treppenraum"),
	MAX				UMETA(Hidden)
};

/** Himmelsrichtungen des Raumgitters. Tuerplaetze liegen immer auf diesen vier Kanten. */
UENUM(BlueprintType)
enum class EKKDir : uint8
{
	Nord, Ost, Sued, West, MAX UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKFloor : uint8
{
	AlterKeller		UMETA(DisplayName = "1 - Der alte Keller"),
	Versorgung		UMETA(DisplayName = "2 - Die Versorgung"),
	Kinderreich		UMETA(DisplayName = "3 - Das Kinderreich"),
	Siedlung		UMETA(DisplayName = "4 - Die vergessene Siedlung"),
	Fleischtiefe	UMETA(DisplayName = "5 - Die Fleischtiefe"),
	Abgrund			UMETA(DisplayName = "6 - Der Abgrund"),
	Nest			UMETA(DisplayName = "7 - Das Nest"),
	MAX				UMETA(Hidden)
};

/** Etagenfluch. Wird beim Betreten einer Etage gewuerfelt (Chance steigt mit Tiefe). */
UENUM(BlueprintType)
enum class EKKCurse : uint8
{
	Keiner			UMETA(DisplayName = "Kein Fluch"),
	Dunkelheit		UMETA(DisplayName = "Fluch der Dunkelheit"),
	Stimmen			UMETA(DisplayName = "Fluch der Stimmen"),
	Gedaechtnis		UMETA(DisplayName = "Fluch des Gedaechtnisses"),
	Tueren			UMETA(DisplayName = "Fluch der Tueren"),
	Kind			UMETA(DisplayName = "Fluch des Kindes"),
	Blut			UMETA(DisplayName = "Fluch des Blutes"),
	MAX				UMETA(Hidden)
};

/** KI-Zustaende. Jede Kreatur durchlaeuft dieselbe Kette, aber mit eigenen Zeiten und Reizschwellen. */
UENUM(BlueprintType)
enum class EKKAIState : uint8
{
	Idle			UMETA(DisplayName = "Ruhe"),
	Patrouille		UMETA(DisplayName = "Patrouille"),
	Untersuchen		UMETA(DisplayName = "Untersuchen"),
	Suchen			UMETA(DisplayName = "Suchen"),
	Alarm			UMETA(DisplayName = "Alarm"),
	Jagd			UMETA(DisplayName = "Jagd"),
	Angriff			UMETA(DisplayName = "Angriff"),
	Rueckzug		UMETA(DisplayName = "Rueckzug"),
	Lauern			UMETA(DisplayName = "Lauern"),
	Tot				UMETA(DisplayName = "Tot"),
	MAX				UMETA(Hidden)
};

/** Sinneskanaele. Kreaturen gewichten sie unterschiedlich (Die Blinden hoeren, Der Kellerhund riecht Blut). */
UENUM(BlueprintType)
enum class EKKSense : uint8
{
	Sicht, Gehoer, Blutgeruch, Licht, Bewegung, MAX UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKEnding : uint8
{
	Keines, Flucht, Kellerkind, Opfer, Wahrheit, DasTor, Geheim, MAX UMETA(Hidden)
};

/** Ein Stat-Modifikator eines Items. Additiv und multiplikativ werden getrennt verrechnet. */
USTRUCT(BlueprintType)
struct FKKStatMod
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	EKKStat Stat = EKKStat::Damage;

	/** Flach addiert, bevor Multiplikatoren greifen. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	float Additive = 0.f;

	/** 0.2 = +20 %. Alle Multiplikatoren eines Stats werden summiert, dann einmal angewendet. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	float Multiplier = 0.f;
};

/** Ein einzelner Schadensvorgang. Wandert unveraendert durch Waffe -> Synergie-Hooks -> Ziel. */
USTRUCT(BlueprintType)
struct FKKDamageEvent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	float Amount = 0.f;

	UPROPERTY(BlueprintReadWrite)
	EKKElement Element = EKKElement::Physisch;

	UPROPERTY(BlueprintReadWrite)
	bool bCritical = false;

	/** Ausloeser: Nahkampf, Projektil, Orbital, Begleiter, Umgebung, Kettenreaktion. */
	UPROPERTY(BlueprintReadWrite)
	FName SourceTag = NAME_None;

	/** Nur C++: schwacher Zeiger auf den Verursacher. */
	UPROPERTY()
	TWeakObjectPtr<AActor> Instigator = nullptr;

	UPROPERTY(BlueprintReadWrite)
	FVector HitLocation = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	FVector HitNormal = FVector::UpVector;

	/** Verhindert Endlosschleifen bei Kettenblitz / Explosionsketten. */
	UPROPERTY(BlueprintReadWrite)
	int32 ChainDepth = 0;
};

/** Ein Sinnesreiz, den der Horror-Director oder eine Aktion in die Welt schreibt. */
USTRUCT(BlueprintType)
struct FKKStimulus
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	EKKSense Sense = EKKSense::Gehoer;

	UPROPERTY(BlueprintReadWrite)
	FVector Location = FVector::ZeroVector;

	/** 0..1. Wird ueber die Distanz gedaempft und gegen die Reizschwelle der Kreatur geprueft. */
	UPROPERTY(BlueprintReadWrite)
	float Strength = 1.f;

	UPROPERTY(BlueprintReadWrite)
	float Radius = 1200.f;

	/** Nur C++: schwacher Zeiger auf die Quelle des Reizes. */
	UPROPERTY()
	TWeakObjectPtr<AActor> Source = nullptr;

	UPROPERTY(BlueprintReadWrite)
	double TimeStamp = 0.0;
};

/** Gitterkoordinate einer Etage. */
USTRUCT(BlueprintType)
struct FKKGridCoord
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	int32 X = 0;

	UPROPERTY(BlueprintReadWrite)
	int32 Y = 0;

	FKKGridCoord() = default;
	FKKGridCoord(int32 InX, int32 InY) : X(InX), Y(InY) {}

	FKKGridCoord Offset(EKKDir Dir) const
	{
		switch (Dir)
		{
		case EKKDir::Nord: return FKKGridCoord(X, Y - 1);
		case EKKDir::Ost:  return FKKGridCoord(X + 1, Y);
		case EKKDir::Sued: return FKKGridCoord(X, Y + 1);
		default:           return FKKGridCoord(X - 1, Y);
		}
	}

	bool operator==(const FKKGridCoord& Other) const { return X == Other.X && Y == Other.Y; }
};

FORCEINLINE uint32 GetTypeHash(const FKKGridCoord& C)
{
	return HashCombine(::GetTypeHash(C.X), ::GetTypeHash(C.Y));
}

namespace KKDir
{
	FORCEINLINE EKKDir Opposite(EKKDir Dir)
	{
		switch (Dir)
		{
		case EKKDir::Nord: return EKKDir::Sued;
		case EKKDir::Ost:  return EKKDir::West;
		case EKKDir::Sued: return EKKDir::Nord;
		default:           return EKKDir::Ost;
		}
	}

	static constexpr EKKDir All[4] = { EKKDir::Nord, EKKDir::Ost, EKKDir::Sued, EKKDir::West };
}
