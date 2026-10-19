/**
 * Routes driven (the pure parts of Tracks.java). A point is kept every 5 s or 30 m while moving,
 * as one CSV line in a file per day ("time,lat,lon,alt,kmh"); days are kept 60 at most and turned
 * into GPX on request. The file side is in src/state/tracks.ts. The 0–100 timer Tracks.java also
 * held is src/logic/accel.ts now; the names the trip screen uses for it are re-exported below.
 */
import { done } from './accel.ts';
import { dist } from './geo.ts';
import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';
import { dayKey } from './trip.ts';

export const KEEP_DAYS = 60;
/** A gap longer than this starts a new segment in the GPX. */
export const SEGMENT_GAP_MS = 5 * 60000;

// ------------------------------------------------------------------ recording

/** Decides which GPS fixes to keep: one every 5 s or 30 m, and only while moving. */
export class Sampler {
  lastLat = 0;
  lastLon = 0;
  lastAt = 0;

  keep(lat: number, lon: number, kmh: number, now: number): boolean {
    if (kmh < 4) return false;
    const d = this.lastAt !== 0 ? dist(this.lastLat, this.lastLon, lat, lon) : 0;
    if (this.lastAt !== 0 && now - this.lastAt < 5000 && d < 30) return false;
    this.lastLat = lat;
    this.lastLon = lon;
    this.lastAt = now;
    return true;
  }
}

/** The file a day's points go in: "2026-10-15.csv". */
export function fileName(t: number): string {
  return dayKey(t) + '.csv';
}

/** One point as a line of the day's file. */
export function csvLine(now: number, lat: number, lon: number, alt: number, kmh: number): string {
  return `${now},${lat.toFixed(6)},${lon.toFixed(6)},${(Number.isFinite(alt) ? alt : 0).toFixed(0)},${kmh.toFixed(1)}\n`;
}

export interface Point {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  kmh: number;
}

/** The points in a day's file; short or broken lines are skipped. */
export function parse(csv: string): Point[] {
  const out: Point[] = [];
  for (const line of csv.split('\n')) {
    const p = line.split(',');
    if (p.length < 5) continue;
    const v = p.map(Number);
    if (v.slice(0, 3).some((x) => !Number.isFinite(x))) continue;
    out.push({ t: v[0], lat: v[1], lon: v[2], alt: Number.isFinite(v[3]) ? v[3] : 0, kmh: Number.isFinite(v[4]) ? v[4] : 0 });
  }
  return out;
}

/** Days with a recorded route, newest first, from the file names in the folder. */
export function days(names: string[]): string[] {
  return names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(n))
    .map((n) => n.slice(0, -4))
    .sort()
    .reverse();
}

/** The days to delete: everything after the newest 60. */
export function toPrune(daysNewestFirst: string[]): string[] {
  return daysNewestFirst.slice(KEEP_DAYS);
}

/** A day's distance (km, counting segment gaps out), points and first and last times. */
export function summarize(points: Point[]): { km: number; points: number; from: number; to: number } {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > SEGMENT_GAP_MS) continue;
    m += dist(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return { km: m / 1000, points: points.length, from: points[0]?.t ?? 0, to: points[points.length - 1]?.t ?? 0 };
}

// ------------------------------------------------------------------ GPX

export function gpxHead(name: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="OpenRath" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <trk>\n    <name>' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</name>\n'
  );
}

export function gpxPoint(lat: number, lon: number, ele: number, t: number): string {
  const iso = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(0)}</ele><time>${iso}</time></trkpt>\n`;
}

/** One day's file as GPX, for Google Earth, OsmAnd or Strava; a new segment starts after a 5-minute gap. */
export function gpx(day: string, csv: string): string {
  let w = gpxHead('Drives on ' + day);
  let prev = 0;
  let open = false;
  for (const p of parse(csv)) {
    if (!open || p.t - prev > SEGMENT_GAP_MS) {
      if (open) w += '    </trkseg>\n';
      w += '    <trkseg>\n';
      open = true;
    }
    w += gpxPoint(p.lat, p.lon, p.alt, p.t);
    prev = p.t;
  }
  if (open) w += '    </trkseg>\n';
  return w + '  </trk>\n</gpx>\n';
}

export function gpxName(day: string): string {
  return 'openrath-' + day + '.gpx';
}

// ------------------------------------------------------------------ 0–100 timer

/**
 * The timer itself, and the texts for a finished run, are in src/logic/accel.ts, which the drive
 * engine uses; these are the names the trip screen has always called them by.
 */
export { Timer, forget as forgetAccel, summary as accelText } from './accel.ts';

/** A finished run: saves it, and returns only the words to say, as this name always has. */
export function accelDone(p: Prefs, t100: number, t60: number, now: number): string {
  return done(p, t100, t60, now).text;
}

export const ACCEL_ABOUT =
  'Stop completely, then accelerate. The time is spoken when you pass 100 km/h. It uses GPS, so it is good to about half a second. Only on a safe, empty road.';

/** ACCEL_ABOUT in the chosen language. */
export function accelAbout(): string {
  return t(ACCEL_ABOUT);
}

// ------------------------------------------------------------------ volume with speed

/** Extra volume steps for a speed: none below 40 km/h, then one more every `per` km/h, at most 6. */
export function extraSteps(kmh: number, per: number): number {
  if (per <= 0 || kmh < 40) return 0;
  return Math.min(6, 1 + Math.trunc((kmh - 40) / per));
}
