/**
 * Monsoon mode (port of Monsoon.java): you mark the spots that flood (from Settings, or later a
 * steering-wheel button or voice command), and when it is raining, or rain is due within the
 * hour, a voice warns as you approach one: "Waterlogging reported ahead".
 *
 * The spots are kept in the "floodSpots" setting as JSON [["lat","lon",time], ...], as in the
 * Android version (lat and lon written as strings), so a backup carries over.
 */
import * as Features from './features.ts';
import { ahead, dist } from './geo.ts';
import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

export interface FloodSpot {
  lat: number;
  lon: number;
  at: number;
}

export function spots(p: Prefs): FloodSpot[] {
  const out: FloodSpot[] = [];
  try {
    const a = JSON.parse(p.str('floodSpots', '[]'));
    for (const s of Array.isArray(a) ? a : []) {
      const lat = Number(s[0]);
      const lon = Number(s[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ lat, lon, at: Number(s[2]) || 0 });
    }
  } catch {
    // a broken list counts as empty
  }
  return out;
}

/**
 * Remember (lat, lon) as a spot that floods (the last 200; one per 100 m). Returns what to show:
 * "Marked as a waterlogging spot", "This spot is already marked" or "No GPS position yet".
 */
export function mark(p: Prefs, lat: number, lon: number, now: number): string {
  if (lat === 0 && lon === 0) return t('No GPS position yet');
  const l = spots(p);
  for (const s of l) if (dist(s.lat, s.lon, lat, lon) < 100) return t('This spot is already marked');
  l.push({ lat, lon, at: now });
  const keep = l.slice(Math.max(0, l.length - 200)).map((s) => [String(s.lat), String(s.lon), Math.trunc(s.at)]);
  p.put('floodSpots', JSON.stringify(keep));
  return t('Marked as a waterlogging spot');
}

export function clear(p: Prefs): void {
  p.put('floodSpots', '[]');
}

/** What to say now, or null: only in rain, once per spot per drive (`told`), for spots within 700 m ahead. */
export function check(p: Prefs, told: Set<string>, wet: boolean, lat: number, lon: number, heading: number, kmh: number): string | null {
  if (!Features.on(p, 'rain')) return null;
  return warning(spots(p), told, wet, lat, lon, heading, kmh);
}

export function warning(
  list: FloodSpot[],
  told: Set<string>,
  wet: boolean,
  lat: number,
  lon: number,
  heading: number,
  kmh: number,
): string | null {
  if (!wet || kmh < 10) return null;
  for (const s of list) {
    const id = s.lat + ',' + s.lon;
    if (told.has(id) || !ahead(lat, lon, heading, s.lat, s.lon, 700)) continue;
    told.add(id);
    const m = Math.round(dist(lat, lon, s.lat, s.lon) / 50) * 50;
    return 'Waterlogging reported ahead, in ' + Math.max(50, m) + ' metres. Go slow.';
  }
  return null;
}
