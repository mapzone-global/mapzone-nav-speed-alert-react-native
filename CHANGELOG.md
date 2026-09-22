# Changelog

## 1.0.1 (2026-09-22)

- Fix: publish compiled `build/` output. `1.0.0` shipped without it, so
  `main`/`types` could not be resolved by Metro or TypeScript.

## 1.0.0 (2026-09-21)

Initial release.

- Expo Module wrapping the MapZone Alert View SDK — route-based speed-limit,
  camera, toll and restriction alerts with sign images and voice cues.
- Requires Expo SDK 57 / React Native 0.86, New Architecture only.
- Android (Kotlin) and iOS (Swift) modules.
- Native SDK: Android JitPack `com.github.mapzone-global:mapzone-alert-view-android:1.0.1`,
  iOS CocoaPods `MapZoneAlertView 1.0.1`.
