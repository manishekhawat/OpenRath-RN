/**
 * The theme changes by itself (port of ThemeAuto.java, feature "autoTheme"): a night theme from
 * sunset to sunrise at the car's position ("nightTheme"). The Android version also shows a theme
 * of its own when a chosen phone connects by Bluetooth ("phoneThemeName", "phoneTheme"), and the
 * phone wins over the night theme; knowing which phone is connected needs Bluetooth from native
 * code, so here no phone is ever connected and only the night theme applies. A phone theme kept
 * from an Android backup stays in the settings untouched. Checked every 15 seconds while a screen
 * shows (src/state/look.ts).
 */
import { dark } from './errands.ts';
import * as Features from './features.ts';
import type { Prefs } from './prefs.ts';

/** How often the theme is checked, as the Android version's deep-sleep check. */
export const EVERY_MS = 15_000;

/** Which theme to show: the phone's, else the night one at night, else the owner's own (null). */
export function pick(nightTheme: string, phoneName: string, phoneTheme: string, night: boolean, connected: string): string | null {
  if (phoneTheme !== '' && phoneName !== '' && phoneName.toLowerCase() === connected.toLowerCase()) return phoneTheme;
  if (night && nightTheme !== '') return nightTheme;
  return null;
}

/** Night at the car's position (sunset to sunrise); without a position, 7 pm to 6 am. */
export function night(lat: number, lon: number, now: number): boolean {
  if (lat !== 0 || lon !== 0) return dark(lat, lon, now);
  const h = new Date(now).getHours();
  return h >= 19 || h < 6;
}

/** The theme ThemeAuto wants on screen now, or null for the owner's own. */
export function want(p: Prefs, lat: number, lon: number, now: number, phone = ''): string | null {
  if (!Features.on(p, 'autoTheme')) return null;
  return pick(p.str('nightTheme', ''), p.str('phoneThemeName', ''), p.str('phoneTheme', ''), night(lat, lon, now), phone);
}

/** Settings: choose the night theme ("" = none); choosing one switches the feature on. */
export function setNight(p: Prefs, id: string): void {
  p.put('nightTheme', id);
  Features.set(p, 'autoTheme', true);
}
