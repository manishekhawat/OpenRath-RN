/**
 * The hidden shortcuts (port of Hints.java, 1.44): the things a long press or a tap on a heading
 * does, which nothing on screen shows. One tip a day on the dashboard while the car is parked,
 * until each has been shown once, and all of them together in Settings > Help.
 *
 * The tips for what this port leaves to native code (the next-turn card, replying to a message by
 * voice) are left out rather than offered and then not work.
 */
import * as Features from './features.ts';
import { num, type Prefs } from './prefs.ts';

/** Each tip and the feature it needs ('' for always). */
export const ALL: { tip: string; needs: string }[] = [
  { tip: 'Hold any box to change what it shows, or to move it', needs: '' },
  { tip: 'Hold a button in the bar to choose which app it opens', needs: '' },
  { tip: 'Hold the Apps button to open Settings', needs: '' },
  { tip: 'Hold the Navigation button for your saved places', needs: 'places' },
  { tip: "Tap the music or radio box's name for its sources and stations", needs: '' },
  { tip: 'Hold an app in the app list to pin it to the top or hide it', needs: 'appDrawer' },
  { tip: 'Hold the mic button to drag it where you want it', needs: 'voice' },
];

/** Which tips are worth showing: the ones whose feature is on. */
export function showing(p: Prefs): boolean[] {
  return ALL.map((h) => h.needs === '' || Features.on(p, h.needs));
}

/**
 * The next tip to show, from `next` on, skipping tips for switched-off features; -1 when they have
 * all been shown.
 */
export function pick(next: number, on: boolean[]): number {
  for (let i = Math.max(0, next); i < ALL.length; i++) if (on[i]) return i;
  return -1;
}

/** Today as the day a tip was last shown is written: "2026-10-25" in the unit's own time. */
export function today(now: number): string {
  const d = new Date(now);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * The tip to show on the dashboard now, and nothing when one has been shown today, the car is
 * moving, or they have all been shown. Showing it writes down the day and moves to the next.
 */
export function due(p: Prefs, now: number, moving: boolean): string | null {
  if (moving) return null;
  const day = today(now);
  if (p.str('hintDay', '') === day) return null;
  const i = pick(num(p, 'hintNext', 0), showing(p));
  if (i < 0) return null;
  p.put('hintDay', day);
  p.put('hintNext', String(i + 1));
  return ALL[i].tip;
}

/** Settings > Help: every tip for the features that are on. */
export function list(p: Prefs): string[] {
  const on = showing(p);
  return ALL.filter((_h, i) => on[i]).map((h) => h.tip);
}
