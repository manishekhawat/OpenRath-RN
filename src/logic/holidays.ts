/**
 * Holidays when the highways out of town fill up (port of Holidays.java): India's national and
 * main festival holidays, and the long weekends they make. Moving festivals are listed to 2027.
 */

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
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function of(year: number): Day[] {
  const out: Day[] = FIXED.map(([m, d, name]) => ({ date: day(year, m, d), name, lead: 1 }));
  for (const [iso, name, lead] of MOVING) {
    const [y, m, d] = iso.split('-').map(Number);
    if (y === year) out.push({ date: day(y, m, d), name, lead });
  }
  return out;
}

const FRI = 5, MON = 1, THU = 4, TUE = 2;

/** The holiday rush on this day, as "the Diwali long weekend" or "Holi", or null. */
export function rush(today: Date): string | null {
  const t = day(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const all = [...of(t.getFullYear()), ...of(t.getFullYear() + 1)];
  for (const h of all) {
    const wd = h.date.getDay();
    const longWeekend = wd === FRI || wd === MON || wd === THU || wd === TUE;
    let from = addDays(h.date, -h.lead);
    let to = h.date;
    if (longWeekend) {
      if (wd === FRI) to = addDays(to, 2);
      else if (wd === THU) to = addDays(to, 3);
      else if (wd === MON) from = addDays(from, -3);
      else from = addDays(from, -4);
    }
    if (t >= from && t <= to) return longWeekend ? `the ${h.name} long weekend` : h.name;
  }
  return null;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The next holidays from today, for Settings: "Diwali, Sun 8 Nov". */
export function upcoming(today: Date, n: number): string[] {
  const t = day(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return [...of(t.getFullYear()), ...of(t.getFullYear() + 1)]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .filter((h) => h.date >= t)
    .slice(0, n)
    .map((h) => `${h.name}, ${DOW[h.date.getDay()]} ${h.date.getDate()} ${MON_NAMES[h.date.getMonth()]}`);
}
