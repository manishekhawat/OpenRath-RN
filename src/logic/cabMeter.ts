/**
 * The cab fare meter (port of CabMeter.java): its rates from the settings, the distance, waiting
 * time and fare of the running ride, and starting and stopping it. The full-screen fare for the
 * passenger, paid in cash or by UPI and saved to the earnings log, is app/cab/meter.tsx; the fare
 * sum itself is fare() in cab.ts.
 */
import { fare, hm, live, night, on, quiet, rs, RATES, startDuty, type Rates } from './cab.ts';
import { fmt } from './fuel.ts';
import { f, t } from './i18n.ts';
import { dec, num, type Prefs } from './prefs.ts';

export function rates(p: Prefs): Rates {
  return {
    base: dec(p, 'cabBase', RATES.base),
    baseKm: dec(p, 'cabBaseKm', RATES.baseKm),
    perKm: dec(p, 'cabPerKm', RATES.perKm),
    waitPerMin: dec(p, 'cabWaitRs', RATES.waitPerMin),
    freeWait: dec(p, 'cabFreeWait', RATES.freeWait),
    nightPct: dec(p, 'cabNightPct', RATES.nightPct),
  };
}

export const running = (p: Prefs) => num(p, 'cabMeterAt', 0) > 0;

/** Km since the meter started, by the GPS odometer. */
export function meterKm(p: Prefs, odoKm: number): number {
  return Math.max(0, odoKm - dec(p, 'cabMeterOdo', odoKm));
}

export function meterWaitMs(p: Prefs): number {
  if (live.waitMs < 0) live.waitMs = num(p, 'cabMeterWait', 0);
  return live.waitMs;
}

/** Night rates if the ride started or is now between 11 pm and 5 am. */
export function meterNight(p: Prefs, now: number): boolean {
  return night(new Date(num(p, 'cabMeterAt', now) || now).getHours()) || night(new Date(now).getHours());
}

export function fareNow(p: Prefs, odoKm: number, now: number): number {
  return fare(rates(p), meterKm(p, odoKm), meterWaitMs(p) / 60000, meterNight(p, now));
}

/** Start the meter; quiet ride starts with it unless switched off ("cabQuietWithMeter"). */
export function startMeter(p: Prefs, odoKm: number, lat: number, lon: number, now: number): void {
  p.put('cabMeterAt', String(now));
  p.put('cabMeterOdo', String(odoKm));
  p.put('cabMeterWait', '0');
  p.put('cabMeterLat', String(lat));
  p.put('cabMeterLon', String(lon));
  live.waitMs = 0;
  startDuty(p, now);
  if (on(p, 'cabQuiet') && p.str('cabQuietWithMeter', 'on') === 'on' && !quiet(p)) p.put('cabQuietNow', 'on');
}

/** The meter's lines under the fare, for the passenger. */
export function meterInfo(p: Prefs, odoKm: number, now: number): string {
  const r = rates(p);
  const w = Math.floor(meterWaitMs(p) / 60000);
  return f('%1$s km   ·   %2$s min waiting   ·   %3$s', fmt(meterKm(p, odoKm)), w, hm(now - num(p, 'cabMeterAt', 0))) +
    (meterNight(p, now) ? '\n' + f('Night charge +%1$s%%', Math.round(r.nightPct)) : '') +
    '\n' + f('%1$s for the first %2$s km, then %3$s a km', rs(r.base), fmt(r.baseKm), rs(r.perKm));
}

export interface Stopped {
  fare: number;
  km: number;
  lat: number;
  lon: number;
  /** "10.0 km, 8 min waiting", for the screen. */
  said: string;
}

/** Stop the meter: the fare and the ride's details, for logging it and showing the UPI code. */
export function stopMeter(p: Prefs, odoKm: number, now: number): Stopped | null {
  if (!running(p)) return null;
  const fr = fareNow(p, odoKm, now);
  const km = meterKm(p, odoKm);
  const w = Math.floor(meterWaitMs(p) / 60000);
  const said = f('%1$s km, %2$s min waiting', fmt(km), w) + (meterNight(p, now) ? t(', night charge') : '');
  const s = { fare: fr, km, lat: dec(p, 'cabMeterLat', 0), lon: dec(p, 'cabMeterLon', 0), said };
  p.put('cabMeterAt', '0');
  p.put('cabMeterWait', '0');
  live.waitMs = 0;
  if (quiet(p) && p.str('cabQuietWithMeter', 'on') === 'on') p.put('cabQuietNow', '');
  return s;
}
