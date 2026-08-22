#include "AI/KKCreatureBase.h"
#include "AI/KKCreatureData.h"
#include "AI/KKPerceptionComponent.h"
#include "AI/KKSenseSubsystem.h"
#include "AI/KKAIController.h"
#include "Combat/KKStatusEffectComponent.h"
#include "Player/KKCharacter.h"
#include "Player/KKInventoryComponent.h"
#include "Core/KKGameInstance.h"
#include "Core/KKContentRegistry.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

#include "Components/AudioComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

AKKCreatureBase::AKKCreatureBase()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.05f;

	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	AIControllerClass = AKKAIController::StaticClass();

	Perception = CreateDefaultSubobject<UKKPerceptionComponent>(TEXT("Perception"));
	Status = CreateDefaultSubobject<UKKStatusEffectComponent>(TEXT("Status"));

	VoiceAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("Voice"));
	VoiceAudio->SetupAttachment(GetRootComponent());
	VoiceAudio->bAutoActivate = false;

	GetCapsuleComponent()->SetCollisionProfileName(TEXT("Pawn"));
	GetMesh()->SetCollisionProfileName(TEXT("CharacterMesh"));
	// Animationen laufen nur, wenn die Kreatur relevant ist - der Keller kann viele tragen.
	GetMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
}

void AKKCreatureBase::BeginPlay()
{
	Super::BeginPlay();

	if (Data)
	{
		ApplyCreatureData(Data);
	}
}

void AKKCreatureBase::ApplyCreatureData(UKKCreatureData* InData)
{
	if (!InData)
	{
		return;
	}
	Data = InData;

	MaxHealth = InData->MaxHealth;
	Health = MaxHealth;

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxWalkSpeed = InData->MoveSpeed;
	}

	if (Perception)
	{
		Perception->SightRange = InData->SightRange;
		Perception->SightHalfAngle = InData->SightHalfAngle;
		Perception->SightWeight = InData->SightWeight;
		Perception->HearingThreshold = InData->HearingThreshold;
		Perception->HearingWeight = InData->HearingWeight;
		Perception->BloodSmellWeight = InData->BloodSmellWeight;
		Perception->LightReaction = InData->LightReaction;
		Perception->MemorySeconds = InData->MemorySeconds;
	}

	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (!InData->Mesh.IsNull())
		{
			MeshComp->SetSkeletalMesh(InData->Mesh.LoadSynchronous());
		}
		if (!InData->AnimClass.IsNull())
		{
			MeshComp->SetAnimInstanceClass(InData->AnimClass.LoadSynchronous());
		}
		MeshComp->SetRelativeScale3D(InData->MeshScale);
	}
}

void AKKCreatureBase::ApplyDifficultyScale(float HealthScale, float InDamageScale)
{
	MaxHealth *= HealthScale;
	Health = MaxHealth;
	DamageScale = InDamageScale;
}

float AKKCreatureBase::GetHealthFraction() const
{
	return MaxHealth > 0.f ? FMath::Clamp(Health / MaxHealth, 0.f, 1.f) : 0.f;
}

bool AKKCreatureBase::IsHunting() const
{
	return bAlive && (AIState == EKKAIState::Jagd || AIState == EKKAIState::Angriff);
}

void AKKCreatureBase::SetAIState(EKKAIState NewState)
{
	if (AIState == NewState)
	{
		return;
	}

	AIState = NewState;

	if (Data)
	{
		if (NewState == EKKAIState::Jagd || NewState == EKKAIState::Alarm)
		{
			PlayCreatureSound(Data->AlertSound);
		}
	}
}

void AKKCreatureBase::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Tempo folgt den Zustaenden: unterkuehlte Kreaturen werden langsam, panische schnell.
	if (Status && Data)
	{
		const float Base = IsHunting() ? Data->SprintSpeed : Data->MoveSpeed;
		GetCharacterMovement()->MaxWalkSpeed = Base * Status->GetMoveSpeedMultiplier();
	}
}

int32 AKKCreatureBase::ReceiveDamage(const FKKDamageEvent& Event)
{
	if (!bAlive)
	{
		return 0;
	}

	float Amount = Event.Amount;

	if (Data)
	{
		if (const float* Modifier = Data->ElementModifiers.Find(Event.Element))
		{
			Amount *= *Modifier;
		}
	}

	if (Status)
	{
		Amount *= Status->GetElementVulnerability(Event.Element);
		Status->ReactToElement(Event.Element, Amount, Event.Instigator.Get());
	}

	Health -= Amount;

	if (Data)
	{
		PlayCreatureSound(Data->HurtSound);
	}

	// Verletzte Kreaturen bluten - das zieht alles an, was Blut riecht.
	BleedInto(Event.HitLocation, FMath::Clamp(Amount / FMath::Max(1.f, MaxHealth), 0.05f, 1.f));

	// Ein Treffer ist auch ein Hinweis: die Kreatur weiss jetzt, wo der Angreifer steht.
	if (Perception && Event.Instigator.IsValid())
	{
		Perception->ForceTarget(Event.Instigator.Get());
	}

	if (Health <= 0.f)
	{
		Die(Event.Instigator.Get());
	}

	return FMath::RoundToInt(Amount);
}

void AKKCreatureBase::BleedInto(const FVector& Location, float Strength)
{
	if (UKKSenseSubsystem* Senses = GetWorld()->GetSubsystem<UKKSenseSubsystem>())
	{
		Senses->LeaveBloodTrace(Location, Strength, this);
	}
}

void AKKCreatureBase::Die(AActor* Killer)
{
	if (!bAlive)
	{
		return;
	}

	bAlive = false;
	SetAIState(EKKAIState::Tot);

	if (Data)
	{
		PlayCreatureSound(Data->DeathSound);
	}

	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	// Ragdoll statt Sterbeanimation: Der Keller soll physisch wirken.
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		MeshComp->SetCollisionProfileName(TEXT("Ragdoll"));
		MeshComp->SetSimulatePhysics(true);
	}

	SpawnDeathBrood();

	if (AKKCharacter* Character = Cast<AKKCharacter>(Killer))
	{
		if (Character->GetInventory())
		{
			Character->GetInventory()->DispatchKill(this);
		}
	}

	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			++Run->EnemiesKilled;
		}
	}

	OnDied.Broadcast(this);
	SetLifeSpan(25.f);
}

void AKKCreatureBase::SpawnDeathBrood()
{
	if (!Data || Data->SpawnOnDeathId.IsNone() || Data->SpawnOnDeathCount <= 0)
	{
		return;
	}

	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKContentRegistry* Registry = GI ? GI->GetContent() : nullptr;
	UKKCreatureData* BroodData = Registry ? Registry->FindCreature(Data->SpawnOnDeathId) : nullptr;
	if (!BroodData || !BroodData->CreatureClass)
	{
		return;
	}

	for (int32 i = 0; i < Data->SpawnOnDeathCount; ++i)
	{
		const float Angle = (360.f / Data->SpawnOnDeathCount) * i;
		const FVector Offset = FRotator(0.f, Angle, 0.f).Vector() * 90.f;

		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

		if (AKKCreatureBase* Brood = GetWorld()->SpawnActor<AKKCreatureBase>(
			BroodData->CreatureClass, GetActorLocation() + Offset, GetActorRotation(), Params))
		{
			Brood->ApplyCreatureData(BroodData);
		}
	}
}

bool AKKCreatureBase::PerformAttack(AActor* AttackTarget)
{
	if (!bAlive || !AttackTarget || !Data)
	{
		return false;
	}

	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextAttackAt)
	{
		return false;
	}
	NextAttackAt = Now + Data->AttackCooldown;

	PlayCreatureSound(Data->AttackSound);

	if (FVector::Dist(GetActorLocation(), AttackTarget->GetActorLocation()) > Data->AttackRange * 1.3f)
	{
		// Ziel ist der Reichweite entkommen - der Angriff geht ins Leere.
		return false;
	}

	FKKDamageEvent Event;
	Event.Amount = Data->AttackDamage * DamageScale;
	Event.Element = Data->DamageElement;
	Event.SourceTag = Data->CreatureId;
	Event.Instigator = this;
	Event.HitLocation = AttackTarget->GetActorLocation();

	if (AKKCharacter* Character = Cast<AKKCharacter>(AttackTarget))
	{
		Character->ReceiveDamage(Event);
	}
	return true;
}

bool AKKCreatureBase::IsObservedByPlayer(float ScreenMargin) const
{
	const APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC)
	{
		return false;
	}

	// "Beobachtet" heisst: im Blickfeld UND nicht verdeckt. Beides muss stimmen, sonst
	// koennte sich Die Maske hinter einer Wand direkt vor dem Spieler bewegen.
	FVector2D ScreenPos;
	if (!PC->ProjectWorldLocationToScreen(GetActorLocation() + FVector(0.f, 0.f, 80.f), ScreenPos))
	{
		return false;
	}

	int32 SizeX = 0, SizeY = 0;
	PC->GetViewportSize(SizeX, SizeY);
	const float MarginX = SizeX * ScreenMargin;
	const float MarginY = SizeY * ScreenMargin;

	if (ScreenPos.X < -MarginX || ScreenPos.X > SizeX + MarginX ||
		ScreenPos.Y < -MarginY || ScreenPos.Y > SizeY + MarginY)
	{
		return false;
	}

	FVector ViewLocation;
	FRotator ViewRotation;
	PC->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KKObserved), false, this);
	Params.AddIgnoredActor(PC->GetPawn());
	const bool bBlocked = GetWorld()->LineTraceSingleByChannel(
		Hit, ViewLocation, GetActorLocation() + FVector(0.f, 0.f, 80.f), ECC_Visibility, Params);

	return !bBlocked;
}

void AKKCreatureBase::PlayCreatureSound(const TSoftObjectPtr<USoundBase>& Sound)
{
	if (Sound.IsNull() || !VoiceAudio)
	{
		return;
	}
	VoiceAudio->SetSound(Sound.LoadSynchronous());
	VoiceAudio->Play();
}
