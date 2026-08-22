using UnrealBuildTool;

public class KellerkindEditorTarget : TargetRules
{
	public KellerkindEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		CppStandard = CppStandardVersion.Cpp20;
		ExtraModuleNames.Add("Kellerkind");
	}
}
