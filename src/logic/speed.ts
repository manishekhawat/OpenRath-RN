/**
 * Speed limits and speed cameras from OpenStreetMap through the free Overpass API (the pure
 * parts of Drive.speedAlerts). Many Indian roads have no limit tagged, so a limit shows only
 * where the map has one. Also the speed shown (Fixes.java): replayed fixes skipped, the smooth
 * number, the speed filter and the speed correction.
 */
import { ahead, dist } from './geo.ts';
import { f, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

export interface Camera {
  lat: number;
  lon: number;
  limit: number;
}

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

export function query(lat: number, lon: number): string {
  const a = lat.toFixed(6);
  const o = lon.toFixed(6);
  return (
    '[out:json][timeout:10];(' +
    `way(around:25,${a},${o})[highway][maxspeed];` +
    `node(around:3000,${a},${o})[highway=speed_camera];` +
    `node(around:3000,${a},${o})[enforcement=maxspeed];` +
    ');out tags center;'
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
/** The lowest tagged limit on the roads here, and the cameras near, from an Overpass answer. */
export function parse(j: any): { limit: number; cameras: Camera[] } {
  let limit = 0;
  const cameras: Camera[] = [];
  for (const e of j?.elements ?? []) {
    const tags = e.tags;
    if (!tags) continue;
    if (e.type === 'way') {
      const v = speed(tags.maxspeed);
      if (v > 0 && (limit === 0 || v < limit)) limit = v;
    } else {
      cameras.push({ lat: e.lat, lon: e.lon, limit: speed(tags.maxspeed) });
    }
  }
  return { limit, cameras };
}

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
