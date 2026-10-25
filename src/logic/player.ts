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
    : { title: 'Music files', sub: 'Tap play for music on the unit or USB' };
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

// ------------------------------------------------------------------ drag to seek (1.39)

/** Where a track is now, in ms: the last reported position moved on by the time since, at the play speed (ArtColour.position). */
export function position(pos: number, reportedAt: number, speed: number, now: number, duration: number): number {
  const p = pos + Math.trunc((now - reportedAt) * speed);
  return Math.max(0, duration > 0 ? Math.min(duration, p) : p);
}

/** "3:07" or "1:02:03", from milliseconds (ArtColour.clock). */
export function clockMs(ms: number): string {
  return clock(Math.max(0, Math.floor(ms / 1000)));
}

/** The seek bar shows for songs of a known length, when the feature is on (radio has no length). */
export function seekable(p: Prefs, mode: Mode | null, durationSec: number): boolean {
  return mode === FILES && durationSec > 0 && Features.on(p, 'seek');
}

/** Where a drag at `x` along a bar `width` wide lands, in seconds. */
export function seekTo(x: number, width: number, durationSec: number): number {
  if (width <= 0 || durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, x / width)) * durationSec;
}

// ------------------------------------------------------------------ album cover colours (1.39)

/**
 * The colour the music box takes from the album cover (ArtColour.pick): the most vivid of its
 * common colours, kept dark enough that white text stays readable on it. Pixels as ARGB numbers;
 * 0 when the cover is grey or empty. Not used yet: the app's own player has no covers (the media
 * library gives audio no artwork, and reading an image's pixels needs native code), and other
 * apps' covers need notification access.
 */
export function artColour(px: ArrayLike<number> | null): number {
  if (px == null || px.length === 0) return 0;
  // 4 levels per channel = 64 bins; each bin weighs how often and how vivid its colour is
  const weight = new Float64Array(64);
  const sum = Array.from({ length: 64 }, () => [0, 0, 0]);
  const n = new Int32Array(64);
  for (let i = 0; i < px.length; i++) {
    const p = px[i];
    if (p >>> 24 < 128) continue;
    const r = (p >> 16) & 0xff;
    const g = (p >> 8) & 0xff;
    const b = p & 0xff;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40) continue; // near black
    const sat = max === 0 ? 0 : (max - min) / max;
    const bin = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
    weight[bin] += 0.2 + sat * sat;
    sum[bin][0] += r;
    sum[bin][1] += g;
    sum[bin][2] += b;
    n[bin]++;
  }
  let best = -1;
  for (let i = 0; i < 64; i++) if (n[i] > 0 && (best < 0 || weight[i] > weight[best])) best = i;
  if (best < 0) return 0;
  let r = Math.trunc(sum[best][0] / n[best]);
  let g = Math.trunc(sum[best][1] / n[best]);
  let b = Math.trunc(sum[best][2] / n[best]);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 30) return 0; // grey: keep the theme's own panel
  // darken so the brightest channel is at most 150
  if (max > 150) {
    r = Math.trunc((r * 150) / max);
    g = Math.trunc((g * 150) / max);
    b = Math.trunc((b * 150) / max);
  }
  return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
}

// ------------------------------------------------- shorter lists while the car moves (1.44)

/** Rows a list shows while the car moves, as Android Auto does (Browse.MOVING_ROWS). */
export const MOVING_ROWS = 12;

/** At most `max` rows while moving, all of them when stopped (Browse.trim). */
export function trim<T>(all: readonly T[], moving: boolean, max = MOVING_ROWS): T[] {
  return moving && all.length > max ? all.slice(0, max) : [...all];
}

// ------------------------------------------------------------------ phone projection (1.36)

/** Words in the package name or label of projection apps (Projection.WORDS). */
export const PROJECTION_WORDS = ['zlink', 'autokit', 'carplay', 'carbit', 'phonelink', 'phone link', 'easyconn', 'androidauto', 'android auto', 'auto link', 'autolink', 'carlink'];

/** True when this package name or label looks like a wireless CarPlay / Android Auto app. */
export function looksLikeProjection(pkg: string | null, label: string | null): boolean {
  const s = ((pkg ?? '') + ' ' + (label ?? '')).toLowerCase();
  // the phone's own Android Auto app, if it's here, can't receive a phone
  if (s.includes('com.google.android.projection.gearhead')) return false;
  return PROJECTION_WORDS.some((w) => s.includes(w));
}

/**
 * The projection app the music box's CARPLAY / AUTO button opens ('app:projection', as
 * Prefs.app), or "" when none is chosen. Android also found one by itself among the installed
 * apps; listing apps needs native code, so here it is chosen by package name.
 */
export function projectionApp(p: Prefs): string {
  return Features.on(p, 'projection') ? p.str('app:projection', '').trim() : '';
}
