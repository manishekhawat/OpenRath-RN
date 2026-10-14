/**
 * The car profile (port of Car.java): brand, model, fuel and tank size, set once on the first
 * start. The name beside the logo, fuel words and expected mileage all follow it.
 */
import type { Prefs } from './prefs.ts';

export const FUELS = ['petrol', 'diesel', 'cng', 'hybrid', 'ev'] as const;
export const FUEL_NAMES = ['Petrol', 'Diesel', 'CNG', 'Petrol hybrid', 'Electric'];
/** Fuel features that mean nothing in an electric car; switched off when Electric is picked. */
export const FUEL_FEATURES = ['fuelPrice', 'coach', 'fuelPlan', 'fuelCheck'];

export const brand = (p: Prefs) => p.str('carBrand', '');
export const brandName = (p: Prefs) => p.str('carBrandName', '');
export const model = (p: Prefs) => p.str('carModel', '');
export const fuel = (p: Prefs) => p.str('fuel', 'petrol');
export const ready = (p: Prefs) => p.str('carSetup', '') === 'yes';

/** The name beside the logo: the owner's, else the model's. */
export function name(p: Prefs): string {
  return p.str('carName', nameFor(model(p)));
}

export function word(f: string): string {
  if (f === 'diesel') return 'diesel';
  if (f === 'cng') return 'CNG';
  if (f === 'ev') return 'charge';
  return 'petrol';
}

export function stations(f: string): string {
  if (f === 'diesel') return 'fuel pumps';
  if (f === 'cng') return 'CNG stations';
  if (f === 'ev') return 'charging stations';
  return 'petrol pumps';
}

/** A typical new car's km per litre (per kg for CNG) until the fuel log knows better; 0 for electric. */
export function kmpl(f: string): number {
  if (f === 'diesel') return 20;
  if (f === 'cng') return 25;
  if (f === 'hybrid') return 22;
  if (f === 'ev') return 0;
  return 17;
}

/** The name beside the logo for a model: upper case, at most 14 letters. */
export function nameFor(m: string | null | undefined): string {
  const n = (m ?? '').trim().toUpperCase();
  return n.length > 14 ? n.substring(0, 14).trim() : n;
}

/** What to search the map for when looking for a workshop. */
export function serviceSearch(bName: string | null | undefined): string {
  return !bName || bName.trim() === '' ? 'car service centre' : bName.trim() + ' service centre';
}

/** Words a brand's workshops carry in OpenStreetMap, as a regular expression ("" for any workshop). */
export function searchWords(id: string, bName: string | null): string {
  if (id === 'maruti-suzuki') return 'maruti|suzuki|nexa|arena|true value';
  if (id === 'mercedes-benz') return 'mercedes|benz';
  if (id === 'tata-motors') return 'tata';
  if (bName == null) return '';
  return bName
    .toLowerCase()
    .split(/[^a-z0-9ëé]+/)
    .filter((w) => w.length >= 2 && w !== 'motors' && w !== 'motor' && w !== 'cars')
    .join('|');
}

/** A brand's id from its name ("Maruti Suzuki" -> "maruti-suzuki"). */
export function idFor(n: string): string {
  let b = '';
  for (const c of n.trim().toLowerCase()) {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) b += c;
    else if (b.length > 0 && !b.endsWith('-')) b += '-';
  }
  return b.replace(/-+$/, '');
}

/** Save the profile from the setup screen. Picking Electric switches off the fuel features. */
export function save(
  p: Prefs,
  v: { brandId: string; brandName: string; model: string; fuel: string; tank: string },
  setFeature: (id: string, on: boolean) => void,
): void {
  p.put('carBrand', v.brandId);
  p.put('carBrandName', v.brandName);
  p.put('carModel', v.model);
  p.put('fuel', v.fuel);
  p.put('tank', v.tank);
  if (v.fuel === 'ev') for (const f of FUEL_FEATURES) setFeature(f, false);
  p.put('carSetup', 'yes');
}
