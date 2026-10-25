/**
 * Holidays when the highways out of town fill up (port of Holidays.java): India's national and
 * main festival holidays, for Settings and the start-up summary. Moving festivals are listed to
 * 2027. (The holiday traffic warning on the dashboard was removed in 1.35.) Since 1.44 the list is
 * empty outside India, where it says nothing about the traffic.
 */
import { DAYS, MONTHS } from './dates.ts';
import * as Money from './money.ts';

/** [yyyy-mm-dd, name, days of heavy traffic before it] */
const MOVING: [string, string, number][] = [
  ['2026-03-03', 'Holi', 1], ['2026-03-21', 'Eid', 1], ['2026-04-03', 'Good Friday', 1],
  ['2026-09-04', 'Janmashtami', 1], ['2026-10-20', 'Dussehra', 1], ['2026-11-08', 'Diwali', 2],
  ['2026-11-24', 'Guru Nanak Jayanti', 1],
  ['2027-03-10', 'Eid', 1], ['2027-03-23', 'Holi', 1], ['2027-03-26', 'Good Friday', 1],
  ['2027-08-25', 'Janmashtami', 1], ['2027-10-09', 'Dussehra', 1], ['2027-10-29', 'Diwali', 2],
  ['2027-11-14', 'Guru Nanak Jayanti', 1],
];

/** [month, day, name]: the same date every year. */
const FIXED: [number, number, string][] = [
  [1, 1, 'New Year'], [1, 26, 'Republic Day'], [8, 15, 'Independence Day'], [10, 2, 'Gandhi Jayanti'],
  [12, 25, 'Christmas'],
];

export interface Day {
  date: Date;
  name: string;
  lead: number;
}

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

export function of(year: number): Day[] {
  const out: Day[] = FIXED.map(([m, d, name]) => ({ date: day(year, m, d), name, lead: 1 }));
  for (const [iso, name, lead] of MOVING) {
    const [y, m, d] = iso.split('-').map(Number);
    if (y === year) out.push({ date: day(y, m, d), name, lead });
  }
  return out;
}

/** The next holidays from today, for Settings: "Diwali, Sun 8 Nov"; nothing outside India. */
export function upcoming(today: Date, n: number, india = Money.india()): string[] {
  if (!india) return [];
  const t = day(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return [...of(t.getFullYear()), ...of(t.getFullYear() + 1)]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .filter((h) => h.date >= t)
    .slice(0, n)
    .map((h) => `${h.name}, ${DAYS[h.date.getDay()]} ${h.date.getDate()} ${MONTHS[h.date.getMonth()]}`);
}
