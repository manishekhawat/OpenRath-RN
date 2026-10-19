import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';
import { dayKey } from './trip.ts';

/**
 * Trip games for children (port of Kids.java): spot a car of the colour shown (two players keep
 * score), spot number plates from other states, and a big "how far to go" countdown to where the
 * map is taking you, Home or Office. Scores and the states found are kept for the day.
 */

export const COLOURS: [string, string][] = [
  ['White', '#F4F4F4'], ['Silver', '#B8BEC6'], ['Black', '#1A1A1A'], ['Red', '#D32F2F'], ['Blue', '#1E63C8'],
  ['Grey', '#6B7078'], ['Brown', '#7A4E2D'], ['Yellow', '#F2C230'], ['Green', '#2E8B57'], ['Orange', '#F07A20'],
];

/** Number-plate codes and the state or territory they come from. */
export const STATES: [string, string][] = [
  ['DL', 'Delhi'], ['HR', 'Haryana'], ['UP', 'Uttar Pradesh'], ['RJ', 'Rajasthan'], ['PB', 'Punjab'],
  ['CH', 'Chandigarh'], ['HP', 'Himachal'], ['UK', 'Uttarakhand'], ['JK', 'Jammu & Kashmir'], ['MH', 'Maharashtra'],
  ['GJ', 'Gujarat'], ['MP', 'Madhya Pradesh'], ['KA', 'Karnataka'], ['TN', 'Tamil Nadu'], ['KL', 'Kerala'],
  ['AP', 'Andhra Pradesh'], ['TS', 'Telangana'], ['WB', 'West Bengal'], ['BR', 'Bihar'], ['OD', 'Odisha'],
  ['GA', 'Goa'], ['AS', 'Assam'], ['JH', 'Jharkhand'], ['CG', 'Chhattisgarh'], ['BH', 'Bharat series'],
];

/** Straight-line km from here to the target, rounded for children ("48", "4.5"). */
export function km(metres: number): string {
  if (metres < 0) return '--';
  const k = metres / 1000;
  return k >= 10 ? String(Math.round(k)) : k.toFixed(1);
}

/** Light colours take dark writing on the colour card. */
export function light(colour: string): boolean {
  return colour === 'White' || colour === 'Silver' || colour === 'Yellow';
}

/** Another colour than the one showing. */
export function nextColour(cur: number, random: () => number = Math.random): number {
  let next: number;
  do next = Math.floor(random() * COLOURS.length);
  while (next === cur);
  return next;
}

// ------------------------------------------------------------------ scores, kept for the day

/** A player's score today ('kidsScore' is "yyyy-mm-dd|left|right"). */
export function score(p: Prefs, player: number, now = Date.now()): number {
  const s = p.str('kidsScore', '').split('|');
  if (s.length < 3 || s[0] !== dayKey(now)) return 0;
  const v = parseInt(s[player + 1], 10);
  return Number.isFinite(v) ? v : 0;
}

export function setScore(p: Prefs, a: number, b: number, now = Date.now()): void {
  p.put('kidsScore', `${dayKey(now)}|${a}|${b}`);
}

/** A point to the player who saw the colour first. */
export function point(p: Prefs, player: number, now = Date.now()): void {
  setScore(p, score(p, 0, now) + (player === 0 ? 1 : 0), score(p, 1, now) + (player === 1 ? 1 : 0), now);
}

/** The plate codes found today ('kidsStates' is "yyyy-mm-dd|DL,HR,…"). */
export function found(p: Prefs, now = Date.now()): string[] {
  const s = p.str('kidsStates', '').split('|');
  if (s.length < 2 || s[0] !== dayKey(now)) return [];
  return s[1].split(',').filter((x) => x !== '');
}

export function setFound(p: Prefs, f: string[], now = Date.now()): void {
  p.put('kidsStates', dayKey(now) + '|' + f.join(','));
}

/** Tap a state: found, or not found after all. */
export function toggle(p: Prefs, code: string, now = Date.now()): string[] {
  const got = found(p, now);
  const i = got.indexOf(code);
  if (i >= 0) got.splice(i, 1);
  else got.push(code);
  setFound(p, got, now);
  return got;
}

export function platesHeading(count: number): string {
  return f('Number plates from other states: %1$s of %2$s found today', count, STATES.length);
}

/** The player's name ('kid1', 'kid2'), or the seat. */
export function player(p: Prefs, i: number): string {
  return p.str('kid' + (i + 1), t(i === 0 ? 'Left seat' : 'Right seat'));
}

export function rename(p: Prefs, i: number, name: string): void {
  if (name.trim() !== '') p.put('kid' + (i + 1), name.trim());
}

// ------------------------------------------------------------------ how far?

export interface Target {
  name: string;
  lat: number;
  lon: number;
}

/** "lat,lon" as the Android version kept places, or {lat, lon} as JSON. */
function point2(s: string): { lat: number; lon: number } | null {
  if (s === '') return null;
  try {
    if (s.startsWith('{')) {
      const j = JSON.parse(s);
      const lat = Number(j.lat), lon = Number(j.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    }
  } catch {
    return null;
  }
  const v = s.split(',');
  if (v.length !== 2) return null;
  const lat = parseFloat(v[0]), lon = parseFloat(v[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** Where the map is taking you: 'dest' ("name|lat|lon"), or the map page's 'lastDest' JSON. */
export function destination(p: Prefs): Target | null {
  const d = p.str('dest', '').split('|');
  if (d.length === 3) {
    const lat = parseFloat(d[1]), lon = parseFloat(d[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { name: d[0], lat, lon };
  }
  try {
    const j = JSON.parse(p.str('lastDest', ''));
    const lat = Number(j.lat), lon = Number(j.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { name: String(j.name ?? ''), lat, lon };
  } catch {
    // none
  }
  return null;
}

/** The places to count down to: the map's destination (by the children's name for it), Home and Office. */
export function targets(p: Prefs): Target[] {
  const out: Target[] = [];
  const d = destination(p);
  if (d) {
    const nick = p.str('destNick', '');
    out.push({ ...d, name: nick !== '' ? nick : d.name === '' ? "Where we're going" : d.name });
  }
  for (const n of ['Home', 'Office']) {
    const s = point2(p.str('place:' + n, ''));
    if (s) out.push({ name: n, ...s });
  }
  return out;
}

/** Which target shows ('kidsTarget'), kept inside the list. */
export function targetIndex(p: Prefs, count: number): number {
  const v = parseInt(p.str('kidsTarget', '0'), 10);
  return Math.max(0, Math.min(Number.isFinite(v) ? v : 0, count - 1));
}

/** Tap the place: the next one. */
export function nextTarget(p: Prefs, count: number): number {
  const i = count === 0 ? 0 : (targetIndex(p, count) + 1) % count;
  p.put('kidsTarget', String(i));
  return i;
}
