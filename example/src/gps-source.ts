import type { LocationFix } from '@mapzone/nav-speed-alert';
import * as Location from 'expo-location';

/**
 * Real GPS via expo-location (foreground only). Resolves to a stop function,
 * or throws if the user denies the permission.
 */
export async function startGpsSource(onFix: (fix: LocationFix) => void): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');

  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
    (loc) => {
      const { heading, speed, accuracy } = loc.coords;
      onFix({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        // iOS reports -1 when the heading is unknown.
        bearing: heading != null && heading >= 0 ? heading : 0,
        speedKmh: Math.max(0, (speed ?? 0) * 3.6),
        // Unknown accuracy is reported as poor rather than perfect.
        accuracy: accuracy ?? 100,
        fixTimeMillis: loc.timestamp,
      });
    }
  );
  return () => sub.remove();
}
