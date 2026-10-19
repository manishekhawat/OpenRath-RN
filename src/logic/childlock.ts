/**
 * Child-lock for apps (ChildLock.java): chosen apps (video, browser, games) can't be opened from
 * the app drawer while the car is moving. Sending the screen home when one is opened some other
 * way needs the accessibility service, which is native (see PORTING.md).
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

/** Moving: above 8 km/h with a fix in the last 10 s. */
export function moving(kmh: number, fixAt: number, now: number = Date.now()): boolean {
  return kmh > 8 && now - fixAt < 10000;
}

export function blocked(p: Prefs, pkg: string, kmh: number, fixAt: number, now: number = Date.now()): boolean {
  return Features.on(p, 'childLock') && moving(kmh, fixAt, now) && apps(p).has(pkg);
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
