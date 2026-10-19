/**
 * Fuel-low planner (port of FuelPlan.java): from the last full tank in the fuel log, the litres
 * added since, the GPS distance driven since and your average mileage, it works out how far the
 * petrol will go. Below the set range it says so (and the map can list the pumps ahead).
 */
import * as Car from './car.ts';
import { typical } from './coach.ts';
import * as Features from './features.ts';
import { log, stats } from './fuel.ts';
import { f, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

/** The choices for "warn when the petrol is below", km of driving. */
export const WARN_STEPS = [40, 60, 80, 100];

/** The tank, litres (kg for CNG), from the car setup or Settings; 40 until it's set. */
export function tank(p: Prefs): number {
  return num(p, 'tankL', 40);
}

/** Save the tank size, kept between 5 and 120 litres as the car setup does. */
export function setTank(p: Prefs, litres: number): void {
  if (Number.isFinite(litres)) p.put('tankL', String(Math.max(5, Math.min(120, Math.round(litres)))));
}

export function warnKm(p: Prefs): number {
  return num(p, 'fuelWarnKm', 60);
}

/** The next warning range after the current one (the Settings row cycles through WARN_STEPS). */
export function nextWarnKm(cur: number): number {
  const i = WARN_STEPS.indexOf(cur);
  return i < 0 ? WARN_STEPS[0] : WARN_STEPS[(i + 1) % WARN_STEPS.length];
}

/**
 * Litres left: a full tank at the last full fill-up, plus part fills since (never above the
 * tank), less the distance driven since at `kmpl`. -1 when there's no full fill-up to start from.
 * `gps` is the GPS odometer at each fill-up, `gpsNow` the GPS odometer now.
 */
export function litresLeft(tankL: number, gps: number[], litres: number[], full: boolean[], gpsNow: number, kmpl: number): number {
  let f = -1;
  for (let i = 0; i < full.length; i++) if (full[i]) f = i;
  if (f < 0 || kmpl <= 0) return -1;
  let l = tankL;
  let at = gps[f];
  for (let i = f + 1; i < gps.length; i++) {
    l -= Math.max(0, gps[i] - at) / kmpl;
    l = Math.min(tankL, Math.max(0, l) + litres[i]);
    at = gps[i];
  }
  return Math.max(0, l - Math.max(0, gpsNow - at) / kmpl);
}

/** The mileage to plan with: the fuel log's average, else the car's typical figure. */
export function kmpl(p: Prefs): number {
  const k = stats(log(p)).avgKmpl;
  return k > 0 ? k : typical(p);
}

/** Kilometres the petrol will last, or -1 when not known. `gpsOdoKm` is the trip computer's odometer. */
export function rangeKm(p: Prefs, gpsOdoKm: number): number {
  const a = log(p);
  const k = kmpl(p);
  const l = litresLeft(
    tank(p),
    a.map((e) => e.gps ?? 0),
    a.map((e) => e.l ?? 0),
    a.map((e) => e.full ?? true),
    gpsOdoKm,
    k,
  );
  return l < 0 ? -1 : l * k;
}

/** For the start-up summary: the range when Fuel and mileage is on, else -1 (which leaves it out). */
export function summaryRange(p: Prefs, gpsOdoKm: number): number {
  return Features.on(p, 'fuelPrice') ? rangeKm(p, gpsOdoKm) : -1;
}

export function text(p: Prefs, gpsOdoKm: number): string {
  const r = rangeKm(p, gpsOdoKm);
  if (r < 0) return t('not known yet: add a fill-up with "filled to full" ticked');
  const w = Car.word(Car.fuel(p));
  const km = Math.round(r / 10) * 10;
  // the Android version always says petrol; other fuels keep their own word (in English)
  return w === 'petrol' ? f('about %1$s km of petrol left', km) : f('about %1$s km of %2$s left', km, w);
}

/**
 * Speaks once below the set range, and again below half of it; filling up resets it. Keep one per
 * app run (the Java version kept the level in a static field).
 */
export class LowCheck {
  /** the last warning level spoken, km */
  told = Number.MAX_SAFE_INTEGER;

  /** What to say (spoken, so in English), or null. */
  check(p: Prefs, gpsOdoKm: number): string | null {
    if (!Features.on(p, 'fuelPrice')) return null;
    const r = rangeKm(p, gpsOdoKm);
    if (r < 0) return null;
    const warn = warnKm(p);
    const level = r < warn / 2 ? Math.trunc(warn / 2) : r < warn ? warn : Number.MAX_SAFE_INTEGER;
    if (level === Number.MAX_SAFE_INTEGER) {
      this.told = Number.MAX_SAFE_INTEGER; // filled up since
      return null;
    }
    if (level >= this.told) return null;
    this.told = level;
    const f = Car.fuel(p);
    return `About ${Math.max(10, Math.round(r / 10) * 10)} kilometres of ${Car.word(f)} left. Showing ${Car.stations(f)} ahead.`;
  }
}
