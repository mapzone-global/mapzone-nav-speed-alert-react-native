import type { EventSubscription } from 'expo-modules-core';

import {
  AlertVehicleType,
  type ConfigureOptions,
  type LocationFix,
  type LogoutResult,
  type RerouteEvent,
  type RestrictionEvent,
  type ResultEvent,
  type SignsEvent,
  type VoiceAlertType,
  type VoiceEvent,
  type VoiceMode,
} from './NavSpeedAlert.types';
import NavSpeedAlertModule from './NavSpeedAlertModule';

export * from './NavSpeedAlert.types';
export { useNavSpeedAlertSigns } from './useNavSpeedAlertSigns';

/**
 * Integer-bridged arguments must be finite whole numbers: iOS converts them
 * with a trapping `Int(...)` (NaN / Infinity terminate the app) while Android
 * silently turns them into 0. Rejecting them here makes both platforms fail
 * the same, recoverable way.
 */
function requireInteger(functionName: string, argumentName: string, value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `NavSpeedAlert.${functionName}: ${argumentName} must be an integer, got ${value}`
    );
  }
}

function requireFinite(functionName: string, argumentName: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `NavSpeedAlert.${functionName}: ${argumentName} must be a finite number, got ${value}`
    );
  }
}

/** Turns a native rejection reason (`null` = accepted) into a thrown `Error`. */
function throwIfRejected(functionName: string, rejectionReason: string | null) {
  if (rejectionReason != null) {
    throw new Error(`NavSpeedAlert.${functionName}: ${rejectionReason}`);
  }
}

/**
 * Sign the identity in and set the vehicle profile. Call it when the user
 * signs in and on every app launch with a user already signed in (the SDK does
 * not remember the identity between launches), and await it before `start()`.
 * Everything that fails later (sign-in rejected, account in use elsewhere, …)
 * arrives through `onResult`.
 *
 * Rejects — and applies nothing, the previous configuration stays — when the
 * native SDK refuses an input (credentials, identity, seats, weight, metadata),
 * with its reason as the message. Also rejects, before reaching native, when
 * `baseUrl` is not `https://`, `vehicleType` is not an `AlertVehicleType`,
 * `seats` is not an integer or `weightsTons` / `maxSnapMeters` is not finite,
 * so both platforms fail the same way.
 */
export async function configure(options: ConfigureOptions): Promise<void> {
  if (!/^https:\/\//i.test(options.baseUrl)) {
    throw new Error('NavSpeedAlert.configure: baseUrl must start with https://');
  }
  requireInteger('configure', 'vehicleType', options.vehicleType);
  if (AlertVehicleType[options.vehicleType] === undefined) {
    throw new TypeError(
      `NavSpeedAlert.configure: vehicleType must be an AlertVehicleType, got ${options.vehicleType}`
    );
  }
  requireInteger('configure', 'seats', options.seats);
  requireFinite('configure', 'weightsTons', options.weightsTons);
  requireFinite('configure', 'maxSnapMeters', options.maxSnapMeters);
  // Reaches native synchronously, so it stays in order with the calls that follow it.
  const rejectionReason = NavSpeedAlertModule.configure({
    baseUrl: options.baseUrl,
    apiKeyId: options.apiKeyId,
    apiKey: options.apiKey,
    identity: options.identity,
    vehicleType: options.vehicleType,
    seats: options.seats,
    weightsTons: options.weightsTons,
    maxSnapMeters: options.maxSnapMeters,
    metadata: options.metadata == null ? null : JSON.stringify(options.metadata),
  });
  throwIfRejected('configure', rejectionReason);
}

let nextLogoutRequestId = 1;

/**
 * Sign the identity out: closes the vehicle session on the server. Call it
 * when the user signs out of your app, and after
 * `AlertViewError.SESSION_MOVED` (the server has already closed that session,
 * which counts as success). It reaches native in call order with
 * `configure()` / `start()` / `onLocation()`. Route data already loaded keeps
 * alerting; later fetches report `AlertViewError.NOT_LOGGED_IN` until
 * `configure()` signs someone in.
 *
 * Resolves with the server's answer — a failed logout is `success: false`, not
 * a rejection: the identity is then kept; call `logout()` again to retry.
 * Without a `configure()` in this app launch it resolves `success: true`
 * without any request. The answer can take a few seconds when a segment fetch
 * is in flight: do not block the sign-out screen on it.
 */
export function logout(): Promise<LogoutResult> {
  const requestId = nextLogoutRequestId++;
  return new Promise((resolve, reject) => {
    const subscription = NavSpeedAlertModule.addListener('onLogoutResult', (event) => {
      if (event.requestId !== requestId) return;
      subscription.remove();
      resolve({
        success: event.success,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
      });
    });
    try {
      NavSpeedAlertModule.logout(requestId);
    } catch (error) {
      subscription.remove();
      reject(error);
    }
  });
}

/**
 * Override the route-data (segment) endpoint only; call after `configure()`.
 * A non-empty `url` must be `https://` and is used exactly as given; an empty
 * string restores the default. Sign-in, sign-out and the auth fetch always use
 * `baseUrl`. Throws with the native reason when `url` is rejected — the
 * previous URL is then kept.
 */
export function setSegmentUrl(url: string): void {
  throwIfRejected('setSegmentUrl', NavSpeedAlertModule.setSegmentUrl(url));
}

/**
 * Add HTTP headers to segment requests. Call after `configure()` and before
 * `start()`. Throws with the native reason (reserved or malformed key/value);
 * the previous headers are then kept. Pass `{}` to clear.
 */
export function setExtraHeaders(headers: Record<string, string>): void {
  throwIfRejected('setExtraHeaders', NavSpeedAlertModule.setExtraHeaders(headers));
}

/**
 * Add body fields to segment requests. Same timing and error contract as
 * `setExtraHeaders`. Pass `{}` to clear.
 */
export function setExtraBodyFields(fields: Record<string, string>): void {
  throwIfRejected('setExtraBodyFields', NavSpeedAlertModule.setExtraBodyFields(fields));
}

/** Start (or restart after reroute) alerting along an encoded polyline (precision 1e6). */
export function start(routePolyline: string): void {
  NavSpeedAlertModule.start(routePolyline);
}

/**
 * Feed one GPS fix (~1 Hz). Returns immediately; results arrive as events.
 * Throws when `fixTimeMillis` is not a finite number; fractions (iOS location
 * timestamps have them) are rounded.
 */
export function onLocation(fix: LocationFix): void {
  requireFinite('onLocation', 'fixTimeMillis', fix.fixTimeMillis);
  NavSpeedAlertModule.onLocation(
    fix.lat,
    fix.lng,
    fix.bearing,
    fix.speedKmh,
    fix.accuracy,
    Math.round(fix.fixTimeMillis)
  );
}

/**
 * Stop alerting and drop the current route. Safe to call repeatedly. Mute
 * set, voice mode and voice speed are kept. Does not sign the user out — use
 * `logout()`.
 */
export function reset(): void {
  NavSpeedAlertModule.reset();
}

/**
 * Mute voice for the given categories. Camera/toll mutes also hide their signs;
 * restriction mutes only silence the voice. Pass `[]` to unmute everything.
 */
export function setMutedAlertTypes(types: VoiceAlertType[]): void {
  types.forEach((type) => requireInteger('setMutedAlertTypes', 'type', type));
  NavSpeedAlertModule.setMutedAlertTypes(types.map((t) => t as number));
}

/**
 * Speak alerts in full (default) or reduce them to dings. Applied after the
 * mute set, so a muted alert never becomes a ding; signs do not change. Kept
 * across routes and `reset()`.
 */
export function setVoiceMode(mode: VoiceMode): void {
  requireInteger('setVoiceMode', 'mode', mode);
  NavSpeedAlertModule.setVoiceMode(mode as number);
}

/**
 * Playback speed of the built-in voice player: `1.0` = recorded speed, clamped
 * natively to `0.5..2.0` (pitch kept). Kept across routes and `reset()`. No
 * effect while an `onVoice` listener is registered (the host then owns playback).
 */
export function setVoiceSpeed(speed: number): void {
  NavSpeedAlertModule.setVoiceSpeed(speed);
}

/**
 * Whether the native build captures a diagnostic log that `exportLogs` can write.
 * Async because it waits for the engine queue (a segment fetch may be in flight).
 */
export function canExportLogs(): Promise<boolean> {
  return NavSpeedAlertModule.canExportLogs();
}

/**
 * Write the diagnostic log to `path`. Resolves to bytes written: `0` = nothing
 * captured, `-1` = the engine was busy or the write failed.
 */
export function exportLogs(path: string): Promise<number> {
  return NavSpeedAlertModule.exportLogs(path);
}

export function addSignsListener(listener: (event: SignsEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onSigns', listener);
}

/** First listener registers the native restriction callback; last removal unregisters it. */
export function addRestrictionListener(
  listener: (event: RestrictionEvent) => void
): EventSubscription {
  return NavSpeedAlertModule.addListener('onRestriction', listener);
}

/** While at least one listener exists the built-in voice player is silent. */
export function addVoiceListener(listener: (event: VoiceEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onVoice', listener);
}

/**
 * Segment-fetch outcomes and background sign-in failures. Handle
 * `AlertViewError.SESSION_MOVED` by telling the user, calling `logout()` and
 * returning to sign-in.
 */
export function addResultListener(listener: (event: ResultEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onResult', listener);
}

export function addRerouteListener(listener: (event: RerouteEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onReroute', listener);
}
