#include "Level/KKBreakableWall.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "NiagaraFunctionLibrary.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "Core/KKGameInstance.h"
#include "Core/KKRunState.h"

AKKBreakableWall::AKKBreakableWall()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	SetRootComponent(Mesh);
}

void AKKBreakableWall::Break(AActor* Breaker)
{
	if (bBroken)
	{
		return;
	}
	bBroken = true;

	if (!DebrisEffect.IsNull())
	{
		UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), DebrisEffect.LoadSynchronous(), GetActorLocation());
	}
	if (!BreakSound.IsNull())
	{
		UGameplayStatics::PlaySoundAtLocation(this, BreakSound.LoadSynchronous(), GetActorLocation());
	}

	if (bLeadsToSecret)
	{
		if (const UKKGameInstance* GI = GetGameInstance<UKKGameInstance>())
		{
			if (UKKRunState* Run = GI->GetRunState())
			{
				++Run->SecretsFound;
			}
		}
	}

	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetVisibility(false);
}

void AKKBreakableWall::Reveal()
{
	if (UMaterialInstanceDynamic* Material = Mesh->CreateAndSetMaterialInstanceDynamic(0))
	{
		// Der Hinweis ist bewusst subtil: die Risse leuchten nicht, sie werden nur deutlicher.
		Material->SetScalarParameterValue(TEXT("CrackVisibility"), 1.f);
	}
}
