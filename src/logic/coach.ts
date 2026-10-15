/**
 * The mileage coach (port of Coach.java): each drive is recorded (distance, idling, hard starts,
 * time above 90 km/h), and the coach estimates how much extra fuel each habit cost, so the worst
 * drives and their reasons can be shown. The estimates are for a 1.2 litre petrol hatchback or
 * small saloon. Drives are kept in the 'drives' pref as JSON arrays, as in the Android version.
 */
import * as Car from './car.ts';
import { clock } from './errands.ts';
import { fmt, log, price, stats } from './fuel.ts';
import type { Prefs } from './prefs.ts';

/** Petrol burnt standing still with the engine running, litres per hour. */
export const IDLE_LPH = 0.7;
/** Extra petrol for each hard start, litres. */
export const START_L = 0.015;
/** Extra share of fuel per km driven above 90 km/h. */
export const FAST_SHARE = 0.2;
/** Mileage to assume before the fuel log has one, km/l. */
export const DEFAULT_KMPL = 18;
/** A stop longer than this ends the drive (it wasn't idling in traffic). */
export const STOP_MS = 10 * 60000;
export const KEY = 'drives';
/** How many drives are kept. */
export const KEEP = 120;

/** One drive: from moving off to a stop of ten minutes or more. */
export interface Trip {
  start: number;
  end: number;
  km: number;
  movingSec: number;
  idleSec: number;
  fastSec: number;
  starts: number;
  brakes: number;
  // where it started and ended (0 when not known), for the commute insights
  sLat: number;
  sLon: number;
  eLat: number;
  eLon: number;
}

export function newTrip(start = 0): Trip {
  return { start, end: 0, km: 0, movingSec: 0, idleSec: 0, fastSec: 0, starts: 0, brakes: 0, sLat: 0, sLon: 0, eLat: 0, eLon: 0 };
}

/** The mileage to expect before the fuel log knows the real one, from the car profile (Coach.typical). */
export function typical(p: Prefs): number {
  return Car.kmpl(Car.fuel(p)) || DEFAULT_KMPL;
}

/** The saved form: the same array layout as the Java version, so backups carry over. */
export function toJson(t: Trip): (number | string)[] {
  return [t.start, t.end, String(Math.round(t.km * 10) / 10), t.movingSec, t.idleSec, t.fastSec, t.starts, t.brakes,
    String(t.sLat), String(t.sLon), String(t.eLat), String(t.eLon)];
}

const n = (v: unknown, def = 0): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : def;
};

export function fromJson(a: unknown[]): Trip {
  return {
    start: n(a[0]), end: n(a[1]), km: n(a[2]), movingSec: Math.trunc(n(a[3])), idleSec: Math.trunc(n(a[4])),
    fastSec: Math.trunc(n(a[5])), starts: Math.trunc(n(a[6])), brakes: Math.trunc(n(a[7])),
    sLat: n(a[8]), sLon: n(a[9]), eLat: n(a[10]), eLon: n(a[11]),
  };
}

export function minutes(t: Trip): number {
  return Math.max(1, Math.trunc((t.end - t.start) / 60000));
}

/** Builds drives from the trip readings. Feed it every GPS fix. */
export class Tracker {
  cur: Trip | null = null;
  prevAt = 0;
  stillSince = 0;
  pendingIdle = 0;

  /**
   * One reading: speed, km moved since the last one, whether it was a hard start or a harsh brake,
   * and (optionally) the position, so the drive knows where it started and ended. Returns a
   * finished drive when a long stop ends one, else null.
   */
  feed(now: number, kmh: number, dKm: number, hardStart: boolean, brake: boolean, lat?: number, lon?: number): Trip | null {
    const done = this.step(now, kmh, dKm, hardStart, brake);
    const cur = this.cur;
    if (cur && lat !== undefined && lon !== undefined) {
      if (cur.sLat === 0 && cur.start === now) {
        cur.sLat = lat;
        cur.sLon = lon;
      }
      if (kmh >= 2 || cur.eLat === 0) {
        cur.eLat = lat;
        cur.eLon = lon;
      }
    }
    return done;
  }

  private step(now: number, kmh: number, dKm: number, hardStart: boolean, brake: boolean): Trip | null {
    let done: Trip | null = null;
    const cur = this.cur;
    if (!cur) {
      if (kmh > 8) {
        this.cur = newTrip(now);
        this.prevAt = now;
        this.stillSince = 0;
        this.pendingIdle = 0;
      }
      return null;
    }
    const dt = Math.min(5000, Math.max(0, now - this.prevAt));
    this.prevAt = now;
    cur.km += dKm;
    if (hardStart) cur.starts++;
    if (brake) cur.brakes++;
    if (kmh < 2) {
      if (this.stillSince === 0) this.stillSince = now;
      this.pendingIdle += dt;
      if (now - this.stillSince >= STOP_MS) {
        cur.end = this.stillSince;
        done = cur;
        this.cur = null;
      }
    } else {
      // the stop was short: it was idling in traffic or at a signal
      cur.idleSec += Math.trunc(this.pendingIdle / 1000);
      this.pendingIdle = 0;
      this.stillSince = 0;
      cur.movingSec += Math.trunc(dt / 1000);
      if (kmh > 90) cur.fastSec += Math.trunc(dt / 1000);
    }
    return done;
  }

  /** Close the drive now (the app is closing); null if there was none. */
  close(now: number): Trip | null {
    const t = this.cur;
    this.cur = null;
    if (!t) return null;
    t.end = this.stillSince > 0 ? this.stillSince : now;
    return t;
  }

  /** Minutes driven since the last long stop, or 0 when not driving. */
  drivingMinutes(now: number): number {
    return this.cur ? Math.trunc((now - this.cur.start) / 60000) : 0;
  }
}

/** What a drive's habits cost: [idle litres, hard-start litres, speeding litres]. */
export function waste(t: Trip, kmpl: number, typicalKmpl = DEFAULT_KMPL): [number, number, number] {
  if (kmpl <= 0) kmpl = typicalKmpl > 0 ? typicalKmpl : DEFAULT_KMPL;
  const idle = (t.idleSec / 3600) * IDLE_LPH;
  const starts = t.starts * START_L;
  const fastKm = (t.fastSec / 3600) * 100; // about 100 km/h while above 90
  const fast = (Math.min(fastKm, t.km) / kmpl) * FAST_SHARE;
  return [idle, starts, fast];
}

export function total(w: number[]): number {
  return w[0] + w[1] + w[2];
}

/** "14 min idling, 5 hard starts": the habits that cost most first, small ones left out. */
export function reasons(t: Trip, w: number[]): string {
  const r = [0, 1, 2].map((i) => ({ i, v: w[i] })).sort((a, b) => b.v - a.v);
  const parts: string[] = [];
  for (const x of r) {
    if (x.v < 0.02) continue;
    if (x.i === 0) parts.push(Math.trunc(t.idleSec / 60) + ' min idling');
    else if (x.i === 1) parts.push(t.starts + (t.starts === 1 ? ' hard start' : ' hard starts'));
    else parts.push(Math.max(1, Math.trunc(t.fastSec / 60)) + ' min above 90 km/h');
  }
  return parts.length === 0 ? 'smooth drive' : parts.join(', ');
}

/** The one tip for the habit that cost most overall. */
export function tip(sum: number[]): string {
  const worst = sum[0] >= sum[1] && sum[0] >= sum[2] ? 0 : sum[1] >= sum[2] ? 1 : 2;
  if (total(sum) < 0.05) return 'Your driving is already easy on fuel.';
  if (worst === 0) return 'Idling costs the most. Switch off for waits longer than a minute, like level crossings.';
  if (worst === 1) return 'Hard starts cost the most. Pull away gently and change up by 2,000 rpm.';
  return 'Speed costs the most. Holding 80 instead of 100 km/h saves about a fifth of the fuel on the highway.';
}

export function trips(p: Prefs): Trip[] {
  try {
    const a = JSON.parse(p.str(KEY, '[]'));
    return Array.isArray(a) ? a.filter(Array.isArray).map(fromJson) : [];
  } catch {
    return [];
  }
}

/** Keep a finished drive (the last 120); drives under a kilometre aren't worth coaching. */
export function save(p: Prefs, t: Trip | null): void {
  if (!t || t.km < 1) return;
  let a: unknown[] = [];
  try {
    const v = JSON.parse(p.str(KEY, '[]'));
    if (Array.isArray(v)) a = v;
  } catch {
    // start again
  }
  a.push(toJson(t));
  p.put(KEY, JSON.stringify(a.slice(Math.max(0, a.length - KEEP))));
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 15 Oct, 8:30 AM" (the Java "EEE d MMM, h:mm a"). */
export function when(t: number): string {
  const d = new Date(t);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}, ${clock(t)}`;
}

/** "Thu" (the Java "EEE"). */
export function weekday(t: number): string {
  return DOW[new Date(t).getDay()];
}

export interface Summary {
  /** the mileage the estimates use */
  kmpl: number;
  /** ₹ a litre, 0 when not known */
  price: number;
  all: Trip[];
  /** extra litres by habit over all drives: idle, hard starts, speed */
  sum: [number, number, number];
  /** drives that wasted most first */
  sorted: Trip[];
}

/** What the coach screen shows: every drive's waste, summed and sorted. */
export function summarize(p: Prefs): Summary {
  const all = trips(p);
  const avg = stats(log(p)).avgKmpl;
  const kmpl = avg > 0 ? avg : DEFAULT_KMPL;
  const sum: [number, number, number] = [0, 0, 0];
  for (const t of all) {
    const w = waste(t, kmpl);
    for (let i = 0; i < 3; i++) sum[i] += w[i];
  }
  const sorted = [...all].sort((x, y) => total(waste(y, kmpl)) - total(waste(x, kmpl)));
  return { kmpl, price: price(p), all, sum, sorted };
}

/** "Your last 12 drives used about 0.8 litres more than they needed (about ₹84)." */
export function headline(s: Summary): string {
  let b = `Your last ${s.all.length} drives used about ${total(s.sum).toFixed(1)} litres more than they needed`;
  if (s.price > 0) b += ` (about ₹${Math.round(total(s.sum) * s.price)})`;
  return b + '.';
}

/** One drive's line under the reasons: "  (about 0.12 l, ₹13 extra)", or "" when it was smooth. */
export function extra(w: number[], pricePerL: number): string {
  if (total(w) < 0.02) return '';
  return `  (about ${total(w).toFixed(2)} l` + (pricePerL > 0 ? `, ₹${Math.round(total(w) * pricePerL)}` : '') + ' extra)';
}

export const EMPTY =
  'No drives recorded yet. After your next drive of a kilometre or more, this shows which drives used the most extra fuel, and why.';

/** The whole coach text, as the Android version's dialog showed it. */
export function report(p: Prefs): string {
  const s = summarize(p);
  if (s.all.length === 0) return EMPTY;
  let b = headline(s) + '\n\n' + tip(s.sum) + '\n\nThe drives that used the most extra fuel:\n';
  for (const t of s.sorted.slice(0, 8)) {
    const w = waste(t, s.kmpl);
    b += `\n• ${when(t.start)}  ·  ${t.km.toFixed(1)} km, ${minutes(t)} min`;
    b += '\n   ' + reasons(t, w) + extra(w, s.price);
  }
  return b + `\n\nEstimates for a 1.2 litre petrol engine, using ${fmt(s.kmpl)} km/l.`;
}
