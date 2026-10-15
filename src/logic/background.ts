/**
 * Counting trips behind other apps (Drive.java ran as a foreground service): the switch, which
 * location source runs, the batch of fixes a background task hands over, and what waits for the
 * screen while the app is behind maps or music. The GPS and task side is src/state/background.ts.
 */
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
  if (!want) return 'off: trips count only while OpenRath is on screen';
  if (src === 'task') return 'on: counting while maps or music are open';
  if (background === false) return 'on, but location isn\'t allowed all the time; tap to allow';
  return 'on';
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

/** Something for the screen that came up while the app was behind another one. */
export interface Queued {
  kind: 'sos' | 'note';
  /** the SOS screen's link, or the note's text */
  text: string;
  at: number;
}

/** A crash older than this isn't worth a countdown that texts the contact by itself. */
export const SOS_STALE_MS = 2 * 60000;
/** Notes kept for the return to the screen, the newest. */
export const NOTES_KEPT = 5;

/** What to show on coming back: the latest SOS if it is recent, and the newest notes, each once. */
export function due(queue: readonly Queued[], now: number): Queued[] {
  const sos = queue.filter((q) => q.kind === 'sos' && now - q.at <= SOS_STALE_MS).slice(-1);
  const notes: Queued[] = [];
  for (const q of queue) {
    if (q.kind !== 'note') continue;
    const i = notes.findIndex((n) => n.text === q.text);
    if (i >= 0) notes.splice(i, 1);
    notes.push(q);
  }
  return [...sos, ...notes.slice(-NOTES_KEPT)];
}
