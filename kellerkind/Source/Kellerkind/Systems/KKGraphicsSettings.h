#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameUserSettings.h"
#include "KKGraphicsSettings.generated.h"

UENUM(BlueprintType)
enum class EKKQualityPreset : uint8
{
	Low, Medium, High, Ultra, Cinematic, Benutzerdefiniert, MAX UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EKKUpscaler : uint8
{
	Aus			UMETA(DisplayName = "Aus (native Aufloesung)"),
	TSR			UMETA(DisplayName = "TSR (Unreal)"),
	DLSS		UMETA(DisplayName = "DLSS"),
	FSR			UMETA(DisplayName = "FSR"),
	XeSS		UMETA(DisplayName = "XeSS"),
	MAX			UMETA(Hidden)
};

/**
 * Grafikoptionen von KELLERKIND.
 *
 * Die fuenf Voreinstellungen setzen die Scalability-Gruppen aus DefaultScalability.ini;
 * darueber hinaus gibt es die Einzelschalter, die im Design gefordert sind. Sobald ein
 * Einzelwert veraendert wird, springt das Preset auf "Benutzerdefiniert".
 */
UCLASS(Config = GameUserSettings, configdonotcheckdefaults)
class KELLERKIND_API UKKGraphicsSettings : public UGameUserSettings
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintPure, Category = "Grafik")
	static UKKGraphicsSettings* GetKKSettings();

	UFUNCTION(BlueprintCallable, Category = "Grafik")
	void ApplyPreset(EKKQualityPreset Preset);

	UFUNCTION(BlueprintPure, Category = "Grafik")
	EKKQualityPreset GetPreset() const { return CurrentPreset; }

	// --- Einzeloptionen ---
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetFrameRateCap(int32 Fps);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetGlobalIlluminationQuality(int32 Level);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetReflectionQuality(int32 Level);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetFogQuality(int32 Level);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetUpscaler(EKKUpscaler Mode, float ScreenPercentage);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetAntiAliasingMode(int32 Mode);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetMotionBlurEnabled(bool bEnabled);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetFilmGrain(float Amount);
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetDepthOfFieldEnabled(bool bEnabled);

	/** Barrierefreiheit: Kameraatmung und Bildwackeln lassen sich vollstaendig abschalten. */
	UFUNCTION(BlueprintCallable, Category = "Grafik") void SetCameraShakeScale(float Scale);

	UFUNCTION(BlueprintPure, Category = "Grafik") float GetFilmGrain() const { return FilmGrain; }
	UFUNCTION(BlueprintPure, Category = "Grafik") float GetCameraShakeScale() const { return CameraShakeScale; }
	UFUNCTION(BlueprintPure, Category = "Grafik") EKKUpscaler GetUpscaler() const { return Upscaler; }

	virtual void ApplySettings(bool bCheckForCommandLineOverrides) override;

protected:
	UPROPERTY(Config) EKKQualityPreset CurrentPreset = EKKQualityPreset::High;
	UPROPERTY(Config) EKKUpscaler Upscaler = EKKUpscaler::TSR;
	UPROPERTY(Config) float FilmGrain = 0.35f;
	UPROPERTY(Config) float CameraShakeScale = 1.f;
	UPROPERTY(Config) bool bMotionBlur = true;
	UPROPERTY(Config) bool bDepthOfField = true;

	void MarkCustom();
	static void SetCVar(const TCHAR* Name, float Value);
	static void SetCVar(const TCHAR* Name, int32 Value);
};
