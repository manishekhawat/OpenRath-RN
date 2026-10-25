/**
 * Counting trips behind other apps (Drive.java ran as a foreground service): the switch, which
 * location source runs, the batch of fixes a background task hands over, and what waits for the
 * screen while the app is behind maps or music. The GPS and task side is src/state/background.ts.
 */
import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

/** The switch in Settings > Road helpers, on unless turned off. */
export const PREF = 'bgTrips';
/** Set once the "allow all the time" explanation has been shown, so it isn't shown at every start. */
export const ASKED = 'bgTripsAsked';

/** The foreground service's notification, in the Android version's words. */
export const NOTICE = { notificationTitle: 'OpenRath', notificationBody: 'Trip computer and speed alerts' };

export const EXPLAIN_TITLE = 'Count trips behind other apps';
export const EXPLAIN =
  'OpenRath can keep the trip computer, speed alerts and road warnings going while maps or music are on screen, ' +
  'as the old version did. Android will now ask about location: choose "Allow all the time". ' +
  'Nothing leaves the unit, and a notification shows while it counts.';

export function wanted(p: Prefs): boolean {
  return p.str(PREF, 'on') === 'on';
}

export function set(p: Prefs, on: boolean): void {
  p.put(PREF, on ? 'on' : 'off');
}

/**
 * Where fixes come from: the background task (it also runs while the app is on screen, so there
 * is one source and no fix counted twice), the plain foreground watch, or nothing without the GPS.
 */
export type Source = 'task' | 'watch' | 'none';

export function source(foreground: boolean, want: boolean, background: boolean): Source {
  if (!foreground) return 'none';
  return want && background ? 'task' : 'watch';
}

/** Ask for "all the time" now? Only on screen, with the switch on, once (or again on a tap in Settings). */
export function shouldAsk(p: Prefs, background: boolean, onScreen: boolean, force: boolean): boolean {
  if (background || !onScreen || !wanted(p)) return false;
  return force || p.str(ASKED, '') === '';
}

/** The settings row's line. */
export function statusText(want: boolean, background: boolean | null, src: Source): string {
  if (!want) return t('off: trips count only while OpenRath is on screen');
  if (src === 'task') return t('on: counting while maps or music are open');
  if (background === false) return t("on, but location isn't allowed all the time; tap to allow");
  return t('on');
}

/**
 * The fixes of a batch worth feeding, oldest first: only those newer than the last one fed, so a
 * fix handed over twice (or by both sources at a switch-over) is counted once.
 */
export function fresh<T extends { timestamp: number }>(batch: readonly T[], lastT: number, now: number): T[] {
  const at = (x: T) => x.timestamp || now;
  const out: T[] = [];
  let t = lastT;
  for (const x of [...batch].sort((a, b) => at(a) - at(b))) {
    if (at(x) <= t) continue;
    t = at(x);
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ the GPS rate while parked

/**
 * Under this the car counts as standing still for the GPS rate (Drive.parkedGps), and while the
 * slow rate is on a fix further than STILL_M from the last one means it is moving again: at 15
 * seconds a fix, a car pulling away reads as slow for one more fix.
 */
export const STILL_KMH = 3;
export const STILL_M = 25;

/**
 * Standing still this long and the fixes drop to one every 15 seconds instead of one a second.
 * Five minutes is well past the 90 s at which the parking spot is written, and long enough not to
 * slow down at a level crossing or a long red light.
 */
export const PARKED_MS = 5 * 60000;
/**
 * With the screen off (the stereo asleep with the ignition, 1.44), standing still slows the fixes
 * after 30 seconds: nobody is watching the speed, and the next drive turns it back up.
 */
export const PARKED_DARK_MS = 30000;
export const FIX_MS = 1000;
export const SLOW_FIX_MS = 15000;

/**
 * When the car stopped, or -1 while it moves; fed the newest fix. The task keeps this between
 * fixes, as the Android service keeps Drive.stillFrom.
 */
export function stillFrom(from: number, slow: boolean, kmh: number, movedM: number, now: number): number {
  if (kmh >= STILL_KMH || (slow && movedM > STILL_M)) return -1;
  return from < 0 ? now : from;
}

/**
 * Whether to ask for fixes slowly (Drive.parkedGps). The task is deliberately left running when
 * the app goes away, so without this the GPS would stay at one fix a second until the unit is
 * rebooted; stopping it altogether instead would miss the next drive until a screen came back.
 */
export function parkedGps(slow: boolean, kmh: number, movedM: number, from: number, now: number, dark = false): boolean {
  if (kmh >= STILL_KMH || (slow && movedM > STILL_M)) return false;
  return from >= 0 && now - from >= (dark ? PARKED_DARK_MS : PARKED_MS);
}

/** Milliseconds between fixes to ask for. */
export function fixMs(slow: boolean): number {
  return slow ? SLOW_FIX_MS : FIX_MS;
}

/** A note for the screen that came up while the app was behind another one (Cab notes, new badges). */
export interface Queued {
  kind: 'note';
  text: string;
  at: number;
}

/** Notes kept for the return to the screen, the newest. */
export const NOTES_KEPT = 5;

/** What to show on coming back: the newest notes, each once. */
export function due(queue: readonly Queued[], _now: number): Queued[] {
  const notes: Queued[] = [];
  for (const q of queue) {
    const i = notes.findIndex((n) => n.text === q.text);
    if (i >= 0) notes.splice(i, 1);
    notes.push(q);
  }
  return notes.slice(-NOTES_KEPT);
}
