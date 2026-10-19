/**
 * The Cab driver page in Settings (port of CabSettings.java): the text of its rows and the steps
 * a tap takes. The page itself is app/cab/settings.tsx.
 */
import { daysTo, dueShow, PAPER_NAMES, PAPERS, paperKey, rs, type Rates } from './cab.ts';
import { contact } from './cabSos.ts';
import { fmt } from './fuel.ts';
import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

/** The cab switches, the main one first (shown at the top of the page, as in Settings). */
export const SWITCHES = ['cab', 'cabEarnings', 'cabMeter', 'cabApps', 'cabPapers', 'cabCng', 'cabSpots', 'cabTarget', 'cabSos', 'cabQuiet',
  'cabNotes', 'cabPhrases'];

/** The pref key of each rate, with its label on the rates screen. */
export const RATE_KEYS: [keyof Rates, string, string][] = [
  ['base', 'cabBase', 'Base fare (₹)'],
  ['baseKm', 'cabBaseKm', 'Km included in the base fare'],
  ['perKm', 'cabPerKm', '₹ a km after that'],
  ['waitPerMin', 'cabWaitRs', 'Waiting ₹ a minute'],
  ['freeWait', 'cabFreeWait', 'Free waiting minutes'],
  ['nightPct', 'cabNightPct', 'Night charge, 11 pm to 5 am (%)'],
];

export function ratesText(r: Rates): string {
  return f('%1$s for %2$s km, %3$s/km, waiting %4$s/min after %5$s min, night +%6$s%%',
    rs(r.base), fmt(r.baseKm), rs(r.perKm), rs(r.waitPerMin), Math.round(r.freeWait), Math.round(r.nightPct));
}

export function contactsText(p: Prefs): string {
  const c1 = contact(p, 1);
  const c2 = contact(p, 2);
  return c1 === null && c2 === null ? t('not set') : (c1 ? c1[0] : '') + (c1 && c2 ? ', ' : '') + (c2 ? c2[0] : '');
}

/** The papers row: the soonest paper and how many are set. */
export function papersSummary(p: Prefs, now: number): string {
  let set = 0;
  let best = Infinity;
  let soonest = '';
  PAPERS.forEach((id, i) => {
    const d = daysTo(p.str(paperKey(id), ''), now);
    if (d === null) return;
    set++;
    if (d < best) {
      best = d;
      soonest = dueShow(PAPER_NAMES[i], d);
    }
  });
  return set === 0 ? t('permit, fitness, badge, road tax, insurance, PUC: not set') : soonest + f('  (%1$s of 6 set)', set);
}

/** Break reminder after 8, 9, 10, 11, 12 hours or never (0), stepping on a tap. */
export function nextDutyH(cur: number): number {
  const steps = [8, 9, 10, 11, 12, 0];
  const i = steps.indexOf(cur);
  return i < 0 ? 10 : steps[(i + 1) % steps.length];
}

/** Quiet ride volume 10% … 50%, stepping on a tap. */
export function nextQuietPct(cur: number): number {
  return cur >= 50 ? 10 : cur + 10;
}
