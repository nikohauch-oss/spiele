using UnrealBuildTool;

public class Kellerkind : ModuleRules
{
	public Kellerkind(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"GameplayTags",
			"GameplayTasks",
			"AIModule",
			"NavigationSystem",
			"Niagara",
			"UMG",
			"SignificanceManager"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"RenderCore",
			"Json",
			"JsonUtilities",
			"DeveloperSettings",
			"AudioMixer",
			"PhysicsCore"
		});

		PublicIncludePaths.Add(ModuleDirectory);
	}
}
