/**
 * The owner's country (port of Money.java, 1.44), for money and the India-only parts (FASTag,
 * India's holidays, UPI). The app writes prices with ₹; outside India every ₹ on screen becomes
 * the local currency's sign, which happens in t() and f() in src/logic/i18n.ts, where all text on
 * screen goes through. Spoken prices use the currency's name. The country starts as the unit's
 * own and is chosen in Settings > Dashboard.
 *
 * The Android version falls back to Java's own currency tables for a country it doesn't list;
 * here the twenty countries Settings offers are listed outright, and anywhere else keeps ₹ unless
 * the unit's Intl knows the currency.
 */
import type { Prefs } from './prefs.ts';

/** The countries Settings offers, India first; any other country still works from the unit's own. */
export const COUNTRIES = [
  'IN', 'PK', 'BD', 'NP', 'LK', 'AE', 'SA', 'GB', 'US', 'CA', 'AU', 'NZ', 'SG', 'MY', 'ZA',
  'DE', 'FR', 'IT', 'ES', 'NL',
];

/** The names shown in Settings, so the list reads the same without Intl.DisplayNames. */
const NAMES: Record<string, string> = {
  IN: 'India',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  NP: 'Nepal',
  LK: 'Sri Lanka',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  GB: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  SG: 'Singapore',
  MY: 'Malaysia',
  ZA: 'South Africa',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
};

const EURO = ',DE,FR,IT,ES,NL,BE,AT,PT,IE,FI,GR,LU,SK,SI,EE,LV,LT,CY,MT,HR,';

/** The country in use, read once at start-up and whenever Settings changes it. */
let here = 'IN';

/** The unit's own country, when it will say. */
function unitCountry(): string {
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale;
    const m = /[-_]([A-Za-z]{2})\b/.exec(l);
    return m ? m[1].toUpperCase() : '';
  } catch {
    return '';
  }
}

export function country(p: Prefs): string {
  const c = p.str('country', '') || unitCountry();
  return c.length === 2 ? c.toUpperCase() : 'IN';
}

export function load(p: Prefs): void {
  here = country(p);
}

export function current(): string {
  return here;
}

export function india(): boolean {
  return here === 'IN';
}

export function set(p: Prefs, cc: string): void {
  p.put('country', cc.toUpperCase());
  here = country(p);
}

/** The sign written before an amount: "₹", "$", "£", "€", "AED ". */
export function symbol(cc: string): string {
  if (!cc || cc === 'IN') return '₹';
  if (EURO.includes(',' + cc + ',')) return '€';
  switch (cc) {
    case 'US':
    case 'CA':
    case 'AU':
    case 'NZ':
    case 'SG':
      return '$';
    case 'GB':
      return '£';
    case 'PK':
    case 'NP':
    case 'LK':
      return 'Rs ';
    case 'BD':
      return '৳';
    case 'MY':
      return 'RM ';
    case 'ZA':
      return 'R ';
    case 'AE':
      return 'AED ';
    case 'SA':
      return 'SAR ';
    case 'JP':
    case 'CN':
      return '¥';
    default:
      return '₹';
  }
}

/** The currency's name to speak: "rupees", "dollars". */
export function spokenFor(cc: string): string {
  if (!cc || cc === 'IN') return 'rupees';
  if (EURO.includes(',' + cc + ',')) return 'euros';
  switch (cc) {
    case 'US':
    case 'CA':
    case 'AU':
    case 'NZ':
    case 'SG':
      return 'dollars';
    case 'GB':
      return 'pounds';
    case 'PK':
    case 'NP':
    case 'LK':
      return 'rupees';
    case 'BD':
      return 'taka';
    case 'AE':
      return 'dirhams';
    case 'SA':
      return 'riyals';
    case 'MY':
      return 'ringgit';
    case 'ZA':
      return 'rand';
    default:
      return 'rupees';
  }
}

export function spoken(): string {
  return spokenFor(here);
}

/** Text with ₹ in it, in the owner's currency. */
export function shownIn(s: string, cc: string): string {
  if (!s || cc === 'IN' || !s.includes('₹')) return s;
  return s.split('₹').join(symbol(cc));
}

export function shown(s: string): string {
  return shownIn(s, here);
}

/** "Target reached: ₹2,000" read out: "Target reached: rupees 2,000" (or dollars, and so on). */
export function say(s: string): string {
  const sign = symbol(here);
  const out = s.split('₹').join(spoken() + ' ');
  return sign === '₹' ? out : out.split(sign).join(spoken() + ' ');
}

/** A country's name for the Settings list. */
export function name(cc: string): string {
  if (NAMES[cc]) return NAMES[cc];
  try {
    const dn = new (Intl as unknown as { DisplayNames: new (l: string[], o: object) => { of: (c: string) => string | undefined } }).DisplayNames(
      ['en'],
      { type: 'region' },
    );
    return dn.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/** For tests: set the country without prefs. */
export function setCurrent(cc: string): void {
  here = cc;
}
