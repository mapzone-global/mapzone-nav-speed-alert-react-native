import { NativeModule, requireNativeModule } from 'expo';

import type { AlertVehicleType, LogoutResult, NavSpeedAlertEvents } from './NavSpeedAlert.types';

/** What `configure()` hands to native: `metadata` already serialised to JSON. */
export type NativeConfigureOptions = {
  baseUrl: string;
  apiKeyId: string;
  apiKey: string;
  identity: string;
  vehicleType: AlertVehicleType;
  seats: number;
  weightsTons: number;
  maxSnapMeters: number;
  metadata: string | null;
};

/** Server answer to one `logout(requestId)` call. Internal to `logout()` in `index.ts`. */
export type LogoutResultEvent = LogoutResult & { requestId: number };

type NativeEvents = NavSpeedAlertEvents & {
  onLogoutResult: (event: LogoutResultEvent) => void;
};

/** Raw native surface. Method order mirrors `AlertViewManager` in the native SDK. */
declare class NavSpeedAlertNativeModule extends NativeModule<NativeEvents> {
  /** `null` when applied, otherwise the native reason it was rejected (nothing applied). */
  configure(options: NativeConfigureOptions): string | null;
  /** Queued behind earlier calls; the server answer comes back as `onLogoutResult` with the same `requestId`. */
  logout(requestId: number): void;
  /** `null` when applied, otherwise why `url` was rejected (previous URL kept). */
  setSegmentUrl(url: string): string | null;
  setExtraHeaders(headers: Record<string, string>): string | null;
  setExtraBodyFields(fields: Record<string, string>): string | null;
  start(routePolyline: string): void;
  onLocation(
    lat: number,
    lng: number,
    bearing: number,
    speedKmh: number,
    accuracy: number,
    fixTimeMillis: number
  ): void;
  reset(): void;
  canExportLogs(): Promise<boolean>;
  exportLogs(path: string): Promise<number>;
  setMutedAlertTypes(codes: number[]): void;
  setVoiceMode(mode: number): void;
  setVoiceSpeed(speed: number): void;
}

export default requireNativeModule<NavSpeedAlertNativeModule>('NavSpeedAlert');
