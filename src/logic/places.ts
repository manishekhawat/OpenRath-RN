/**
 * Saved places for any navigation app (port of Places.java, 1.38): Home, Office, where the car is
 * parked and your own spots, each handed over as a geo: link. Typing an address is blocked while
 * the car is moving. The screen is src/app/places.tsx (a long press on the dock's Navigation
 * button in the Android version).
 *
 * Your own places are kept in 'places' as "name|lat,lon" separated by ";", newest first; Home and
 * Office are the map's 'place:Home' and 'place:Office' ("lat,lon"), as in the Android version.
 */

export const MAX = 12;

/** A geo: link any navigation app understands, with the name shown as the label. */
export function geo(lat: number, lon: number, name: string | null | undefined): string {
  const n = (name ?? '').replace(/[()]/g, '').trim();
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return 'geo:' + at + '?q=' + at + (n === '' ? '' : '(' + encodeURIComponent(n) + ')');
}

/** A geo: search link for a typed address. */
export function search(address: string): string {
  return 'geo:0,0?q=' + encodeURIComponent(address.trim());
}

/** [lat, lon] from a saved "lat,lon", or null. */
export function point(v: string | null | undefined): [number, number] | null {
  if (v == null) return null;
  const s = v.split(',');
  if (s.length !== 2 || s[0].trim() === '' || s[1].trim() === '') return null;
  const lat = Number(s[0].trim());
  const lon = Number(s[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return [lat, lon];
}

/** The owner's own places: [name, "lat,lon"], newest first. */
export function own(saved: string | null | undefined): [string, string][] {
  const out: [string, string][] = [];
  if (saved == null) return out;
  for (const e of saved.split(';')) {
    const bar = e.indexOf('|');
    if (bar <= 0 || point(e.substring(bar + 1)) == null) continue;
    out.push([e.substring(0, bar), e.substring(bar + 1)]);
  }
  return out;
}

/** `saved` with a place added at the front (one with the same name is replaced), at most MAX. */
export function add(saved: string, name: string, lat: number, lon: number): string {
  const clean = name.replace(/;/g, ' ').replace(/\|/g, ' ').trim();
  let b = clean + '|' + `${lat.toFixed(6)},${lon.toFixed(6)}`;
  let n = 1;
  for (const [pn, at] of own(saved)) {
    if (pn.toLowerCase() === clean.toLowerCase() || n >= MAX) continue;
    b += ';' + pn + '|' + at;
    n++;
  }
  return b;
}

export function drop(saved: string, name: string): string {
  return own(saved)
    .filter(([pn]) => pn !== name)
    .map(([pn, at]) => pn + '|' + at)
    .join(';');
}

/** Where a place goes: the app chosen for the dock's Navigation button, else any app for geo: links. */
export const NAV_KEY = 'app:dock:navi';
