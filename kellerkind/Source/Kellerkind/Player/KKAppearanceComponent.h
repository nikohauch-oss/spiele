#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KKAppearanceComponent.generated.h"

class UMaterialInstanceDynamic;
class UNiagaraComponent;
class UNiagaraSystem;

/** Eine optische Schicht auf Leon, z. B. "Brand", "Elektro", "Schatten", "Blut", "Maschine". */
USTRUCT(BlueprintType)
struct FKKAppearanceLayer
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	FName LayerId;

	/** Skalarparameter, die auf allen Koerpermaterialien hochgefahren werden. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	TMap<FName, float> ScalarTargets;

	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	TMap<FName, FLinearColor> ColorTargets;

	/** Partikel, die dauerhaft an Leon haengen (Rauch, Funken, Schattenfetzen). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	TSoftObjectPtr<UNiagaraSystem> AttachedEffect;

	UPROPERTY(EditAnywhere, BlueprintReadOnly)
	FName EffectSocket = TEXT("spine_03");

	/** Wie stark eine einzelne Stufe wirkt; mehrere Items derselben Schicht stapeln. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.05", ClampMax = "1.0"))
	float StepStrength = 0.34f;
};

/**
 * Uebersetzt den Build in Leons Aussehen.
 *
 * Regel: Jedes Item, das eine Schicht setzt, macht Leon sichtbar anders - aber nie so,
 * dass die Silhouette unlesbar wird. Schichten werden gestapelt und ueber die Zeit
 * eingeblendet, damit die Veraenderung waehrend des Runs spuerbar bleibt.
 */
UCLASS(ClassGroup = (Kellerkind), meta = (BlueprintSpawnableComponent))
class KELLERKIND_API UKKAppearanceComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKKAppearanceComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintCallable, Category = "Optik")
	void AddLayer(FName LayerId, float Amount = -1.f);

	UFUNCTION(BlueprintCallable, Category = "Optik")
	void RemoveLayer(FName LayerId);

	UFUNCTION(BlueprintPure, Category = "Optik")
	float GetLayerStrength(FName LayerId) const;

	/** Dreck, Naesse und Blut auf Kleidung - unabhaengig von Items, kommt aus der Welt. */
	UFUNCTION(BlueprintCallable, Category = "Optik")
	void AddGrime(float Dirt, float Wetness, float Blood);

	UPROPERTY(EditDefaultsOnly, Category = "Optik")
	TArray<FKKAppearanceLayer> LayerDefinitions;

private:
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> BodyMaterials;
	UPROPERTY() TMap<FName, TObjectPtr<UNiagaraComponent>> LayerEffects;

	/** Ziel- und Istwerte je Schicht; der Tick faehrt Ist auf Ziel zu. */
	TMap<FName, float> TargetStrength;
	TMap<FName, float> CurrentStrength;

	float Dirt = 0.f;
	float Wetness = 0.f;
	float Blood = 0.f;

	const FKKAppearanceLayer* FindDefinition(FName LayerId) const;
	void PushToMaterials();
};
