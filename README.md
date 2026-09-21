# Integration Guide — `@mapzone/nav-speed-alert`

This guide walks you through adding route-based speed, camera, toll and
restriction alerts to an Expo / React Native navigation app with
`@mapzone/nav-speed-alert`. It assumes you already have a navigation engine
that produces a route polyline and a source of GPS fixes.

## 1. Overview

The SDK does one job: given the **route** the driver is following and a stream
of **GPS fixes**, it tells you — once per fix — which signs to show and which
voice cues to play at that moment. It does not compute routes and it does not
read GPS itself; your app supplies both.

```
your navigation engine ──► route polyline ──► start(polyline)
                                                     │
your GPS source ──► onLocation(fix) at ~1 Hz ────────┤
                                                     ▼
                                        native alert engine
                                                     │
              ┌──────────────┬───────────────┬───────┴───────┬──────────────┐
              ▼              ▼               ▼               ▼              ▼
           onSigns     onRestriction      onVoice        onResult      onReroute
        (speed/camera/  (stop/closed/    (WAV clip,     (fetch ok /   (driver left
         toll images)   vehicle/bua/     optional)       error code)    the route)
                        turn images)
```

Sign images arrive as native references (`AlertSignRef`) that you hand
straight to `expo-image`. Voice plays through a built-in native player unless
you choose to receive the clips yourself.

## 2. Prerequisites

| Requirement | Value |
|---|---|
| Expo SDK | ≥ 57 (React Native ≥ 0.86), **New Architecture only** |
| Build type | Development build or `expo run:*` — **not Expo Go** |
| iOS | ≥ 16.4, Xcode ≥ 26.4 |
| Android | minSdk 24 |
| Peer dependency | `expo-image` (renders the native sign references) |
| Credentials | `baseUrl`, `apiKeyId`, `apiKey`, `vehicleId` issued by MapZone |

**Your application id must be registered with the alert service.** If it does not match what the service has on file,
every segment fetch fails with a `2xxx` error code (see §8). Register both
platform ids before testing.

The SDK requires location data but does **not** request the permission itself.
Declare the location permission in your app config and request it at runtime
as you would for any navigation app (the example in §5 uses `expo-location`).

## 3. Installation

```sh
npx expo install @mapzone/nav-speed-alert expo-image
```

### Android

The native SDK is resolved from JitPack. If your project locks repositories
with `RepositoriesMode.FAIL_ON_PROJECT_REPOS` in `settings.gradle`, add JitPack
there:

```groovy
dependencyResolutionManagement {
  repositories {
    maven { url 'https://jitpack.io' }
  }
}
```

The AAR ships its own consumer ProGuard rules and the `INTERNET` permission;
nothing else to add.

### iOS

Run `npx pod-install` after installing. The CocoaPods dependency
`MapZoneAlertView` is declared by the module's podspec. The module is a static
framework — keep CocoaPods' default linkage, or use
`use_frameworks! :linkage => :static` if you enable frameworks.

### Rebuild

Native code changed, so rebuild the app:

```sh
npx expo run:android
npx expo run:ios
```

## 4. Configuration

Call `configure()` **once**, before the first `start()`. All fields are
required.

```ts
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';

NavSpeedAlert.configure({
  baseUrl: 'https://<alert-service>',
  apiKeyId: '<your-api-key-id>',
  apiKey: '<your-api-key>',
  vehicleId: '<your-vehicle-id>',
  vehicleType: 1,     // 1..9, see table below
  seats: 0,           // passenger seats (coaches); 0 = default for the vehicle type
  weights: 0,         // gross weight in tonnes (trucks); 0 = default for the vehicle type
  maxSnapMeters: 0,   // max distance a GPS fix may be from the route and still count; 0 = server default (~25 m)
});
```

| `vehicleType` | Vehicle |
|---|---|
| 1 | Car |
| 2 | Motorcycle |
| 3 | Truck |
| 4 | Coach |
| 5 | Bus |
| 6 | Taxi |
| 7 | Bicycle |
| 8 | Pedestrian |
| 9 | Emergency vehicle |

`vehicleType`, `seats` and `weights` decide which restrictions apply to you
(for example the "vehicle restricted" sign in §6.4 is answered by the service
for exactly this profile).

### Optional request tuning

These are rarely needed. Call them after `configure()` and before `start()`;
they persist across reroutes.

| Function | Purpose |
|---|---|
| `setSegmentUrl(url)` | Send segment requests to exactly this URL instead of the default endpoint under `baseUrl` — for example to route through your own proxy. `''` restores the default. Authentication always uses `baseUrl`. |
| `setExtraHeaders(map)` | Add HTTP headers to segment requests. Returns `null` on success or an error message (reserved key such as `Content-Type`, empty key, newline in a value); on error the previous headers are kept. `{}` clears. |
| `setExtraBodyFields(map)` | Same contract for extra string fields in the request body. Cannot override the SDK's own fields. `{}` clears. |

## 5. Session lifecycle

```ts
// Navigation starts (and again after every reroute):
NavSpeedAlert.start(routePolyline);

// Every GPS fix, ~1 Hz:
NavSpeedAlert.onLocation({ lat, lng, bearing, speedKmh, accuracy, fixTimeMillis });

// Navigation ends:
NavSpeedAlert.reset();
```

### `start(routePolyline)`

`routePolyline` is the **full route geometry** from your navigation engine,
encoded as a Google polyline with **precision 1e6** (not the more common 1e5).
The engine splits it into segments and fetches speed limits and alerts for each
on demand as the driver progresses.

Call `start()` again with a new polyline whenever the route changes — after a
reroute, or if the user picks a different destination. This replaces the
previous route; you do not need to `reset()` first.

### `onLocation(fix)`

Feed every GPS fix as it arrives, at the usual GPS cadence (~1 Hz). Each field:

| Field | Unit / meaning |
|---|---|
| `lat`, `lng` | WGS84 degrees |
| `bearing` | Heading in degrees, 0 = north, 90 = east. Pass `0` if unknown. |
| `speedKmh` | Current speed in **km/h** (most platform APIs give m/s — multiply by 3.6). |
| `accuracy` | Horizontal accuracy in metres. Pass a large value (e.g. 100) if unknown, not 0. |
| `fixTimeMillis` | Fix timestamp, **epoch milliseconds (UTC)**. Pass the fix's own timestamp, not an uptime clock. |

If your app already runs map-matched navigation, pass the **snapped** position
rather than the raw GPS sample — raw fixes can sit 10–20 m off the road centre
even with good accuracy, and fixes farther than `maxSnapMeters` from the route
are treated as off-route.

A minimal source using `expo-location` (foreground only):

```ts
import * as Location from 'expo-location';
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';

async function startGps() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');

  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
    (loc) => {
      const { heading, speed, accuracy } = loc.coords;
      NavSpeedAlert.onLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        bearing: heading != null && heading >= 0 ? heading : 0, // iOS reports -1 when unknown
        speedKmh: Math.max(0, (speed ?? 0) * 3.6),
        accuracy: accuracy ?? 100,
        fixTimeMillis: loc.timestamp,
      });
    }
  );
}
// Later: (await startGps()).remove();
```

### `reset()`

Stops alerting, drops the route and clears voice state. Safe to call
repeatedly. Call it when navigation finishes; also call it on component
unmount so a hot reload does not leave a stale session running.

## 6. Receiving signs

This is the part most apps spend their time on, so it is covered in detail.

### 6.1 `AlertSignRef` — the image handle

Every sign slot is an `AlertSignRef | null`. `null` means "nothing to show in
this slot — hide it". A non-null ref is a native image (Bitmap on Android,
UIImage on iOS) that:

- renders directly with `expo-image`: `<Image source={ref} />`;
- can be converted with `ref.toBase64()` (PNG bytes as base64) if you render
  with something other than `expo-image`;
- **must be released** with `ref.release()` once you no longer display it.
  Skipping this leaks a native image per slot per tick.

### 6.2 Three ways to subscribe

**A. `useNavSpeedAlertSigns()` — recommended.** The hook keeps the latest
`onSigns` and `onRestriction` events in React state and releases the previous
tick's refs for you, including events that were batched between renders. It
also subscribes to `onRestriction`, which is what makes the engine start
producing restriction signs.

```tsx
import { useNavSpeedAlertSigns } from '@mapzone/nav-speed-alert';
import { Image } from 'expo-image';

function SpeedOverlay() {
  const { signs, restriction } = useNavSpeedAlertSigns();
  return (
    <>
      {signs?.current && <Image source={signs.current} style={S.sign} />}
      {signs?.camera && (
        <>
          <Image source={signs.camera} style={S.sign} />
          <Text>{signs.cameraDistMeters} m</Text>
        </>
      )}
      {restriction?.stop && <Image source={restriction.stop} style={S.sign} />}
    </>
  );
}
```

Mount one instance of the component that calls the hook for the whole
navigation screen. Unmounting it removes the listeners and releases the last
refs.

**B. `addSignsListener` / `addRestrictionListener` — manual.** Use these when
you keep your own state (e.g. outside React, or in a store). You own the
release protocol: release every ref in an event once you have replaced it with
a newer one, and release the last event's refs when you stop.

```ts
let last: SignsEvent | null = null;
const sub = NavSpeedAlert.addSignsListener((e) => {
  render(e);
  if (last) for (const k of ['current', 'next', 'camera', 'toll'] as const) last[k]?.release();
  last = e;
});
// On stop:
sub.remove();
if (last) for (const k of ['current', 'next', 'camera', 'toll'] as const) last[k]?.release();
```

**C. `toBase64()` — non-`expo-image` hosts.** Subscribe as in B, call
`ref.toBase64()` on the refs you need, release the ref immediately, and render
`data:image/png;base64,…` with your image component.

### 6.3 The nine sign slots

`onSigns` carries four slots plus `speedStatus`; `onRestriction` carries five.
Slots are independent — several can be non-null at once. Every `*DistMeters`
is metres along the route from the current position; `0` means "on it now".

#### `SignsEvent`

| Field | Sign | Shown | Distance |
|---|---|---|---|
| `current` | Current speed limit | Always while on the route | — |
| `speedStatus` | `0` within limit · `1` close to limit · `2` over limit | Always | — |
| `next` | Next speed limit (differs from `current`) | When a new limit is near ahead | `nextDistMeters` |
| `camera` | Nearest camera ahead (speed / enforcement / red-light / AI) | When a camera is ahead; gone once passed | `cameraDistMeters` |
| `toll` | Toll plaza ahead | When a toll plaza is ahead; gone once passed | `tollDistMeters` |

#### `RestrictionEvent`

| Field | Sign | Shown | Distance |
|---|---|---|---|
| `stop` | No-parking / no-stopping | **Only while driving slowly** and on or near a restricted stretch | `stopDistMeters` |
| `closed` | Road closed | On or near a closed stretch | `closedDistMeters` |
| `vehicle` | Your vehicle type not allowed | On or near a stretch restricted for your `vehicleType` | `vehicleDistMeters` |
| `bua` | Built-up (urban) area — entry plate, or end plate | While inside an area, when approaching one, and briefly after leaving | `buaDistMeters` (`0` while inside) |
| `inBua` | — | `true` while inside a built-up area | — |
| `turn` | Turn restriction (no left / right / U-turn / straight, or "only …") | When a restricted junction is ahead | `turnDistMeters` |

`stop`, `closed` and `vehicle` describe a stretch of road: the sign stays up
while you are on it, then disappears. `bua` has no voice; the other restriction
slots do (§7).

### 6.4 Rendering tips

- Sign images are square; 72×72 dp works well for a primary sign, 48×48 dp for
  a preview row. Set explicit `width`/`height` on the `Image`.
- Show the distance next to `next`, `camera`, `toll` and the restriction slots;
  omit it for `current` (it has none).
- Because a new ref arrives every second, avoid keying a list item on the ref
  identity; key on the slot name.

## 7. Voice

### Built-in player (default)

With no `onVoice` listener the native engine plays voice cues itself through a
priority-aware queue: speed-limit changes, "approaching" warnings, speeding
warnings, camera / toll / restriction announcements. Nothing to do.

### Receiving clips yourself

Subscribe to `onVoice` if you want to mix the audio into your own player, duck
music, or route it to a specific audio session. **While at least one listener
exists the built-in player is silent** and your app is responsible for playing
every clip; removing the last listener hands playback back to the built-in
player.

```ts
const sub = NavSpeedAlert.addVoiceListener((e) => {
  // e.wavBase64: WAV, PCM 16-bit LE, mono, 22 050 Hz
  // e.priority:  0 = "current" (drop first if you fall behind), 1 = normal, 2 = speeding (never drop)
  // e.trigger:   native VoiceTrigger id — useful for logging / analytics
  playWav(e.wavBase64, e.priority);
});
```

`wavBase64` is a complete WAV file; write it to a temporary file and play it
with your audio library, or decode it and feed an audio track directly. If
clips can queue up, honour `priority`: shed priority 0 first, then 1, never 2.

### Muting categories

```ts
import { VoiceAlertType } from '@mapzone/nav-speed-alert';

NavSpeedAlert.setMutedAlertTypes([VoiceAlertType.SPEED_CAMERA, VoiceAlertType.TOLL]);
NavSpeedAlert.setMutedAlertTypes([]); // unmute everything
```

- Speed-limit and speeding voices are core safety cues and **cannot** be muted.
- Muting a **camera or toll** category hides its sign as well (there is one
  slot each; a category you do not want should not occupy it).
- Muting a **restriction** category (`NO_PARKING`, `NO_STOPPING`,
  `ROAD_CLOSED`, `VEHICLE_RESTRICTED`, `BUILDUP_AREA_START/END`) silences the
  voice only; the sign is still delivered.
- The turn categories (`NO_LEFT_TURN`, `NO_RIGHT_TURN`, `NO_UTURN`,
  `NO_STRAIGHT`) are accepted but currently have no voice — turn signs are
  shown silently.

The mute set persists across `start()` / reroutes. See `VoiceAlertType` in
[`src/NavSpeedAlert.types.ts`](../src/NavSpeedAlert.types.ts) for the full list.

## 8. Results

### `onResult` — segment fetch outcome

Fired once per route segment fetch. Subscribe at least in development so
authentication and coverage problems are visible.

```ts
NavSpeedAlert.addResultListener((e) => {
  if (!e.success) console.warn(`alert fetch failed ${e.errorCode}: ${e.errorMessage}`);
});
```

| `errorCode` | Meaning |
|---|---|
| `0` | Success — segment loaded |
| `1001` | A route point is outside the supported area (Vietnam) |
| `1002` | Missing points / invalid request |
| `1003` | Route polyline could not be decoded (check the 1e6 precision) |
| `2001` | Device clock is more than 10 s out of sync with the server |
| `2002` | Unauthorized — `apiKeyId` / `apiKey` / application id mismatch |
| other `2xxx` | Session could not be established (surfaced as "session expired") |
| `3003` | `vehicleType` outside 1..9 |
| `3004` | Route did not match any road |
| `5xxx` | Server temporarily unavailable — retry later |
| negative | Local failure: no connectivity, or the response could not be read (for example a proxy or wrong `setSegmentUrl` returning something other than the service response) |

`errorMessage` is short and display-ready.
## 9. Putting it together

A complete minimal integration: configure once, wire listeners, drive a
session from your navigation state, render the signs.

```tsx
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import { useNavSpeedAlertSigns } from '@mapzone/nav-speed-alert';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 1. Once at app start (credentials from your config layer).
NavSpeedAlert.configure({
  baseUrl: config.alertBaseUrl,
  apiKeyId: config.alertApiKeyId,
  apiKey: config.alertApiKey,
  vehicleId: config.alertVehicleId,
  vehicleType: 1,
  seats: 0,
  weights: 0,
  maxSnapMeters: 0,
});

// 2. Session driver: follows your navigation state.
export function useSpeedAlertSession(route: { polyline1e6: string } | null, gps: GpsSource) {
  useEffect(() => {
    if (!route) return;
    NavSpeedAlert.start(route.polyline1e6);
    const stopGps = gps.subscribe((fix) => NavSpeedAlert.onLocation(fix));
    const subs = [
      NavSpeedAlert.addResultListener((e) => {
        if (!e.success) console.warn('alert fetch', e.errorCode, e.errorMessage);
      }),
      NavSpeedAlert.addRerouteListener(({ lat, lng }) => navigation.rerouteFrom(lat, lng)),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      stopGps();
      NavSpeedAlert.reset();
    };
  }, [route, gps]);
}

// 3. Overlay: mount once on the navigation screen.
export function SpeedAlertOverlay() {
  const { signs, restriction } = useNavSpeedAlertSigns();
  if (!signs) return null;
  return (
    <View style={S.row}>
      <Slot sign={signs.current} tint={signs.speedStatus} />
      <Slot sign={signs.next} dist={signs.nextDistMeters} />
      <Slot sign={signs.camera} dist={signs.cameraDistMeters} />
      <Slot sign={signs.toll} dist={signs.tollDistMeters} />
      <Slot sign={restriction?.stop} dist={restriction?.stopDistMeters} />
      <Slot sign={restriction?.closed} dist={restriction?.closedDistMeters} />
      <Slot sign={restriction?.vehicle} dist={restriction?.vehicleDistMeters} />
      <Slot sign={restriction?.bua} dist={restriction?.buaDistMeters} />
      <Slot sign={restriction?.turn} dist={restriction?.turnDistMeters} />
    </View>
  );
}

function Slot({ sign, dist, tint }: { sign?: NavSpeedAlert.AlertSignRef | null; dist?: number; tint?: number }) {
  if (!sign) return null;
  const border = tint === 2 ? '#F44336' : tint === 1 ? '#FF9800' : 'transparent';
  return (
    <View style={S.slot}>
      <Image source={sign} style={[S.sign, { borderColor: border }]} />
      {dist !== undefined && dist > 0 ? <Text style={S.dist}>{dist} m</Text> : null}
    </View>
  );
}

const S = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { alignItems: 'center' },
  sign: { width: 72, height: 72, borderWidth: 3, borderRadius: 36 },
  dist: { fontSize: 12 },
});
```

## Contact

This SDK is available to [Vietmap MAPs API](https://maps.vietmap.vn/docs/vi/) enterprise customers. For credentials,
application-id registration or integration support, contact on [Zalo OA](https://zalo.me/3189066936017422854).
