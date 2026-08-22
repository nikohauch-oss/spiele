#include "Systems/KKGraphicsSettings.h"
#include "Kellerkind.h"
#include "HAL/IConsoleManager.h"
#include "Engine/Engine.h"

UKKGraphicsSettings* UKKGraphicsSettings::GetKKSettings()
{
	return Cast<UKKGraphicsSettings>(UGameUserSettings::GetGameUserSettings());
}

void UKKGraphicsSettings::SetCVar(const TCHAR* Name, float Value)
{
	if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
	{
		Var->Set(Value, ECVF_SetByGameSetting);
	}
}

void UKKGraphicsSettings::SetCVar(const TCHAR* Name, int32 Value)
{
	if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
	{
		Var->Set(Value, ECVF_SetByGameSetting);
	}
}

void UKKGraphicsSettings::MarkCustom()
{
	CurrentPreset = EKKQualityPreset::Benutzerdefiniert;
}

void UKKGraphicsSettings::ApplyPreset(EKKQualityPreset Preset)
{
	CurrentPreset = Preset;

	if (Preset == EKKQualityPreset::Benutzerdefiniert)
	{
		return;
	}

	const int32 Level = FMath::Clamp(static_cast<int32>(Preset), 0, 4);

	// Die Gruppen selbst stehen in DefaultScalability.ini - hier wird nur umgeschaltet.
	ScalabilityQuality.SetFromSingleQualityLevel(Level);

	// Zwei Dinge haengen nicht an der Scalability-Gruppe, sind fuer die Optik des Kellers
	// aber entscheidend: Nebeldichte und Aufloesungsskalierung.
	switch (Preset)
	{
	case EKKQualityPreset::Low:
		SetUpscaler(EKKUpscaler::TSR, 60.f);
		SetCVar(TEXT("r.VolumetricFog"), 0);
		break;
	case EKKQualityPreset::Medium:
		SetUpscaler(EKKUpscaler::TSR, 70.f);
		SetCVar(TEXT("r.VolumetricFog"), 1);
		SetCVar(TEXT("r.VolumetricFog.GridPixelSize"), 16.f);
		break;
	case EKKQualityPreset::High:
		SetUpscaler(EKKUpscaler::TSR, 80.f);
		SetCVar(TEXT("r.VolumetricFog"), 1);
		SetCVar(TEXT("r.VolumetricFog.GridPixelSize"), 8.f);
		break;
	case EKKQualityPreset::Ultra:
		SetUpscaler(EKKUpscaler::TSR, 100.f);
		SetCVar(TEXT("r.VolumetricFog.GridPixelSize"), 8.f);
		break;
	case EKKQualityPreset::Cinematic:
		SetUpscaler(EKKUpscaler::Aus, 100.f);
		SetCVar(TEXT("r.VolumetricFog.GridPixelSize"), 4.f);
		SetCVar(TEXT("r.Lumen.Reflections.HardwareRayTracing"), 1);
		break;
	default:
		break;
	}

	// Der Preset-Wechsel darf die persoenlichen Schalter nicht ueberschreiben.
	CurrentPreset = Preset;
	ApplySettings(false);

	UE_LOG(LogKellerkind, Log, TEXT("Grafik-Preset gesetzt: %d"), static_cast<int32>(Preset));
}

void UKKGraphicsSettings::SetFrameRateCap(int32 Fps)
{
	SetFrameRateLimit(Fps <= 0 ? 0.f : static_cast<float>(Fps));
}

void UKKGraphicsSettings::SetGlobalIlluminationQuality(int32 Level)
{
	ScalabilityQuality.GlobalIlluminationQuality = FMath::Clamp(Level, 0, 4);
	MarkCustom();
}

void UKKGraphicsSettings::SetReflectionQuality(int32 Level)
{
	ScalabilityQuality.ReflectionQuality = FMath::Clamp(Level, 0, 4);
	MarkCustom();
}

void UKKGraphicsSettings::SetFogQuality(int32 Level)
{
	// 0 schaltet den volumetrischen Nebel ab. Da der Keller stark davon lebt,
	// bleibt auf Stufe 1 ein grober Nebel erhalten statt gar keiner.
	SetCVar(TEXT("r.VolumetricFog"), Level > 0 ? 1 : 0);
	SetCVar(TEXT("r.VolumetricFog.GridPixelSize"), static_cast<float>(FMath::Clamp(20 - Level * 4, 4, 20)));
	MarkCustom();
}

void UKKGraphicsSettings::SetUpscaler(EKKUpscaler Mode, float ScreenPercentage)
{
	Upscaler = Mode;
	SetCVar(TEXT("r.ScreenPercentage"), FMath::Clamp(ScreenPercentage, 33.f, 100.f));

	switch (Mode)
	{
	case EKKUpscaler::Aus: SetCVar(TEXT("r.AntiAliasingMethod"), 2); break;
	case EKKUpscaler::TSR: SetCVar(TEXT("r.AntiAliasingMethod"), 4); break;
	default:
		// DLSS, FSR und XeSS kommen ueber ihre Plugins; hier wird nur der Wunsch abgelegt,
		// den das jeweilige Plugin beim Start liest.
		break;
	}
}

void UKKGraphicsSettings::SetAntiAliasingMode(int32 Mode)
{
	SetCVar(TEXT("r.AntiAliasingMethod"), FMath::Clamp(Mode, 0, 4));
	MarkCustom();
}

void UKKGraphicsSettings::SetMotionBlurEnabled(bool bEnabled)
{
	bMotionBlur = bEnabled;
	SetCVar(TEXT("r.DefaultFeature.MotionBlur"), bEnabled ? 1 : 0);
	SetCVar(TEXT("r.MotionBlurQuality"), bEnabled ? 4 : 0);
}

void UKKGraphicsSettings::SetFilmGrain(float Amount)
{
	FilmGrain = FMath::Clamp(Amount, 0.f, 1.f);
	SetCVar(TEXT("r.FilmGrain"), FilmGrain > 0.f ? 1 : 0);
	SetCVar(TEXT("r.FilmGrainIntensity"), FilmGrain);
}

void UKKGraphicsSettings::SetDepthOfFieldEnabled(bool bEnabled)
{
	bDepthOfField = bEnabled;
	SetCVar(TEXT("r.DepthOfFieldQuality"), bEnabled ? 4 : 0);
}

void UKKGraphicsSettings::SetCameraShakeScale(float Scale)
{
	CameraShakeScale = FMath::Clamp(Scale, 0.f, 1.f);
}

void UKKGraphicsSettings::ApplySettings(bool bCheckForCommandLineOverrides)
{
	Super::ApplySettings(bCheckForCommandLineOverrides);

	// Persoenliche Schalter nach jedem Anwenden erneut setzen, damit sie eine
	// Preset-Aenderung ueberleben.
	SetMotionBlurEnabled(bMotionBlur);
	SetFilmGrain(FilmGrain);
	SetDepthOfFieldEnabled(bDepthOfField);
}
