/**
 * The last few errors OpenRath caught and carried on from, for Settings > Help > Diagnostics
 * (Diag.java, 1.43). Kept in memory only (lost when the app closes) and never sent anywhere. Not
 * for probes that are expected to fail on most units, which would push the useful ones out.
 *
 * Every line goes through scrub() first, as the Android version's crash reports do (Crash.scrub):
 * a fetch that failed carries the address it asked for, and that address can say where the car
 * was taken out. Web and file addresses and numbers that look like a latitude or longitude go.
 */

export const KEEP = 30;
/** How long a line may be; the rest of a long message is cut off, as in the Android version. */
export const LINE = 200;

const recent: string[] = [];

const URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]*/gi;
const COORD = /(^|[^\w.])(-?\d{1,3}\.\d{4,})(?![\w.])/g;

/** Text with what could say where the car was taken out removed: addresses and coordinates. */
export function scrub(s: string): string {
  return s.replace(URL, '<address>').replace(COORD, (_m, before: string) => before + '<number>');
}

/** "HH:MM:SS", the time a note was made. */
export function clock(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** An error as a few words: its kind and its message. */
export function what(e: unknown): string {
  if (e == null) return '';
  if (e instanceof Error) return e.name + (e.message ? ': ' + e.message : '');
  return String(e);
}

/** Note an error caught in `where` (a few words: "weather", "OBD read"). */
export function note(where: string, e: unknown, now = Date.now()): void {
  const line = scrub(`${clock(now)} ${where} ${what(e)}`.trim()).substring(0, LINE);
  recent.push(line);
  while (recent.length > KEEP) recent.shift();
}

/** The noted errors, newest first. */
export function lines(): string[] {
  return recent.slice().reverse();
}

/** The noted errors, newest first, one per line; "" when there are none. */
export function text(): string {
  return lines()
    .map((l) => l + '\n')
    .join('');
}

export function clear(): void {
  recent.length = 0;
}
