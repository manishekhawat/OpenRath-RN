/**
 * The trip computer, parking spot and driving score (the pure parts of Drive.java). Each GPS
 * fix goes through `feed`, which returns the new state; the app keeps the state and saves it.
 */
import { dist } from './geo.ts';

export interface Fix {
  lat: number;
  lon: number;
  /** m/s from the GPS, or null when it gives none */
  speed: number | null;
  /** degrees, or null */
  heading: number | null;
  /** metres */
  accuracy: number | null;
  t: number;
}

export interface TripState {
  day: string;
  todayKm: number;
  todaySec: number;
  driveKm: number;
  driveSec: number;
  /** the GPS odometer: every km counted since the app was installed */
  odoKm: number;
  kmh: number;
  heading: number;
  lat: number;
  lon: number;
  todayBrakes: number;
  todayAccels: number;
  todaySpeedSec: number;
  park: { lat: number; lon: number; at: number } | null;
  // working values
  last: Fix | null;
  prevKmh: number;
  prevAt: number;
  lastHarsh: number;
  moved: boolean;
  stoppedSince: number;
  stopAt: { lat: number; lon: number } | null;
}

/** Day by day: [km, seconds, harsh brakes, hard starts, seconds over the limit, score]. */
export type History = Record<string, number[]>;

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initial(now: number, saved?: Partial<TripState>): TripState {
  return {
    day: dayKey(now),
    todayKm: 0,
    todaySec: 0,
    driveKm: 0,
    driveSec: 0,
    odoKm: 0,
    kmh: 0,
    heading: -1,
    lat: 0,
    lon: 0,
    todayBrakes: 0,
    todayAccels: 0,
    todaySpeedSec: 0,
    park: null,
    last: null,
    prevKmh: 0,
    prevAt: 0,
    lastHarsh: 0,
    moved: false,
    stoppedSince: 0,
    stopAt: null,
    ...saved,
  };
}

/** 100 = smooth and within limits; harsh braking, hard starts and speeding take points off. */
export function score(s: TripState): number {
  return Math.trunc(Math.max(0, Math.min(100, 100 - 4 * s.todayBrakes - 2 * s.todayAccels - s.todaySpeedSec / 30)));
}

export interface FeedResult {
  state: TripState;
  /** the day that just ended, to add to the history */
  closedDay?: { day: string; row: number[] };
  hardBrake: boolean;
  hardStart: boolean;
  parked: boolean;
}

/**
 * One GPS fix. `over` says the car is above the speed limit right now; `scoring` and `parking`
 * are the feature switches.
 */
export function feed(s0: TripState, f: Fix, opts: { over: boolean; scoring: boolean; parking: boolean }): FeedResult {
  const s: TripState = { ...s0 };
  const now = f.t;
  let closedDay: FeedResult['closedDay'];
  if (dayKey(now) !== s.day) {
    // past midnight: close yesterday, start today
    closedDay = { day: s.day, row: [Math.round(s.todayKm * 10) / 10, s.todaySec, s.todayBrakes, s.todayAccels, s.todaySpeedSec, score(s)] };
    s.day = dayKey(now);
    s.todayKm = 0;
    s.todaySec = 0;
    s.todayBrakes = 0;
    s.todayAccels = 0;
    s.todaySpeedSec = 0;
  }
  let kmh = f.speed != null && f.speed >= 0 ? f.speed * 3.6 : 0;
  const last = s.last;
  const d = last ? dist(last.lat, last.lon, f.lat, f.lon) : 0;
  // some units' GPS gives no speed, so it's worked out from position changes
  if ((f.speed == null || kmh === 0) && last && now - last.t > 0 && now - last.t < 5000 && d > 2) {
    kmh = Math.max(kmh, (d / ((now - last.t) / 1000)) * 3.6);
  }
  s.kmh = kmh;
  s.lat = f.lat;
  s.lon = f.lon;
  s.heading = f.heading != null && kmh > 5 ? f.heading : -1;

  // harsh braking / hard starts: speed change over about a second
  let hardBrake = false;
  let hardStart = false;
  if (s.prevAt !== 0 && now - s.prevAt <= 2500 && now - s.prevAt >= 500) {
    const rate = (kmh - s.prevKmh) / ((now - s.prevAt) / 1000); // km/h per second
    if (now - s.lastHarsh > 5000) {
      if (rate < -12 && s.prevKmh > 20) {
        hardBrake = true;
        s.lastHarsh = now;
        if (opts.scoring) s.todayBrakes++;
      } else if (rate > 11) {
        hardStart = true;
        s.lastHarsh = now;
        if (opts.scoring) s.todayAccels++;
      }
    }
    if (opts.over) s.todaySpeedSec += Math.floor((now - s.prevAt) / 1000);
  }
  s.prevKmh = kmh;
  s.prevAt = now;

  // count real movement only: not GPS drift while parked, not jumps after a gap
  if (last && (f.accuracy == null || f.accuracy < 40)) {
    const dt = now - last.t;
    if (kmh > 4 && d < 70 * Math.max(1, dt / 1000)) {
      s.todayKm += d / 1000;
      s.driveKm += d / 1000;
      s.odoKm += d / 1000;
      if (dt < 5000) {
        s.todaySec += Math.floor(dt / 1000);
        s.driveSec += Math.floor(dt / 1000);
      }
    }
  }
  s.last = f;

  // where I parked: standing still 90 s after a drive
  let parked = false;
  if (opts.parking) {
    if (kmh > 8) {
      s.moved = true;
      s.stoppedSince = 0;
    } else if (s.moved) {
      if (s.stoppedSince === 0) {
        s.stoppedSince = now;
        s.stopAt = { lat: f.lat, lon: f.lon };
      } else if (now - s.stoppedSince > 90000 && s.stopAt) {
        s.park = { ...s.stopAt, at: now };
        s.moved = false;
        parked = true;
      }
    }
  }
  return { state: s, closedDay, hardBrake, hardStart, parked };
}

/** What gets saved between runs (the working values start fresh). */
export function persisted(s: TripState): Partial<TripState> {
  const { day, todayKm, todaySec, odoKm, todayBrakes, todayAccels, todaySpeedSec, park, lat, lon } = s;
  return { day, todayKm, todaySec, odoKm, todayBrakes, todayAccels, todaySpeedSec, park, lat, lon };
}

export function avgKmh(km: number, sec: number): number {
  return sec > 0 ? km / (sec / 3600) : 0;
}

export function duration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
