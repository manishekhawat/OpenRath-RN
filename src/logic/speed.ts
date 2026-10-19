/**
 * Speed limits and speed cameras from OpenStreetMap through the free Overpass API (the pure
 * parts of Drive.speedAlerts). Many Indian roads have no limit tagged, so a limit shows only
 * where the map has one. Also the speed shown (Fixes.java): replayed fixes skipped, the smooth
 * number, the speed filter and the speed correction.
 */
import { nearest } from './ahead.ts';
import { ahead, dist } from './geo.ts';
import { f, t } from './i18n.ts';
import { bbox, type Camera } from './overpass.ts';
import { num, type Prefs } from './prefs.ts';

export type { Camera };

/** A mapped road with a speed limit, and its shape, so the limit holds while the car is on it. */
export interface Way {
  kmh: number;
  pts: [number, number][];
}

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/**
 * The roads with a limit around the car, the cameras of a square, or both (Drive.query). The roads
 * come with their shape, so one answer serves the whole road rather than the spot it was asked at,
 * and a square's cameras are asked for once a week rather than on every lookup.
 */
export function query(lat: number, lon: number, cams: string | null, wantLimit: boolean): string {
  const a = lat.toFixed(6);
  const o = lon.toFixed(6);
  return (
    '[out:json][timeout:15];' +
    (wantLimit ? `way(around:600,${a},${o})[highway][maxspeed];out tags geom qt;` : '') +
    (cams ? `(node${bbox(cams)}[highway=speed_camera];node${bbox(cams)}[enforcement=maxspeed];);out tags center qt;` : '')
  );
}

/** A maxspeed tag in km/h ("50", "30 mph"; "IN:urban" gives 0). */
export function speed(s: string | null | undefined): number {
  if (!s) return 0;
  const m = /(\d+)/.exec(s);
  if (!m) return 0;
  const v = parseInt(m[1], 10);
  return s.includes('mph') ? Math.round(v * 1.609) : v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The roads with their shape and limit, and the cameras, from an Overpass answer. */
export function parse(j: any): { ways: Way[]; cameras: Camera[] } {
  const ways: Way[] = [];
  const cameras: Camera[] = [];
  for (const e of j?.elements ?? []) {
    const tags = e.tags;
    if (!tags) continue;
    if (e.type === 'way') {
      const kmh = speed(tags.maxspeed);
      const pts: [number, number][] = (e.geometry ?? [])
        .filter((g: any) => Number.isFinite(g?.lat) && Number.isFinite(g?.lon))
        .map((g: any) => [g.lat, g.lon] as [number, number]);
      if (kmh > 0 && pts.length > 1) ways.push({ kmh, pts });
    } else if (Number.isFinite(e.lat) && Number.isFinite(e.lon)) {
      cameras.push({ lat: e.lat, lon: e.lon, limit: speed(tags.maxspeed) });
    }
  }
  return { ways, cameras };
}

/** The lowest limit of the mapped roads within maxM of a place, or 0 when none is that close. */
export function limitAt(ways: readonly Way[], lat: number, lon: number, maxM: number): number {
  let lim = 0;
  for (const w of ways) {
    const n = nearest(w.pts, lat, lon);
    if (n && n.d <= maxM && w.kmh > 0 && (lim === 0 || w.kmh < lim)) lim = w.kmh;
  }
  return lim;
}

/** Whether any of the roads from the last answer is within maxM. */
export function onWay(ways: readonly Way[], lat: number, lon: number, maxM: number): boolean {
  return ways.some((w) => {
    const n = nearest(w.pts, lat, lon);
    return n != null && n.d <= maxM;
  });
}

/**
 * Whether to ask the map for the limits again (Drive.limitsStale): never asked, the last answer
 * failed, or over 500 m from where it was asked (the answer covers 600 m around it) and no longer
 * on a road from that answer, or 5 km on whatever the roads say.
 */
export function limitsStale(asked: boolean, failed: boolean, metresFromAsked: number, onKnownRoad: boolean): boolean {
  if (!asked || failed) return true;
  if (metresFromAsked > 5000) return true;
  return metresFromAsked > 500 && !onKnownRoad;
}

/** How close to a road the car counts as on it, in metres. */
export const ON_ROAD_M = 25;

/** Metres to the nearest camera ahead within 600 m, or -1. */
export function nearestCamera(lat: number, lon: number, heading: number, kmh: number, cams: Camera[]): number {
  let nearest = -1;
  for (const c of cams) {
    const d = dist(lat, lon, c.lat, c.lon);
    const isAhead = kmh < 5 || ahead(lat, lon, heading, c.lat, c.lon, 600);
    if (d < 600 && isAhead && (nearest < 0 || d < nearest)) nearest = Math.round(d);
  }
  return nearest;
}

/** Above the limit (with 3 km/h grace), or above the owner's warning speed anywhere. */
export function isOver(kmh: number, limit: number, warnAt: number): boolean {
  return (limit > 0 && kmh > limit + 3) || (warnAt > 0 && kmh > warnAt);
}

// ------------------------------------------------------------------ the speed shown (Fixes.java, 1.38–1.39)

/** Below this the car is standing still: GPS drift at a red light reads 1–2 km/h. */
export const STILL_KMH = 2;
/** No fix for this long: the speed shows "--". */
export const FIX_TIMEOUT_MS = 10000;

/**
 * True when a fix can be used: real coordinates, and not older than the last fix used (0 = none
 * yet). Android can hand back an old cached fix when location updates restart; it is skipped
 * instead of adding a jump to the trip or a spike to the speed.
 */
export function usable(lat: number, lon: number, fixT: number, lastT: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return lastT === 0 || fixT === 0 || fixT >= lastT;
}

/**
 * The speed to show: eased towards the new reading over about a third of a second, so it doesn't
 * jump digit to digit, and 0 below `stillKmh` (the speed filter) so it doesn't crawl at a red light.
 */
export function smooth(shown: number, raw: number, dtMs: number, stillKmh: number = STILL_KMH): number {
  if (raw < stillKmh) return 0;
  if (shown <= 0 || dtMs <= 0 || dtMs > 5000) return raw;
  const a = 1 - Math.exp(-dtMs / 350);
  return shown + a * (raw - shown);
}

/**
 * GPS speed with the owner's correction, in percent (-10 to +10), so it matches the car's own
 * speedometer, which usually reads a few percent high (Drive.corrected).
 */
export function corrected(kmh: number, percent: number): number {
  const p = Math.max(-10, Math.min(10, percent));
  return (kmh * (100 + p)) / 100;
}

/** Settings > Driving > Speed correction ('speedFix', percent). */
export function fix(p: Prefs): number {
  return num(p, 'speedFix', 0);
}

export const FIX_CHOICES = [-5, -3, -2, 0, 2, 3, 4, 5, 6, 8, 10];

/** "off" or "GPS speed +3%". */
export function fixText(percent: number): string {
  return percent === 0 ? t('off') : f('GPS speed %1$s%%', (percent > 0 ? '+' : '') + percent);
}

/** One choice in the list: "off", "+3%" or "-2%". */
export function fixChoice(percent: number): string {
  return percent === 0 ? t('off') : (percent > 0 ? '+' : '') + percent + '%';
}

/** Settings > Driving > Speed filter ('speedFilter', km/h): the speed shows 0 below it. */
export function filter(p: Prefs): number {
  return num(p, 'speedFilter', STILL_KMH);
}

export const FILTER_CHOICES = [0, 2, 3, 4, 5, 6, 8];

/** "off" or "0 below 4 km/h". */
export function filterText(kmh: number): string {
  return kmh === 0 ? t('off') : f('0 below %1$s km/h', kmh);
}

export function filterChoice(kmh: number): string {
  return kmh === 0 ? t('off') : kmh + ' km/h';
}
