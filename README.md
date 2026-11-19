# Integration Guide — `@mapzone/nav-speed-alert`

This guide walks you through adding route-based speed, camera, toll and
restriction alerts to an Expo / React Native navigation app with
`@mapzone/nav-speed-alert`. It assumes you already have a navigation engine
that produces a route polyline and a source of GPS fixes.

> **Upgrading from 1.x?** 2.0.0 runs on native Alert View SDK 2.0.1 and is a
> breaking release: the user now signs in. See [Upgrading from 1.x](#upgrading-from-1x).

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
| Credentials | `baseUrl`, `apiKeyId`, `apiKey` issued by MapZone, plus the signed-in user's `identity` |
| Native SDK | Android `com.github.mapzone-global:mapzone-alert-view-android:2.0.1`, iOS pod `MapZoneAlertView 2.0.1` (declared by the module) |

**Your application id must be registered with the alert service.** The SDK
sends the running app's id (Android `applicationId`, iOS bundle identifier)
when it authenticates. Build variants with an id suffix (`com.foo.debug`) are
rejected unless they are registered too. A mismatch shows up as `2004` in
`onResult` (§8). Register every platform id you test with.

**Store privacy forms.** The SDK sends a device identifier it generates itself
and the GPS positions along the route, linked to the signed-in user. Declare
them in Google Play's *Data safety* form (Device or other IDs + Precise
location) and in the App Store privacy details (Device ID + Precise Location,
app functionality, not used for tracking). Whatever you pass as `identity` and
`metadata` is your own data: declare it in your forms and privacy policy too.

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

Call `configure()` when the user signs in — and on every app launch with a
user already signed in (the SDK does not remember the identity across
launches) — and **await it before the first `start()`**.

```ts
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import { AlertVehicleType } from '@mapzone/nav-speed-alert';

try {
  await NavSpeedAlert.configure({
    baseUrl: 'https://driving.map.zone',   // gateway issued by MapZone; must start with https://
    apiKeyId: '<your-api-key-id>',
    apiKey: '<your-api-key>',              // a credential: keep it out of source control and logs
    identity: '+84901234567',              // the signed-in user — see Identity
    vehicleType: AlertVehicleType.CAR,     // see table below
    seats: 0,                              // passenger seats (coaches), integer; 0 = default for the type
    weightsTons: 0,                        // gross weight in TONNES (trucks); 0 = default for the type
    maxSnapMeters: 0,                      // max distance a fix may be from the route; ≤ 0 = server default (~25 m)
    metadata: { vehicleId: '29A-12345' },  // optional — see Metadata
  });
} catch (error) {
  // Rejected: nothing was applied, the previous configuration stays in effect.
}
```

`configure()` **rejects** when an input is invalid — credentials, identity,
vehicle type, seats, weight, metadata, or a `baseUrl` that is not `https://` —
with a short English reason as the message, and then applies nothing.
Everything that fails *after* that (sign-in refused, account in use elsewhere,
server down) arrives through `onResult` as a numeric code (§8), never as a
rejection.

| `AlertVehicleType` | Code | Vehicle |
|---|---|---|
| `CAR` | 1 | Car |
| `TAXI` | 2 | Taxi |
| `BUS` | 3 | Bus |
| `COACH` | 4 | Coach |
| `TRUCK` | 5 | Truck |
| `MOTORCYCLE` | 7 | Motorcycle |

Each code is the MapZone server's own vehicle code and is sent unchanged; any
other number is rejected. The type must also be enabled for your API key —
otherwise fetches report `3003`.

`vehicleType`, `seats` and `weightsTons` decide which restrictions apply to
you. The "vehicle restricted" sign (§6.3) is computed for exactly this profile,
and `vehicleType` also picks which artwork that sign uses (car or taxi, bus or
coach, truck, motorcycle).

The name `AlertVehicleType` (not `VehicleType`) avoids a clash with
`@mapzone/speed-alert`, so one file can import both packages.

### Identity

The user (or driver) signed in on this device, sent verbatim with every
request — typically the account's phone number in `+84…` form, or a driver
code. Pick one kind of identity for your app and keep it: the service matches
it **exactly** (`"0901234567"` and `"+84901234567"` are two different people).

- Non-empty, at most **128** characters, no `"` and no control characters.
- One identity is active on one device at a time. Signing the same identity in
  on another device moves its session there, and this device receives `2006`.
- Switching to a **different** identity on the same device is only allowed
  **20 minutes** after this device last opened a session (`2008` otherwise).

### Metadata

`metadata` is optional, free-form information agreed between you and MapZone
(your own vehicle id, app version, …). The SDK adds the device `model` and
`os` unless you set them.

- A plain object, serialised to JSON: at most **2048 UTF-8 bytes**, nesting
  depth at most **16**. `null` or omitted = none.
- Recorded only when a session is **opened**: on the first sign-in on this
  device, or when the identity changes. Calling `configure()` again with the
  same identity keeps the metadata stored at sign-in. It can also be missing if
  the app started offline and the first route request opened the session.

### Optional request tuning

These are rarely needed. Call them after `configure()` and before `start()`;
they persist across reroutes.

| Function | Purpose |
|---|---|
| `setSegmentUrl(url)` | Send segment requests to exactly this URL instead of the default endpoint under `baseUrl` — for example to route through your own proxy. Must be `https://`; `''` restores the default. Sign-in, sign-out and authentication always use `baseUrl`. **Throws** with the reason when `url` is rejected; the previous URL is kept. |
| `setExtraHeaders(map)` | Add HTTP headers to segment requests. **Throws** with the reason (reserved key such as `Content-Type`, empty key, newline in a value); the previous headers are then kept. `{}` clears. |
| `setExtraBodyFields(map)` | Same contract for extra string fields in the request body. Cannot override the SDK's own fields (`identity`, `deviceId`, `refId`, `metadata`, `vehicleType`, … are reserved). `{}` clears. |

A proxy behind `setSegmentUrl` must forward to
`https://driving.map.zone/speed/v2/tracking/network/packed`, pass the status,
the body and `Retry-After` through unchanged, and answer directly — the SDK
does not follow redirects. It can read `identity`.

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
unmount so a hot reload does not leave a stale session running. The mute set,
voice mode and voice speed are kept. `reset()` does **not** sign the user out.

### `logout()`

```ts
const { success, errorCode, errorMessage } = await NavSpeedAlert.logout();
```

Signs the identity out: closes the vehicle session on the server. Call it when
the user signs out of your app. It reaches native in call order with
`configure()` / `start()` / `onLocation()`. Route data already loaded keeps
alerting; later fetches report `-6` until `configure()` signs someone in again.

The promise resolves with the server's answer (`success` is also `true` when
nobody was signed in); a failed logout is `success: false`, not a rejection.
When `success` is `false` (e.g. offline) the identity is kept — call `logout()`
again to retry. With no `configure()` in this app launch, `logout()` resolves
`success: true` without any request. The answer can take a few seconds when a
segment fetch is in flight — do not block your sign-out screen on it.

- **Kicked out (`2006`)**: the identity was signed in on another device and the
  SDK has stopped loading. Tell the user ("Your account is in use on another
  device"), call `logout()` — the server has already closed that session, which
  counts as success — and take the user back to sign-in. Call `configure()`
  again **only after the user signs in**: it takes the session back from the
  other device, and two devices doing so keep signing each other out.
- Signing the next user in right away is fine: `logout(); configure(next)`
  reaches native in that order.

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
| `stop` | No-parking / no-stopping | On or near a restricted stretch, at any speed (its voice plays only while driving slowly, ≤ 18 km/h) | `stopDistMeters` |
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

### Voice mode

```ts
import { VoiceMode } from '@mapzone/nav-speed-alert';

NavSpeedAlert.setVoiceMode(VoiceMode.DING); // chimes instead of sentences
NavSpeedAlert.setVoiceMode(VoiceMode.FULL); // default
```

| Alert | `FULL` | `DING` |
|---|---|---|
| Cameras (all four kinds) | "phía trước có camera…" | ding |
| No parking / no stopping | "phía trước có biển…" | ding |
| Speeding | "bạn đang vượt quá…" | distinct ding |
| Speed limit, toll, built-up area, no overtaking, rest station, road closed, vehicle restricted | spoken | silent |

Signs do not change in either mode. The mute set is applied first, so a muted
category stays silent in both modes. Voice mode persists across routes and
`reset()`.

### Voice speed

```ts
NavSpeedAlert.setVoiceSpeed(1.25); // 25 % faster, pitch kept
```

`1.0` is the recorded speed (default); values are clamped to `0.5..2.0`. It
applies from the next clip and persists across routes and `reset()`. It has no
effect while an `onVoice` listener is registered — your app then owns playback.

## 8. Results

### `onResult` — fetch outcome

Fired for route segment fetches and for background sign-in failures after
`configure()`. Subscribe at least in development so authentication and
coverage problems are visible.

```ts
import { AlertViewError } from '@mapzone/nav-speed-alert';

NavSpeedAlert.addResultListener((e) => {
  if (e.errorCode === AlertViewError.SESSION_MOVED) {
    // Account in use on another device — see logout() (§5).
  } else if (!e.success) {
    console.warn(`alert fetch failed ${e.errorCode}: ${e.errorMessage}`);
  }
});
```

Whatever the code, route data already loaded **keeps alerting**; what changes
is whether the SDK keeps loading more. A route you pass to `start()` while
loading is stopped stays pending and loads by itself once loading resumes. A
new route replaces the running one only after its first part has loaded, so a
failed reroute leaves the current alerts untouched. `start()` always gets an
answer; while driving, a stop or wait code is reported **once per episode**,
report-only codes on every failed try. `AlertViewError` names the codes you are
expected to act on.

| `errorCode` | Meaning | SDK |
|---|---|---|
| `0` | Success — segment loaded | — |
| `2006` `SESSION_MOVED` | The identity is now in use on another device | Stops until `configure()` — see `logout()` (§5) |
| `2007` `LOCKED` | Device or identity locked by an administrator | Stops until `configure()` |
| `2002` / `2003` / `2004` | API key, signature or application id not accepted (§2) | Stops until `configure()` |
| `2005` | Service plan expired | Stops until `configure()` |
| `2010` `TRIAL_IDENTITY_NOT_ALLOWED` | Trial API key: this identity is not one of the key's sample identities | Stops until `configure()` |
| `3003` | Vehicle type not enabled for the API key | Stops until `configure()` |
| `3011` / `3012` `NEW_DEVICE_LIMIT` | Device limit of the API key reached | Stops until `configure()` |
| `4001` `REQUEST_QUOTA_EXCEEDED` | Request quota of the API key used up | Stops until `configure()` |
| `1002` | Missing information in the request | Stops until `configure()` |
| `1001` | Sign-in: identity or vehicle rejected · Route: request rejected (e.g. outside Vietnam) | Sign-in: stops until `configure()` · Route: retries that route after 30 / 60 / 120 s |
| `2008` `SWITCH_TOO_SOON` | Account on this device changed too recently | Pauses **20 minutes**, then resumes on its own |
| `4000` `TOO_MANY_REQUESTS` / `2009` / `5000` / `5004` | Server busy or failing | Waits for the server's `Retry-After` (at most 600 s) or backs off, then resumes |
| `2000` | Device clock is more than 10 s out of sync with the server | Keeps going |
| other `1000`–`5999` | Generic message for that range | Keeps going |
| `-1` | Server response could not be verified | Keeps going |
| `-2` | Route data unavailable or invalid (also: the route has fewer than 2 points, or a proxy answered with an unexpected HTTP status) | Keeps going |
| `-3` | Secure session could not be set up yet; nothing was sent | Retries on its own while you keep calling `onLocation` |
| `-4` `NETWORK_FAILED` | Server unreachable — check connectivity | Keeps going |
| `-5` `BRIDGE_FAILED` | The SDK could not complete the request on this device | Keeps going |
| `-6` `NOT_LOGGED_IN` | No identity signed in (`logout()` ran, or `configure()` never did) | Stops until `configure()` |
| `-7` `NO_ROUTE_DATA` | The service has no data for this stretch of the route | Retries that route after 30 / 60 / 120 s |
| `-8` `DEVICE_NOT_READY` | The device cannot be read yet. The SDK re-reads about once a minute; show a notice. `logout()` also resolves with `-8` in that state — call it again later | Pauses, then resumes on its own |

`errorMessage` is a short, display-ready English sentence derived from
`errorCode` alone — the server's own wording never reaches your app. Localise
off `errorCode` if you need another language, and quote the number in bug
reports.

## 9. Putting it together

A complete minimal integration: configure on sign-in, wire listeners, drive a
session from your navigation state, render the signs.

```tsx
import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import { AlertVehicleType, AlertViewError, useNavSpeedAlertSigns } from '@mapzone/nav-speed-alert';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 1. On sign-in and on every launch with a signed-in user (credentials from your config layer).
export async function signInSpeedAlert(user: { phone: string }) {
  await NavSpeedAlert.configure({
    baseUrl: config.alertBaseUrl,
    apiKeyId: config.alertApiKeyId,
    apiKey: config.alertApiKey,
    identity: user.phone,
    vehicleType: AlertVehicleType.CAR,
    seats: 0,
    weightsTons: 0,
    maxSnapMeters: 0,
  });
}

// On sign-out (and after SESSION_MOVED).
export const signOutSpeedAlert = () => NavSpeedAlert.logout();

// 2. Session driver: follows your navigation state.
export function useSpeedAlertSession(route: { polyline1e6: string } | null, gps: GpsSource) {
  useEffect(() => {
    if (!route) return;
    NavSpeedAlert.start(route.polyline1e6);
    const stopGps = gps.subscribe((fix) => NavSpeedAlert.onLocation(fix));
    const subs = [
      NavSpeedAlert.addResultListener((e) => {
        if (e.errorCode === AlertViewError.SESSION_MOVED) auth.kickedOut(); // logout() + back to sign-in
        else if (!e.success) console.warn('alert fetch', e.errorCode, e.errorMessage);
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

## Upgrading from 1.x

2.0.0 moves to native Alert View SDK 2.0.1 (Android `2.0.1`, iOS `2.0.1`).
Code written for 1.x no longer type-checks.

| 1.x | 2.0.0 |
|---|---|
| `configure(options): void` | `configure(options): Promise<void>` — await it; rejects with the reason when an input is refused (§4) |
| `vehicleId: string` | `identity: string` — the signed-in user (§4); put the old value in `metadata` if you still need it |
| `vehicleType: number` (1 car, 2 motorcycle, 3 truck, 4 coach, 5 bus, 6 taxi, 7–9) | `vehicleType: AlertVehicleType` — server codes, see the mapping below |
| `weights: number` (tonnes) | `weightsTons: number` — same unit, renamed |
| — | `metadata?: object` (§4) |
| `setSegmentUrl(url): void` | Still `void`, but **throws** when `url` is rejected; `https://` only |
| `setExtraHeaders` / `setExtraBodyFields` return `string \| null` | Return `void` and **throw** with the reason; more reserved body keys (`identity`, `deviceId`, `refId`, `deviceMeta`, `metadata`) |
| — | `logout(): Promise<LogoutResult>` (§5) |
| — | `setVoiceMode(VoiceMode)`, `setVoiceSpeed(speed)` (§7) |
| — | `AlertViewError` constants and reorganised codes (§8) |
| `closed` / `vehicle` restriction slots always `null` | Now carry a sign; `vehicle` is drawn for your vehicle type |
| `stop` sign shown only while driving slowly | Shown at any speed; only its voice still waits until the vehicle is slow |
| `onLocation` passed `fixTimeMillis` through | Rounds a fractional value and throws on a non-finite one |

| Vehicle | 1.x number | 2.0.0 |
|---|---|---|
| Car | `1` | `AlertVehicleType.CAR` (`1`) |
| Taxi | `6` | `AlertVehicleType.TAXI` (**`2`**) |
| Bus | `5` | `AlertVehicleType.BUS` (**`3`**) |
| Coach | `4` | `AlertVehicleType.COACH` (`4`) |
| Truck | `3` | `AlertVehicleType.TRUCK` (**`5`**) |
| Motorcycle | `2` | `AlertVehicleType.MOTORCYCLE` (**`7`**) |
| Bicycle / pedestrian / emergency | `7` / `8` / `9` | Not supported |

Do **not** pass a stored 1.x number straight through: `3` was a truck in 1.x
and is a bus in 2.0.0. Convert with the table above.

| Error code in 1.x | 2.0.0 |
|---|---|
| `2001` device clock out of sync | Now `2000` |
| `2002` unauthorized | Split into `2002`, `2003`, `2004`; loading stops until `configure()` |
| other `2xxx` "session expired" | `2005`–`2010` each have their own meaning (§8) |
| `3003` vehicle type must be `1..9` | Vehicle type not enabled for the API key; stops until `configure()` |
| `1003`, `3004` | No longer listed |
| — | New: `-5` … `-8`, `3011`, `3012`, `4000`, `4001` |

Steps:

1. `npx expo install @mapzone/nav-speed-alert@^2.0.0`, then rebuild
   (`npx pod-install` on iOS picks up `MapZoneAlertView 2.0.1`).
2. Set `baseUrl` to the gateway address from MapZone (`https://` only).
3. Replace `vehicleId` with `identity`, convert `vehicleType` with the table,
   rename `weights` to `weightsTons`.
4. `await configure()` on every sign-in and app launch with a signed-in user,
   and handle its rejection.
5. Call `logout()` when the user signs out, and after `2006`.
6. Wrap `setSegmentUrl` / `setExtraHeaders` / `setExtraBodyFields` in
   `try/catch` instead of checking a returned string. A segment proxy now
   forwards to `https://driving.map.zone/speed/v2/tracking/network/packed`.
7. Update your `onResult` handling for the new codes (§8).
8. Update the store privacy forms (§2).

Unchanged: `start`, `reset`, the shape of every sign / restriction / voice /
reroute event, `useNavSpeedAlertSigns`, muting, `exportLogs`.

## Contact

This SDK is available to [Vietmap MAPs API](https://maps.vietmap.vn/docs/vi/) enterprise customers. For credentials,
application-id registration or integration support, contact on [Zalo OA](https://zalo.me/3189066936017422854).
