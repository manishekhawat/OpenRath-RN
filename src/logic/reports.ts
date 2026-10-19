/**
 * Opt-in crash and usage reports (Reports.java, the "reports" switch, off by default). While it's
 * on, OpenRath counts which settings get opened and how often it starts, on the unit only; the owner
 * reads and shares the report from Settings. Nothing goes to OpenRath's makers, nothing is counted
 * while it's off, and turning it off forgets the counts. A report holds the counts, the app and
 * Android versions, the unit's model and a random id made when reports are turned on: no position,
 * no names, no numbers. Crash notes are kept apart (the last five), as the Android app's
 * OpenRath/logs. Sending to a fleet's address needs managed settings, which this version leaves out.
 */
import * as Features from './features.ts';
import type { Prefs } from './prefs.ts';
import { dayKey } from './trip.ts';

let store: Prefs | null = null;
let prefs: Prefs | null = null;
let early: Prefs | null = null;

const CRASHES = 5;

/** Where the counts live (their own storage, not in backups), and the settings; counts one start. */
export function install(s: Prefs, p: Prefs, now = Date.now()): void {
  store = s;
  prefs = p;
  count('app start', now);
}

export function on(): boolean {
  return prefs != null && Features.on(prefs, 'reports');
}

/** One more use of `what`, if reports are on. */
export function count(what: string, now = Date.now()): void {
  if (!on() || store == null) return;
  if (store.str('id', '') === '') {
    let id = '';
    for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
    store.put('id', id.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-'));
    store.put('since', String(now));
  }
  const k = 'n:' + what;
  store.put(k, String((parseInt(store.str(k, '0'), 10) || 0) + 1));
}

/** The counts by what was used. */
export function counts(s: Prefs | null = store): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s?.all?.() ?? {})) if (k.startsWith('n:')) out[k.substring(2)] = parseInt(v, 10) || 0;
  return out;
}

/** "what: count" lines, most used first. */
export function format(c: Record<string, number>): string {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}: ${v}\n`)
    .join('');
}

/** The report as plain text, for Share. `unit` is the maker, model and Android version. */
export function text(version: string, unit: string, now = Date.now()): string {
  const s = store;
  const since = parseInt(s?.str('since', '') ?? '', 10);
  let b =
    `OpenRath ${version} usage report\n` +
    `Unit: ${unit}\n` +
    `Report id: ${s?.str('id', '-') || '-'}\n` +
    `Counted since: ${s ? dayKey(Number.isFinite(since) ? since : now) : '-'}\n\n`;
  b += format(counts());
  const c = crashes();
  b += `\nCrash reports on the unit: ${c.length}\n`;
  for (const x of c) b += `\n---- ${x.name}\n${x.body}\n`;
  return b;
}

/** Whether `url` is somewhere reports may go: https only. */
export function sendable(url: string | null | undefined): boolean {
  return url != null && url.trim().toLowerCase().startsWith('https://') && url.trim().length > 8;
}

/** Turning reports off forgets everything counted (crash notes stay, as files do on Android). */
export function clear(): void {
  if (!store) return;
  for (const k of Object.keys(store.all?.() ?? {})) if (!k.startsWith('crash:')) store.remove?.(k);
}

// ------------------------------------------------------------------ crash notes

/**
 * Where crash notes go, from the moment the app starts (1.43: Crash.install runs before the
 * screens, so a crash while they are still loading is recorded too). The counts wait for install().
 */
export function keepCrashesIn(where: Prefs): void {
  early = where;
}

function kept(): Prefs | null {
  return store ?? early;
}

/** Keep a crash's message and stack, the last five. */
export function crash(body: string, now = Date.now()): void {
  const s = kept();
  if (!s) return;
  s.put('crash:' + now, body.substring(0, 8000));
  const keys = Object.keys(s.all?.() ?? {})
    .filter((k) => k.startsWith('crash:'))
    .sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - CRASHES))) s.remove?.(k);
}

/** The crash notes, newest first, named like the Android app's files. */
export function crashes(): { name: string; body: string }[] {
  const s = kept();
  if (!s) return [];
  return Object.entries(s.all?.() ?? {})
    .filter(([k]) => k.startsWith('crash:'))
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([k, v]) => {
      const d = new Date(parseInt(k.substring(6), 10));
      const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
      return { name: `crash-${dayKey(d.getTime())}-${hm}.txt`, body: v };
    });
}

export function clearCrashes(): void {
  const s = kept();
  if (!s) return;
  for (const k of Object.keys(s.all?.() ?? {})) if (k.startsWith('crash:')) s.remove?.(k);
}
