import type { EventSubscription } from 'expo-modules-core';

import type {
  ConfigureOptions,
  LocationFix,
  RerouteEvent,
  RestrictionEvent,
  ResultEvent,
  SignsEvent,
  VoiceAlertType,
  VoiceEvent,
} from './NavSpeedAlert.types';
import NavSpeedAlertModule from './NavSpeedAlertModule';

export * from './NavSpeedAlert.types';
export { useNavSpeedAlertSigns } from './useNavSpeedAlertSigns';

/** Configure credentials and vehicle profile. Must precede `start()`. */
export function configure(options: ConfigureOptions): void {
  NavSpeedAlertModule.configure(options);
}

/** Override the segment endpoint. Empty string restores the default. */
export function setSegmentUrl(url: string): void {
  NavSpeedAlertModule.setSegmentUrl(url);
}

/**
 * Add HTTP headers to segment requests. Call after `configure()` and before
 * `start()`. Returns `null` on success, otherwise the native error message
 * (reserved or malformed key/value); previous headers are kept on error.
 * Pass `{}` to clear.
 */
export function setExtraHeaders(headers: Record<string, string>): string | null {
  return NavSpeedAlertModule.setExtraHeaders(headers);
}

/**
 * Add body fields to segment requests. Same timing and return contract as
 * `setExtraHeaders`. Pass `{}` to clear.
 */
export function setExtraBodyFields(fields: Record<string, string>): string | null {
  return NavSpeedAlertModule.setExtraBodyFields(fields);
}

/** Start (or restart after reroute) alerting along an encoded polyline (precision 1e6). */
export function start(routePolyline: string): void {
  NavSpeedAlertModule.start(routePolyline);
}

/** Feed one GPS fix. Call at ~1 Hz. */
export function onLocation(fix: LocationFix): void {
  NavSpeedAlertModule.onLocation(
    fix.lat,
    fix.lng,
    fix.bearing,
    fix.speedKmh,
    fix.accuracy,
    fix.fixTimeMillis
  );
}

/** Stop alerting and drop the current route. Safe to call repeatedly. */
export function reset(): void {
  NavSpeedAlertModule.reset();
}

/**
 * Mute voice for the given categories. Camera/toll mutes also hide their signs;
 * restriction mutes only silence the voice. Pass `[]` to unmute everything.
 */
export function setMutedAlertTypes(types: VoiceAlertType[]): void {
  NavSpeedAlertModule.setMutedAlertTypes(types.map((t) => t as number));
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

export function addResultListener(listener: (event: ResultEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onResult', listener);
}

export function addRerouteListener(listener: (event: RerouteEvent) => void): EventSubscription {
  return NavSpeedAlertModule.addListener('onReroute', listener);
}
