import { NativeModule, requireNativeModule } from 'expo';

import type { ConfigureOptions, NavSpeedAlertEvents } from './NavSpeedAlert.types';

/** Raw native surface. Method order mirrors `AlertViewManager` in the native SDK. */
declare class NavSpeedAlertNativeModule extends NativeModule<NavSpeedAlertEvents> {
  configure(options: ConfigureOptions): void;
  setSegmentUrl(url: string): void;
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
  setMutedAlertTypes(codes: number[]): void;
  canExportLogs(): Promise<boolean>;
  exportLogs(path: string): Promise<number>;
}

export default requireNativeModule<NavSpeedAlertNativeModule>('NavSpeedAlert');
