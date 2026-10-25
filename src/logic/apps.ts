/**
 * The all-apps screen's helpers (AppsActivity's, 1.38 "Better all-apps screen"): search, the A to
 * Z letters, and the pinned ('pinnedApps') and recently opened ('recentApps') lists, kept as
 * comma-separated package names as in the Android version.
 *
 * 1.44 adds the order (A to Z or the apps opened most, 'appOrder' and the counts in 'appUses') and
 * hiding an app from the list ('hiddenApps'); a hidden app still comes back when it is searched
 * for, so it can be put back.
 */

export const RECENT = 6;
export const PINS = 12;
/** How many apps' open counts are kept, and how many apps may be hidden. */
export const USES = 60;
export const HIDDEN = 500;

/** Whether an app matches what was typed: every word appears in its name or package. */
export function matches(label: string, pkg: string, q: string | null | undefined): boolean {
  if (q == null) return true;
  const hay = (label + ' ' + pkg).toLowerCase();
  for (const w of q.trim().toLowerCase().split(/\s+/)) {
    if (w && !hay.includes(w)) return false;
  }
  return true;
}

/** The A–Z letter an app files under; "#" for digits and anything else. */
export function letter(label: string | null | undefined): string {
  const s = (label ?? '').trim();
  if (!s) return '#';
  const c = s.charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** `item` moved to the front, at most `max` kept. */
export function push(list: string[], item: string, max: number): string[] {
  const out = [item];
  for (const s of list) if (s !== item && out.length < max) out.push(s);
  return out;
}

export function remove(list: string[], item: string): string[] {
  const out = [...list];
  const i = out.indexOf(item);
  if (i >= 0) out.splice(i, 1);
  return out;
}

export function split(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

export function join(list: string[]): string {
  return list.join(',');
}

// ------------------------------------------------------------------ the order and hiding (1.44)

/** The order chosen: 'az' or 'used'. Only the better all-apps screen offers it. */
export function order(p: { str(k: string, d: string): string }, extras: boolean): 'az' | 'used' {
  return extras && p.str('appOrder', 'az') === 'used' ? 'used' : 'az';
}

/** "pkg=n,pkg=n" as a map of how many times each app was opened. */
export function counts(s: string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const part of (s ?? '').split(',')) {
    const eq = part.lastIndexOf('=');
    if (eq <= 0) continue;
    const n = parseInt(part.substring(eq + 1), 10);
    // a damaged entry is left out
    if (Number.isFinite(n)) m.set(part.substring(0, eq).trim(), n);
  }
  return m;
}

/** One more open of `pkg`, keeping the USES most opened apps. */
export function bump(s: string | null | undefined, pkg: string): string {
  const m = counts(s);
  m.set(pkg, (m.get(pkg) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, USES)
    .map(([k, n]) => k + '=' + n)
    .join(',');
}

/**
 * The apps to show: what matches the search, with hidden apps left out unless something is typed,
 * and the most opened first when that order is chosen. A to Z order is whatever order the apps
 * came in, which is how the unit lists them; the sort by use keeps that order among equals.
 */
export function shown<T>(
  apps: readonly T[],
  pkgOf: (a: T) => string,
  labelOf: (a: T) => string,
  q: string,
  hidden: readonly string[],
  mostUsed: boolean,
  uses: Map<string, number>,
): T[] {
  const typed = q.trim() !== '';
  const out = apps.filter((a) => (typed || !hidden.includes(pkgOf(a))) && matches(labelOf(a), pkgOf(a), q));
  if (!mostUsed) return out;
  return out
    .map((a, i) => [a, i] as const)
    .sort((a, b) => (uses.get(pkgOf(b[0])) ?? 0) - (uses.get(pkgOf(a[0])) ?? 0) || a[1] - b[1])
    .map(([a]) => a);
}
