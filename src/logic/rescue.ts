import { mapsLink } from './geo.ts';
import type { Prefs } from './prefs.ts';

/**
 * Accident help (port of Rescue.java): after a very hard stop (from 40 km/h or more to nearly
 * nothing within about a second and a half), the screen asks "Are you OK?" with a 30-second
 * countdown. Unless someone taps "I'm OK", it gets a text ready for the emergency contact with
 * where the car is, offers a call, and shows the place in words and as a QR code, so it can be
 * read out or scanned by whoever helps.
 *
 * The Android version phoned the contact by itself through the paired phone; here the text
 * opens in the messaging app and needs a tap on Send (sending without a tap needs native code).
 */

export const SECONDS = 30;
/** No second alarm within two minutes of one. */
export const QUIET_MS = 120000;
export const EMERGENCY = '112';

/** A crash-like stop: at least 40 km/h before, under 8 now, at more than 25 km/h lost per second. */
export function crash(before: number, now: number, ms: number): boolean {
  if (ms <= 0 || ms > 2000 || before < 40 || now > 8) return false;
  return (before - now) / (ms / 1000) > 25;
}

/**
 * What the drive service feeds each GPS speed into (as Drive.java did with prevKmh and prevAt):
 * true once per crash-like stop, when accident help is on.
 */
export class CrashWatch {
  private prevKmh = 0;
  private prevAt = 0;
  private crashAt = 0;

  feed(kmh: number, now: number, on: boolean): boolean {
    const hit = this.prevAt !== 0 && crash(this.prevKmh, kmh, now - this.prevAt) && now - this.crashAt > QUIET_MS && on;
    if (hit) this.crashAt = now;
    this.prevKmh = kmh;
    this.prevAt = now;
    return hit;
  }
}

/**
 * The route that shows the countdown after a crash, for router.push(): the place it happened, or
 * a test run. (Plain /sos is an SOS asked for by voice; /sos?setup=1 is the contact setup.)
 */
export function sosHref(lat: number, lon: number, test = false): string {
  return `/sos?crash=1&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}` + (test ? '&test=1' : '');
}

export function contact(p: Prefs): string {
  return p.str('sosNumber', '');
}

export function contactName(p: Prefs): string {
  const n = p.str('sosName', '');
  return n === '' ? contact(p) : n;
}

/** Save who to contact; the number keeps only digits and +. */
export function setContact(p: Prefs, name: string, number: string): void {
  p.put('sosName', name.trim());
  p.put('sosNumber', number.replace(/[^0-9+]/g, ''));
}

/** The Settings row's words. */
export function contactRow(p: Prefs, on: boolean): string {
  return contact(p) === '' ? 'not set (accident help calls 112 only if you tap it)' : contactName(p) + (on ? '' : ' (accident help is off)');
}

/** "28.45950, 77.02660". */
export function where(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** Whether a place is known (0, 0 means no fix). */
export function known(lat: number, lon: number): boolean {
  return lat !== 0 || lon !== 0;
}

/** The text for the contact: what happened and where, with a Maps link. */
export function message(lat: number, lon: number): string {
  return (
    'I may have been in an accident. ' +
    (known(lat, lon) ? `The car is at ${where(lat, lon)}: ${mapsLink(lat, lon)}` : "The car's location isn't known.")
  );
}

/** Opens the messaging app with the text filled in (iOS separates the body with &). */
export function smsLink(number: string, body: string, ios = false): string {
  return 'sms:' + number + (ios ? '&' : '?') + 'body=' + encodeURIComponent(body);
}

export function telLink(number: string): string {
  return 'tel:' + number.replace(/[^0-9+]/g, '');
}

/** The line under the title while counting down; `manual` for an SOS asked for by voice or a tap. */
export function startText(p: Prefs, manual = false): string {
  if (manual && contact(p) !== '') return `SOS: texting ${contactName(p)} where the car is in ${SECONDS} seconds.`;
  if (manual) return 'SOS. No emergency contact is set: set one under Accident help, or call 112.';
  return contact(p) === ''
    ? 'A very hard stop was detected. Set an emergency contact in Settings > Driving to be called.'
    : `A very hard stop was detected. Texting ${contactName(p)} where the car is in ${SECONDS} seconds.`;
}

/** What the voice says as the countdown starts. */
export function spoken(p: Prefs, test: boolean, manual = false): string {
  if (test) return 'Accident help test. Are you OK?';
  if (manual) return contact(p) === '' ? 'No emergency contact is set.' : "Texting " + contactName(p) + " where we are in thirty seconds. Tap I'm OK to stop.";
  return "Are you OK? Tap I'm OK, or I will message " + (contact(p) === '' ? 'no one, no contact is set' : contactName(p)) + ' in thirty seconds.';
}

/** After the countdown (or "Message now"). */
export function sentText(p: Prefs, test: boolean): string {
  if (contact(p) === '') return 'No emergency contact is set. Tap "Call 112" if you need help.';
  return (
    (test ? 'Test: would text ' : 'The message to ') + contactName(p) + (test ? '' : ' is ready: tap Send') +
    '. Read out the place below. Tap "I\'m OK" to close.'
  );
}
