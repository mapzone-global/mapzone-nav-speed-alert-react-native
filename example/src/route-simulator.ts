import polyline from '@mapbox/polyline';
import type { LocationFix } from '@mapzone/nav-speed-alert';

type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function haversineMeters(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: Point, b: Point): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Drives a fake vehicle along an encoded route at a constant speed and emits
 * one `LocationFix` per second, the same cadence a real GPS would give.
 *
 *   polyline ──decode──► [p0..pn] ──advance v·Δt along segments──► fix @ 1 Hz
 */
export class RouteSimulator {
  private readonly points: Point[];
  private segIndex = 0;
  private segOffsetM = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    encodedPolyline: string,
    private readonly onFix: (fix: LocationFix) => void,
    private readonly onEnd: () => void
  ) {
    this.points = polyline.decode(encodedPolyline, 6).map(([lat, lng]) => ({ lat, lng }));
  }

  /** Vehicle speed in km/h; may be changed while running. */
  speedKmh = 60;

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.timer || this.points.length < 2) return;
    this.timer = setInterval(() => this.tick(1000), 1000);
    this.tick(0); // Emit the start position immediately.
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Back to the first point; keeps the speed setting. */
  reset() {
    this.stop();
    this.segIndex = 0;
    this.segOffsetM = 0;
  }

  private tick(elapsedMs: number) {
    let remaining = (this.speedKmh / 3.6) * (elapsedMs / 1000);
    while (remaining > 0 && this.segIndex < this.points.length - 1) {
      const segLen = haversineMeters(this.points[this.segIndex], this.points[this.segIndex + 1]);
      const left = segLen - this.segOffsetM;
      if (remaining < left) {
        this.segOffsetM += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        this.segIndex += 1;
        this.segOffsetM = 0;
      }
    }

    const atEnd = this.segIndex >= this.points.length - 1;
    const a = this.points[Math.min(this.segIndex, this.points.length - 2)];
    const b = this.points[Math.min(this.segIndex + 1, this.points.length - 1)];
    const segLen = haversineMeters(a, b);
    const t = atEnd ? 1 : segLen === 0 ? 0 : this.segOffsetM / segLen;

    this.onFix({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
      bearing: bearingDeg(a, b),
      speedKmh: atEnd ? 0 : this.speedKmh,
      accuracy: 5,
      fixTimeMillis: Date.now(),
    });

    if (atEnd) {
      this.stop();
      this.onEnd();
    }
  }
}
