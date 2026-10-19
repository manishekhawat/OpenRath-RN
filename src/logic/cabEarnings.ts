/**
 * The cab earnings log's text (port of CabEarnings.java): the choices for adding a ride or a cost,
 * the day's and week's totals by app and by payment, what "how much did I earn" says, and a line
 * of the log. The log itself and its sums are in cab.ts; the screen is app/cab/earnings.tsx.
 * Also the Cab box's bottom line (Cards.CabCard), for the dashboard.
 */
import { by, dayStart, hm, log, net, on, quiet, rs, sum, weekStart, when, type Entry } from './cab.ts';
import { fareNow, meterKm, meterWaitMs, running } from './cabMeter.ts';
import * as Features from './features.ts';
import { fmt } from './fuel.ts';
import { f, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

/** Saved in English (as the Android version did) and shown through t(). */
export const APPS = ['Uber', 'Ola', 'Rapido', 'inDrive', 'Namma Yatri', 'Street', 'Other'];
export const PAYS = ['Cash', 'UPI', 'In the app'];
export const COSTS = ['Fuel or CNG', 'Toll', 'Parking', 'Food', 'Commission', 'Repair', 'Other'];

export function report(p: Prefs, now: number): string {
  const l = log(p);
  const today = dayStart(now);
  const week = weekStart(now);
  let b = '';
  const spans: [string, number, number][] = [
    ['Today', today, now + 1], ['Yesterday', dayStart(today - 3600000), today],
    ['This week (from Monday)', week, now + 1], ['Last 30 days', today - 29 * 86400000, now + 1],
  ];
  for (const [name, from, to] of spans) {
    const x = sum(l, from, to);
    b += f('%1$s: %2$s net', t(name), rs(net(x))) + '\n   ' +
      (x.rides === 1 ? f('1 ride %1$s,  costs %2$s', rs(x.in), rs(x.out)) : f('%1$s rides %2$s,  costs %3$s', x.rides, rs(x.in), rs(x.out))) + '\n';
  }
  const apps = by(l, week, now + 1, false);
  const pays = by(l, today, now + 1, true);
  if (apps.length > 0) b += '\n' + t('This week by app: ') + apps.map(([k, v]) => t(k) + ' ' + rs(v)).join(',  ');
  if (pays.length > 0) b += '\n' + t('Today by payment: ') + pays.map(([k, v]) => t(k) + ' ' + rs(v)).join(',  ');
  const target = num(p, 'cabTargetRs', 2000);
  if (on(p, 'cabTarget') && target > 0) {
    const n = net(sum(l, today, now + 1));
    b += '\n\n' + (n >= target ? f('Daily target %1$s: reached', rs(target)) : f('Daily target %1$s: %2$s to go', rs(target), rs(target - n)));
  }
  return b.trim();
}

/** What "how much did I earn" says (spoken, so English). */
export function spoken(p: Prefs, now: number): string {
  const s = sum(log(p), dayStart(now), now + 1);
  if (s.rides === 0 && s.out === 0) return 'No rides logged today yet.';
  return 'Today, ' + s.rides + (s.rides === 1 ? ' ride, ' : ' rides, ') + Math.round(s.in) + ' rupees in, ' +
    Math.round(s.out) + ' rupees of costs, ' + Math.round(net(s)) + ' rupees net.';
}

/** The text to show for a line of the log. */
export function entryRow(e: Entry): string {
  return when(e.t) + '   ' + (e.ride
    ? '+' + rs(e.rs) + '  ' + t(e.app) + ', ' + t(e.pay) + (e.km > 0 ? ', ' + fmt(e.km) + ' km' : '')
    : '−' + rs(e.rs) + '  ' + t(e.what));
}

/**
 * The Cab box's bottom line (Cards.CabCard): the running meter, else the target and time on
 * duty, with "Quiet ride" in front during one.
 */
export function boxFoot(p: Prefs, now: number, odoKm: number): string {
  if (!Features.on(p, 'cab')) return t('Turn on Cab driver tools in Settings > Cab driver');
  const s = sum(log(p), dayStart(now), now + 1);
  let line: string;
  if (running(p)) {
    line = f('Meter %1$s  ·  %2$s km  ·  %3$s min waiting', rs(fareNow(p, odoKm, now)), fmt(meterKm(p, odoKm)), Math.floor(meterWaitMs(p) / 60000));
  } else {
    const target = num(p, 'cabTargetRs', 2000);
    const duty = num(p, 'cabDutyAt', 0);
    line = on(p, 'cabTarget') && target > 0
      ? (net(s) >= target ? f('Target %1$s reached', rs(target)) : f('%1$s to the target', rs(target - net(s)))) +
        (duty >= dayStart(now) ? '  ·  ' + f('on duty %1$s', hm(now - duty)) : '')
      : t('Tap for the meter, rides and SOS');
  }
  return (quiet(p) ? t('Quiet ride') + '  ·  ' : '') + line;
}
