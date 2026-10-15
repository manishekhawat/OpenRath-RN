/**
 * Hill (ghat) mode (port of Hill.java): the slope of the road from the GPS height over the last
 * few hundred metres. On a long steep climb or descent a voice gives the hill-driving tips once:
 * a low gear, engine braking instead of riding the brakes going down, and that traffic climbing
 * up has the right of way. GPS height is rough, so it only speaks for a steady slope over 400 m.
 */

/** 6 %: a ghat road */
export const STEEP = 0.06;
/** back under 3 %: the hill is over */
export const GENTLE = 0.03;
/** the slope is measured over this much road */
export const SPAN_M = 500;

export const CLIMB_TEXT = 'Steep climb. Stay in a lower gear, and keep to your side at the bends.';
export const DESCENT_TEXT =
  "Steep road going down. Use a lower gear and let the engine slow the car; don't ride the brakes. " +
  'Vehicles climbing up have the right of way.';

export class Hill {
  /** [metres driven, height] */
  private pts: [number, number][] = [];
  private g = NaN;
  /** 1 climbing, -1 descending, 0 none since the last flat stretch */
  private told = 0;
  private flatFrom = -1;

  /** The slope now (rise over run, + uphill), or NaN until there is enough road. */
  grade(): number {
    return this.g;
  }

  /** One fix: the metres driven so far and the GPS height; returns tips to speak, or null. */
  feed(metres: number, height: number): string | null {
    const pts = this.pts;
    if (pts.length > 0 && metres < pts[pts.length - 1][0]) this.reset(); // the count started again
    pts.push([metres, height]);
    while (pts.length > 2 && metres - pts[1][0] >= SPAN_M) pts.shift();
    const run = metres - pts[0][0];
    if (run < SPAN_M * 0.8) {
      this.g = NaN;
      return null;
    }
    // average the ends a little: the first and last few points
    this.g = (this.avg(pts.length - 3, pts.length) - this.avg(0, 3)) / run;
    const a = Math.abs(this.g);
    if (a < GENTLE) {
      if (this.flatFrom < 0) this.flatFrom = metres;
      if (metres - this.flatFrom > 1000) this.told = 0; // a kilometre of flat road: the next hill is new
      return null;
    }
    this.flatFrom = -1;
    if (a < STEEP) return null;
    const dir = this.g > 0 ? 1 : -1;
    if (this.told === dir) return null;
    this.told = dir;
    return dir > 0 ? CLIMB_TEXT : DESCENT_TEXT;
  }

  private avg(from: number, to: number): number {
    from = Math.max(0, from);
    to = Math.min(this.pts.length, to);
    let s = 0;
    for (let i = from; i < to; i++) s += this.pts[i][1];
    return s / Math.max(1, to - from);
  }

  reset(): void {
    this.pts = [];
    this.g = NaN;
    this.told = 0;
    this.flatFrom = -1;
  }
}
