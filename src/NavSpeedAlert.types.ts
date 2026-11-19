import type { SharedRef } from 'expo-modules-core';

/**
 * Vehicle classes, with the numbers the alert service uses. Values MUST match
 * `AlertVehicleType.java` / `AlertVehicleType` (Swift) in the native SDK.
 * Named to avoid a clash with `VehicleType` of `@mapzone/speed-alert`, so one
 * file can import both packages.
 *
 * Several numbers changed from 1.x (taxi 6 → 2, bus 5 → 3, truck 3 → 5,
 * motorcycle 2 → 7): pick the type, do not reuse a stored 1.x number.
 */
export enum AlertVehicleType {
  CAR = 1,
  TAXI = 2,
  BUS = 3,
  COACH = 4,
  TRUCK = 5,
  MOTORCYCLE = 7,
}

/**
 * Credentials and vehicle profile for the native engine. Call `configure()`
 * when the user signs in — and on every app launch with a user already signed
 * in — and await it before `start()`. The application id (bundle id) is
 * resolved natively.
 */
export type ConfigureOptions = {
  /** Gateway address issued by MapZone, e.g. `https://driving.map.zone`. Must start with `https://`. */
  baseUrl: string;
  apiKeyId: string;
  /** Authentication secret paired with `apiKeyId`. Do not log it or ship it in source control. */
  apiKey: string;
  /**
   * The signed-in user, e.g. the account's phone number `"+84901234567"` or a
   * driver code. Sent verbatim and matched exactly — `"0901…"` and `"+84901…"`
   * are two different users. Non-empty, at most 128 characters, no `"` and no
   * control characters. One identity is active on one device at a time.
   */
  identity: string;
  vehicleType: AlertVehicleType;
  /** Number of seats (coaches), 0 or more; 0 = default for the type. Integer. */
  seats: number;
  /** Vehicle gross weight in **tonnes** (trucks), 0 or more; 0 = default for the type. */
  weightsTons: number;
  /** Maximum distance (m) a GPS fix may be from the route and still snap to it; ≤ 0 = server default. */
  maxSnapMeters: number;
  /**
   * Optional information about this device / user, agreed with Vietmap (e.g.
   * `{ vehicleId: '29A-12345' }`). Serialised to JSON: at most 2048 UTF-8
   * bytes, nesting depth at most 16. Stored only when a session is opened
   * (first sign-in on this device, or a new identity) — a later `configure()`
   * of the same identity does not update it. The SDK adds `model` and `os`
   * unless you set them.
   */
  metadata?: Record<string, unknown> | null;
};

/** Result of `logout()`. `success` is also `true` when nobody was signed in. */
export type LogoutResult = {
  success: boolean;
  /** `0` on success, otherwise a code from the `onResult` table (see `AlertViewError`). */
  errorCode: number;
  errorMessage: string;
};

/**
 * Codes the SDK acts on, delivered through `onResult` and `logout()`. Values
 * MUST match `AlertViewError` in the native SDK. Branch on the number; the
 * message that comes with it is an English sentence for logs and fallback UI.
 */
export enum AlertViewError {
  /** Could not reach the server. */
  NETWORK_FAILED = -4,
  /** The SDK could not complete the request on this device. */
  BRIDGE_FAILED = -5,
  /** No identity signed in: `logout()` ran, or `configure()` never did. */
  NOT_LOGGED_IN = -6,
  /** The server has no data for this stretch of the route. */
  NO_ROUTE_DATA = -7,
  /** The device cannot be read yet; the SDK retries about once a minute. Show a notice. */
  DEVICE_NOT_READY = -8,
  /**
   * The identity is now in use on another device. Tell the user, call
   * `logout()`, send them to sign in, and do not `configure()` again until
   * they do — otherwise the two devices keep taking the session from each other.
   */
  SESSION_MOVED = 2006,
  /** Device or identity locked by an administrator. */
  LOCKED = 2007,
  /** The account on this device changed too recently; fetching resumes after 20 minutes. */
  SWITCH_TOO_SOON = 2008,
  /** Trial API key: this identity is not one of the key's sample identities. */
  TRIAL_IDENTITY_NOT_ALLOWED = 2010,
  /** The API key cannot register more new devices. */
  NEW_DEVICE_LIMIT = 3012,
  /** Too many requests; the SDK waits for the server's Retry-After. */
  TOO_MANY_REQUESTS = 4000,
  /** The API key has used up its request quota. */
  REQUEST_QUOTA_EXCEEDED = 4001,
}

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

/**
 * How alerts sound. Values MUST match `VoiceMode.java` / `VoiceMode` (Swift)
 * in the native SDK. Signs are identical in both modes.
 *
 * - `FULL`: a spoken sentence per alert kind (default).
 * - `DING`: cameras and no-parking/no-stopping become a ding, speeding a
 *   distinct ding, everything else (speed-limit changes included) is silent.
 */
export enum VoiceMode {
  FULL = 0,
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

/**
 * Outcome of a route-segment fetch, or a background sign-in failure after
 * `configure()`. `errorCode === 0` on success; codes the app acts on are in
 * `AlertViewError`.
 */
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
