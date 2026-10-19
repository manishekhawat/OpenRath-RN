/**
 * mph and °F (Units.java), chosen in Home screen > Units. Distances stay in km, as in the Android
 * version. Read the prefs each time, so a change shows at once.
 */
import type { Prefs } from './prefs.ts';

export function mph(p: Prefs): boolean {
  return p.str('speedUnit', 'kmh') === 'mph';
}

export function fahrenheit(p: Prefs): boolean {
  return p.str('tempUnit', 'c') === 'f';
}

/** A km/h figure in the chosen unit, rounded. */
export function speed(kmh: number, inMph: boolean): number {
  return Math.round(inMph ? kmh / 1.609344 : kmh);
}

export function speedLabel(p: Prefs): string {
  return mph(p) ? 'mph' : 'km/h';
}

export function tempValue(c: number, f: boolean): number {
  return f ? (c * 9) / 5 + 32 : c;
}

/** "31°" or "88°". */
export function temp(p: Prefs, c: number): string {
  return `${Math.round(tempValue(c, fahrenheit(p)))}°`;
}
