/**
 * Looking after the car (port of Care.java): service reminders by distance from the odometer or
 * by date, and the odometer itself.
 */
import { log, suggestOdo } from './fuel.ts';
import { num, type Prefs } from './prefs.ts';

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
    if (d === UNSET) return 'due date not set';
    const due = p.str(`care:${ITEMS[i]}:due`, '');
    return d < 0 ? 'overdue since ' + due : d === 0 ? 'due today' : `due ${due} (${d} days)`;
  }
  const k = kmLeft(p, i, odoKm);
  if (k === UNSET) return `every ${every(p, i)} km; last one not set`;
  return k < 0 ? `overdue by ${-k} km` : `in ${k} km (every ${every(p, i)} km)`;
}

/** The most urgent reminder for the car box, or "" when nothing is close. */
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
