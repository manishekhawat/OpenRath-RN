/**
 * Backup and restore (port of Backup.java), in the Android version's own format so a backup
 * from either app restores in the other: a .zip holding backup.json and the owner's pictures
 * (custom/*.png).
 *
 *   {"app": "OpenRath", "format": 1, "made": <ms>,
 *    "prefs": {"home": {"key": ["s", "text"]}, "drive": {...}, "player": {...}}}
 *
 * Values keep their Android type: ["s", "text"], ["i", 3], ["l", 9], ["f", 1.5], ["b", true],
 * ["ss", [..]]. Settings here are all text, so a restore turns each into text and remembers the
 * type in "backupTypes", and a backup made here writes it back with that type (an Android
 * restore would fail on "swapped" saved as text). "home" is the settings; "drive" is the trip
 * computer, parking spot and day-by-day history, which this app keeps outside the settings;
 * "player" (the Android music player) has nothing to restore here and is left out of backups made
 * here, so restoring one on Android keeps its player as it is.
 * Since 1.35 a backup's old switch names ("feat:tollAhead") are kept as they are: Features.on
 * reads the switch each became part of, and the names of removed features are ignored.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';
import type { History, TripState } from './trip.ts';

/** Settings files that are worth keeping; "crash" is left out on purpose. */
export const PREFS = ['home', 'drive', 'player'];
/** Automatic backups kept. */
export const KEEP = 7;
/** Where the types of restored settings are remembered (not itself backed up). */
export const TYPES_KEY = 'backupTypes';

export type Typed = ['s', string] | ['i', number] | ['l', number] | ['f', number] | ['b', boolean] | ['ss', string[]];

export interface BackupJson {
  app: string;
  format: number;
  made: number;
  prefs: Record<string, Record<string, Typed>>;
}

/** Settings the Android version keeps as numbers or switches, for backups of a fresh install here. */
const KNOWN_TYPES: Record<string, Typed[0]> = { swapped: 'b', alerts: 'b', warnSpeed: 'i' };

/** "openrath-manual-2026-10-15-0930.zip", as the Android version names them. */
export function fileName(kind: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `openrath-${kind}-${stamp}.zip`;
}

/** Whether a file name looks like a backup (dzire-home-: made before the app was renamed). */
export function isBackupName(n: string): boolean {
  return (n.startsWith('openrath-') || n.startsWith('dzire-home-')) && n.endsWith('.zip');
}

/** Which old automatic backups to delete so `KEEP` remain (names sort by date). */
export function prune(names: string[], kind: string): string[] {
  const mine = names.filter((n) => n.startsWith('openrath-' + kind + '-')).sort();
  return mine.slice(0, Math.max(0, mine.length - KEEP));
}

/** Once a day: whether today's automatic backup is still to do. */
export function dueToday(p: Prefs, now: Date): boolean {
  return p.str('backupDay', '') !== dayKey(now);
}

export function markDone(p: Prefs, now: Date): void {
  p.put('backupDay', dayKey(now));
  p.put('backupLast', String(now.getTime()));
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ values

function types(p: Prefs): Record<string, Typed[0]> {
  try {
    return { ...KNOWN_TYPES, ...JSON.parse(p.str(TYPES_KEY, '{}')) };
  } catch {
    return { ...KNOWN_TYPES };
  }
}

/** A setting's text as the type Android keeps it in; text when it doesn't read as that type. */
export function typed(v: string, type: Typed[0] | undefined): Typed {
  if (type === 'b' && (v === 'true' || v === 'false')) return ['b', v === 'true'];
  if ((type === 'i' || type === 'l') && /^-?\d+$/.test(v.trim())) return [type, parseInt(v, 10)];
  if (type === 'f' && v.trim() !== '' && Number.isFinite(Number(v))) return ['f', Number(v)];
  if (type === 'ss') {
    try {
      const a = JSON.parse(v);
      if (Array.isArray(a)) return ['ss', a.map(String)];
    } catch {
      // fall through to text
    }
  }
  return ['s', v];
}

/** A backed-up value as the text this app keeps; null for a type it doesn't know. */
export function text(t: unknown): string | null {
  if (!Array.isArray(t) || t.length < 2) return null;
  const [k, v] = t;
  if (k === 's') return String(v);
  if (k === 'i' || k === 'l') return String(Math.trunc(Number(v)));
  if (k === 'f') return String(Number(v));
  if (k === 'b') return v === true || v === 'true' ? 'true' : 'false';
  if (k === 'ss') return JSON.stringify(Array.isArray(v) ? v.map(String) : []);
  return null;
}

// ------------------------------------------------------------------ the trip computer ("drive")

/** The trip computer's saved values in the Android version's "drive" settings. */
export function driveOf(trip: Partial<TripState> | null, hist: History): Record<string, Typed> {
  const o: Record<string, Typed> = { hist: ['s', JSON.stringify(hist)] };
  if (!trip) return o;
  if (trip.day) o.day = ['s', trip.day];
  if (trip.todayKm != null) o.dayKm = ['f', trip.todayKm];
  if (trip.todaySec != null) o.daySec = ['l', Math.round(trip.todaySec)];
  if (trip.todayBrakes != null) o.dayBrakes = ['i', trip.todayBrakes];
  if (trip.todayAccels != null) o.dayAccels = ['i', trip.todayAccels];
  if (trip.todaySpeedSec != null) o.daySpeed = ['l', Math.round(trip.todaySpeedSec)];
  if (trip.odoKm != null) o.odo = ['f', trip.odoKm];
  if (trip.park) {
    o.parkLat = ['f', trip.park.lat];
    o.parkLon = ['f', trip.park.lon];
    o.parkAt = ['l', trip.park.at];
  }
  if (trip.lat) {
    o.lastLat = ['f', trip.lat];
    o.lastLon = ['f', trip.lon ?? 0];
  }
  return o;
}

/** The trip computer and history from a backup's "drive" settings. */
export function tripOf(d: Record<string, unknown>): { trip: Partial<TripState>; history: History } {
  const n = (k: string) => {
    const v = Number(text(d[k]));
    return Number.isFinite(v) ? v : 0;
  };
  const s = (k: string) => text(d[k]) ?? '';
  let history: History = {};
  try {
    const h = JSON.parse(s('hist') || '{}');
    if (h && typeof h === 'object') history = h;
  } catch {
    // a broken history is left out
  }
  const trip: Partial<TripState> = {
    day: s('day'),
    todayKm: n('dayKm'),
    todaySec: n('daySec'),
    todayBrakes: n('dayBrakes'),
    todayAccels: n('dayAccels'),
    todaySpeedSec: n('daySpeed'),
    odoKm: n('odo'),
    park: n('parkAt') > 0 ? { lat: n('parkLat'), lon: n('parkLon'), at: n('parkAt') } : null,
    lat: n('lastLat'),
    lon: n('lastLon'),
  };
  return { trip, history };
}

// ------------------------------------------------------------------ making and reading

/** backup.json for every setting, and the trip computer when given. */
export function build(p: Prefs, now: number, drive?: { trip: Partial<TripState> | null; history: History }): BackupJson {
  if (!p.all) throw new Error('backups need a settings store that lists its keys');
  const t = types(p);
  const home: Record<string, Typed> = {};
  for (const [k, v] of Object.entries(p.all())) if (k !== TYPES_KEY) home[k] = typed(v, t[k]);
  const prefs: Record<string, Record<string, Typed>> = { home };
  if (drive) prefs.drive = driveOf(drive.trip, drive.history);
  return { app: 'OpenRath', format: 1, made: now, prefs };
}

/** The .zip: backup.json (indented by one, as Android writes it) and the pictures. */
export function zip(b: BackupJson, pictures: Record<string, Uint8Array> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { 'backup.json': strToU8(JSON.stringify(b, null, 1)) };
  for (const [name, bytes] of Object.entries(pictures)) if (safePicture(name)) files['custom/' + name] = bytes;
  return zipSync(files);
}

/** Pictures only, no paths. */
function safePicture(file: string): boolean {
  return file !== '' && !file.includes('/') && !file.includes('..') && file.endsWith('.png');
}

export interface Opened {
  json: BackupJson;
  pictures: Record<string, Uint8Array>;
}

/** Read a backup .zip; throws "not an OpenRath backup" when it isn't one. */
export function unzip(bytes: Uint8Array): Opened {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(t('not an OpenRath backup'));
  }
  const je = files['backup.json'];
  if (!je) throw new Error(t('not an OpenRath backup'));
  const json = JSON.parse(strFromU8(je)) as BackupJson;
  if (!json || typeof json.prefs !== 'object' || json.prefs == null) throw new Error(t('not an OpenRath backup'));
  const pictures: Record<string, Uint8Array> = {};
  for (const [n, b] of Object.entries(files)) {
    if (!n.startsWith('custom/') || n.endsWith('/')) continue;
    const file = n.substring('custom/'.length);
    if (safePicture(file)) pictures[file] = b;
  }
  return { json, pictures };
}

/**
 * Put the settings back (all of them are replaced, as the Android version clears its file
 * first). Returns how many were restored and the trip computer to put back, if the backup has it.
 */
export function restore(p: Prefs, json: BackupJson): { settings: number; drive: ReturnType<typeof tripOf> | null } {
  if (!p.all || !p.remove) throw new Error('restoring needs a settings store that lists its keys');
  const prefs = json.prefs;
  let settings = 0;
  const home = prefs.home as Record<string, unknown> | undefined;
  if (home && typeof home === 'object') {
    const put: Record<string, string> = {};
    const kinds: Record<string, Typed[0]> = {};
    for (const [k, v] of Object.entries(home)) {
      const s = text(v);
      if (s == null) continue;
      put[k] = s;
      const kind = (v as Typed)[0];
      if (kind !== 's') kinds[k] = kind;
    }
    for (const k of Object.keys(p.all())) if (!(k in put)) p.remove(k);
    for (const [k, v] of Object.entries(put)) p.put(k, v);
    p.put(TYPES_KEY, JSON.stringify(kinds));
    settings = Object.keys(put).length;
    if (json.app === 'Dzire Home' && !('carBrand' in put)) {
      // made before the rename, when the app was only for the Dzire: that is the car
      p.put('carBrand', 'maruti-suzuki');
      p.put('carBrandName', 'Maruti Suzuki');
      p.put('carModel', 'Dzire');
      p.put('fuel', 'petrol');
      p.put('carSetup', 'yes');
      if (!('tankL' in put)) p.put('tankL', '37'); // the Dzire's tank, the old default
    }
  }
  const drive = prefs.drive && typeof prefs.drive === 'object' ? tripOf(prefs.drive as Record<string, unknown>) : null;
  return { settings, drive };
}
