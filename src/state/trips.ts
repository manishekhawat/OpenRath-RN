/**
 * What the drive service feeds on each GPS fix for trips, mileage and money (the parts of
 * Drive.java that called Coach, Tracks and FuelPlan): the mileage coach's drive tracker, the route
 * recorder and the fuel-low check (the 0–100 timer is in road.ts, which also shows it). Each keeps its own state for the app's run.
 *
 * For each fix in src/state/engine.ts:
 *
 *   const before = snap.trip;                     // before Trip.feed replaces it
 *   const r = Trip.feed(before, fix, opts);
 *   ...
 *   const out = Trips.onTripFix(prefs, before, r, l.coords.altitude);
 *   out.say.forEach(say);
 *
 * and when the app closes with no background task to go on: `Trips.end(prefs)`.
 */
import * as Coach from '../logic/coach';
import * as Features from '../logic/features';
import { LowCheck } from '../logic/fuelplan';
import type { Prefs } from '../logic/prefs';
import * as Tracks from '../logic/tracks';
import type { FeedResult, TripState } from '../logic/trip';
import * as TrackFiles from './tracks';

/** Builds the coach's drives; a finished one (over a km) is saved to the 'drives' pref (the coach is part of "Fuel and mileage" since 1.35). */
export const coachTracker = {
  tracker: new Coach.Tracker(),
  /** Returns the drive a ten-minute stop just finished, or null. */
  feed(prefs: Prefs, t: number, kmh: number, movedKm: number, hardStart: boolean, hardBrake: boolean, lat: number, lon: number): Coach.Trip | null {
    const done = this.tracker.feed(t, kmh, movedKm, hardStart, hardBrake, lat, lon);
    if (done && Features.on(prefs, 'fuelPrice')) Coach.save(prefs, done);
    return done;
  },
  /** The app is closing: keep the drive so far. */
  end(prefs: Prefs, now: number = Date.now()): void {
    const done = this.tracker.close(now);
    if (Features.on(prefs, 'fuelPrice')) Coach.save(prefs, done);
  },
  /** Minutes at the wheel since the last long stop (for the break reminder). */
  drivingMinutes(now: number = Date.now()): number {
    return this.tracker.drivingMinutes(now);
  },
};

/** Keeps a point every 5 s or 30 m while moving, in the day's file, when route recording is on. */
export const trackRecorder = {
  sampler: new Tracks.Sampler(),
  pruned: false,
  feed(prefs: Prefs, t: number, lat: number, lon: number, alt: number | null, kmh: number): void {
    if (!Features.on(prefs, 'gpx')) return;
    if (!this.pruned) {
      this.pruned = true;
      TrackFiles.prune();
    }
    if (!this.sampler.keep(lat, lon, kmh, t)) return;
    TrackFiles.append(t, Tracks.csvLine(t, lat, lon, alt ?? 0, kmh));
  },
};

/** Checks the petrol range every 30 s while moving; returns the warning to say, or null. */
export const fuelLow = {
  check: new LowCheck(),
  at: 0,
  feed(prefs: Prefs, t: number, kmh: number, odoKm: number): string | null {
    if (t - this.at <= 30000 || kmh <= 5) return null;
    this.at = t;
    return this.check.check(prefs, odoKm);
  },
};

export interface FixOut {
  /** sentences to speak, in order */
  say: string[];
  /** a ten-minute stop just ended a drive (the break clock can start again) */
  driveEnded: boolean;
  /** the fuel-low warning fired (the map can show the pumps ahead) */
  fuelLow: boolean;
}

/** All of the above for one fix, from the trip computer's state before and after Trip.feed. */
export function onTripFix(prefs: Prefs, before: TripState, r: FeedResult, altitude: number | null): FixOut {
  const s = r.state;
  const t = s.last?.t ?? Date.now();
  const say: string[] = [];
  trackRecorder.feed(prefs, t, s.lat, s.lon, altitude, s.kmh);
  // the km the trip computer counted for this fix (it leaves out GPS drift and jumps)
  const movedKm = Math.max(0, s.odoKm - before.odoKm);
  const done = coachTracker.feed(prefs, t, s.kmh, movedKm, r.hardStart, r.hardBrake, s.lat, s.lon);
  const low = fuelLow.feed(prefs, t, s.kmh, s.odoKm);
  if (low) say.push(low);
  return { say, driveEnded: done !== null, fuelLow: low !== null };
}

/** The app is closing: keep the drive so far. */
export function end(prefs: Prefs): void {
  coachTracker.end(prefs);
}
