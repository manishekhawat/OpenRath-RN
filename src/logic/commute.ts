/**
 * Commute insights (port of Commute.java): from the recorded drives, the trip you make most (say
 * home to office) and how long it takes depending on when you leave, so you can pick the quickest
 * time. Places are named from the map's saved Home and Office when they're within 400 m.
 */
import { minutes, type Trip } from './coach.ts';
import { dist } from './geo.ts';
import type { Prefs } from './prefs.ts';

export const SAME_PLACE_M = 500;

export interface Route {
  from: string;
  to: string;
  trips: number;
  /** the average km of a drive (the total while learning) */
  km: number;
  /** Leaving time (minutes after midnight, in half hours) → [total minutes, trips], earliest first. */
  slots: Map<number, [number, number]>;
  /** the quickest half hour to leave, or -1 when no slot has two drives */
  best: number;
}

/**
 * Minutes after midnight when a drive started. `offsetMin` fixes the time zone (330 for India);
 * left out, the phone's own zone is used.
 */
function minuteOfDay(t: number, offsetMin?: number): number {
  if (offsetMin === undefined) {
    const d = new Date(t);
    return d.getHours() * 60 + d.getMinutes();
  }
  const m = Math.floor((t + offsetMin * 60000) / 60000);
  return ((m % 1440) + 1440) % 1440;
}

/** The two most-made routes with 3 or more drives, most made first. `places` maps a name to [lat, lon]. */
export function learn(all: Trip[], places: Record<string, [number, number]>, offsetMin?: number): Route[] {
  const centres: [number, number][] = [];
  const pairs: [number, number][] = [];
  const used: Trip[] = [];
  for (const t of all) {
    if (t.sLat === 0 || t.eLat === 0 || t.km < 2) continue;
    const a = cluster(centres, t.sLat, t.sLon);
    const b = cluster(centres, t.eLat, t.eLon);
    if (a === b) continue; // a round trip
    pairs.push([a, b]);
    used.push(t);
  }
  const routes = new Map<string, Route>();
  used.forEach((t, i) => {
    const [a, b] = pairs[i];
    const key = a + '>' + b;
    let r = routes.get(key);
    if (!r) {
      r = { from: name(centres[a], places, a), to: name(centres[b], places, b), trips: 0, km: 0, slots: new Map(), best: -1 };
      routes.set(key, r);
    }
    r.trips++;
    r.km += t.km;
    const m = minuteOfDay(t.start, offsetMin);
    const slot = Math.floor(m / 60) * 60 + Math.floor((m % 60) / 30) * 30;
    const s = r.slots.get(slot) ?? [0, 0];
    s[0] += minutes(t);
    s[1]++;
    r.slots.set(slot, s);
  });
  // the Java version kept these in sorted maps: routes by key, slots by time
  const out = [...routes.keys()]
    .sort()
    .map((k) => routes.get(k) as Route)
    .filter((r) => r.trips >= 3)
    .sort((x, y) => y.trips - x.trips);
  for (const r of out) {
    r.slots = new Map([...r.slots.entries()].sort((x, y) => x[0] - y[0]));
    r.km /= r.trips;
    let bestAvg = Number.MAX_VALUE;
    for (const [slot, [mins, n]] of r.slots) {
      const avg = mins / n;
      if (n >= 2 && avg < bestAvg) {
        bestAvg = avg;
        r.best = slot;
      }
    }
  }
  return out.slice(0, 2);
}

function cluster(centres: [number, number][], lat: number, lon: number): number {
  for (let i = 0; i < centres.length; i++) if (dist(centres[i][0], centres[i][1], lat, lon) < SAME_PLACE_M) return i;
  centres.push([lat, lon]);
  return centres.length - 1;
}

function name(c: [number, number], places: Record<string, [number, number]>, i: number): string {
  for (const k of Object.keys(places).sort()) {
    const v = places[k];
    if (dist(c[0], c[1], v[0], v[1]) < 400) return k;
  }
  return 'place ' + String.fromCharCode(65 + Math.min(25, i));
}

/** "8:30 am" for minutes after midnight. */
export function time(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Home and Office from the map's saved places ('place:Home' = "lat,lon"). */
export function places(p: Prefs): Record<string, [number, number]> {
  const m: Record<string, [number, number]> = {};
  for (const n of ['Home', 'Office']) {
    const v = p.str('place:' + n, '').split(',');
    if (v.length === 2) {
      const lat = parseFloat(v[0]);
      const lon = parseFloat(v[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) m[n] = [lat, lon];
    }
  }
  return m;
}

export const EMPTY =
  'Not enough drives yet. After three or more drives between the same two places, this shows how long the drive takes depending on when you leave.';
export const HINT = 'Save Home and Office on the map (the star) to see them named here.';

/** One route's lines: the heading, then one per half hour, then the quickest. */
export function lines(r: Route): string[] {
  const out = [`${r.from} to ${r.to}: ${r.trips} drives, about ${Math.round(r.km)} km`];
  for (const [slot, [mins, n]] of r.slots) {
    out.push(`• Leaving ${time(slot)}–${time(slot + 30)}: ${Math.round(mins / n)} min on average (${n} ${n === 1 ? 'drive' : 'drives'})`);
  }
  if (r.best >= 0) out.push(`Quickest: leave between ${time(r.best)} and ${time(r.best + 30)}.`);
  return out;
}

export function describe(routes: Route[]): string {
  if (routes.length === 0) return EMPTY;
  return routes.map((r) => lines(r).join('\n')).join('\n\n');
}
