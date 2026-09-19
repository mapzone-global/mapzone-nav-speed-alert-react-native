import type { SharedRef } from 'expo-modules-core';

/**
 * Credentials and vehicle profile for the native engine. All fields are
 * required; call `configure()` once before `start()`. The application id
 * (bundle id) is resolved natively.
 */
export type ConfigureOptions = {
  baseUrl: string;
  apiKeyId: string;
  apiKey: string;
  vehicleId: string;
  /** Vehicle class 1..9 as defined by the alert service. */
  vehicleType: number;
  seats: number;
  weights: number;
  /** Maximum distance (m) a GPS fix may be from the route and still snap to it. */
  maxSnapMeters: number;
};

/** One GPS sample forwarded to the engine. */
export type LocationFix = {
  lat: number;
  lng: number;
  /** Heading in degrees, 0 = north. */
  bearing: number;
  speedKmh: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  /** Fix timestamp, epoch milliseconds. */
  fixTimeMillis: number;
};

/**
 * Voice alert categories that can be muted. Values MUST match
 * `VoiceAlertType.java` / `VoiceAlertType.swift` in the native SDK.
 */
export enum VoiceAlertType {
  SPEED_CAMERA = 3,
  TOLL = 4,
  TRAFFIC_ENFORCEMENT_CAMERA = 6,
  RED_LIGHT_CAMERA = 7,
  AI_CAMERA = 8,
  NO_LEFT_TURN = 9,
  NO_RIGHT_TURN = 10,
  NO_UTURN = 11,
  NO_OVERTAKING = 12,
  NO_OVERTAKING_END = 13,
  NO_PARKING = 14,
  NO_STRAIGHT = 15,
  BUILDUP_AREA_START = 16,
  BUILDUP_AREA_END = 17,
  REST_STATION = 18,
  NO_STOPPING = 19,
  ROAD_CLOSED = 20,
  VEHICLE_RESTRICTED = 21,
}

/** How voice alerts are delivered. Values MUST match `VoiceMode.java` / `VoiceMode.swift`. */
export enum VoiceMode {
  /** Spoken sentences (default). */
  FULL = 0,
  /** Short chime only; signs are unaffected. */
  DING = 1,
}

/** 0 = within limit, 1 = within 5 km/h of the limit, 2 = over the limit. */
export type SpeedStatus = 0 | 1 | 2;

/**
 * Native reference to a rendered sign image (Bitmap on Android, UIImage on
 * iOS). Pass it straight to `expo-image` as `source`. Call `release()` when
 * the tick it belongs to is no longer displayed.
 */
export declare class AlertSignRef extends SharedRef<'image'> {
  /** PNG-encoded bytes as base64 for hosts that do not use `expo-image`. */
  toBase64(): string;
}

/** Emitted on every GPS tick after `start()`; a `null` slot means nothing to show. */
export type SignsEvent = {
  current: AlertSignRef | null;
  speedStatus: SpeedStatus;
  next: AlertSignRef | null;
  nextDistMeters: number;
  camera: AlertSignRef | null;
  cameraDistMeters: number;
  toll: AlertSignRef | null;
  tollDistMeters: number;
};

/**
 * Emitted on every GPS tick while at least one `onRestriction` listener is
 * registered. `*DistMeters === 0` means "currently on it".
 */
export type RestrictionEvent = {
  stop: AlertSignRef | null;
  stopDistMeters: number;
  closed: AlertSignRef | null;
  closedDistMeters: number;
  vehicle: AlertSignRef | null;
  vehicleDistMeters: number;
  bua: AlertSignRef | null;
  buaDistMeters: number;
  inBua: boolean;
  turn: AlertSignRef | null;
  turnDistMeters: number;
};

/**
 * Emitted instead of playing through the built-in player while at least one
 * `onVoice` listener is registered. `wavBase64` is PCM16 mono 22050 Hz.
 */
export type VoiceEvent = {
  wavBase64: string;
  trigger: number;
  /** 0 = current (lowest), 1 = normal, 2 = speeding. */
  priority: number;
};

/** Result of fetching one route segment. `errorCode === 0` on success. */
export type ResultEvent = {
  success: boolean;
  errorCode: number;
  errorMessage: string;
};

/** The vehicle left the route; host should request a new route from this point. */
export type RerouteEvent = {
  lat: number;
  lng: number;
};

export type NavSpeedAlertEvents = {
  onSigns: (event: SignsEvent) => void;
  onRestriction: (event: RestrictionEvent) => void;
  onVoice: (event: VoiceEvent) => void;
  onResult: (event: ResultEvent) => void;
  onReroute: (event: RerouteEvent) => void;
};
