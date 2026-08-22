using UnrealBuildTool;

public class KellerkindTarget : TargetRules
{
	public KellerkindTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		CppStandard = CppStandardVersion.Cpp20;
		ExtraModuleNames.Add("Kellerkind");
	}
}
