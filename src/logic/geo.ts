/** Distances and directions on the earth (port of Geo.java). */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Metres between two points. */
export function dist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000;
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dp = p2 - p1;
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compass direction from the first point to the second, 0–360. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Whether a point is within `m` metres and roughly ahead (±50°); heading < 0 means unknown. */
export function ahead(lat: number, lon: number, heading: number, pLat: number, pLon: number, m: number): boolean {
  if (dist(lat, lon, pLat, pLon) > m) return false;
  if (heading < 0) return true;
  const diff = Math.abs((((bearing(lat, lon, pLat, pLon) - heading) % 360) + 540) % 360 - 180);
  return diff < 50;
}

/** A Google Maps link to a point, which opens on any phone. */
export function mapsLink(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/** Google Maps directions from one spot to another. */
export function routeLink(lat: number, lon: number, toLat: number, toLon: number): string {
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${lat.toFixed(5)},${lon.toFixed(5)}` +
    `&destination=${toLat.toFixed(5)},${toLon.toFixed(5)}&travelmode=driving`
  );
}
