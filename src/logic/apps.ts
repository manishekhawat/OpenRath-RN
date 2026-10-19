/**
 * The all-apps screen's helpers (AppsActivity's, 1.38 "Better all-apps screen"): search, the A to
 * Z letters, and the pinned ('pinnedApps') and recently opened ('recentApps') lists, kept as
 * comma-separated package names as in the Android version.
 */

export const RECENT = 6;
export const PINS = 12;

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
