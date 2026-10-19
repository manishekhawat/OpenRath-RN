/**
 * Looking after the car (port of Care.java): service reminders by distance from the odometer or
 * by date, the odometer itself, toll spending, and the weekly and monthly trip history.
 */
import { fmt, log, suggestOdo } from './fuel.ts';
import { f, t as tr } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';
import { dayKey, type History } from './trip.ts';

export const ITEMS = ['oil', 'tyres', 'alignment', 'service', 'insurance', 'puc'] as const;
export const NAMES = [
  'Oil change',
  'Tyre rotation',
  'Wheel alignment and balancing',
  'General service',
  'Insurance renewal',
  'PUC certificate',
];
const EVERY_KM = [10000, 10000, 5000, 10000, 0, 0];
/** Marks "never set" (Long.MIN_VALUE in the Java version). */
export const UNSET = Number.NEGATIVE_INFINITY;

/** The car's odometer: what was entered once (or at the last fill-up) plus what the GPS has counted since. */
export function odo(p: Prefs, gpsOdoKm: number): number {
  const off = p.str('odoOffset', '');
  if (off !== '' && Number.isFinite(parseFloat(off))) return Math.round(gpsOdoKm + parseFloat(off));
  return Math.round(suggestOdo(log(p), gpsOdoKm));
}

export function setOdo(p: Prefs, km: number, gpsOdoKm: number): void {
  p.put('odoOffset', String(km - gpsOdoKm));
}

export function byDate(i: number): boolean {
  return EVERY_KM[i] === 0;
}

export function every(p: Prefs, i: number): number {
  return num(p, `care:${ITEMS[i]}:every`, EVERY_KM[i]);
}

/** Km left to the next one (negative = overdue), or UNSET. */
export function kmLeft(p: Prefs, i: number, odoKm: number): number {
  const last = p.str(`care:${ITEMS[i]}:last`, '');
  if (last === '') return UNSET;
  return parseInt(last, 10) + every(p, i) - odoKm;
}

/** Days left to a dated item (negative = overdue), or UNSET. Dates are yyyy-mm-dd. */
export function daysLeft(p: Prefs, i: number, today: Date = new Date()): number {
  const due = p.str(`care:${ITEMS[i]}:due`, '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m) return UNSET;
  const d = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((d - t) / 86400000);
}

export function describe(p: Prefs, i: number, odoKm: number, today: Date = new Date()): string {
  if (byDate(i)) {
    const d = daysLeft(p, i, today);
    if (d === UNSET) return tr('due date not set');
    const due = p.str(`care:${ITEMS[i]}:due`, '');
    return d < 0 ? f('overdue since %1$s', due) : d === 0 ? tr('due today') : f('due %1$s (%2$s days)', due, d);
  }
  const k = kmLeft(p, i, odoKm);
  if (k === UNSET) return f('every %1$s km; last one not set', every(p, i));
  return k < 0 ? f('overdue by %1$s km', -k) : f('in %1$s km (every %2$s km)', k, every(p, i));
}

/** The most urgent reminder for the car box, or "" when nothing is close (in English: it is also spoken). */
export function alert(p: Prefs, odoKm: number, today: Date = new Date()): string {
  let best = '';
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ITEMS.length; i++) {
    let score: number;
    let text: string;
    const name = NAMES[i].toUpperCase();
    if (byDate(i)) {
      const d = daysLeft(p, i, today);
      if (d === UNSET || d > 15) continue;
      score = d * 40; // 15 days ≈ 600 km of urgency
      text = name + (d < 0 ? ' OVERDUE' : d === 0 ? ' DUE TODAY' : ` DUE IN ${d}${d === 1 ? ' DAY' : ' DAYS'}`);
    } else {
      const k = kmLeft(p, i, odoKm);
      if (k === UNSET || k > 500) continue;
      score = k;
      text = name + (k < 0 ? ' OVERDUE' : ` DUE IN ${k} KM`);
    }
    if (score < bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best;
}

/** A km-based service due within 300 km (or overdue), for the booking reminder: its index, or -1. */
export function bookingDue(p: Prefs, odoKm: number): number {
  let best = -1;
  let bestKm = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ITEMS.length; i++) {
    if (byDate(i) || ITEMS[i] === 'tyres' || ITEMS[i] === 'alignment') continue;
    const k = kmLeft(p, i, odoKm);
    if (k === UNSET || k > 300) continue;
    if (k < bestKm) {
      bestKm = k;
      best = i;
    }
  }
  return best;
}

// ------------------------------------------------------------------ tolls

/** A toll paid: when (ms) and rupees. Fuel fill-ups have the same two fields, so spent() adds either. */
export interface Paid {
  t: number;
  rs: number;
}

export const TOLLS_KEY = 'tolls';

export function tolls(p: Prefs): Paid[] {
  try {
    const a = JSON.parse(p.str(TOLLS_KEY, '[]'));
    return Array.isArray(a) ? a.filter((e) => e && typeof e === 'object') : [];
  } catch {
    return [];
  }
}

export function setTolls(p: Prefs, l: Paid[]): void {
  p.put(TOLLS_KEY, JSON.stringify(l));
}

export function addToll(p: Prefs, rs: number, now: number = Date.now()): void {
  if (!Number.isFinite(rs) || rs <= 0) return;
  setTolls(p, [...tolls(p), { t: now, rs }]);
}

/** Rupees spent on tolls (or fuel) between two times, `from` included. */
export function spent(l: { t?: number; rs?: number }[], from: number, to: number): number {
  let s = 0;
  for (const e of l) {
    const t = Number(e.t ?? 0);
    const rs = Number(e.rs ?? 0);
    if (t >= from && t < to && Number.isFinite(rs)) s += rs;
  }
  return s;
}

/** "  ·  tolls ₹450 this month" for the fuel box's foot, or "". */
export function tollsThisMonth(p: Prefs, now: Date = new Date()): string {
  const rs = spent(tolls(p), new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Number.MAX_SAFE_INTEGER);
  return rs > 0 ? '  ·  ' + f('tolls ₹%1$s this month', Math.round(rs)) : '';
}

// ------------------------------------------------------------------ trip history

export interface Period {
  name: string;
  /** midnight on the first day, ms */
  from: number;
  /** midnight after the last day, ms (not included) */
  to: number;
}

/** This week (from Sunday), last week, this month and last month, up to the end of today. */
export function periods(now: Date = new Date()): Period[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const weekStart = new Date(y, m, d - now.getDay());
  const lastWeek = new Date(y, m, d - now.getDay() - 7);
  const monthStart = new Date(y, m, 1);
  const lastMonth = new Date(y, m - 1, 1);
  const tomorrow = new Date(y, m, d + 1);
  return [
    { name: 'This week', from: weekStart.getTime(), to: tomorrow.getTime() },
    { name: 'Last week', from: lastWeek.getTime(), to: weekStart.getTime() },
    { name: 'This month', from: monthStart.getTime(), to: tomorrow.getTime() },
    { name: 'Last month', from: lastMonth.getTime(), to: monthStart.getTime() },
  ];
}

export interface Totals {
  km: number;
  sec: number;
  fuelRs: number;
  tollRs: number;
  /** the average of the days' scores (days over 1 km), or -1 */
  score: number;
}

/** Distance, time and score from the day-by-day history between two midnights. */
export function driven(hist: History, from: number, to: number): { km: number; sec: number; score: number } {
  let km = 0;
  let sec = 0;
  let scoreSum = 0;
  let scored = 0;
  const start = new Date(from);
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d.getTime() < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const r = hist[dayKey(d.getTime())];
    if (!Array.isArray(r)) continue;
    km += Number(r[0]) || 0;
    sec += Number(r[1]) || 0;
    if ((Number(r[0]) || 0) > 1 && r.length > 5) {
      scoreSum += Number(r[5]) || 0;
      scored++;
    }
  }
  return { km, sec, score: scored > 0 ? Math.trunc(scoreSum / scored) : -1 };
}

/** One period's totals: driving from the history, money from the fuel log and the tolls. */
export function totals(p: Prefs, hist: History, from: number, to: number): Totals {
  const d = driven(hist, from, to);
  return { ...d, fuelRs: spent(log(p), from, to), tollRs: spent(tolls(p), from, to) };
}

/** "This week: 120.5 km, 3 h 10 min, fuel ₹2000, tolls ₹150, score 88" */
export function periodLine(name: string, t: Totals): string {
  let b = tr(name) + ': ' + f('%1$s km, %2$s h %3$s min', fmt(t.km), Math.floor(t.sec / 3600), Math.floor((t.sec % 3600) / 60));
  if (t.fuelRs > 0) b += f(', fuel ₹%1$s', Math.round(t.fuelRs));
  if (t.tollRs > 0) b += f(', tolls ₹%1$s', Math.round(t.tollRs));
  if (t.score >= 0) b += f(', score %1$s', t.score);
  return b;
}

/**
 * The history with today's running figures added (the drive service only files a day when it
 * closes): row = [km, seconds, harsh brakes, hard starts, seconds over the limit, score].
 */
export function withToday(hist: History, day: string, row: number[]): History {
  return { ...hist, [day]: row };
}

/** "Today's driving score: 92 / 100 (1 harsh brakes, 2 hard starts, 0 min over the limit)" */
export function scoreLine(score: number, brakes: number, accels: number, speedSec: number): string {
  return f("Today's driving score: %1$s / 100 (%2$s harsh brakes, %3$s hard starts, %4$s min over the limit)", score, brakes, accels, Math.floor(speedSec / 60));
}

// ------------------------------------------------------------------ the trip menu

/**
 * Since 1.35 "Trips, fuel and tolls" is one Settings row that opens the trip menu (also the trip
 * box's tap): start today's trip again, save the parking spot, the fuel log, trip history with the
 * driving score, and a toll payment.
 */
export const TRIP_MENU = [
  "Start today's trip again",
  'Save the parking spot here',
  'Fuel log and fill-ups',
  'Trip history and driving score',
  'Add a toll payment',
];

/** The trip menu's heading: "Today 12.3 km  ·  GPS odometer 4567 km". */
export function tripMenuTitle(todayKm: number, odoKm: number): string {
  return f('Today %1$s km  ·  GPS odometer %2$s km', todayKm.toFixed(1), String(Math.round(odoKm)));
}

/** The Settings row's state: "today 12.3 km, score 92; 4 fill-ups". */
export function tripRow(todayKm: number, score: number, fills: number): string {
  return f('today %1$s km, score %2$s; %3$s', todayKm.toFixed(1), String(score), fills === 0 ? tr('no fill-ups yet') : f('%1$s fill-ups', String(fills)));
}

/** The parking spot is saved only from a GPS fix of the last 30 seconds (Hub.liveFix). */
export function liveFix(fixAt: number, now: number = Date.now()): boolean {
  return fixAt > 0 && now - fixAt < 30000;
}
