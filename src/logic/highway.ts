/**
 * Highway mode (port of Highway.java): after two minutes above 75 km/h the car counts as on the
 * highway until it stays under 50 km/h for two minutes. While it lasts, message pop-ups and
 * read-aloud wait (they are counted and mentioned when the highway ends), and the dashboard shows
 * a slim highway strip with the average speed and the time since the last break.
 */

export const FAST = 75;
export const SLOW = 50;
export const HOLD_MS = 120000;

export class Highway {
  on = false;
  /** messages that waited */
  held = 0;
  private fastSince = -1;
  private slowSince = -1;

  /** One speed reading; returns +1 when highway mode starts, -1 when it ends, else 0. */
  feed(kmh: number, now: number): number {
    if (kmh >= FAST) {
      if (this.fastSince < 0) this.fastSince = now;
    } else this.fastSince = -1;
    if (kmh < SLOW) {
      if (this.slowSince < 0) this.slowSince = now;
    } else this.slowSince = -1;
    if (!this.on && this.fastSince >= 0 && now - this.fastSince >= HOLD_MS) {
      this.on = true;
      this.held = 0;
      return 1;
    }
    if (this.on && this.slowSince >= 0 && now - this.slowSince >= HOLD_MS) {
      this.on = false;
      return -1;
    }
    return 0;
  }

  reset(): void {
    this.fastSince = this.slowSince = -1;
    this.on = false;
  }
}

export const START_TEXT = 'Highway mode on. Messages will wait until you slow down.';

export function endText(held: number): string {
  if (held <= 0) return 'Highway mode off.';
  return 'Highway mode off. ' + held + (held === 1 ? ' message' : ' messages') + ' came in while you were on the highway.';
}

/** The slim strip: "HIGHWAY  ·  avg 82 km/h  ·  driving 1 h 5 min  ·  2 waiting". */
export function stripText(avgKmh: number, drivingMin: number, held: number): string {
  const mins = Math.max(0, Math.floor(drivingMin));
  return (
    'HIGHWAY  ·  avg ' + Math.round(avgKmh) + ' km/h  ·  driving ' +
    (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min') +
    (held > 0 ? '  ·  ' + held + ' waiting' : '')
  );
}
