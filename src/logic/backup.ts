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

import { validVpa } from './errands.ts';
import { t } from './i18n.ts';
import type { Prefs } from './prefs.ts';
import { dayKey, type History, type TripState } from './trip.ts';
import { validPin } from './valet.ts';

/** Settings files that are worth keeping; "crash" is left out on purpose. */
export const PREFS = ['home', 'drive', 'player'];
/** Automatic backups kept. */
export const KEEP = 7;
/** Where the types of restored settings are remembered (not itself backed up). */
export const TYPES_KEY = 'backupTypes';

/**
 * Secrets never written to a backup: a backup is a file that leaves the unit, so the valet PIN,
 * the hotspot password and the key-action token stay behind (Backup.SECRET).
 */
export const SECRET = ['valetPin', 'apPass', 'keyToken'];

/**
 * Never taken from a backup, whatever it holds: the secrets, valet mode (it goes with its PIN) and
 * the addresses updates come from and reports go to. What the unit has for these stays as it is,
 * and so does anything a fleet manages, whose keys begin "m:".
 */
export const KEPT = [...SECRET, 'valet', 'updateUrl', 'reportUrl'];

/**
 * Android's own name for a setting. Everything the Android version reads through Prefs.str and
 * Prefs.put is kept under an "x:" prefix; the keys its named accessors use (Prefs.java) have no
 * prefix. This port keeps every setting unprefixed, so a backup is translated on the way out and
 * back on the way in, which is what makes the two apps' backups interchangeable.
 */
const ANDROID_PLAIN = new Set(['swapped', 'lights', 'lightKey', 'lightOff', 'lightOn', 'alerts', 'warnSpeed', 'fmFreq', 'welcome']);
/** The same, by how the name begins: chosen apps, radio commands, the car's learnt signals, box slots. */
const ANDROID_PLAIN_START = ['app:', 'src:', 'fm:', 'sigKey_', 'sigOff_', 'sigOn_'];
const ANDROID_SLOT = /^(slot\d+|p\d+slot\d+)$/;
/** Settings this port had to name apart from the Android version's own key. */
const RENAMED: Record<string, string> = { fuelLog: 'fuel' };
const X = 'x:';

function plainOnAndroid(key: string): boolean {
  return ANDROID_PLAIN.has(key) || ANDROID_SLOT.test(key) || ANDROID_PLAIN_START.some((s) => key.startsWith(s));
}

/** Our key, as a backup holds it. */
export function androidKey(key: string): string {
  return RENAMED[key] ?? (plainOnAndroid(key) ? key : X + key);
}

/**
 * A key from a backup, as we hold it. A backup made by this port before 1.43 has no prefixes at
 * all; such a key is neither prefixed nor one of Android's plain ones, and is taken as it is.
 * "fuel" is the one name that means two things: the fill-up log in an Android backup, and the
 * car's fuel type in a backup this port made while the two shared a name. The value says which.
 */
export function ourKey(key: string, value = ''): string {
  if (key.startsWith(X)) return key.substring(X.length);
  if (key === 'fuel') return value.trim().startsWith('[') ? 'fuelLog' : 'fuel';
  return key;
}

/** Whether a setting goes into backups. */
export function backedUp(key: string): boolean {
  return !SECRET.includes(key);
}

/** Whether a setting may be restored from a backup. */
export function restorable(key: string): boolean {
  return !KEPT.includes(key) && !key.startsWith('m:');
}

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
  return p.str('backupDay', '') !== dayKey(now.getTime());
}

export function markDone(p: Prefs, now: Date): void {
  p.put('backupDay', dayKey(now.getTime()));
  p.put('backupLast', String(now.getTime()));
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

// ------------------------------------------------------------------ what a restore may write

/** An Android package name, for the apps the dock and the map hand over to. */
const PACKAGE = /^[a-z][a-z0-9_.]*$/;

/** "name|number", the way a favourite and an SOS contact are kept; the number as a number. */
function namePhone(v: string): boolean {
  if (v === '') return true;
  const bar = v.indexOf('|');
  if (bar <= 0 || v.indexOf('|', bar + 1) >= 0) return false;
  const phone = v.substring(bar + 1);
  const digits = phone.replace(/[^0-9+]/g, '');
  return digits.length >= 3 && digits.length <= 20 && !/[^0-9+\s()-]/.test(phone);
}

/**
 * Whether a restored value is one the owner could have typed into the screen it belongs to. A
 * backup is a file like any other file, and a few of these settings are acted on without ever
 * being typed again: the UPI id the cost-split QR pays, the SOS numbers, the voice-dial
 * favourites, the apps a dock button starts and the valet PIN. Each goes through the check its
 * own screen makes; the rest is text the owner sees on screen before anything is done with it.
 */
export function okValue(key: string, v: string): boolean {
  if (key.startsWith('app:')) return v === '' || PACKAGE.test(v);
  if (key === 'upiId') return v === '' || validVpa(v);
  if (key === 'valetPin') return v === '' || validPin(v);
  if (key === 'cabSos1' || key === 'cabSos2' || /^fav[1-9]$/.test(key)) return namePhone(v);
  return true;
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
  for (const [k, v] of Object.entries(p.all())) if (k !== TYPES_KEY && backedUp(k)) home[androidKey(k)] = typed(v, t[k]);
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
 * first). A value `okValue` turns down is left out, and what is here now is kept in its place
 * rather than cleared, so a doctored file can neither set one of those settings nor empty it.
 * Returns how many were restored and the trip computer to put back, if the backup has it.
 */
export function restore(p: Prefs, json: BackupJson): { settings: number; drive: ReturnType<typeof tripOf> | null } {
  if (!p.all || !p.remove) throw new Error('restoring needs a settings store that lists its keys');
  const prefs = json.prefs;
  let settings = 0;
  const home = prefs.home as Record<string, unknown> | undefined;
  if (home && typeof home === 'object') {
    const put: Record<string, string> = {};
    const kinds: Record<string, Typed[0]> = {};
    const kept = new Set<string>();
    for (const [name, v] of Object.entries(home)) {
      const s = text(v);
      if (s == null) continue;
      const k = ourKey(name, s);
      if (!restorable(k) || !okValue(k, s)) {
        kept.add(k);
        continue;
      }
      put[k] = s;
      const kind = (v as Typed)[0];
      if (kind !== 's') kinds[k] = kind;
    }
    for (const k of Object.keys(p.all())) if (!(k in put) && !kept.has(k)) p.remove(k);
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
