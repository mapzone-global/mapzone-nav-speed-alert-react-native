# @mapzone/nav-speed-alert

Expo Module for React Native that wraps the **MapZone Alert View SDK**: route-based
speed-limit, camera, toll and restriction alerts for a navigation session. Give it
the route polyline your navigation engine produces, feed it GPS fixes, and render the
sign images it returns.

The native engine (Android AAR / iOS xcframework) is pulled from public
channels at build time; this package contains only Kotlin, Swift and TypeScript.

> **Status:** Android is implemented. The iOS module is in progress and is not
> functional in this version.

## Requirements

| | |
|---|---|
| Expo SDK | ≥ 57 (React Native ≥ 0.86), **New Architecture only** |
| Build type | Development build / `expo run:*` (not Expo Go) |
| iOS | ≥ 16.4, Xcode ≥ 26.4 |
| Android | minSdk 24 |
| Peer | `expo-image` (renders the native sign refs) |

## Installation

```sh
npx expo install @mapzone/nav-speed-alert expo-image
```

**Android:** the native SDK is resolved from JitPack. If your project sets
`RepositoriesMode.FAIL_ON_PROJECT_REPOS` in `settings.gradle`, add the repository
there:

```groovy
dependencyResolutionManagement {
  repositories {
    maven { url 'https://jitpack.io' }
  }
}
```

**iOS:** `npx pod-install` after installing. The CocoaPods dependency
`MapZoneAlertView` is declared by the module's podspec.

Then rebuild the native app (`npx expo run:android` / `npx expo run:ios`).

## Quick start

```tsx
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import { useNavSpeedAlertSigns } from '@mapzone/nav-speed-alert';
import { Image } from 'expo-image';

// 1. Once, before start(). Authentication is required; obtain credentials from MapZone.
NavSpeedAlert.configure({
  baseUrl: 'https://<alert-service>',
  apiKeyId: '…',
  apiKey: '…',
  vehicleId: '10',
  vehicleType: 1,      // 1..9
  seats: 5,
  weights: 1.5,        // tonnes
  maxSnapMeters: 0,    // 0 = server default
});

// 2. When navigation starts (and again after every reroute).
NavSpeedAlert.start(routePolyline); // encoded polyline, precision 1e6

// 3. On every GPS fix (~1 Hz).
NavSpeedAlert.onLocation({ lat, lng, bearing, speedKmh, accuracy, fixTimeMillis });

// 4. Render.
function SpeedOverlay() {
  const { signs, restriction } = useNavSpeedAlertSigns();
  return (
    <>
      {signs?.current && <Image source={signs.current} style={{ width: 72, height: 72 }} />}
      {signs?.camera && <Image source={signs.camera} style={{ width: 72, height: 72 }} />}
      {restriction?.closed && <Image source={restriction.closed} style={{ width: 72, height: 72 }} />}
    </>
  );
}

// 5. When navigation ends.
NavSpeedAlert.reset();
```

`useNavSpeedAlertSigns()` keeps the latest tick in state and releases the previous
tick's native images for you. If you subscribe with `addSignsListener` /
`addRestrictionListener` directly, call `release()` on every `AlertSignRef` you no
longer display.

## API

### Methods

| Method | Notes |
|---|---|
| `configure(options)` | Must precede `start()`. See `ConfigureOptions`. |
| `setSegmentUrl(url)` | Optional. Overrides only the segment endpoint; `''` restores the default. |
| `setExtraHeaders(map)` | Optional; call after `configure()`, before `start()`. Adds HTTP headers to segment requests. Returns `null` on success or an error message (reserved/duplicate/empty key, newline in value); previous headers are kept on error. `{}` clears. |
| `setExtraBodyFields(map)` | Same contract for extra request body fields (string values). |
| `start(polyline)` | Begin alerting along the route; call again on reroute. |
| `onLocation(fix)` | Feed one GPS sample. |
| `reset()` | Stop and drop the route. Safe to call repeatedly. |
| `setMutedAlertTypes(types)` | Mute voice categories (`VoiceAlertType[]`). Camera/toll mutes also hide the sign; restriction mutes only silence the voice. `[]` unmutes all. Speed-limit / speeding voice cannot be muted. |
| `setVoiceMode(mode)` | `VoiceMode.FULL` (spoken, default) or `VoiceMode.DING` (chime only). Signs are unaffected. |
| `canExportLogs()` | `Promise<boolean>` — whether the native build captures a diagnostic log. |
| `exportLogs(path)` | `Promise<number>` — write the diagnostic log to a file. Resolves to bytes written; `0` = nothing captured, `-1` = engine busy / write failed. |

### Events

| Event | Listener | Payload |
|---|---|---|
| `onSigns` | `addSignsListener` | `SignsEvent` — `current`, `speedStatus` (0 ok · 1 near limit · 2 over), `next`/`nextDistMeters`, `camera`/`cameraDistMeters`, `toll`/`tollDistMeters` |
| `onRestriction` | `addRestrictionListener` | `RestrictionEvent` — `stop`, `closed`, `vehicle`, `bua` (+`inBua`), `turn`, each with `*DistMeters` (`0` = currently on it). Only produced while a listener exists. |
| `onVoice` | `addVoiceListener` | `VoiceEvent` — `wavBase64` (PCM16 mono 22050 Hz), `trigger`, `priority`. While a listener exists the built-in player is silent and your app plays the clip. |
| `onResult` | `addResultListener` | `ResultEvent` — `success`, `errorCode` (0 = OK), `errorMessage`, per route segment fetch. |
| `onReroute` | `addRerouteListener` | `RerouteEvent` — `lat`, `lng` where the vehicle left the route. |

Each `add*Listener` returns an `EventSubscription`; call `.remove()` to unsubscribe.

### `AlertSignRef`

Native image reference (`SharedRef<'image'>`). Pass it directly to `expo-image` as
`source`. `toBase64()` returns PNG bytes as base64 for other image components.
`release()` frees the native reference.

### Enums

`VoiceAlertType` and `VoiceMode` carry the same numeric values as the native SDK.

## Voice

Voice plays through the built-in native player by default. Subscribe to `onVoice`
to receive clips instead and play them yourself; unsubscribing hands playback back
to the built-in player.

## Version mapping

| npm | Android (JitPack `com.github.mapzone-global:mapzone-alert-view-android`) | iOS (CocoaPods `MapZoneAlertView`) |
|---|---|---|
| 1.0.1 | 1.0.1 | 1.0.1 |

## Troubleshooting

- **Gradle: `Could not resolve com.github.mapzone-global:mapzone-alert-view-android`** —
  add the JitPack repository to `settings.gradle` (see Installation).
- **iOS build fails in `expo-modules-jsi` (`'weak' must be a mutable variable`)** —
  Expo SDK 57 requires Xcode ≥ 26.4. Upgrade Xcode.
- **iOS link error mentioning `MapZoneAlertView` linkage** — the module is a static
  framework; keep the default CocoaPods linkage or `use_frameworks! :linkage => :static`.
- **`onResult` with `errorCode ≠ 0`** — 1001 point outside coverage · 1003 malformed
  polyline · 2001 device clock skew · 3003 `vehicleType` outside 1..9 · 3004 route could
  not be matched.

## Example app

`example/` is a development-build app exercising the whole surface (route simulator
or real GPS, all nine sign slots, voice options, log). Copy `example/.env.example` to
`example/.env`, then `cd example && npx expo run:android` / `run:ios`.

## License

MIT © Vietmap JSC
