/**
 * The cab driver's one-tap SOS (port of CabSos.java): two emergency contacts, and the text with
 * where the car is. The countdown screen is app/cab/sos.tsx. The text itself goes to other
 * people's phones, so it stays English.
 */
import { MONTHS, two } from './cab.ts';
import { mapsLink } from './geo.ts';
import { f } from './i18n.ts';
import type { Prefs } from './prefs.ts';

/** SOS contact 1 or 2 ("cabSos1", saved as name|number), or null. */
export function contact(p: Prefs, i: number): [string, string] | null {
  const v = p.str('cabSos' + i, '');
  const bar = v.indexOf('|');
  if (bar < 0 || bar === v.length - 1) return null;
  return [v.substring(0, bar), v.substring(bar + 1)];
}

export function setContact(p: Prefs, i: number, name: string, phone: string): void {
  const n = phone.replace(/[^0-9+]/g, '');
  const nm = name.trim().replace(/\|/g, ' ');
  p.put('cabSos' + i, n === '' ? '' : (nm === '' ? n : nm) + '|' + n);
}

/** "Papa and Ravi", for the countdown. */
export function sosWho(p: Prefs): string {
  const c1 = contact(p, 1);
  const c2 = contact(p, 2);
  return c1 && c2 ? f('%1$s and %2$s', c1[0], c2[0]) : c1 ? c1[0] : c2 ? c2[0] : '';
}

export function sosText(p: Prefs, lat: number, lon: number, now: number): string {
  const name = p.str('welcome', ''); // Prefs.welcome(); the Android default was the author's own name
  const who = name === '' ? 'your driver' : name;
  const car = p.str('cabVehicle', '');
  const d = new Date(now);
  return 'SOS from ' + who + (car === '' ? '' : ' (' + car + ')') + ': I need help. ' +
    (lat === 0 && lon === 0 ? 'Location not known yet.' : 'I am here: ' + mapsLink(lat, lon)) +
    ' at ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + '.';
}

/** An SMS link to every SOS contact with the text filled in. */
export function sosSms(p: Prefs, text: string): string {
  const to = [contact(p, 1), contact(p, 2)].filter((c): c is [string, string] => c !== null).map((c) => c[1]);
  return 'sms:' + to.join(',') + '?body=' + encodeURIComponent(text);
}

/** The QR a phone scans to send the SOS text to the first contact. */
export function sosQr(p: Prefs, text: string): string {
  const c = contact(p, 1) ?? contact(p, 2);
  return c ? 'SMSTO:' + c[1] + ':' + text : '';
}
