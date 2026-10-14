/**
 * Air quality (port of Air.java): the Indian AQI (CPCB scale) from Open-Meteo's PM2.5 and PM10.
 * When the air turns Poor or worse the car suggests the AC on recirculate, at most every 3 hours.
 */

const PM25 = [[0, 30, 0, 50], [30, 60, 51, 100], [60, 90, 101, 200], [90, 120, 201, 300], [120, 250, 301, 400], [250, 500, 401, 500]];
const PM10 = [[0, 50, 0, 50], [50, 100, 51, 100], [100, 250, 101, 200], [250, 350, 201, 300], [350, 430, 301, 400], [430, 600, 401, 500]];

function sub(c: number, t: number[][]): number {
  if (!(c >= 0)) return -1;
  for (const r of t) if (c <= r[1]) return Math.round(r[2] + ((r[3] - r[2]) * (c - r[0])) / (r[1] - r[0]));
  return 500;
}

/** The AQI from PM2.5 and PM10 in µg/m³ (either may be NaN), or -1. */
export function index(pm25: number, pm10: number): number {
  return Math.max(sub(pm25, PM25), sub(pm10, PM10));
}

export function band(aqi: number): string {
  if (aqi < 0) return 'unknown';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very poor';
  return 'Severe';
}

/** What to say for a new reading, or null: only for Poor or worse, and not again within three hours. */
export function alert(aqi: number, now: number, lastAt: number): string | null {
  if (aqi <= 200 || now - lastAt < 3 * 3600000) return null;
  return `The air outside is ${band(aqi).toLowerCase()}, A Q I ${aqi}. Close the windows and set the AC to recirculate.`;
}

export function url(lat: number, lon: number): string {
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=pm2_5,pm10`;
}
