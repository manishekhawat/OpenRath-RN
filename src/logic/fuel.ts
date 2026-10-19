/**
 * Fuel log (port of Fuel.java): each fill-up has litres, amount paid, odometer and whether the
 * tank was filled. Mileage per tank uses the standard "full to full" method.
 */
import { fullTankKmpl as kmplOf } from './errands.ts';
import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

export interface FillUp {
  /** when, ms since epoch */
  t: number;
  /** litres */
  l: number;
  /** rupees paid */
  rs: number;
  /** odometer typed at the pump */
  odo: number;
  /** the GPS odometer at that moment */
  gps?: number;
  city?: string;
  full?: boolean;
}

export interface Stats {
  lastKmpl: number;
  avgKmpl: number;
  rupeesPerKm: number;
  fills: number;
  lastAt: number;
}

/**
 * Where the fill-ups are kept. Up to 1.43 this was "fuel", which is also where the car's fuel type
 * lives (Car.fuel), so the first fill-up wrote over "diesel" or "cng". The Android version uses the
 * same two names without clashing, because everything it reads through Prefs.str carries an "x:"
 * prefix and the fuel log does not; this port has no prefix, so the log is named apart instead.
 */
export const LOG_KEY = 'fuelLog';
/** The name the log had before, which is the car's fuel type's name. */
export const OLD_LOG_KEY = 'fuel';

/**
 * Moves a log still kept under the old name across, once, at start-up. The car's fuel type was
 * lost when the log replaced it, so the key is cleared and the type falls back to its default
 * until the owner sets it again in Settings > Car.
 */
export function moveOldLog(p: Prefs): void {
  const old = p.str(OLD_LOG_KEY, '').trim();
  if (!old.startsWith('[')) return; // a fuel type, or nothing
  if (p.str(LOG_KEY, '') === '') p.put(LOG_KEY, old);
  if (p.remove) p.remove(OLD_LOG_KEY);
  else p.put(OLD_LOG_KEY, '');
}
/** Used until the fuel log has learnt the real figure (Coach.DEFAULT_KMPL). */
export const DEFAULT_KMPL = 18;

export function log(p: Prefs): FillUp[] {
  try {
    const a = JSON.parse(p.str(LOG_KEY, '[]'));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function setLog(p: Prefs, l: FillUp[]): void {
  p.put(LOG_KEY, JSON.stringify(l));
}

/** Km per litre between full tanks, by the odometer typed at each fill-up. */
export function fullTankKmpl(l: FillUp[]): number[] {
  return kmplOf(
    l.map((e) => e.odo ?? e.gps ?? 0),
    l.map((e) => e.l ?? 0),
    l.map((e) => e.full ?? true),
  );
}

/** Full-to-full mileage from fill-ups in order. */
export function compute(odo: number[], litres: number[], rupees: number[], full: boolean[], at: number[]): Stats {
  const s: Stats = { lastKmpl: 0, avgKmpl: 0, rupeesPerKm: 0, fills: odo.length, lastAt: 0 };
  let totalKm = 0;
  let totalL = 0;
  let totalRs = 0;
  let lastFull = -1;
  let litresSince = 0;
  let rupeesSince = 0;
  for (let i = 0; i < odo.length; i++) {
    s.lastAt = at[i];
    if (lastFull >= 0) {
      litresSince += litres[i];
      rupeesSince += rupees[i];
    }
    if (full[i]) {
      if (lastFull >= 0 && litresSince > 0) {
        const km = odo[i] - odo[lastFull];
        if (km > 0) {
          s.lastKmpl = km / litresSince;
          totalKm += km;
          totalL += litresSince;
          totalRs += rupeesSince;
        }
      }
      lastFull = i;
      litresSince = 0;
      rupeesSince = 0;
    }
  }
  if (totalL > 0) s.avgKmpl = totalKm / totalL;
  if (totalKm > 0) s.rupeesPerKm = totalRs / totalKm;
  return s;
}

export function stats(l: FillUp[]): Stats {
  return compute(
    l.map((e) => e.odo),
    l.map((e) => e.l),
    l.map((e) => e.rs),
    l.map((e) => e.full ?? true),
    l.map((e) => e.t),
  );
}

/** Price per litre: the owner's own figure, else the latest fill-up in this city, else any; 0 when unknown. */
export function price(p: Prefs): number {
  const own = parseFloat(p.str('fuelPrice', '0'));
  if (own > 0) return own;
  const a = log(p);
  const city = p.str('city', '');
  let any = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const e = a[i];
    if (!(e.l > 0) || !(e.rs > 0)) continue;
    if (city !== '' && city === e.city) return e.rs / e.l;
    if (any === 0) any = e.rs / e.l;
  }
  return any;
}

export function priceText(p: Prefs): string {
  const v = price(p);
  if (v <= 0) return t('not known yet: add a fill-up with the amount paid, or tap to enter it');
  const ownStr = p.str('fuelPrice', '0');
  const own = ownStr !== '0' && ownStr !== '';
  const city = p.str('city', '');
  return own
    ? f('₹%1$s a litre (your figure)', fmt(v))
    : city === ''
      ? f('₹%1$s a litre (from your fill-ups)', fmt(v))
      : f('₹%1$s a litre (from your fill-ups, %2$s)', fmt(v), city);
}

/** Fuel cost of driving this far, at the average mileage and today's price; 0 when unknown. */
export function cost(p: Prefs, km: number, typicalKmpl: number): number {
  const pr = price(p);
  if (pr <= 0 || km <= 0) return 0;
  const kmpl = stats(log(p)).avgKmpl;
  return (km / (kmpl > 0 ? kmpl : typicalKmpl > 0 ? typicalKmpl : DEFAULT_KMPL)) * pr;
}

/** The odometer to suggest: the last entry plus what the GPS has counted since. */
export function suggestOdo(l: FillUp[], gpsOdoKm: number): number {
  if (l.length === 0) return Math.round(gpsOdoKm);
  const last = l[l.length - 1];
  return Math.round(last.odo + Math.max(0, gpsOdoKm - (last.gps ?? gpsOdoKm)));
}

export function fmt(v: number): string {
  return v.toFixed(1);
}
