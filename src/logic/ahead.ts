/**
 * What's on the road ahead (port of Ahead.java), from OpenStreetMap through the Overpass API:
 * toll plazas (a countdown with the expected toll), schools and hospitals (slow down, no horn),
 * and in fog the next bend on this road. Every GPS fix goes to feed(); the map data is fetched
 * again every few hundred metres, in the background. (The wrong-way and overtaking warnings were
 * removed in 1.35: map data gave false alarms.)
 */
import { bearing, dist, ahead as isAhead } from './geo.ts';
import { f, t } from './i18n.ts';

/** A place ahead to speak about once: a toll plaza, school or hospital. */
export interface Spot {
  kind: 'toll' | 'school' | 'hospital';
  name: string;
  lat: number;
  lon: number;
}

/** A road: its points in drawing order, and whether it is one-way (1), one-way backwards (-1) or not (0). */
export interface Road {
  pts: [number, number][];
  oneway: number;
  /** 0 when the map doesn't say */
  lanes: number;
  name: string;
}

export const spotId = (s: Spot) => s.kind + s.lat.toFixed(5) + ',' + s.lon.toFixed(5);

// ------------------------------------------------------------------ geometry

/** The nearest point on a road to (lat, lon), or null for a road of fewer than two points. */
export function nearest(
  pts: [number, number][],
  lat: number,
  lon: number,
): { d: number; bearing: number; seg: number; frac: number } | null {
  let best = Number.MAX_VALUE;
  let br = 0;
  let seg = -1;
  let frac = 0;
  const kx = Math.cos((lat * Math.PI) / 180) * 111320;
  const ky = 110540;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = (pts[i][1] - lon) * kx;
    const ay = (pts[i][0] - lat) * ky;
    const bx = (pts[i + 1][1] - lon) * kx;
    const by = (pts[i + 1][0] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (d < best) {
      best = d;
      br = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      seg = i;
      frac = t;
    }
  }
  return seg < 0 ? null : { d: best, bearing: br, seg, frac };
}

/** The difference between two bearings, 0–180 degrees. */
export function turn(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/**
 * The next bend on this road in the direction of travel, within maxM metres: metres to it,
 * +1 right or -1 left, and how sharp in degrees; null when it runs straight. A bend is the road
 * turning 30 degrees or more within 80 metres.
 */
export function nextBend(
  pts: [number, number][],
  lat: number,
  lon: number,
  heading: number,
  maxM: number,
): { m: number; dir: number; sharp: number } | null {
  const n = nearest(pts, lat, lon);
  if (!n || heading < 0) return null;
  const forward = turn(n.bearing, heading) < 90;
  // the points ahead, in travel order, starting from where the car is
  const ahead: [number, number][] = [[lat, lon]];
  if (forward) for (let i = n.seg + 1; i < pts.length; i++) ahead.push(pts[i]);
  else for (let i = n.seg; i >= 0; i--) ahead.push(pts[i]);
  let travelled = 0;
  let prevBearing = heading;
  for (let i = 0; i + 1 < ahead.length; i++) {
    const a = ahead[i];
    const b = ahead[i + 1];
    const len = dist(a[0], a[1], b[0], b[1]);
    if (len < 3) continue;
    const br = bearing(a[0], a[1], b[0], b[1]);
    if (i > 0) {
      // look over the next 80 m: how far the road swings from the bearing before this point
      let swing = 0;
      let look = 0;
      let dir = 0;
      for (let j = i; j + 1 < ahead.length && look < 80; j++) {
        const p = ahead[j];
        const q = ahead[j + 1];
        const l = dist(p[0], p[1], q[0], q[1]);
        if (l < 3) continue;
        const bj = bearing(p[0], p[1], q[0], q[1]);
        const t = turn(prevBearing, bj);
        if (t > swing) {
          swing = t;
          dir = ((bj - prevBearing + 540) % 360) - 180 > 0 ? 1 : -1;
        }
        look += l;
      }
      if (swing >= 30) return { m: travelled, dir, sharp: swing };
    }
    travelled += len;
    if (travelled > maxM) return null;
    prevBearing = br;
  }
  return null;
}

/** School hours on a weekday or Saturday: 7–9:30 in the morning and 12:30–3:30 in the afternoon. */
export function schoolHours(d: Date): boolean {
  if (d.getDay() === 0) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return (m >= 7 * 60 && m <= 9 * 60 + 30) || (m >= 12 * 60 + 30 && m <= 15 * 60 + 30);
}

/** "Toll plaza in 2 kilometres, about 65 rupees. Keep to the FASTag lane." */
export function tollText(m: number, rupees: number, name: string): string {
  const km = Math.round(m / 1000);
  const where = m >= 950 ? `${km} kilometre${km === 1 ? '' : 's'}` : Math.round(m / 100) * 100 + ' metres';
  return (
    'Toll plaza' + (name === '' ? '' : ', ' + name + ',') + ' in ' + where +
    (rupees > 0 ? ', about ' + rupees + ' rupees' : '') + '. Keep to the FASTag lane.'
  );
}

// ------------------------------------------------------------------ Overpass

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Roads with their shape within 400 m; with `places`, toll plazas within 3 km and schools and hospitals within 600 m. */
export function query(lat: number, lon: number, places: boolean): string {
  const a = lat.toFixed(6);
  const o = lon.toFixed(6);
  return (
    '[out:json][timeout:15];' +
    `way(around:400,${a},${o})[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"];` +
    'out tags geom qt;' +
    (places
      ? `(node(around:3000,${a},${o})[barrier=toll_booth];` +
        `nwr(around:600,${a},${o})[amenity~"^(school|kindergarten|hospital)$"];);out tags center qt;`
      : '')
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The places and roads in an Overpass answer. */
export function parse(j: any): { spots: Spot[]; roads: Road[] } {
  const spots: Spot[] = [];
  const roads: Road[] = [];
  for (const e of j?.elements ?? []) {
    const tags = e?.tags;
    if (!tags) continue;
    const amenity: string = tags.amenity ?? '';
    if (tags.barrier === 'toll_booth') {
      if (Number.isFinite(e.lat) && Number.isFinite(e.lon)) spots.push({ kind: 'toll', name: tags.name ?? '', lat: e.lat, lon: e.lon });
    } else if (amenity !== '') {
      const la = e.center ? e.center.lat : e.lat;
      const lo = e.center ? e.center.lon : e.lon;
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
      spots.push({ kind: amenity === 'hospital' ? 'hospital' : 'school', name: tags.name ?? '', lat: la, lon: lo });
    } else if (e.type === 'way' && Array.isArray(e.geometry)) {
      const ow: string = tags.oneway ?? '';
      let oneway = ow === 'yes' || ow === '1' || ow === 'true' ? 1 : ow === '-1' ? -1 : 0;
      if (oneway === 0 && (tags.highway === 'motorway' || tags.junction === 'roundabout')) oneway = ow === 'no' ? 0 : 1;
      const lanes = Math.trunc(Number(tags.lanes ?? 0));
      roads.push({
        pts: e.geometry.map((g: any) => [Number(g?.lat), Number(g?.lon)] as [number, number]),
        oneway,
        lanes: Number.isFinite(lanes) ? lanes : 0,
        name: tags.name ?? '',
      });
    }
  }
  return { spots, roads };
}

/** Sends an Overpass query and returns the answer's text. */
export type Fetch = (query: string) => Promise<string>;

/** Which warnings are switched on, and the toll per plaza (0 = don't say a price). */
export interface Wants {
  toll: boolean;
  zones: boolean;
  fog: boolean;
  tollRate: number;
}

/** What the dashboard can show about the road ahead after a fix. */
export interface View {
  /** metres to the nearest toll plaza ahead, or -1 */
  tollM: number;
  tollName: string;
  /** a school or hospital within 250 m ahead */
  zone: '' | 'school' | 'hospital';
  /** the mapped road under the car, "" when none */
  road: string;
  oneway: boolean;
  /** the next bend in fog: metres (or -1 when none), and +1 right / -1 left */
  bendM: number;
  bendDir: number;
}

export class Ahead {
  spots: Spot[] = [];
  roads: Road[] = [];
  view: View = { tollM: -1, tollName: '', zone: '', road: '', oneway: false, bendM: -1, bendDir: 0 };
  private told = new Set<string>();
  private qLat = 0;
  private qLon = 0;
  private qAt = 0;
  private busy = false;

  /** For tests: whether a fetch is running. */
  get fetching(): boolean {
    return this.busy;
  }

  /**
   * One GPS fix. Returns sentences to speak (possibly none). The map data is fetched in the
   * background through `net` when the car has moved on or the data is old.
   */
  feed(lat: number, lon: number, heading: number, kmh: number, want: Wants, net: Fetch, now: Date): string[] {
    const say: string[] = [];
    const v: View = { tollM: -1, tollName: '', zone: '', road: '', oneway: false, bendM: -1, bendDir: 0 };
    this.view = v;
    if (!(want.toll || want.zones || want.fog)) return say;
    const ms = now.getTime();
    const far = this.qAt === 0 || dist(this.qLat, this.qLon, lat, lon) > 350;
    if (!this.busy && kmh > 3 && (far || ms - this.qAt > 180000) && ms - this.qAt > 10000) this.fetch(lat, lon, want.toll || want.zones, net, ms);

    const once = (id: string) => (this.told.has(id) ? false : (this.told.add(id), true));
    for (const s of this.spots) {
      const d = dist(lat, lon, s.lat, s.lon);
      const ahead = isAhead(lat, lon, heading, s.lat, s.lon, 2500);
      if (s.kind === 'toll' && want.toll && ahead && (v.tollM < 0 || d < v.tollM)) {
        v.tollM = Math.round(d);
        v.tollName = s.name;
      }
      if (s.kind !== 'toll' && want.zones && ahead && d < 250 && v.zone !== 'hospital') v.zone = s.kind;
      if (s.kind === 'toll' && want.toll && ahead && d < 2200 && d > 250 && kmh > 15 && once(spotId(s))) say.push(tollText(d, want.tollRate, s.name));
      if (s.kind === 'school' && want.zones && ahead && d < 250 && kmh > 25 && schoolHours(now) && once(spotId(s)))
        say.push('School ahead. Please slow down.');
      if (s.kind === 'hospital' && want.zones && ahead && d < 250 && once(spotId(s))) say.push("Hospital ahead. Please don't use the horn.");
    }
    // the road under the car: the nearest mapped road within 12 m
    let on: Road | null = null;
    let onD = 12;
    for (const r of this.roads) {
      const n = nearest(r.pts, lat, lon);
      if (n && n.d < onD) {
        onD = n.d;
        on = r;
      }
    }
    if (on) {
      v.road = on.name;
      v.oneway = on.oneway !== 0;
    }
    if (want.fog && on) {
      const b = nextBend(on.pts, lat, lon, heading, 400);
      v.bendM = b ? b.m : -1;
      v.bendDir = b ? b.dir : 0;
      if (b && b.m < 250 && b.m > 40 && kmh > 10 && once('bend' + Math.round(lat * 2000) + ',' + Math.round(lon * 2000)))
        say.push((b.sharp > 60 ? 'Sharp bend ' : 'Bend ') + (b.dir > 0 ? 'to the right' : 'to the left') + ' ahead.');
    }
    return say;
  }

  /** A new drive: places can be announced again. */
  reset(): void {
    this.told.clear();
  }

  private fetch(lat: number, lon: number, places: boolean, net: Fetch, now: number): void {
    this.busy = true;
    this.qAt = now;
    this.qLat = lat;
    this.qLon = lon;
    net(query(lat, lon, places))
      .then((text) => {
        const got = parse(JSON.parse(text));
        if (places) this.spots = got.spots;
        this.roads = got.roads;
      })
      .catch(() => {
        this.qAt = Date.now() - 170000; // try again in ten seconds
      })
      .finally(() => {
        this.busy = false;
      });
  }
}

/** The short line for the dashboard: the most useful thing about the road ahead, or "". */
export function line(v: View): string {
  if (v.zone === 'hospital') return t('Hospital ahead · no horn');
  if (v.zone === 'school') return t('School ahead · slow down');
  if (v.tollM >= 0) {
    const where = v.tollM >= 950 ? (v.tollM / 1000).toFixed(1) + ' km' : Math.round(v.tollM / 100) * 100 + ' m';
    return v.tollName ? f('Toll plaza %1$s in %2$s', v.tollName, where) : f('Toll plaza in %1$s', where);
  }
  return '';
}

/** POSTs an Overpass query with fetch(), as the Android version did with HttpURLConnection. */
export const overpass: Fetch = async (q) => {
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error('overpass ' + r.status);
  return r.text();
};
