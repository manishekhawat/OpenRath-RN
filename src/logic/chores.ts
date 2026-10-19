import { clock, parkingLink, share, upiLink, validVpa, wifiQr } from './errands.ts';
import * as Features from './features.ts';
import { log } from './fuel.ts';
import { dist, mapsLink, routeLink } from './geo.ts';
import { f, t } from './i18n.ts';
import { destination } from './kids.ts';
import { num, type Prefs } from './prefs.ts';

/**
 * The everyday helpers' steps and words (port of the screens in Chores.java): splitting a trip's
 * cost by UPI QR code, a paid-parking reminder on the phone and a guest Wi-Fi code; also the trip share code (HomeActivity.shareTrip). The sums and links are in errands.ts. The weekly report and the start-up summary
 * live elsewhere.
 */

/** A code to show: its heading, the text it holds and the words beside it. */
export interface Code {
  title: string;
  text: string;
  caption: string;
}

const NAMES: Record<string, string> = {
  split: 'Split the cost by UPI',
  parkTimer: 'Paid parking reminder',
  hotspot: 'Guest Wi-Fi',
  tripShare: 'Share the trip by QR code',
};

/** The hint when a helper's switch is off, or null when it is on. */
export function off(p: Prefs, id: keyof typeof NAMES | string): string | null {
  return Features.on(p, id) ? null : t(`Turn on "${NAMES[id] ?? id}" in Settings > Features`);
}

// ------------------------------------------------------------------ splitting the cost

/** The last fill-up's rupees, as the usual thing to split; 0 when there is none. */
export function lastFill(p: Prefs): number {
  const l = log(p);
  const e = l.length === 0 ? null : l[l.length - 1];
  return e ? Number(e.rs) || 0 : 0;
}

/** Save the UPI id, or say what's wrong with it. */
export function setUpi(p: Prefs, id: string, name?: string): string | null {
  if (!validVpa(id)) return t("That doesn't look like a UPI id (name@bank)");
  p.put('upiId', id.trim());
  if (name !== undefined) p.put('upiName', name.trim());
  return null;
}

/** The code each person scans to pay their share; a string says what's wrong instead. */
export function split(p: Prefs, total: number, people: number): Code | string {
  const vpa = p.str('upiId', '');
  if (!validVpa(vpa)) return t('Your UPI id (like name@okbank)');
  if (!(total > 0)) return t('Enter the total to split');
  people = Math.floor(people);
  if (!(people >= 2)) return t('At least 2 people');
  p.put('splitPeople', String(people));
  const each = share(total, people);
  return {
    title: f('Pay ₹%1$s each', each),
    text: upiLink(vpa, p.str('upiName', ''), each, 'Trip share'),
    caption: f(
      '₹%1$s split %2$s ways. Each person scans this with any UPI app ' +
        '(GPay, PhonePe, Paytm, BHIM); the amount is filled in. Pays %3$s.',
      Math.round(total),
      people,
      vpa,
    ),
  };
}

// ------------------------------------------------------------------ paid parking

export const PARK_MINUTES = [30, 60, 120, 180, 240];
export const PARK_LABELS = ['30 minutes', '1 hour', '2 hours', '3 hours', '4 hours'];

/** Parking paid for `minutes` from now: remember when it ends, and the code for the phone's calendar. */
export function startParking(p: Prefs, minutes: number, now = Date.now()): Code {
  const end = now + minutes * 60000;
  p.put('parkEnds', String(end));
  return {
    title: f('Parking ends at %1$s', clock(end)),
    text: parkingLink(now, minutes),
    caption: t(
      'Scan with your phone to add a reminder to its calendar, 10 minutes before the parking runs out. ' +
        "The car's screen switches off with the engine, so the phone does the reminding.",
    ),
  };
}

/** When the paid parking ends, or 0 when none is running. */
export function parkEnds(p: Prefs, now = Date.now()): number {
  const end = num(p, 'parkEnds', 0);
  return end > now ? end : 0;
}

/** The row's words in Settings: "parking ends at 3:40 PM" or what it does. */
export function parkingRow(p: Prefs, now = Date.now()): string {
  const end = parkEnds(p, now);
  return end ? f('parking ends at %1$s', clock(end)) : t('a reminder on your phone; or say "parking timer"');
}

// ------------------------------------------------------------------ guest Wi-Fi

export function setHotspot(p: Prefs, name: string, pass: string): string | null {
  if (name.trim() === '') return t('Hotspot name (as set on the unit)');
  p.put('apName', name.trim());
  p.put('apPass', pass);
  return null;
}

export const HOTSPOT_NOTE =
  "Android only lets the unit's own settings switch the hotspot on. Turn it on there, come back, " +
  'then show the code for passengers to join.';

/** HOTSPOT_NOTE in the chosen language. */
export function hotspotNote(): string {
  return t(HOTSPOT_NOTE);
}

/** The code passengers scan to join the unit's hotspot; null until its name is set. */
export function hotspot(p: Prefs): Code | null {
  const name = p.str('apName', '');
  if (name === '') return null;
  return {
    title: t("Join the car's Wi-Fi"),
    text: wifiQr(name, p.str('apPass', '')),
    caption: f('Point a phone camera at this to join "%1$s". It shares the unit\'s mobile data.', name),
  };
}

// ------------------------------------------------------------------ trip share

/**
 * A code family scan to see where the car is, and the route and time to where the map is taking
 * it when there is a destination; a string says why not. Nothing is sent online.
 */
export function tripShare(p: Prefs, lat: number, lon: number): Code | string {
  if (lat === 0 && lon === 0) return t('Waiting for the GPS to find the car');
  const d = destination(p);
  if (d) {
    const km = dist(lat, lon, d.lat, d.lon) / 1000;
    return {
      title: f('Our trip to %1$s', d.name),
      text: routeLink(lat, lon, d.lat, d.lon),
      caption:
        f('About %1$s km to go in a straight line.', km.toFixed(0)) +
        ' ' +
        t('Scan with a phone to see the route and time from where the car is now. Show a new code later for a fresh position.'),
    };
  }
  return {
    title: t('Where we are now'),
    text: mapsLink(lat, lon),
    caption: t('Scan with a phone to see where the car is now. Pick a destination on the map to share the route too.'),
  };
}
