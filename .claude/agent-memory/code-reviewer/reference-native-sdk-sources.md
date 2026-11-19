---
name: native-sdk-sources
description: Where to verify native MapZone Alert View SDK API facts (Swift/Java source checkout, pod swiftinterface location) when reviewing the Expo wrapper
metadata:
  type: reference
---

Native SDK source checkout (sibling repo): `/Users/nguyentoan/App/map_sdk/alert-view-sdk`
- iOS: `ios/AlertViewSDK/AlertViewSDK/{AlertViewManager,AlertViewBridge,VoiceAlertType}.swift`
- Android: `android/alert-view-sdk/src/main/java/com/vietmap/alert_view_sdk/`
- Note: its `main` is AHEAD of the published 1.0.1 binaries (has VoiceMode); check `git log` on a file before trusting it for 1.0.1 behavior.

Published pod 1.0.1 swiftinterface (readable, not under node_modules):
`example/ios/Pods/MapZoneAlertView/AlertViewSDK.xcframework/ios-arm64/AlertViewSDK.framework/Modules/AlertViewSDK.swiftmodule/arm64-apple-ios.swiftinterface`
- swiftinterface OMITS enum raw values for non-@objc enums; `VoiceAlertType` raw values 3..21 were confirmed from source (`triggerValue == rawValue`), not from the interface.

ExpoModulesCore Swift API (SDK 57) swiftinterface:
`example/ios/Pods/ExpoModulesCore/ExpoModulesCore.xcframework/ios-arm64/ExpoModulesCore.framework/Modules/ExpoModulesCore.swiftmodule/arm64-apple-ios.swiftinterface`

Native threading facts that matter for reviews: all native callbacks fire on main thread via a process-wide singleton `AlertViewBridge.shared`; `setExtraHeaders/setExtraBodyFields/canExportLogs/exportLogs` do `queue.sync` on the engine queue where segment fetches block up to 15 s.
