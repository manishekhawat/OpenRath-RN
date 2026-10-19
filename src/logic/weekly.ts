/**
 * The weekly report (Chores.weekly in the Android version): on Sundays, or the first start after
 * a missed one, the last seven days in one card: km, time, petrol and toll spending, the average
 * score, and the smoothest and most wasteful drive. Also the start-up summary's extras.
 */
import { spent, tolls, driven } from './care.ts';
import * as Coach from './coach.ts';
import { weekly as weeklyText } from './errands.ts';
import * as Features from './features.ts';
import { t } from './i18n.ts';
import { log } from './fuel.ts';
import { kmpl as planKmpl, summaryRange } from './fuelplan.ts';
import { upcoming } from './holidays.ts';
import type { Prefs } from './prefs.ts';
import type { History } from './trip.ts';

const DAY = 86400000;

/**
 * Whether to show the report on its own now (and, if so, marks it shown in 'weeklyAt'). The first
 * time only starts the clock. Call when parked (below 3 km/h), as the Java version did.
 */
export function due(p: Prefs, now: Date = new Date()): boolean {
  // part of "Daily and weekly summary" since 1.35
  if (!Features.on(p, 'startSummary')) return false;
  const t = now.getTime();
  const last = parseFloat(p.str('weeklyAt', '0')) || 0;
  if (last === 0) {
    p.put('weeklyAt', String(t));
    return false;
  }
  const sunday = now.getDay() === 0;
  if (!((sunday && t - last > 6 * DAY) || t - last > 8 * DAY)) return false;
  p.put('weeklyAt', String(t));
  return true;
}

export interface Week {
  from: number;
  to: number;
  km: number;
  sec: number;
  fuelRs: number;
  tollRs: number;
  score: number;
  best: Coach.Trip | null;
  worst: Coach.Trip | null;
  /** "Tue, 12 km: smooth drive", or "" */
  bestText: string;
  worstText: string;
  /** the whole card, line by line */
  text: string;
}

/** The last seven days, from the day-by-day history, the fuel log, the tolls and the coach's drives. */
export function week(p: Prefs, hist: History, now: number = Date.now()): Week {
  const from = now - 7 * DAY;
  // the Java version read 8 calendar days starting on the day a week ago
  const d0 = new Date(from);
  const start = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  const end = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 8).getTime();
  const { km, sec, score } = driven(hist, start, end);
  // the smoothest and the most wasteful drive, by fuel lost to habits per km
  const k = planKmpl(p);
  let best: Coach.Trip | null = null;
  let worst: Coach.Trip | null = null;
  let bestW = Number.MAX_VALUE;
  let worstW = -1;
  for (const tr of Coach.trips(p)) {
    if (tr.start < from || tr.km < 3) continue;
    const w = Coach.total(Coach.waste(tr, k)) / tr.km;
    if (w < bestW) {
      bestW = w;
      best = tr;
    }
    if (w > worstW) {
      worstW = w;
      worst = tr;
    }
  }
  const line = (t: Coach.Trip) => `${Coach.weekday(t.start)}, ${Math.round(t.km)} km: ${Coach.reasons(t, Coach.waste(t, k))}`;
  const bestText = best ? line(best) : '';
  const worstText = worst && worst !== best ? line(worst) : '';
  const fuelRs = spent(log(p), from, now);
  const tollRs = spent(tolls(p), from, now);
  return {
    from, to: now, km, sec, fuelRs, tollRs, score, best, worst, bestText, worstText,
    text: weeklyText(km, sec, fuelRs, tollRs, score, bestText, worstText),
  };
}

export const TITLE = 'Your week in the car';

/** TITLE in the chosen language. */
export function title(): string {
  return t(TITLE);
}

/** The next holiday, if it falls within a week (the first one on or after a week from now differs). */
export function holidaySoon(now: Date = new Date()): string {
  const next = upcoming(now, 1);
  const later = upcoming(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7), 1);
  return next.length > 0 && (later.length === 0 || later[0] !== next[0]) ? next[0] : '';
}

/**
 * The start-up summary's petrol range and holiday, as Chores.summary passed them to
 * Errands.summary: range -1 (left out) unless Fuel and mileage is on and knows the tank.
 */
export function summaryExtras(p: Prefs, gpsOdoKm: number, now: Date = new Date()): { rangeKm: number; holiday: string } {
  return { rangeKm: summaryRange(p, gpsOdoKm), holiday: holidaySoon(now) };
}
