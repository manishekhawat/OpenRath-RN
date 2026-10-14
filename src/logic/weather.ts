/**
 * Weather from Open-Meteo (port of Weather.java and Hub's weather parts). The last forecast is
 * kept, and while there is no internet the box shows the hour that is now from it.
 */

export interface Wx {
  temp: number;
  code: number;
  text: string;
  isDay: boolean;
  humidity: number;
  wind: number;
  /** rain expected in the next hour (mm), from the 15-minute forecast */
  rainSoon: number;
  daily: { date: string; code: number; max: number; min: number }[];
  /** non-empty when this came from the saved forecast */
  savedNote: string;
}

export function url(lat: number, lon: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&current=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5' +
    '&hourly=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation' +
    '&minutely_15=precipitation&forecast_minutely_15=5&timezone=auto'
  );
}

/** WMO weather codes, as used by Open-Meteo. */
export function describe(c: number): string {
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Partly cloudy';
  if (c === 3) return 'Cloudy';
  if (c <= 48) return 'Fog';
  if (c <= 57) return 'Drizzle';
  if (c <= 67) return 'Rain';
  if (c <= 77) return 'Snow';
  if (c <= 82) return 'Showers';
  if (c <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

/** "2026-10-14T15:00": the hour now at that place, as Open-Meteo writes its hourly times. */
export function hourKey(nowMs: number, utcOffsetSec: number): string {
  return new Date(nowMs + utcOffsetSec * 1000).toISOString().substring(0, 13) + ':00';
}

/** Where `hour` is in the forecast's hours, or -1 when the forecast doesn't reach it. */
export function slot(times: string[], hour: string): number {
  return times.indexOf(hour);
}

/** "Offline · forecast from 3 h ago", under the weather. */
export function savedNote(savedAt: number, nowMs: number): string {
  const m = Math.max(0, Math.floor((nowMs - savedAt) / 60000));
  const age = m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
  return 'Offline · forecast from ' + age;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The weather from an Open-Meteo answer. With `saved`, it is an old answer read while offline:
 * the current values come from the hour that is now in its hourly forecast.
 */
export function read(j: any, nowMs: number, saved: boolean, savedAt = 0): Wx | null {
  let cur = j?.current;
  if (saved) {
    const h = j?.hourly;
    if (!h?.time) return null;
    const i = slot(h.time, hourKey(nowMs, j.utc_offset_seconds ?? 0));
    if (i < 0) return null;
    cur = {
      temperature_2m: h.temperature_2m[i],
      weather_code: h.weather_code[i],
      is_day: h.is_day[i],
      relative_humidity_2m: h.relative_humidity_2m[i],
      wind_speed_10m: h.wind_speed_10m[i],
    };
  }
  if (cur?.temperature_2m == null || cur?.weather_code == null) return null;
  const d = j.daily ?? {};
  const daily = (d.time ?? []).map((date: string, k: number) => ({
    date,
    code: d.weather_code?.[k] ?? 0,
    max: d.temperature_2m_max?.[k] ?? 0,
    min: d.temperature_2m_min?.[k] ?? 0,
  }));
  const rain: number[] = saved ? [] : (j.minutely_15?.precipitation ?? []);
  return {
    temp: Math.round(cur.temperature_2m),
    code: cur.weather_code,
    text: describe(cur.weather_code),
    isDay: cur.is_day !== 0,
    humidity: cur.relative_humidity_2m ?? 0,
    wind: cur.wind_speed_10m ?? 0,
    rainSoon: rain.slice(0, 4).reduce((a, b) => a + (b || 0), 0),
    daily,
    savedNote: saved ? savedNote(savedAt, nowMs) : '',
  };
}
