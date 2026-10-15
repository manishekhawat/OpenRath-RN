/**
 * Fog mode (the pure parts of Fog.java): in dense fog (from the weather, or switched on by hand)
 * while driving, the dashboard shows the speed against a slow guide speed and the next bend on
 * this road, with a reminder about lamps and gaps. The bend itself comes from ahead.ts.
 */
import * as Features from './features.ts';
import { num, type Prefs } from './prefs.ts';

/** The guide speed in fog, km/h. */
export function guide(p: Prefs): number {
  return num(p, 'fogSpeed', 40);
}

/** The choices Settings cycles through. */
export const GUIDE_CHOICES = [30, 40, 50, 60];

/** Fog now: the weather says so (`weatherFog`), or the driver switched it on. */
export function now(p: Prefs, weatherFog: boolean): boolean {
  return Features.on(p, 'fog') && (weatherFog || p.str('fogNow', 'off') === 'on');
}

/** "Bend to the right in 150 m", "Bend to the left now", or "" when the road isn't known. */
export function bendText(m: number, dir: number): string {
  if (m < 0) return '';
  if (m < 25) return dir > 0 ? 'Bend to the right now' : 'Bend to the left now';
  return (dir > 0 ? 'Bend to the right in ' : 'Bend to the left in ') + Math.round(m / 10) * 10 + ' m';
}

/** The line under the speed: "Fog: keep below 40 km/h", or "Fog: slow down to 40" when faster. */
export function guideText(kmh: number, guideKmh: number): string {
  return Math.round(kmh) > guideKmh ? 'Fog: slow down to ' + guideKmh : 'Fog: keep below ' + guideKmh + ' km/h';
}

export const LAMPS_TEXT = 'Low beams and fog lamps on  ·  keep a long gap';
