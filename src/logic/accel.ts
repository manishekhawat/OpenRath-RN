/**
 * The 0–100 km/h timer (port of Tracks.Timer and Drive.accelDone): it times every standing start
 * from GPS (or OBD-II) speed, and keeps the latest and best times in the settings: "accelLast"
 * as "t100|t60|time" and "accelBest" as "t100", as in the Android version.
 */
import { f, t } from './i18n.ts';
import { dec, type Prefs } from './prefs.ts';

/**
 * Times standing starts: armed after a second at a standstill, starts when the car moves, and
 * records the moment 60 and 100 km/h are passed (between two readings, the crossing time is
 * interpolated). A run that slows down or takes over 40 s is dropped.
 */
export class Timer {
  private stillSince = 0;
  private startAt = 0;
  private prevAt = 0;
  private prevKmh = 0;
  private armed = false;
  private running = false;
  private done60 = false;
  /** seconds, from the latest run; -1 when not reached */
  result60 = -1;
  result100 = -1;

  /** Feed a speed reading; returns a finished 0–100 time in seconds, or -1. */
  feed(kmh: number, now: number): number {
    let out = -1;
    if (kmh < 2) {
      if (this.stillSince === 0) this.stillSince = now;
      if (now - this.stillSince >= 1000) this.armed = true;
      this.running = false;
    } else {
      this.stillSince = 0;
      if (this.armed && !this.running) {
        this.running = true;
        this.armed = false;
        // the car pulled away somewhere between the last still reading and this one
        this.startAt = this.prevAt !== 0 && now - this.prevAt < 3000 ? this.prevAt + Math.trunc((now - this.prevAt) / 2) : now;
        this.done60 = false;
        this.result60 = this.result100 = -1;
      }
      if (this.running) {
        if (kmh + 3 < this.prevKmh || now - this.startAt > 40000) this.running = false; // backed off: not a full run
        else {
          if (!this.done60 && kmh >= 60) {
            this.result60 = this.cross(60, kmh, now);
            this.done60 = true;
          }
          if (kmh >= 100) {
            this.result100 = this.cross(100, kmh, now);
            out = this.result100;
            this.running = false;
          }
        }
      }
    }
    this.prevKmh = kmh;
    this.prevAt = now;
    return out;
  }

  private cross(target: number, kmh: number, now: number): number {
    const f = kmh <= this.prevKmh ? 1 : (target - this.prevKmh) / (kmh - this.prevKmh);
    const at = this.prevAt + Math.trunc((now - this.prevAt) * Math.min(1, Math.max(0, f)));
    return (at - this.startAt) / 1000;
  }
}

/** A finished run: saves it, and returns what to say ("Nought to hundred in 9.4 seconds, your best"). */
export function done(p: Prefs, t100: number, t60: number, now: number): { text: string; record: boolean } {
  const s100 = t100.toFixed(1);
  p.put('accelLast', s100 + (t60 > 0 ? '|' + t60.toFixed(1) : '|') + '|' + now);
  const best = dec(p, 'accelBest', 0);
  const record = best <= 0 || t100 < best;
  if (record) p.put('accelBest', s100);
  return { text: 'Nought to hundred in ' + s100 + ' seconds' + (record ? ', your best' : ''), record };
}

/** For Settings: "last 9.4 s (0–60 5.1 s)  ·  best 8.9 s", or "no full run yet". */
export function summary(p: Prefs): string {
  const last = p.str('accelLast', '');
  if (last === '') return t('no full run yet');
  const lf = last.split('|');
  return f('last %1$s s', lf[0]) + (lf.length > 1 && lf[1] !== '' ? ' (0–60 ' + lf[1] + ' s)' : '') + f('  ·  best %1$s s', p.str('accelBest', '-'));
}

export function forget(p: Prefs): void {
  p.put('accelBest', '');
  p.put('accelLast', '');
}
