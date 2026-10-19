/**
 * The OpenRath logo when the app opens (Intro.java, 1.42): the timing, kept apart from the drawing
 * in src/components/Intro.tsx for the tests.
 */
export const LENGTH = 2000;

/** Whether to play it: switched on, movement not Off, and the app has just started. */
export function show(on: boolean, motion: string, fresh: boolean): boolean {
  return on && fresh && motion !== 'off';
}

/** How far along a step is, 0 to 1, eased out: `t` from the start, the step from `start` for `len`. */
export function part(t: number, start: number, len: number): number {
  if (t <= start) return 0;
  if (len <= 0 || t >= start + len) return 1;
  const x = (t - start) / len;
  return 1 - (1 - x) * (1 - x) * (1 - x);
}
