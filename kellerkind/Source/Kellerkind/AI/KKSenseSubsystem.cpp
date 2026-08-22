#include "AI/KKSenseSubsystem.h"
#include "AI/KKPerceptionComponent.h"
#include "Engine/World.h"

void UKKSenseSubsystem::RegisterListener(UKKPerceptionComponent* Listener)
{
	if (Listener)
	{
		Listeners.AddUnique(Listener);
	}
}

void UKKSenseSubsystem::UnregisterListener(UKKPerceptionComponent* Listener)
{
	Listeners.RemoveAll([Listener](const TWeakObjectPtr<UKKPerceptionComponent>& Entry)
	{
		return !Entry.IsValid() || Entry.Get() == Listener;
	});
}

void UKKSenseSubsystem::BroadcastStimulus(const FKKStimulus& Stimulus)
{
	for (int32 i = Listeners.Num() - 1; i >= 0; --i)
	{
		UKKPerceptionComponent* Listener = Listeners[i].Get();
		if (!Listener)
		{
			Listeners.RemoveAtSwap(i);
			continue;
		}

		const AActor* Owner = Listener->GetOwner();
		if (!Owner)
		{
			continue;
		}

		const float Distance = FVector::Dist(Owner->GetActorLocation(), Stimulus.Location);
		if (Distance > Stimulus.Radius)
		{
			continue;
		}

		// Lineare Daempfung reicht: Was zaehlt, ist die Reizschwelle der einzelnen Kreatur.
		FKKStimulus Local = Stimulus;
		Local.Strength = Stimulus.Strength * (1.f - Distance / FMath::Max(1.f, Stimulus.Radius));
		Listener->ReceiveStimulus(Local);
	}
}

void UKKSenseSubsystem::MakeNoise(const FVector& Location, float Strength, float Radius, AActor* Source)
{
	FKKStimulus Stimulus;
	Stimulus.Sense = EKKSense::Gehoer;
	Stimulus.Location = Location;
	Stimulus.Strength = Strength;
	Stimulus.Radius = Radius;
	Stimulus.Source = Source;
	Stimulus.TimeStamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	BroadcastStimulus(Stimulus);
}

void UKKSenseSubsystem::LeaveBloodTrace(const FVector& Location, float Strength, AActor* Source)
{
	FKKStimulus Stimulus;
	Stimulus.Sense = EKKSense::Blutgeruch;
	Stimulus.Location = Location;
	Stimulus.Strength = Strength;
	// Blut riecht weit, aber es fuehrt nur zum Ort - nicht zum Ziel.
	Stimulus.Radius = 2600.f;
	Stimulus.Source = Source;
	Stimulus.TimeStamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	BroadcastStimulus(Stimulus);
}

void UKKSenseSubsystem::RaiseAlarm(const FVector& Location, float Radius, AActor* Source)
{
	FKKStimulus Stimulus;
	Stimulus.Sense = EKKSense::Gehoer;
	Stimulus.Location = Location;
	Stimulus.Strength = 4.f;
	Stimulus.Radius = Radius;
	Stimulus.Source = Source;
	Stimulus.TimeStamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	BroadcastStimulus(Stimulus);
}
