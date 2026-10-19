/**
 * The parking photo (port of Snap.java): a picture of where the car is parked, to find it again
 * in a big parking lot, taken when the drive service sees the car has parked (stood still 90 s
 * after a drive). Kept as parking/latest.jpg, the one before as previous.jpg.
 *
 * The Android version took a frame from the dashcam's last minute when it was recording, or one
 * silent picture from the (USB) camera when it wasn't. Here the device's camera can only be used
 * from a view on screen: when the dashboard's dashcam box is showing it ends the clip and takes
 * the photo itself; otherwise the owner is asked, and the parking photo screen takes it.
 */
import * as Features from './features.ts';
import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

export const DIR = 'parking';
export const LATEST = 'latest.jpg';
export const PREVIOUS = 'previous.jpg';
/** JPEG quality, as Bitmap.compress(JPEG, 85). */
export const QUALITY = 0.85;
/** Let the exposure settle this long after the camera opens, then one picture. */
export const SETTLE_MS = 1500;

/**
 * What to do when the car parks: nothing (switched off, or no camera permission, which can't be
 * asked for with nobody looking), let the dashcam's view take it, or ask the owner.
 */
export type Plan = 'none' | 'view' | 'ask';

export function plan(p: Prefs, allowed: boolean | null, viewShowing: boolean): Plan {
  if (!Features.on(p, 'parking') || allowed === false) return 'none';
  return viewShowing && allowed ? 'view' : 'ask';
}

/** The file moves when a new photo is kept: latest becomes previous, the new one latest. */
export function rotate(names: string[]): { from: string; to: string }[] {
  return names.includes(LATEST) ? [{ from: LATEST, to: PREVIOUS }] : [];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Taken Wed 8:30 PM" (SimpleDateFormat "EEE h:mm a"). */
export function takenText(at: number): string {
  const d = new Date(at);
  const h = d.getHours() % 12 || 12;
  return f('Taken %1$s', `${DAYS[d.getDay()]} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`);
}

/** The Settings row "Last parking photo". */
export function rowText(have: boolean, camera = true): string {
  return t(have ? 'tap to see it' : camera ? 'none yet' : 'needs a camera');
}

/** What the voice command says when there is no photo to show. */
export function noneText(camera = true): string {
  return t(camera ? 'No parking photo yet: one is taken when you park' : 'No camera on this unit, so no parking photo');
}

/** The question when the car has parked and the camera isn't on screen. */
export const ASK_TITLE = 'Parked';
export const ASK_TEXT = 'Take a photo of where the car is, to find it again?';
