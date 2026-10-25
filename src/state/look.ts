/**
 * The active theme, from Settings > Theme: one of the eight built in, or a theme pack the owner
 * imported (a folder in the app's documents, themes/<name>, holding theme.json and any
 * background.jpg/png; the Android version kept them in OpenRath/themes on the unit's storage).
 * "Theme changes by itself" (ThemeAuto) is checked here every 15 seconds while a screen shows,
 * with the car's last position from the drive engine.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import auto from '../data/theme-auto.json';
import electric from '../data/theme-electric.json';
import genz from '../data/theme-genz.json';
import light from '../data/theme-light.json';
import magmaGrey from '../data/theme-magma-grey.json';
import minimal from '../data/theme-minimal.json';
import mission from '../data/theme-mission.json';
import roadster from '../data/theme-roadster.json';
import * as Glass from '../logic/glass';
import type { Prefs } from '../logic/prefs';
import {
  brokenPack,
  chosen,
  DEFAULT,
  folderName,
  getOverride,
  lookOf,
  packOf,
  parseJson,
  setOverride,
  zipFiles,
  type Look,
  type Pack,
  type ThemeJson,
} from '../logic/theme';
import * as ThemeAuto from '../logic/themeauto';
import * as Engine from './engine';
import { usePrefs } from './prefs';

/** The themes built into the app (Theme.BUILT_IN); ids start with @ as in the Android version. */
export const BUILT_IN: { id: string; json: ThemeJson }[] = [
  { id: '@magma-grey', json: magmaGrey },
  { id: '@light', json: light },
  { id: '@minimal', json: minimal },
  { id: '@auto', json: auto },
  { id: '@genz', json: genz },
  { id: '@mission', json: mission },
  { id: '@electric', json: electric },
  { id: '@roadster', json: roadster },
];
export const DEFAULT_THEME = DEFAULT;

/** Where imported themes are kept. */
export function themesDir(): Directory {
  return new Directory(Paths.document, 'themes');
}

let packs: Pack[] | null = null;

/** The imported themes, read once and again after an import or removal. */
export function installed(): Pack[] {
  if (packs) return packs;
  const out: Pack[] = [];
  try {
    const d = themesDir();
    if (d.exists) {
      const dirs = d.list().filter((x): x is Directory => x instanceof Directory);
      dirs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const f of dirs) {
        const tj = new File(f, 'theme.json');
        if (!tj.exists) continue;
        try {
          out.push(packOf(f.name, parseJson(tj.textSync()), f.name));
        } catch (e) {
          out.push(brokenPack(f.name, e instanceof Error ? e.message : String(e)));
        }
      }
    }
  } catch {
    // no storage (web): built-in themes only
  }
  packs = out;
  return out;
}

/** Every theme: the built-in ones first, then the imported ones. */
export function available(): Pack[] {
  return [...BUILT_IN.map((t) => packOf(t.id, t.json, null)), ...installed()];
}

export function pack(id: string): Pack {
  const all = available();
  return all.find((p) => p.id === id) ?? all[0];
}

export function themeJson(id: string): ThemeJson {
  return pack(id).json;
}

/** The theme in use's name, for Settings. */
export function themeName(p: Prefs): string {
  return pack(chosen(p)).name;
}

/** An imported theme's own picture: background.jpg or .png, preview.png or .jpg. */
export function packPicture(p: Pack, base: 'background' | 'preview'): string | undefined {
  if (p.folder == null) return undefined;
  for (const ext of ['.jpg', '.png']) {
    try {
      const f = new File(themesDir(), p.folder, base + ext);
      if (f.exists) return f.uri;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function lookFor(p: Pack): Look {
  const l = lookOf(p.json);
  const bg = packPicture(p, 'background');
  return bg ? { ...l, backgroundImage: bg } : l;
}

// ------------------------------------------------------------------ the theme changing by itself

const autoListeners = new Set<() => void>();
let autoTimer: ReturnType<typeof setInterval> | null = null;
let autoPrefs: Prefs | null = null;

/**
 * Night at the car's position, which the Glass look needs: its glass and wallpaper are darker
 * after dark whatever theme is on (Glass.night). Checked on the same 15-second tick as the theme.
 */
let night = false;

export function isNight(): boolean {
  return night;
}

/** ThemeAuto.check: switch the theme on screen when it should change, and follow nightfall. */
export function checkAuto(p: Prefs): void {
  const trip = Engine.snapshot().trip;
  const now = Date.now();
  const want = ThemeAuto.want(p, trip.lat, trip.lon, now);
  const dark = ThemeAuto.night(trip.lat, trip.lon, now);
  const moved = want !== getOverride();
  const dusk = dark !== night && Glass.wanted(p);
  if (!moved && !dusk) {
    night = dark;
    return;
  }
  night = dark;
  if (moved) setOverride(want);
  for (const fn of [...autoListeners]) fn();
}

function subscribeAuto(fn: () => void): () => void {
  autoListeners.add(fn);
  if (!autoTimer) autoTimer = setInterval(() => autoPrefs && checkAuto(autoPrefs), ThemeAuto.EVERY_MS);
  return () => {
    autoListeners.delete(fn);
    if (autoListeners.size === 0 && autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  };
}

/**
 * Night at the car's position, for the screens that follow it on their own: the map page's day and
 * night colours (1.44). The Android version can also read the headlights; this port has only
 * sunset to go by.
 */
export function useNight(): boolean {
  return useSyncExternalStore(subscribeAuto, isNight);
}

export function useLook(): Look {
  const { prefs, version } = usePrefs();
  autoPrefs = prefs;
  const over = useSyncExternalStore(subscribeAuto, getOverride);
  const dark = useSyncExternalStore(subscribeAuto, isNight);
  // a change in Settings (the switch, the night theme, the Glass look) shows at once
  useEffect(() => checkAuto(prefs), [prefs, version]);
  const id = chosen(prefs);
  const glass = Glass.wanted(prefs);
  const wall = Glass.wall(prefs);
  return useMemo(
    () => {
      const look = lookFor(pack(id));
      return glass ? Glass.apply(look, wall, dark) : look;
    },
    // `version` and `over` say when to read an imported theme's look off the storage again; the
    // linter can't see that, because neither is named inside the function
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, over, glass, wall, dark],
  );
}

/**
 * Install a theme from a picked file: a .zip of a theme folder, or a lone theme.json. Returns
 * the new theme's id (its folder name). Throws with what is wrong.
 */
export function importTheme(fileName: string, bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  let folder: string;
  if (/\.json$/i.test(fileName)) {
    const json = parseJson(strFromU8(bytes));
    files = { 'theme.json': bytes };
    folder = folderName(typeof json.name === 'string' && json.name.trim() ? json.name.trim() : fileName);
  } else {
    files = zipFiles(bytes, fileName);
    parseJson(strFromU8(files['theme.json'])); // say what's wrong now, not in the gallery
    folder = folderName(fileName);
  }
  const d = new Directory(themesDir(), folder);
  d.create({ intermediates: true, idempotent: true });
  for (const [name, b] of Object.entries(files)) {
    const f = new File(d, name);
    if (f.exists) f.delete();
    f.create();
    f.write(b);
  }
  packs = null;
  return folder;
}

/** Remove an imported theme's folder. */
export function removeTheme(folder: string): void {
  const d = new Directory(themesDir(), folder);
  if (d.exists) d.delete();
  packs = null;
}
