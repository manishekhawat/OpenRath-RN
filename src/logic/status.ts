/**
 * Small helpers for the dashboard, with no Expo types so they are tested: the dock's status icons
 * (StatusIcons.java, 1.38), where they sit and the clock box's line under the date (1.44), and the
 * compass box's points (Cards.CompassCard, 1.36). The car box's drive summary when stopped is
 * Trip.stopText.
 */
import * as Agenda from './agenda.ts';
import { t } from './i18n.ts';

// ---------------------------------------------------------------- status icons

export const OFF = 0;
export const SEARCHING = 1;
export const ON = 2;

/** What the GPS icon shows: a fix in the last 10 seconds, searching, or location switched off. */
export function gps(fixAgeSec: number, enabled: boolean): number {
  if (fixAgeSec >= 0 && fixAgeSec <= 10) return ON;
  return enabled ? SEARCHING : OFF;
}

/** Battery percent from the system's level and scale, or -1 when the unit reports no battery. */
export function percent(present: boolean, level: number, scale: number): number {
  if (!present || level < 0 || scale <= 0) return -1;
  return Math.max(0, Math.min(100, Math.round((level * 100) / scale)));
}

/** "4G", "5G", "H+"… for TelephonyManager's network type, or "" when unknown. */
export function label(type: number): string {
  switch (type) {
    case 20:
      return '5G';
    case 13:
    case 19:
      return '4G';
    case 15:
      return 'H+';
    case 8:
    case 9:
    case 10:
      return 'H';
    case 3:
    case 5:
    case 6:
    case 12:
    case 14:
    case 17:
      return '3G';
    case 2:
      return 'E';
    case 1:
    case 16:
      return 'G';
    default:
      return '';
  }
}

/** Signal bars, 0 to 4, from a Wi-Fi strength in dBm. */
export function wifiBars(rssi: number): number {
  if (rssi <= -100 || rssi === 2147483647) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -78) return 2;
  return 1;
}

// ---------------------------------------------------------------- compass box

/** N, NE, E … for a heading in degrees. */
export function point(deg: number): string {
  const p = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return p[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ------------------------------------------- where the icons sit, and the clock's line (1.44)

/**
 * Where the Wi-Fi, mobile data, GPS and battery icons go (HomeActivity.statusPlace): along the top
 * of the clock box when the page has one, else in the buttons bar; nowhere when they are switched
 * off, or Android's own status bar already shows them.
 */
export function place(on: boolean, systemBar: boolean, clockOnPage: boolean): '' | 'clock' | 'dock' {
  if (!on || systemBar) return '';
  return clockOnPage ? 'clock' : 'dock';
}

/**
 * The line under the date in the clock box (ClockCard.nextLine): the next event still to come
 * today, else the weather now, else nothing. `events` is null when the calendar box is off.
 */
export function nextLine(
  events: readonly Agenda.Event[] | null,
  now: number,
  temp: string,
  sky: string,
  tz?: string,
): string {
  for (const e of events ?? []) {
    if (e.end <= now) continue;
    const [day, time] = Agenda.when(e.start, e.end, e.allDay, now, tz);
    // only today's: tomorrow's is in the calendar box, not under the clock
    if (day !== 'Today') break;
    return (time === '' ? '' : t(time) + '  ') + e.title;
  }
  if (temp === '' || temp.startsWith('--')) return '';
  return temp + (sky === '' || sky === 'Weather' ? '' : ' ' + t(sky));
}
