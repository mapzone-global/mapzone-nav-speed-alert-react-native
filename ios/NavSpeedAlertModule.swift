import ExpoModulesCore

// Placeholder so the pod has a source file. The real module (mirroring
// android/.../NavSpeedAlertModule.kt) lands with the iOS phase, which
// requires Xcode >= 26.4 (Expo SDK 57).
public class NavSpeedAlertModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NavSpeedAlert")
  }
}
