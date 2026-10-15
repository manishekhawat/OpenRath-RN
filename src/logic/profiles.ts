/**
 * Driver profiles (port of Profiles.java): each driver keeps their own boxes, theme, volume,
 * sound, alert speed, voice language and message settings. Switching saves the current driver's
 * settings and loads the other's. The fuel log, drives, car setup and service reminders are
 * shared by everyone. Profiles are kept in "profiles" as JSON, by name; "profile" is the driver now.
 */
import type { Prefs } from './prefs.ts';

export const KEYS = new Set([
  'theme', 'themePack', 'swapped', 'alerts', 'warnSpeed', 'voiceLang', 'eqPreset', 'eqBass', 'eqCustom', 'speedVolPer',
  'tickerShow', 'readAloudMode', 'fav', 'saverMin', 'pages', 'dim', 'dimLevel', 'welcome', 'quietVol', 'feat:speedVolume',
  'feat:eq', 'feat:readAloud', 'feat:nightDrive', 'feat:ticker', 'feat:voice', 'feat:pages', 'feat:saver', 'feat:quiet',
  'layout', 'layWall', 'layAnim', 'layRoad', 'layUser', 'layApps', 'layMirror',
]);

/** Whether a setting belongs to the driver rather than the car. */
export function personal(key: string): boolean {
  return KEYS.has(key) || /^(p\d)?slot\d$/.test(key) || key.startsWith('src:') || key.startsWith('lay:');
}

export function current(p: Prefs): string {
  return p.str('profile', '');
}

/** Each driver's saved settings, by name. */
export function all(p: Prefs): Record<string, Record<string, unknown>> {
  try {
    const o = JSON.parse(p.str('profiles', '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export function names(p: Prefs): string[] {
  return Object.keys(all(p)).sort();
}

function every(p: Prefs): Record<string, string> {
  if (!p.all) throw new Error('profiles need a settings store that lists its keys');
  return p.all();
}

/**
 * Keep the current driver's settings under their name. The Android version also kept the music
 * volume ("~vol"); setting the system volume needs native code, so a saved "~vol" is carried
 * along untouched.
 */
export function saveCurrent(p: Prefs): void {
  const name = current(p);
  if (!name) return;
  const a = all(p);
  const snap: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(every(p))) if (personal(k)) snap[k] = v;
  const old = a[name];
  if (old && '~vol' in old) snap['~vol'] = old['~vol'];
  a[name] = snap;
  p.put('profiles', JSON.stringify(a));
}

/** Save the current driver and load `name`'s settings; a new driver starts from the current ones. */
export function switchTo(p: Prefs, name: string): void {
  saveCurrent(p);
  const snap = all(p)[name];
  if (snap && typeof snap === 'object') {
    for (const k of Object.keys(every(p))) if (personal(k) && !(k in snap)) p.remove?.(k);
    // values saved by the Android version keep their JSON type (true, 3); settings here are text
    for (const [k, v] of Object.entries(snap)) if (personal(k) && v != null) p.put(k, String(v));
  }
  p.put('profile', name);
  saveCurrent(p);
}

/** The next driver in the list (steering-wheel button); null when there aren't two. */
export function next(p: Prefs): string | null {
  const n = names(p);
  if (n.length < 2) return null;
  const to = n[(n.indexOf(current(p)) + 1) % n.length];
  switchTo(p, to);
  return to;
}

/**
 * Add a driver. The first one takes the current settings ("added"); after that, adding one
 * switches to them ("switched"). "" when the name is empty or taken.
 */
export function add(p: Prefs, raw: string): '' | 'added' | 'switched' {
  const name = raw.trim();
  if (!name || names(p).includes(name)) return '';
  if (!current(p)) {
    p.put('profile', name);
    saveCurrent(p);
    return 'added';
  }
  switchTo(p, name);
  return 'switched';
}

/** Remove another driver's saved settings (the driver now can't be removed). */
export function remove(p: Prefs, name: string): boolean {
  if (name === current(p)) return false;
  const a = all(p);
  if (!(name in a)) return false;
  delete a[name];
  p.put('profiles', JSON.stringify(a));
  return true;
}
