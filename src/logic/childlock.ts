/**
 * Child-lock for apps (ChildLock.java): chosen apps (video, browser, games) can't be opened from
 * the app drawer while the car is moving. Sending the screen home when one is opened some other
 * way needs the accessibility service, which is native (see PORTING.md).
 *
 * Since 1.44 a car that was moving a moment ago still counts as moving for ten minutes after the
 * GPS goes quiet, so a tunnel or a car park does not unlock the locks.
 */
import * as Features from './features.ts';
import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

export const SORRY = 'This app is locked while the car is moving';

/** SORRY in the chosen language, for the toast. */
export function sorry(): string {
  return t(SORRY);
}

export function apps(p: Prefs): Set<string> {
  const s = new Set(p.str('lockedApps', '').split(','));
  s.delete('');
  return s;
}

/** How long a car last seen moving still counts as moving with no fresh speed (a tunnel, GPS lost). */
export const LOST_MS = 10 * 60 * 1000;

/**
 * Whether the car moves (1.44): the engine's own speed when an OBD-II adapter reports it, else a
 * GPS fix under 10 seconds old. With neither, a car seen moving in the last 10 minutes still
 * counts as moving, so losing the GPS in a tunnel or a multi-storey car park does not unlock the
 * locks. `obdKmh` is always -1 here, because reading the adapter needs native code (PORTING.md);
 * it is kept so the rule itself is the Android version's.
 */
export function moving(kmh: number, fixAt: number, now: number = Date.now(), obdKmh = -1, seenMoving = 0): boolean {
  if (obdKmh >= 0) return obdKmh > 8;
  if (now - fixAt < 10000) return kmh > 8;
  return seenMoving > 0 && now - seenMoving < LOST_MS;
}

/** When a fresh reading last said the car was moving. */
let movingSeen = 0;

/**
 * `moving`, writing down when the car was last seen moving. The drive engine calls this on every
 * fix; everything else reads `movingShown`, so looking at a screen never changes what the locks
 * think the car is doing.
 */
export function movingNow(kmh: number, fixAt: number, now: number = Date.now(), obdKmh = -1): boolean {
  const m = moving(kmh, fixAt, now, obdKmh, movingSeen);
  if (m && (obdKmh >= 0 || now - fixAt < 10000)) movingSeen = now;
  return m;
}

/** Whether the car moves, from what the engine last saw. */
export function movingShown(kmh: number, fixAt: number, now: number = Date.now()): boolean {
  return moving(kmh, fixAt, now, -1, movingSeen);
}

/** For the tests, and when a drive ends: forget that the car was moving. */
export function forgetMoving(): void {
  movingSeen = 0;
}

export function blocked(p: Prefs, pkg: string, kmh: number, fixAt: number, now: number = Date.now()): boolean {
  return Features.on(p, 'childLock') && movingShown(kmh, fixAt, now) && apps(p).has(pkg);
}

/** Lock or unlock one app. */
export function toggle(p: Prefs, pkg: string): boolean {
  const s = apps(p);
  const locked = !s.has(pkg);
  if (locked) s.add(pkg);
  else s.delete(pkg);
  p.put('lockedApps', [...s].sort().join(','));
  return locked;
}
