/**
 * Small badges for good driving (port of Achievements.java, 1.40), worked out from the day-by-day
 * driving log (the trip computer's history): smooth streaks, weeks within the limit, calm long
 * drives and distance. Kept on the unit ('badges', a comma list); a new one is shown once.
 */
import * as Features from './features.ts';
import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

/** [id, name, how to earn it]. */
export const BADGES: [string, string, string][] = [
  ['smooth3', 'Smooth three', 'Three driving days in a row with a score of 90 or more'],
  ['smooth7', 'Smooth week', 'Seven driving days in a row with a score of 90 or more'],
  ['smooth30', 'Smooth month', 'Thirty driving days in a row with a score of 90 or more'],
  ['limit7', 'A week within the limit', 'Seven driving days in a row without speeding'],
  ['perfect', 'Perfect day', 'A day of 20 km or more with a score of 100'],
  ['calm', 'Calm long drive', 'A day of 100 km or more with no harsh braking or hard starts'],
  ['km1000', '1,000 km', '1,000 km driven with OpenRath'],
  ['km10000', '10,000 km', '10,000 km driven with OpenRath'],
];

/** A day counts as a driving day from this distance. */
export const DRIVEN_KM = 5;
/** The dashboard looks for new badges at most this often. */
export const CHECK_MS = 3600 * 1000;

/**
 * Badges the log has earned. `days` is in date order, each [km, seconds, harsh brakes, hard
 * starts, seconds over the limit, score]; days with almost no driving don't break a streak.
 */
export function earned(days: readonly (readonly number[] | null | undefined)[]): string[] {
  const out: string[] = [];
  let smooth = 0;
  let bestSmooth = 0;
  let within = 0;
  let bestWithin = 0;
  let km = 0;
  let perfect = false;
  let calm = false;
  for (const d of days) {
    if (!d || d.length < 6) continue;
    km += d[0];
    if (d[0] < DRIVEN_KM) continue;
    smooth = d[5] >= 90 ? smooth + 1 : 0;
    within = d[4] === 0 ? within + 1 : 0;
    bestSmooth = Math.max(bestSmooth, smooth);
    bestWithin = Math.max(bestWithin, within);
    if (d[0] >= 20 && d[5] >= 100) perfect = true;
    if (d[0] >= 100 && d[2] === 0 && d[3] === 0) calm = true;
  }
  if (bestSmooth >= 3) out.push('smooth3');
  if (bestSmooth >= 7) out.push('smooth7');
  if (bestSmooth >= 30) out.push('smooth30');
  if (bestWithin >= 7) out.push('limit7');
  if (perfect) out.push('perfect');
  if (calm) out.push('calm');
  if (km >= 1000) out.push('km1000');
  if (km >= 10000) out.push('km10000');
  return out;
}

/** The ones in `now` that aren't in the saved comma list `had`. */
export function fresh(had: string | null | undefined, now: readonly string[]): string[] {
  const h = ',' + (had ?? '') + ',';
  return now.filter((id) => !h.includes(',' + id + ','));
}

export function name(id: string): string {
  return BADGES.find((b) => b[0] === id)?.[1] ?? id;
}

/** The driving log in date order, from the history ({ "2026-10-14": [km, s, …] }). */
export function days(hist: Record<string, unknown>): number[][] {
  const out: number[][] = [];
  for (const k of Object.keys(hist).sort()) {
    const j = hist[k];
    if (!Array.isArray(j) || j.length < 6) continue;
    out.push(j.slice(0, 6).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)));
  }
  return out;
}

/**
 * From the dashboard's regular check, at most once an hour: the new badges to show (each once),
 * remembered in 'badges'. Empty when switched off, too soon, or nothing new.
 */
export function check(p: Prefs, hist: Record<string, unknown>, now: number): string[] {
  if (!Features.on(p, 'achievements')) return [];
  if (Math.abs(now - (Number(p.str('badgesAt', '0')) || 0)) < CHECK_MS) return [];
  p.put('badgesAt', String(now));
  const got = earned(days(hist));
  const news = fresh(p.str('badges', ''), got);
  if (news.length === 0) return [];
  p.put('badges', got.join(','));
  return news;
}

/** "New badge: Smooth week" */
export function newText(id: string): string {
  return f('New badge: %1$s', t(name(id)));
}

/** The Settings row: "3 of 8 earned". */
export function countText(n: number): string {
  return f('%1$s of %2$s earned', n, BADGES.length);
}

/** The badges screen's title: "Badges: 3 of 8". */
export function titleText(n: number): string {
  return f('Badges: %1$s of %2$s', n, BADGES.length);
}
