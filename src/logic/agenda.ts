/**
 * The calendar box (Agenda.java, 1.38): today's and the next few days' events from the calendars
 * on the unit (a signed-in Google account or the phone's). Reading them is done with
 * expo-calendar in components/CalendarBox.tsx; these helpers have no Expo types, so they are tested.
 */

export const DAYS = 4;
export const MAX = 6;

export interface Event {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
}

/** The milliseconds a zone is ahead of UTC at `ms`: the local zone, or a named one ("Asia/Kolkata"). */
export function offsetMs(ms: number, tz?: string): number {
  if (!tz) return -new Date(ms).getTimezoneOffset() * 60000;
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
}

/**
 * Events still to come or going on now, soonest first, at most MAX. All-day events are stored at
 * midnight UTC, so they are moved to the local day; a missing title shows as "(no title)".
 */
export function upcoming(raw: { title?: string | null; start: number; end: number; allDay: boolean }[], now: number, tz?: string): Event[] {
  const out: Event[] = [];
  for (const e of raw) {
    let { start, end } = e;
    if (e.allDay) {
      const off = offsetMs(start, tz);
      start -= off;
      end -= off;
    }
    if (end <= now) continue;
    const title = (e.title ?? '').trim();
    out.push({ title: title || '(no title)', start, end, allDay: e.allDay });
  }
  out.sort((a, b) => a.start - b.start);
  return out.slice(0, MAX);
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** {day, time} for an event: "Today", "Tomorrow" or "Wed", and "14:30" ("" for all day, "now" while it runs). */
export function when(start: number, end: number, allDay: boolean, now: number, tz?: string): [string, string] {
  const n = parts(now, tz);
  const s = parts(Math.max(start, now), tz);
  const days = Math.round((Date.UTC(s.y, s.mo - 1, s.d) - Date.UTC(n.y, n.mo - 1, n.d)) / 86400000);
  const day = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : WEEK[s.wd];
  const time = allDay ? '' : start <= now && end > now ? 'now' : `${String(s.h).padStart(2, '0')}:${String(s.mi).padStart(2, '0')}`;
  return [day, time];
}

/** Year, month, day, weekday, hour and minute at `ms`, in the local zone or a named one. */
function parts(ms: number, tz?: string): { y: number; mo: number; d: number; wd: number; h: number; mi: number } {
  if (!tz) {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), wd: d.getDay(), h: d.getHours(), mi: d.getMinutes() };
  }
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const v: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ms))) v[p.type] = p.value;
  return { y: +v.year, mo: +v.month, d: +v.day, wd: WEEK.indexOf(v.weekday), h: +v.hour % 24, mi: +v.minute };
}
