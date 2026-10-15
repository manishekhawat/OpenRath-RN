/**
 * Places the car learns from your own drives (port of Spots.java), kept as plain text in the
 * settings ("bumps" and "waits"): speed breakers (a sharp slow-down at the same spot, in the same
 * direction, on three different drives) and stops (how long you usually wait at a signal or toll
 * plaza, by the time of day).
 */
import { ahead as isAhead, dist } from './geo.ts';

export interface Spot {
  lat: number;
  lon: number;
  /** heading in eighths (0 = north), -1 for any */
  dir: number;
  /** [drive or time, value] */
  seen: [number, number][];
}

/** Heading in eighths of a circle (0 = north), or -1 when not known. */
export function eighth(heading: number): number {
  return heading < 0 ? -1 : Math.round((((heading % 360) + 360) % 360) / 45) % 8;
}

/** How many different drives (ids) a spot was seen on. */
export function drives(s: Spot): number {
  return new Set(s.seen.map((r) => r[0])).size;
}

/** The median of the values (the upper one of an even count), or -1 for none. */
export function median(v: number[]): number {
  if (v.length === 0) return -1;
  const c = [...v].sort((a, b) => a - b);
  return c[Math.floor(c.length / 2)];
}

/** Waits at a spot within two hours of `hour` (wrapping round midnight); all of them when fewer than three. */
export function waitsNear(s: Spot, hour: number): number[] {
  const near: number[] = [];
  const any: number[] = [];
  for (const r of s.seen) {
    any.push(r[1]);
    const dh = Math.abs(new Date(r[0]).getHours() - hour);
    if (Math.min(dh, 24 - dh) <= 2) near.push(r[1]);
  }
  return near.length >= 3 ? near : any;
}

/** A spot's id, for saying it once a drive. */
export function id(s: Spot): string {
  return `${s.lat.toFixed(4)},${s.lon.toFixed(4)},${s.dir}`;
}

/** A learnt speed breaker: seen on three different drives. */
export const isBreaker = (s: Spot) => drives(s) >= 3;

/** A stop worth mentioning at this hour: three waits or more, usually 40 s or longer. */
export const isLongWait = (hour: number) => (s: Spot) => s.seen.length >= 3 && median(waitsNear(s, hour)) >= 40;

export class Spots {
  private all = new Map<string, Spot>();
  private grid: number;
  private keep: number;
  private max: number;

  /** grid: size of a spot in degrees; keep: readings kept per spot; max: spots kept in all. */
  constructor(grid: number, keep: number, max: number) {
    this.grid = grid;
    this.keep = keep;
    this.max = max;
  }

  private key(lat: number, lon: number, dir: number): string {
    return Math.round(lat / this.grid) + ',' + Math.round(lon / this.grid) + ',' + dir;
  }

  /** Add a reading at a place: `idOrTime` is the drive (for breakers) or the time (for waits). */
  add(lat: number, lon: number, heading: number, idOrTime: number, value: number): Spot {
    const d = eighth(heading);
    const k = this.key(lat, lon, d);
    let s = this.all.get(k);
    if (!s) {
      s = { lat, lon, dir: d, seen: [] };
      this.all.set(k, s);
      while (this.all.size > this.max) this.all.delete(this.all.keys().next().value as string);
    }
    s.seen.push([idOrTime, value]);
    while (s.seen.length > this.keep) s.seen.shift();
    return s;
  }

  /** The nearest learnt spot ahead in the car's direction within `metres`, matching `ok`, or null. */
  ahead(lat: number, lon: number, heading: number, metres: number, ok: (s: Spot) => boolean): Spot | null {
    let best: Spot | null = null;
    let bestD = metres;
    const d = eighth(heading);
    for (const s of this.all.values()) {
      if (s.dir >= 0 && d >= 0 && Math.min(Math.abs(s.dir - d), 8 - Math.abs(s.dir - d)) > 1) continue;
      const m = dist(lat, lon, s.lat, s.lon);
      if (m < bestD && m > 15 && isAhead(lat, lon, heading, s.lat, s.lon, metres) && ok(s)) {
        bestD = m;
        best = s;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ saving as text

  /** One line a spot: "lat|lon|dir|id:value,id:value". */
  save(): string {
    let b = '';
    for (const s of this.all.values()) {
      b += `${s.lat.toFixed(5)}|${s.lon.toFixed(5)}|${s.dir}|` + s.seen.map((r) => r[0] + ':' + r[1]).join(',') + '\n';
    }
    return b;
  }

  load(text: string | null | undefined): void {
    this.all.clear();
    if (!text) return;
    const int = /^-?\d+$/;
    for (const line of text.split('\n')) {
      const f = line.split('|');
      if (f.length < 4 || f[3] === '') continue;
      const la = Number(f[0]);
      const lo = Number(f[1]);
      if (!Number.isFinite(la) || !Number.isFinite(lo) || !int.test(f[2])) continue;
      const seen: [number, number][] = [];
      let bad = false;
      for (const r of f[3].split(',')) {
        const p = r.split(':');
        if (p.length !== 2) continue;
        if (!int.test(p[0]) || !int.test(p[1])) bad = true;
        else seen.push([Number(p[0]), Number(p[1])]);
      }
      if (bad) continue; // as the Android version: a broken reading drops the spot
      const d = Number(f[2]);
      this.all.set(this.key(la, lo, d), { lat: la, lon: lo, dir: d, seen });
    }
  }

  size(): number {
    return this.all.size;
  }

  count(t: (s: Spot) => boolean): number {
    let n = 0;
    for (const s of this.all.values()) if (t(s)) n++;
    return n;
  }

  clear(): void {
    this.all.clear();
  }
}

/** The two stores Drive keeps: speed breakers and waits, with the Android version's sizes. */
export const breakers = () => new Spots(0.0003, 12, 400);
export const waits = () => new Spots(0.0005, 10, 300);
