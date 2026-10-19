/**
 * The drive clock behind the break reminder (the parts of Coach.Tracker and Drive.restStop the
 * road helpers need). A drive starts above 8 km/h and ends after ten minutes standing still; its
 * end is also when road warnings may repeat.
 */
import { f } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

/** a stop this long ends the drive */
export const STOP_MS = 10 * 60000;
/** the reminder comes again after this long */
export const AGAIN_MS = 45 * 60000;

export class DriveClock {
  /** when this drive started, 0 when not driving */
  start = 0;
  private stillSince = 0;

  /** One speed reading; returns true when a long stop has just ended the drive. */
  feed(kmh: number, now: number): boolean {
    if (this.start === 0) {
      if (kmh > 8) {
        this.start = now;
        this.stillSince = 0;
      }
      return false;
    }
    if (kmh < 2) {
      if (this.stillSince === 0) this.stillSince = now;
      if (now - this.stillSince >= STOP_MS) {
        this.start = 0;
        return true;
      }
    } else this.stillSince = 0;
    return false;
  }

  /** Minutes driven since the last long stop, or 0 when not driving. */
  minutes(now: number): number {
    return this.start === 0 ? 0 : Math.floor((now - this.start) / 60000);
  }
}

/** Minutes at the wheel before the break reminder (Settings offers 90, 120, 150 or 180). */
export function breakMin(p: Prefs): number {
  return num(p, 'breakMin', 120);
}

export const BREAK_CHOICES = [90, 120, 150, 180];

/** Whether to remind now: past the set time, and not within 45 minutes of the last reminder. */
export function due(p: Prefs, mins: number, now: number, restAt: number): boolean {
  return mins >= breakMin(p) && now - restAt >= AGAIN_MS;
}

/** "You've been driving for 2 hours. Time for a short break. Looking for a stop ahead." */
export function restText(mins: number): string {
  const h = Math.floor(mins / 60);
  const t = mins >= 90 && mins % 60 < 15 ? h + (h === 1 ? ' hour' : ' hours') : mins + ' minutes';
  return "You've been driving for " + t + '. Time for a short break. Looking for a stop ahead.';
}

/** "2 hours of driving" or "1.5 hours of driving", for Settings. */
export function breakText(min: number): string {
  return f('%1$s hours of driving', min % 60 === 0 ? String(min / 60) : (min / 60).toFixed(1));
}
