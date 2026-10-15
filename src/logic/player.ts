import * as Features from './features.ts';
import { num, type Prefs } from './prefs.ts';

/**
 * OpenRath's own player (the pure parts of Player.java and Resume.java), so the music box plays
 * without opening another app. "web" plays internet radio stations from the free Radio Browser
 * directory (Indian stations by popularity); "files" plays music on the unit. There is no shuffle
 * or repeat setting, as in the Android version: songs run on to the next and round to the first
 * again, and a station plays until it stops. Playing itself is in src/state/player.tsx.
 */

export const WEB = 'web';
export const FILES = 'files';
export type Mode = typeof WEB | typeof FILES;

export interface Track {
  name: string;
  /** the artist, folder or a station's tags */
  sub: string;
  /** a URL or file URI, or "asset:<id>" for a song in the phone's media library */
  src: string;
}

// ------------------------------------------------------------------ what is remembered

/** The station and song last played, as indexes into their lists (the "player" prefs in Android). */
export function savedIndex(p: Prefs, mode: Mode): number {
  return Math.max(0, num(p, mode === WEB ? 'station' : 'song', 0));
}

export function saveIndex(p: Prefs, mode: Mode, i: number): void {
  p.put(mode === WEB ? 'station' : 'song', String(i));
}

/** The list a mode plays from, and its current entry (null when the index is out of range). */
export function current(list: Track[], i: number): Track | null {
  return i >= 0 && i < list.length ? list[i] : null;
}

/** The next (d = 1) or previous (d = -1) index, going round at the ends. */
export function skip(i: number, d: number, size: number): number {
  if (size <= 0) return 0;
  return (((i + d) % size) + size) % size;
}

// ------------------------------------------------------------------ resume after switch-on

/**
 * What was playing, for carrying on after switch-on: "web", "files", "fm", "app:<package>" or ""
 * for stopped. Saved when the owner starts or stops something (not when the battery saver pauses).
 */
export function remember(p: Prefs, what: string): void {
  p.put('resume', what);
}

/** What to carry on with: "web" or "files" for this player, "" for nothing (FM and other apps aren't ours). */
export function toResume(p: Prefs): Mode | '' {
  const w = p.str('resume', '');
  return w === WEB || w === FILES ? w : '';
}

/**
 * Carry on now? Once per app start, when resume is on and this player was playing. The Android
 * version also carried on after the unit's screen had slept a minute; an app can't tell that
 * from being behind other apps, so that part is left out.
 */
export function due(p: Prefs, fresh: boolean): boolean {
  return fresh && Features.on(p, 'resume') && toResume(p) !== '';
}

// ------------------------------------------------------------------ stations

/** Radio Browser's mirrors, tried in turn. */
export const HOSTS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info', 'all.api.radio-browser.info'];

export function stationsUrl(host: string): string {
  return `https://${host}/json/stations/search?countrycode=IN&hidebroken=true&order=clickcount&reverse=true&limit=80`;
}

interface RawStation {
  name?: string;
  url?: string;
  url_resolved?: string;
  codec?: string;
  tags?: string;
}

/**
 * Radio Browser's answer as stations: at most 50, no repeated names, MP3 or AAC streams only (or
 * no codec given), with the first 40 characters of their tags underneath.
 */
export function parseStations(json: string | null): Track[] {
  const out: Track[] = [];
  if (!json) return out;
  let a: unknown;
  try {
    a = JSON.parse(json);
  } catch {
    return out;
  }
  if (!Array.isArray(a)) return out;
  const seen = new Set<string>();
  for (const s of a as RawStation[]) {
    if (out.length >= 50) break;
    if (!s || typeof s !== 'object') continue;
    const codec = String(s.codec ?? '').toUpperCase();
    const url = String(s.url_resolved ?? s.url ?? '');
    const name = String(s.name ?? '').trim();
    if (url === '' || name === '' || seen.has(name.toLowerCase())) continue;
    if (!(codec.includes('MP3') || codec.includes('AAC') || codec === '')) continue;
    seen.add(name.toLowerCase());
    let tags = String(s.tags ?? '');
    if (tags.length > 40) tags = tags.substring(0, 40);
    out.push({ name, sub: tags.replaceAll(',', ', '), src: url });
  }
  return out;
}

/**
 * The same stations in Radio Browser's own format, cut down to the fields used: kept in the
 * 'stations' pref for when the directory can't be reached (the full answer is far bigger).
 */
export function keepStations(json: string): string {
  return JSON.stringify(parseStations(json).map((t) => ({ name: t.name, url_resolved: t.src, tags: t.sub.replaceAll(', ', ',') })));
}

type Get = (url: string) => Promise<string>;

const get: Get = async (u) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'OpenRath' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
};

/** The stations from the first mirror that answers, else the last list seen. */
export async function fetchStations(p: Prefs, fetchText: Get = get): Promise<Track[]> {
  for (const h of HOSTS) {
    try {
      const json = await fetchText(stationsUrl(h));
      const l = parseStations(json);
      if (l.length > 0) {
        p.put('stations', keepStations(json));
        return l;
      }
    } catch {
      // the next mirror
    }
  }
  return parseStations(p.str('stations', ''));
}

// ------------------------------------------------------------------ songs

export const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wav', '.opus'];

export function isAudio(fileName: string): boolean {
  const l = fileName.toLowerCase();
  return AUDIO_EXT.some((e) => l.endsWith(e));
}

/** A file's name without its extension, as the song's title. */
export function title(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

/** Music, not ringtones and clips: longer than 15 seconds (unknown lengths are kept). */
export function longEnough(durationMs: number | null | undefined): boolean {
  return durationMs == null || durationMs <= 0 || durationMs > 15000;
}

/** Sorted by name, ignoring case. */
export function byName(l: Track[]): Track[] {
  return [...l].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// ------------------------------------------------------------------ what the boxes show

export const STATUS = {
  findingStations: 'Finding stations…',
  findingMusic: 'Looking for music…',
  webUnreachable: 'Web radio unreachable',
  noMusic: 'No music files found',
  cantPlay: "Can't play this one",
  stationDown: 'Station unavailable, trying the next',
  fileBad: "Can't play this file, skipping",
  noPlayable: 'No playable music files',
};

/** After an error: move on (true), or give up after five in a row so it doesn't spin with no connection. */
export function retry(errors: number): boolean {
  return errors < 5;
}

/** The message once it gives up. */
export function gaveUp(mode: Mode): string {
  return mode === WEB ? STATUS.webUnreachable : STATUS.noPlayable;
}

/** The box's two lines when nothing of ours is loaded. */
export function idle(mode: Mode): { title: string; sub: string } {
  return mode === WEB
    ? { title: 'Online radio', sub: 'Tap play for Indian stations' }
    : { title: 'Music files', sub: 'Tap play for music on the unit, or add some on the music page' };
}

/** "1:05", "1:02:09": a position or length in seconds. */
export function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
