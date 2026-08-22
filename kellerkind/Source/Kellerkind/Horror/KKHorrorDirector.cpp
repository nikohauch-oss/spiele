#include "Horror/KKHorrorDirector.h"
#include "Horror/KKKellerkindStalker.h"
#include "Player/KKCharacter.h"
#include "Player/KKHealthComponent.h"
#include "Player/KKFearComponent.h"
#include "Player/KKStealthComponent.h"
#include "AI/KKCreatureBase.h"
#include "Core/KKGameSettings.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"

void UKKHorrorDirector::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Stream.Initialize(FMath::Rand());
}

TStatId UKKHorrorDirector::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UKKHorrorDirector, STATGROUP_Tickables);
}

void UKKHorrorDirector::ConfigureEvents(const TArray<TSubclassOf<UKKHorrorEvent>>& EventClasses)
{
	Events.Reset();
	for (const TSubclassOf<UKKHorrorEvent>& Class : EventClasses)
	{
		if (!Class)
		{
			continue;
		}
		UKKHorrorEvent* Event = NewObject<UKKHorrorEvent>(this, Class);
		Event->Initialize(this);
		Events.Add(Event);
	}

	UE_LOG(LogKKHorror, Log, TEXT("Horror-Director bereit: %d Ereignisse."), Events.Num());
}

void UKKHorrorDirector::NotifyRoomEntered(EKKRoomType RoomType)
{
	CurrentRoomType = RoomType;
	TimeInRoom = 0.f;

	// Im Safe Room schweigt der Director - dort soll der Spieler wirklich Luft holen.
	// Genau deshalb wirkt es spaeter, wenn sich ein Safe Room doch einmal veraendert.
	if (RoomType == EKKRoomType::SafeRoom)
	{
		Tension = FMath::Min(Tension, 0.15f);
	}
}

FKKHorrorContext UKKHorrorDirector::BuildContext() const
{
	FKKHorrorContext Context;

	AKKCharacter* Character = Cast<AKKCharacter>(UGameplayStatics::GetPlayerPawn(GetWorld(), 0));
	if (!Character)
	{
		return Context;
	}

	Context.Player = Character;
	Context.PlayerLocation = Character->GetActorLocation();
	Context.ViewDirection = Character->GetControlRotation().Vector();
	Context.RoomType = CurrentRoomType;
	Context.TimeInRoom = TimeInRoom;
	Context.EventsSoFar = EventCount;

	if (const UKKHealthComponent* Health = Character->GetHealth())
	{
		Context.HealthFraction = Health->GetHealthFraction();
	}
	if (const UKKFearComponent* Fear = Character->GetFear())
	{
		Context.Fear = Fear->GetFear();
	}
	if (const UKKStealthComponent* Stealth = Character->FindComponentByClass<UKKStealthComponent>())
	{
		Context.LightLevel = Stealth->GetLightLevel();
	}
	if (const UKKGameInstance* GI = Character->GetGameInstance<UKKGameInstance>())
	{
		if (const UKKRunState* Run = GI->GetRunState())
		{
			Context.Floor = Run->GetFloor();
		}
	}

	for (TActorIterator<AKKCreatureBase> It(GetWorld()); It; ++It)
	{
		const AKKCreatureBase* Creature = *It;
		if (Creature && Creature->IsAlive() &&
			FVector::DistSquared(Creature->GetActorLocation(), Context.PlayerLocation) < FMath::Square(2200.f))
		{
			++Context.NearbyEnemies;
		}
	}

	return Context;
}

void UKKHorrorDirector::UpdateTension(const FKKHorrorContext& Context, float DeltaTime)
{
	const UKKGameSettings& Settings = UKKGameSettings::Get();

	// Spannung waechst mit der Zeit im Raum, mit Dunkelheit und mit niedrigem Leben.
	float Gain = 0.02f * FloorIntensity;
	Gain += (1.f - Context.LightLevel) * 0.015f;
	Gain += (1.f - Context.HealthFraction) * 0.02f;
	Gain += FMath::Min(Context.TimeInRoom / 60.f, 1.f) * 0.02f;

	// Wo gekaempft wird, baut sich keine Horrorspannung auf - das macht der Kampf selbst.
	if (Context.NearbyEnemies > 0)
	{
		Gain = 0.f;
		Tension = FMath::Max(0.f, Tension - Settings.HorrorTensionDecayPerSecond * DeltaTime * 0.05f);
	}

	Tension = FMath::Clamp(Tension + Gain * DeltaTime, 0.f, 1.f);
}

bool UKKHorrorDirector::IsJumpscareAllowed() const
{
	const float Budget = UKKGameSettings::Get().JumpscareBudget;
	if (EventCount < 8)
	{
		// Zu Beginn eines Runs gar keiner: Der Keller muss erst glaubwuerdig werden.
		return false;
	}
	return (static_cast<float>(JumpscareCount + 1) / static_cast<float>(EventCount + 1)) <= Budget;
}

bool UKKHorrorDirector::TrySelectAndRun(const FKKHorrorContext& Context)
{
	TArray<UKKHorrorEvent*> Candidates;
	TArray<float> Scores;
	float Total = 0.f;

	for (UKKHorrorEvent* Event : Events)
	{
		if (!Event)
		{
			continue;
		}
		if (Event->bIsJumpscare && !IsJumpscareAllowed())
		{
			continue;
		}

		const float Score = Event->ScoreFor(Context);
		if (Score <= 0.f)
		{
			continue;
		}

		Candidates.Add(Event);
		Scores.Add(Score);
		Total += Score;
	}

	if (Candidates.Num() == 0)
	{
		return false;
	}

	float Pick = Stream.FRandRange(0.f, Total);
	UKKHorrorEvent* Chosen = Candidates.Last();
	for (int32 i = 0; i < Candidates.Num(); ++i)
	{
		Pick -= Scores[i];
		if (Pick <= 0.f)
		{
			Chosen = Candidates[i];
			break;
		}
	}

	Chosen->Execute(Context);
	Chosen->ReadyAt = GetWorld()->GetTimeSeconds() + Chosen->Cooldown;
	++Chosen->TimesUsed;

	++EventCount;
	if (Chosen->bIsJumpscare)
	{
		++JumpscareCount;
	}

	// Nach einem Ereignis faellt die Spannung deutlich - der Rhythmus beginnt von vorn.
	Tension = FMath::Max(0.f, Tension - 0.55f);

	if (const UKKGameInstance* GI = GetWorld()->GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->HorrorEventCounts.FindOrAdd(Chosen->EventId) += 1;
		}
	}

	OnHorrorEvent.Broadcast(Chosen->EventId);
	UE_LOG(LogKKHorror, Log, TEXT("Horrorereignis: %s (Spannung war %.2f)"), *Chosen->EventId.ToString(), Tension);
	return true;
}

void UKKHorrorDirector::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!bActive || Events.Num() == 0)
	{
		return;
	}

	TimeInRoom += DeltaTime;

	const FKKHorrorContext Context = BuildContext();
	if (!Context.Player.IsValid())
	{
		return;
	}

	UpdateTension(Context, DeltaTime);

	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextEventEarliest)
	{
		return;
	}

	// Die Spannung bestimmt die Wahrscheinlichkeit, nicht den Zeitpunkt: Auch bei hoher
	// Spannung kann es einmal ruhig bleiben - das haelt den Keller unberechenbar.
	const float Chance = FMath::Pow(Tension, 2.f) * DeltaTime * 0.8f * FloorIntensity;
	if (Stream.FRand() > Chance)
	{
		return;
	}

	if (TrySelectAndRun(Context))
	{
		const UKKGameSettings& Settings = UKKGameSettings::Get();
		NextEventEarliest = Now + Settings.HorrorBaseCooldown * Stream.FRandRange(0.6f, 1.4f);
	}
}

bool UKKHorrorDirector::TriggerEvent(FName EventId)
{
	const FKKHorrorContext Context = BuildContext();

	for (UKKHorrorEvent* Event : Events)
	{
		if (Event && Event->EventId == EventId)
		{
			Event->Execute(Context);
			++Event->TimesUsed;
			++EventCount;
			if (Event->bIsJumpscare)
			{
				++JumpscareCount;
			}
			OnHorrorEvent.Broadcast(EventId);
			return true;
		}
	}
	return false;
}

void UKKHorrorDirector::PlayDeathSequence(AKKCharacter* Character)
{
	bActive = false;

	// Kurze Horrorsequenz, Schwarzbild, ein Satz einer Kinderstimme - danach die Auswertung.
	if (DeathLines.Num() > 0)
	{
		const FText& Line = DeathLines[Stream.RandRange(0, DeathLines.Num() - 1)];
		UE_LOG(LogKKHorror, Log, TEXT("Todessequenz: \"%s\""), *Line.ToString());
	}

	if (UKKGameInstance* GI = GetWorld()->GetGameInstance<UKKGameInstance>())
	{
		GI->EndRun(false);
	}
}
