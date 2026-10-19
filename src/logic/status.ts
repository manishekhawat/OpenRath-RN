/**
 * Small helpers for the dashboard, with no Expo types so they are tested: the dock's status icons
 * (StatusIcons.java, 1.38), the car box's drive summary when stopped (CarCard.summary, 1.39) and
 * the compass box's points (Cards.CompassCard, 1.36).
 */
import { speed } from './units.ts';

// ---------------------------------------------------------------- status icons

export const OFF = 0;
export const SEARCHING = 1;
export const ON = 2;

/** What the GPS icon shows: a fix in the last 10 seconds, searching, or location switched off. */
export function gps(fixAgeSec: number, enabled: boolean): number {
  if (fixAgeSec >= 0 && fixAgeSec <= 10) return ON;
  return enabled ? SEARCHING : OFF;
}

/** Battery percent from the system's level and scale, or -1 when the unit reports no battery. */
export function percent(present: boolean, level: number, scale: number): number {
  if (!present || level < 0 || scale <= 0) return -1;
  return Math.max(0, Math.min(100, Math.round((level * 100) / scale)));
}

/** "4G", "5G", "H+"… for TelephonyManager's network type, or "" when unknown. */
export function label(type: number): string {
  switch (type) {
    case 20:
      return '5G';
    case 13:
    case 19:
      return '4G';
    case 15:
      return 'H+';
    case 8:
    case 9:
    case 10:
      return 'H';
    case 3:
    case 5:
    case 6:
    case 12:
    case 14:
    case 17:
      return '3G';
    case 2:
      return 'E';
    case 1:
    case 16:
      return 'G';
    default:
      return '';
  }
}

/** Signal bars, 0 to 4, from a Wi-Fi strength in dBm. */
export function wifiBars(rssi: number): number {
  if (rssi <= -100 || rssi === 2147483647) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -78) return 2;
  return 1;
}

// ---------------------------------------------------------------- car box

/** "12.4 km · 34 min · avg 22 · top 68 km/h", in the owner's speed unit (distance stays in km). */
export function summary(km: number, sec: number, top: number, mph: boolean): string {
  const min = Math.floor(sec / 60);
  const avg = sec > 0 ? speed((km * 3600) / sec, mph) : 0;
  const time = min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
  return `${km.toFixed(1)} km · ${time} · avg ${avg} · top ${speed(top, mph)} ${mph ? 'mph' : 'km/h'}`;
}

// ---------------------------------------------------------------- compass box

/** N, NE, E … for a heading in degrees. */
export function point(deg: number): string {
  const p = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return p[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
