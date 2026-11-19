# Changelog

## 2.0.0

Moves to native MapZone Alert View SDK **2.0.1**.

- `configure()` now signs a user in and returns `Promise<void>`: await it
  before `start()`; it rejects with the native reason (and applies nothing)
  when an input is refused.
- `ConfigureOptions`: `identity` replaces `vehicleId`; `vehicleType` is the new
  `AlertVehicleType` enum with server codes (`CAR` 1, `TAXI` 2, `BUS` 3,
  `COACH` 4, `TRUCK` 5, `MOTORCYCLE` 7); `weightsTons` replaces `weights`
  (same unit, tonnes); optional `metadata` object.
- New `logout()`, resolving with `{ success, errorCode, errorMessage }`; it
  reaches native in call order with `configure()` / `start()` / `onLocation()`.
- `setSegmentUrl()`, `setExtraHeaders()` and `setExtraBodyFields()` throw with
  the native reason instead of returning it; `setSegmentUrl()` accepts
  `https://` only.
- New `setVoiceMode(VoiceMode)` (`FULL` / `DING`) and `setVoiceSpeed(speed)`.
- New `AlertViewError` constants; error codes reorganised by the native SDK
  (`2006`, `2008`, `-6`, `-8`, …).
- `onLocation()` rounds a fractional `fixTimeMillis` and throws on a
  non-finite one.
- Road-closed and vehicle-restricted restriction slots now carry a sign.
- The no-parking / no-stopping (`stop`) sign shows at any speed; only its voice
  still waits until the vehicle is slow.

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
