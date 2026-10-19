/**
 * The three plain decisions behind the speed the dashboard shows (Fixes.java and CarCard.changed):
 * when there has been no fix for long enough that it reads "--", what the number is for a reading
 * (eased, or snapped to 0 under the speed filter), and when this drive's summary is due once the
 * car has stood still. The drive engine keeps the values between fixes and does the speaking; only
 * the rules live here, so they can be tried on their own.
 */
import * as Speed from './speed.ts';
import * as Trip from './trip.ts';

/** A fix recent enough to show a speed at all; without one the dashboard reads "--" (-1). */
export function fresh(fixAt: number, now: number): boolean {
  return fixAt > 0 && now - fixAt < Speed.FIX_TIMEOUT_MS;
}

/**
 * The speed to show for this reading: eased towards it with "Smooth speed" on, else the reading
 * itself. Either way it is 0 below the speed filter, so the number doesn't crawl at a red light.
 */
export function speed(shown: number, raw: number, dtMs: number, still: number, smooth: boolean): number {
  return smooth ? Speed.smooth(shown, raw, dtMs, still) : raw < still ? 0 : raw;
}

/** When the car became still, kept while it stands and 0 as soon as it moves again. */
export function stillSince(isStill: boolean, since: number, now: number): number {
  if (!isStill) return 0;
  return since === 0 ? now : since;
}

/** This drive's summary is due: standing still long enough, after a drive long enough to sum up. */
export function summaryDue(isStill: boolean, since: number, now: number, driveKm: number, on: boolean): boolean {
  return isStill && now - since >= Trip.STOP_SUMMARY_MS && driveKm >= Trip.STOP_SUMMARY_KM && on;
}
