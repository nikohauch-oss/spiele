#include "Player/KKCharacter.h"
#include "Player/KKStatsComponent.h"
#include "Player/KKHealthComponent.h"
#include "Player/KKInventoryComponent.h"
#include "Player/KKAppearanceComponent.h"
#include "Player/KKFearComponent.h"
#include "Player/KKInteractionComponent.h"
#include "Player/KKStealthComponent.h"
#include "Combat/KKStatusEffectComponent.h"
#include "Combat/KKWeapon.h"
#include "Combat/KKDamageLibrary.h"
#include "AI/KKCreatureBase.h"
#include "AI/KKSenseSubsystem.h"
#include "Horror/KKHorrorDirector.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"
#include "Kellerkind.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"

AKKCharacter::AKKCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(38.f, 92.f);

	// Voller Koerper, auch aus der Ich-Perspektive sichtbar: kein separates Arm-Mesh.
	GetMesh()->SetRelativeLocationAndRotation(FVector(0.f, 0.f, -92.f), FRotator(0.f, -90.f, 0.f));
	GetMesh()->SetCastShadow(true);
	GetMesh()->bCastHiddenShadow = true;
	GetMesh()->SetOwnerNoSee(false);
	GetMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPose;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetMesh(), CameraSocket);
	Camera->bUsePawnControlRotation = false;
	Camera->SetFieldOfView(92.f);

	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = false;
	Move->MaxWalkSpeed = 380.f;
	Move->MaxWalkSpeedCrouched = 170.f;
	Move->JumpZVelocity = 420.f;
	Move->AirControl = 0.25f;
	Move->BrakingDecelerationWalking = 2400.f;
	Move->SetCrouchedHalfHeight(56.f);
	Move->GetNavAgentPropertiesRef().bCanCrouch = true;
	Move->NavAgentProps.bCanCrouch = true;

	bUseControllerRotationYaw = true;
	bUseControllerRotationPitch = true;

	Stats = CreateDefaultSubobject<UKKStatsComponent>(TEXT("Stats"));
	Health = CreateDefaultSubobject<UKKHealthComponent>(TEXT("Health"));
	Inventory = CreateDefaultSubobject<UKKInventoryComponent>(TEXT("Inventory"));
	Appearance = CreateDefaultSubobject<UKKAppearanceComponent>(TEXT("Appearance"));
	Fear = CreateDefaultSubobject<UKKFearComponent>(TEXT("Fear"));
	Interaction = CreateDefaultSubobject<UKKInteractionComponent>(TEXT("Interaction"));
	Stealth = CreateDefaultSubobject<UKKStealthComponent>(TEXT("Stealth"));
	Status = CreateDefaultSubobject<UKKStatusEffectComponent>(TEXT("Status"));
}

void AKKCharacter::BeginPlay()
{
	Super::BeginPlay();

	CombatStream.Initialize(GetUniqueID() ^ 0x1b873593);

	if (Health)
	{
		Health->OnDeath.AddDynamic(this, &AKKCharacter::HandleDeath);
		Health->OnHeartLost.AddDynamic(this, &AKKCharacter::HandleHeartLost);
	}
	if (Stats)
	{
		ApplyMovementSpeed();
	}

	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
			ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (DefaultMapping)
			{
				Subsystem->AddMappingContext(DefaultMapping, 0);
			}
		}
	}
}

void AKKCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		return;
	}

	if (IA_Move)			{ Input->BindAction(IA_Move, ETriggerEvent::Triggered, this, &AKKCharacter::Input_Move); }
	if (IA_Look)			{ Input->BindAction(IA_Look, ETriggerEvent::Triggered, this, &AKKCharacter::Input_Look); }
	if (IA_Jump)			{ Input->BindAction(IA_Jump, ETriggerEvent::Started, this, &ACharacter::Jump); }
	if (IA_Sprint)			{ Input->BindAction(IA_Sprint, ETriggerEvent::Started, this, &AKKCharacter::Input_SprintStart);
							  Input->BindAction(IA_Sprint, ETriggerEvent::Completed, this, &AKKCharacter::Input_SprintStop); }
	if (IA_Crouch)			{ Input->BindAction(IA_Crouch, ETriggerEvent::Started, this, &AKKCharacter::Input_CrouchToggle); }
	if (IA_Attack)			{ Input->BindAction(IA_Attack, ETriggerEvent::Started, this, &AKKCharacter::Input_Attack); }
	if (IA_HeavyAttack)		{ Input->BindAction(IA_HeavyAttack, ETriggerEvent::Started, this, &AKKCharacter::Input_HeavyAttack); }
	if (IA_Block)			{ Input->BindAction(IA_Block, ETriggerEvent::Triggered, this, &AKKCharacter::Input_Block);
							  Input->BindAction(IA_Block, ETriggerEvent::Completed, this, &AKKCharacter::Input_Block); }
	if (IA_Dodge)			{ Input->BindAction(IA_Dodge, ETriggerEvent::Started, this, &AKKCharacter::Input_Dodge); }
	if (IA_Interact)		{ Input->BindAction(IA_Interact, ETriggerEvent::Started, this, &AKKCharacter::Input_Interact); }
	if (IA_UseActive)		{ Input->BindAction(IA_UseActive, ETriggerEvent::Started, this, &AKKCharacter::Input_UseActive); }
	if (IA_Bomb)			{ Input->BindAction(IA_Bomb, ETriggerEvent::Started, this, &AKKCharacter::Input_PlaceBomb); }
	if (IA_Throw)			{ Input->BindAction(IA_Throw, ETriggerEvent::Started, this, &AKKCharacter::Input_Throw); }
}

void AKKCharacter::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	UpdateStance(DeltaTime);
	UpdateFootstepNoise(DeltaTime);

	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->AddRunTime(DeltaTime);
		}
	}
}

// --- Bewegung --------------------------------------------------------------

void AKKCharacter::Input_Move(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (Axis.IsNearlyZero())
	{
		return;
	}

	const FRotator YawOnly(0.f, GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(YawOnly).GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(FRotationMatrix(YawOnly).GetUnitAxis(EAxis::Y), Axis.X);
}

void AKKCharacter::Input_Look(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(-Axis.Y);
}

void AKKCharacter::Input_SprintStart()
{
	// Sprinten im Kriechen ist nicht moeglich - Leon muss sich erst aufrichten.
	if (Stance == EKKStance::Kriechend)
	{
		return;
	}
	bSprinting = true;
	ApplyMovementSpeed();
}

void AKKCharacter::Input_SprintStop()
{
	bSprinting = false;
	ApplyMovementSpeed();
}

void AKKCharacter::Input_CrouchToggle()
{
	if (Stance == EKKStance::Stehend)
	{
		Stance = EKKStance::Geduckt;
		Crouch();
	}
	else
	{
		Stance = EKKStance::Stehend;
		UnCrouch();
	}
	ApplyMovementSpeed();
}

void AKKCharacter::ApplyMovementSpeed()
{
	if (!Stats)
	{
		return;
	}

	float Speed = Stats->GetStat(EKKStat::MoveSpeed);

	switch (Stance)
	{
	case EKKStance::Geduckt:   Speed *= CrouchMultiplier; break;
	case EKKStance::Kriechend: Speed *= CrawlMultiplier; break;
	default: break;
	}

	if (bSprinting && Stance == EKKStance::Stehend)
	{
		Speed *= SprintMultiplier;
	}
	if (bBlocking)
	{
		Speed *= 0.6f;
	}
	if (Status)
	{
		Speed *= Status->GetMoveSpeedMultiplier();
	}

	GetCharacterMovement()->MaxWalkSpeed = Speed;
	GetCharacterMovement()->MaxWalkSpeedCrouched = Speed;
}

void AKKCharacter::UpdateStance(float DeltaTime)
{
	if (bSprinting && GetVelocity().SizeSquared2D() < 100.f)
	{
		bSprinting = false;
		ApplyMovementSpeed();
	}
}

void AKKCharacter::UpdateFootstepNoise(float DeltaTime)
{
	const float Speed2D = GetVelocity().Size2D();
	if (Speed2D < 10.f || GetCharacterMovement()->IsFalling())
	{
		FootstepTimer = 0.f;
		return;
	}

	FootstepTimer -= DeltaTime;
	if (FootstepTimer > 0.f)
	{
		return;
	}

	// Schrittabstand und Lautstaerke haengen direkt am Tempo - Schleichen ist deshalb
	// keine Sonderregel, sondern ergibt sich aus der Bewegung.
	FootstepTimer = FMath::GetMappedRangeValueClamped(FVector2D(120.f, 600.f), FVector2D(0.62f, 0.32f), Speed2D);

	float Strength = FMath::GetMappedRangeValueClamped(FVector2D(120.f, 600.f), FVector2D(0.15f, 1.f), Speed2D);
	if (Stance != EKKStance::Stehend)
	{
		Strength *= 0.35f;
	}
	if (Stealth)
	{
		Strength *= Stealth->GetNoiseMultiplier();
	}

	EmitNoise(Strength, 300.f + Strength * 1500.f, GetActorLocation());
}

void AKKCharacter::Input_Dodge()
{
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextDodgeAt)
	{
		return;
	}
	NextDodgeAt = Now + DodgeCooldown;

	FVector Dir = GetVelocity().GetSafeNormal2D();
	if (Dir.IsNearlyZero())
	{
		Dir = -GetActorForwardVector();
	}

	LaunchCharacter(Dir * DodgeImpulse + FVector(0.f, 0.f, 150.f), true, false);

	if (Health)
	{
		Health->GrantInvulnerability(DodgeIFrames);
	}
	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->RecordAbilityUse(TEXT("Ausweichen"));
		}
	}
}

// --- Kampf -----------------------------------------------------------------

void AKKCharacter::Input_Attack()
{
	if (Weapon)
	{
		Weapon->TryAttack(false);
	}
}

void AKKCharacter::Input_HeavyAttack()
{
	if (Weapon)
	{
		Weapon->TryAttack(true);
	}
}

void AKKCharacter::Input_Block(const FInputActionValue& Value)
{
	bBlocking = Value.Get<bool>();
	ApplyMovementSpeed();
}

void AKKCharacter::Input_Interact()
{
	if (Interaction)
	{
		Interaction->TryInteract();
	}
}

void AKKCharacter::Input_UseActive()
{
	if (Inventory)
	{
		Inventory->UseActiveItem();
	}
}

void AKKCharacter::Input_PlaceBomb()
{
	const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>();
	UKKRunState* Run = GI ? GI->GetRunState() : nullptr;
	if (!Run || Run->Bombs <= 0)
	{
		return;
	}

	--Run->Bombs;
	UKKDamageLibrary::SpawnBomb(this, GetActorLocation() + GetActorForwardVector() * 90.f);
	Run->RecordAbilityUse(TEXT("Bombe"));
}

void AKKCharacter::Input_Throw()
{
	if (Interaction)
	{
		Interaction->ThrowHeldObject();
	}
}

AKKWeapon* AKKCharacter::EquipWeapon(TSubclassOf<AKKWeapon> WeaponClass)
{
	if (!WeaponClass)
	{
		return nullptr;
	}

	AKKWeapon* Previous = Weapon;

	FActorSpawnParameters Params;
	Params.Owner = this;
	Params.Instigator = this;
	Weapon = GetWorld()->SpawnActor<AKKWeapon>(WeaponClass, GetActorTransform(), Params);

	if (Weapon)
	{
		Weapon->AttachToComponent(GetMesh(), FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("hand_r_weapon"));
		Weapon->SetWielder(this);
	}

	if (Previous)
	{
		Previous->SetWielder(nullptr);
		Previous->Destroy();
	}
	return Previous;
}

void AKKCharacter::DealDamage(AActor* Target, float BaseAmount, EKKElement Element, FName SourceTag,
	const FVector& HitLocation, const FVector& HitNormal, int32 ChainDepth)
{
	if (!Target || !Stats)
	{
		return;
	}

	FKKDamageEvent Event;
	Event.Amount = BaseAmount * Stats->GetStat(EKKStat::Damage);
	Event.Element = Element;
	Event.SourceTag = SourceTag;
	Event.Instigator = this;
	Event.HitLocation = HitLocation;
	Event.HitNormal = HitNormal;
	Event.ChainDepth = ChainDepth;
	Event.bCritical = Stats->RollCrit(CombatStream);

	if (Event.bCritical)
	{
		Event.Amount *= 2.f;
	}

	// Items und Synergien duerfen Betrag, Element und Zusatzwirkung noch veraendern.
	if (Inventory)
	{
		Inventory->DispatchPreDealDamage(Event, Target);
	}

	int32 Dealt = 0;
	if (AKKCreatureBase* Creature = Cast<AKKCreatureBase>(Target))
	{
		Dealt = Creature->ReceiveDamage(Event);
	}

	if (Inventory)
	{
		Inventory->DispatchPostDealDamage(Event, Target);
	}

	if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
	{
		if (UKKRunState* Run = GI->GetRunState())
		{
			Run->RecordAbilityUse(SourceTag);
		}
	}
}

int32 AKKCharacter::ReceiveDamage(FKKDamageEvent Event)
{
	if (bBlocking)
	{
		// Blocken halbiert den Schaden und schluckt Rueckstoss, verhindert aber nichts vollstaendig.
		Event.Amount *= 0.5f;
	}

	if (Inventory)
	{
		Inventory->DispatchPreTakeDamage(Event);
	}

	const int32 Lost = Health ? Health->ApplyDamage(Event) : 0;

	if (Lost > 0)
	{
		if (Fear)
		{
			Fear->AddFear(0.25f * Lost);
		}
		if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
		{
			if (UKKRunState* Run = GI->GetRunState())
			{
				Run->DamageTaken += Lost;
			}
		}
	}
	return Lost;
}

void AKKCharacter::HandleHeartLost(EKKHeartType Heart)
{
	if (Inventory)
	{
		Inventory->DispatchHeartLost(Heart);
	}
}

void AKKCharacter::HandleDeath()
{
	UE_LOG(LogKellerkind, Log, TEXT("Leon ist gestorben."));

	if (UKKHorrorDirector* Director = GetWorld()->GetSubsystem<UKKHorrorDirector>())
	{
		Director->PlayDeathSequence(this);
	}

	GetCharacterMovement()->DisableMovement();
	if (Weapon)
	{
		Weapon->SetWielder(nullptr);
	}
}

// --- Wahrnehmung -----------------------------------------------------------

void AKKCharacter::EmitNoise(float Strength, float Radius, const FVector& Location)
{
	if (UKKSenseSubsystem* Senses = GetWorld()->GetSubsystem<UKKSenseSubsystem>())
	{
		FKKStimulus Stimulus;
		Stimulus.Sense = EKKSense::Gehoer;
		Stimulus.Location = Location;
		Stimulus.Strength = Strength;
		Stimulus.Radius = Radius;
		Stimulus.Source = this;
		Stimulus.TimeStamp = GetWorld()->GetTimeSeconds();
		Senses->BroadcastStimulus(Stimulus);
	}
}

float AKKCharacter::GetVisibility() const
{
	float Visibility = 1.f;

	if (Stealth)
	{
		Visibility *= Stealth->GetVisibilityMultiplier();
	}

	switch (Stance)
	{
	case EKKStance::Geduckt:   Visibility *= 0.6f; break;
	case EKKStance::Kriechend: Visibility *= 0.4f; break;
	default: break;
	}

	// Wer rennt, ist auch im Dunkeln gut zu erkennen.
	const float SpeedFactor = FMath::GetMappedRangeValueClamped(
		FVector2D(0.f, 600.f), FVector2D(0.75f, 1.35f), GetVelocity().Size2D());

	return FMath::Clamp(Visibility * SpeedFactor, 0.f, 2.f);
}
