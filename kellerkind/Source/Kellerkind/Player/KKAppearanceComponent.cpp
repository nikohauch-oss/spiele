#include "Player/KKAppearanceComponent.h"
#include "GameFramework/Character.h"
#include "Components/SkeletalMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"

UKKAppearanceComponent::UKKAppearanceComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.1f;
}

void UKKAppearanceComponent::BeginPlay()
{
	Super::BeginPlay();

	if (const ACharacter* Character = Cast<ACharacter>(GetOwner()))
	{
		if (USkeletalMeshComponent* Mesh = Character->GetMesh())
		{
			const int32 Num = Mesh->GetNumMaterials();
			BodyMaterials.Reserve(Num);
			for (int32 i = 0; i < Num; ++i)
			{
				BodyMaterials.Add(Mesh->CreateAndSetMaterialInstanceDynamic(i));
			}
		}
	}
}

const FKKAppearanceLayer* UKKAppearanceComponent::FindDefinition(FName LayerId) const
{
	return LayerDefinitions.FindByPredicate([LayerId](const FKKAppearanceLayer& L) { return L.LayerId == LayerId; });
}

void UKKAppearanceComponent::AddLayer(FName LayerId, float Amount)
{
	const FKKAppearanceLayer* Definition = FindDefinition(LayerId);
	const float Step = (Amount > 0.f) ? Amount : (Definition ? Definition->StepStrength : 0.34f);

	float& Target = TargetStrength.FindOrAdd(LayerId);
	Target = FMath::Clamp(Target + Step, 0.f, 1.f);

	if (Definition && !Definition->AttachedEffect.IsNull() && !LayerEffects.Contains(LayerId))
	{
		if (const ACharacter* Character = Cast<ACharacter>(GetOwner()))
		{
			UNiagaraComponent* Effect = UNiagaraFunctionLibrary::SpawnSystemAttached(
				Definition->AttachedEffect.LoadSynchronous(), Character->GetMesh(), Definition->EffectSocket,
				FVector::ZeroVector, FRotator::ZeroRotator, EAttachLocation::SnapToTarget, false);
			LayerEffects.Add(LayerId, Effect);
		}
	}
}

void UKKAppearanceComponent::RemoveLayer(FName LayerId)
{
	TargetStrength.Remove(LayerId);

	if (TObjectPtr<UNiagaraComponent>* Effect = LayerEffects.Find(LayerId))
	{
		if (*Effect)
		{
			(*Effect)->Deactivate();
		}
		LayerEffects.Remove(LayerId);
	}
}

float UKKAppearanceComponent::GetLayerStrength(FName LayerId) const
{
	const float* Found = CurrentStrength.Find(LayerId);
	return Found ? *Found : 0.f;
}

void UKKAppearanceComponent::AddGrime(float InDirt, float InWetness, float InBlood)
{
	Dirt = FMath::Clamp(Dirt + InDirt, 0.f, 1.f);
	Wetness = FMath::Clamp(Wetness + InWetness, 0.f, 1.f);
	Blood = FMath::Clamp(Blood + InBlood, 0.f, 1.f);
}

void UKKAppearanceComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	bool bDirty = false;

	// Schichten wachsen langsam ein - ein aufgenommenes Item veraendert Leon sichtbar,
	// aber nicht schlagartig.
	for (const TPair<FName, float>& Pair : TargetStrength)
	{
		float& Current = CurrentStrength.FindOrAdd(Pair.Key);
		if (!FMath::IsNearlyEqual(Current, Pair.Value, 0.005f))
		{
			Current = FMath::FInterpTo(Current, Pair.Value, DeltaTime, 1.6f);
			bDirty = true;
		}
	}

	// Naesse trocknet, Blut bleibt bis zum Etagenende.
	if (Wetness > 0.f)
	{
		Wetness = FMath::Max(0.f, Wetness - DeltaTime * 0.02f);
		bDirty = true;
	}

	if (bDirty)
	{
		PushToMaterials();
	}
}

void UKKAppearanceComponent::PushToMaterials()
{
	for (UMaterialInstanceDynamic* Material : BodyMaterials)
	{
		if (!Material)
		{
			continue;
		}

		Material->SetScalarParameterValue(TEXT("Dirt"), Dirt);
		Material->SetScalarParameterValue(TEXT("Wetness"), Wetness);
		Material->SetScalarParameterValue(TEXT("Blood"), Blood);

		for (const TPair<FName, float>& Pair : CurrentStrength)
		{
			const FKKAppearanceLayer* Definition = FindDefinition(Pair.Key);
			if (!Definition)
			{
				// Ohne Definition wird die Schicht direkt als Skalar mit ihrem Namen gesetzt.
				Material->SetScalarParameterValue(Pair.Key, Pair.Value);
				continue;
			}

			for (const TPair<FName, float>& Scalar : Definition->ScalarTargets)
			{
				Material->SetScalarParameterValue(Scalar.Key, Scalar.Value * Pair.Value);
			}
			for (const TPair<FName, FLinearColor>& Color : Definition->ColorTargets)
			{
				Material->SetVectorParameterValue(Color.Key, Color.Value * Pair.Value);
			}
		}
	}

	for (const TPair<FName, TObjectPtr<UNiagaraComponent>>& Pair : LayerEffects)
	{
		if (Pair.Value)
		{
			Pair.Value->SetFloatParameter(TEXT("Strength"), GetLayerStrength(Pair.Key));
		}
	}
}
