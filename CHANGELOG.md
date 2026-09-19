# Changelog

## 1.0.1

Initial release.

- Expo Module wrapping the MapZone Alert View SDK for Expo SDK 57 / React Native 0.86.
- New Architecture only.
- Android (Kotlin) and iOS (Swift) modules.
- `setVoiceMode` is not exposed: the published native 1.0.1 binaries predate it. It
  will be added when the next native release ships.
- `canExportLogs()` / `exportLogs()` are async (`Promise`) — they wait on the native engine queue.
- Native binaries: Android JitPack `com.github.mapzone-global:mapzone-alert-view-android:1.0.1`,
  iOS CocoaPods `MapZoneAlertView 1.0.1`.
