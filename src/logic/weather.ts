/**
 * Weather from Open-Meteo (port of Weather.java and Hub's weather parts). The last forecast is
 * kept, and while there is no internet the box shows the hour that is now from it. A tall weather
 * box also shows the next 24 hours' temperature and rain (Hourly weather, 1.38), from the same
 * kept forecast when offline.
 *
 * Since 1.44 the box also carries the car's altitude, the way it points and the air quality on one
 * row, and the next two days under that. Which of those rows there is room for is worked out here
 * (`rows`), and a box that is much wider than it is tall lays them out side by side (`wide`).
 */
import { f, t } from './i18n.ts';
import { compass } from './layouts.ts';

export interface Wx {
  /** °C, rounded */
  temp: number;
  /** °C as Open-Meteo gave it, for showing in °F without rounding twice */
  tempC: number;
  code: number;
  text: string;
  isDay: boolean;
  humidity: number;
  wind: number;
  /** rain expected in the next hour (mm), from the 15-minute forecast */
  rainSoon: number;
  /** "Raining now", "Rain in about 30 min", "Rain likely this hour"…, in English (for the voice), or "" */
  rain: string;
  /** days from today on (a saved copy drops the days gone by) */
  daily: { date: string; code: number; max: number; min: number }[];
  /** the next 24 hours' temperatures (°C) and rain (mm), from the hour that is now; empty if unknown */
  hours: number[];
  hoursRain: number[];
  /** non-empty when this came from the saved forecast */
  savedNote: string;
}

/**
 * The most forecast text worth keeping for offline: an answer for this URL is 15-20 KB, so
 * anything far past that is a service having gone wrong and is not written to the unit at all.
 */
export const SAVED_MAX = 64 * 1024;

/** Worth keeping until the next answer comes in: something, and not absurdly large. */
export function keep(body: string): boolean {
  return body.length > 0 && body.length <= SAVED_MAX;
}

export function url(lat: number, lon: number): string {
  // the hourly part is for offline and the 24-hour curve: the box picks the hour that is now from it
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

/**
 * Up to `n` values from `from` on, stopping at the first gap; empty when `from` is outside. For
 * the 24-hour temperature curve.
 */
export function next(all: (number | null | undefined)[] | null | undefined, from: number, n: number): number[] {
  if (!all || from < 0 || from >= all.length) return [];
  const end = Math.min(all.length, from + n);
  const out: number[] = [];
  for (let k = from; k < end; k++) {
    const v = all[k];
    if (v == null || Number.isNaN(v)) break;
    out.push(v);
  }
  return out;
}

/** The hour, 0 to 23, at which rain (0.3 mm or more) is first expected, or -1. */
export function firstRain(rain: number[] | null | undefined): number {
  for (let i = 0; rain && i < rain.length; i++) if (rain[i] >= 0.3) return i;
  return -1;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10-26" as "Mon" in the owner's language; anything else comes back as it is. */
export function dayName(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return date;
  return t(DAYS[d.getDay()]);
}

/** The car's height above the sea: "640 m", or "--" before the GPS has said. */
export function altText(altM: number): string {
  return altM < 0 || !Number.isFinite(altM) ? '--' : Math.round(altM) + ' m';
}

/** The way the car points: "NE 42°", or "--" while it is parked and nothing was kept. */
export function headingText(deg: number): string {
  return deg < 0 || !Number.isFinite(deg) ? '--' : compass(deg) + ' ' + Math.round(deg) + '\u00B0';
}

/**
 * The air quality on the facts row: nothing at all when the air-quality feature is off, "AQI --"
 * while no reading has come in, else the reading. The space never breaks the line.
 */
export function aqiText(aqi: number, on: boolean): string {
  if (!on) return '';
  return aqi < 0 ? 'AQI --' : 'AQI\u00A0' + aqi;
}

/** The colour of the air-quality dot: green through red as the air gets worse. */
export function aqiColour(aqi: number, dim: string): string {
  if (aqi < 0) return dim;
  if (aqi <= 50) return '#4CAF50';
  if (aqi <= 100) return '#CDDC39';
  if (aqi <= 200) return '#FFB02E';
  if (aqi <= 300) return '#F4511E';
  return '#D32F2F';
}

/** A box much wider than it is tall: the rows go side by side rather than under each other. */
export function wide(w: number, h: number): boolean {
  return w > 520 && w > h * 2.4;
}

/**
 * Which rows the box has room for, under the reading itself. They are dropped last first: the
 * next 24 hours need the most room, then the two days, then the three facts.
 */
export function rows(w: number, h: number, hourly: boolean): { facts: boolean; days: boolean; hours: boolean } {
  if (wide(w, h)) return { facts: true, days: w > 760, hours: false };
  const scale = Math.min(1, w / 300);
  return {
    facts: h > 150 * scale,
    days: h > 215 * scale,
    hours: hourly && h > 300 * scale,
  };
}

/** "Offline · forecast from 3 h ago", under the weather. */
export function savedNote(savedAt: number, nowMs: number): string {
  const m = Math.max(0, Math.floor((nowMs - savedAt) / 60000));
  return m < 60
    ? f('Offline · forecast from %1$s min ago', m)
    : m < 48 * 60
      ? f('Offline · forecast from %1$s h ago', Math.floor(m / 60))
      : f('Offline · forecast from %1$s days ago', Math.floor(m / 1440));
}

/** The rain line for the screen, in the chosen language (Wx.rain itself stays English for the voice). */
export function showRain(r: string): string {
  if (!r) return '';
  const m = /^Rain in about (\d+) min$/.exec(r);
  return m ? f('Rain in about %1$s min', m[1]) : t(r);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The weather from an Open-Meteo answer. With `saved`, it is an old answer read while offline:
 * the current values come from the hour that is now in its hourly forecast.
 */
export function read(j: any, nowMs: number, saved: boolean, savedAt = 0): Wx | null {
  const offset = j?.utc_offset_seconds ?? 0;
  const now = hourKey(nowMs, offset);
  const h = j?.hourly;
  const times: string[] = h?.time ?? [];
  const i = slot(times, now);
  let cur = j?.current;
  let rain = '';
  if (saved) {
    if (!h?.time || i < 0) return null;
    cur = {
      temperature_2m: h.temperature_2m?.[i],
      weather_code: h.weather_code?.[i],
      is_day: h.is_day?.[i],
      relative_humidity_2m: h.relative_humidity_2m?.[i],
      wind_speed_10m: h.wind_speed_10m?.[i],
    };
    const pr: number[] = h.precipitation ?? [];
    if (i < pr.length && pr[i] >= 0.3) rain = 'Rain likely this hour';
    else if (i + 1 < pr.length && pr[i + 1] >= 0.3) rain = 'Rain likely within 2 hours';
  } else {
    // rain in the next hour, from the 15-minute forecast (slot 0 = now)
    const mm: number[] = j?.minutely_15?.precipitation ?? [];
    for (let k = 0; k < mm.length && k < 5; k++) {
      if (mm[k] >= 0.3) {
        rain = k === 0 ? 'Raining now' : `Rain in about ${k * 15} min`;
        break;
      }
    }
  }
  if (cur?.temperature_2m == null || cur?.weather_code == null) return null;
  const today = now.substring(0, 10);
  const d = j.daily ?? {};
  const daily = (d.time ?? [])
    .map((date: string, k: number) => ({
      date,
      code: d.weather_code?.[k] ?? 0,
      max: d.temperature_2m_max?.[k] ?? 0,
      min: d.temperature_2m_min?.[k] ?? 0,
    }))
    .filter((x: { date: string }) => x.date >= today); // a saved copy: days gone by are dropped
  const minutely: number[] = saved ? [] : (j.minutely_15?.precipitation ?? []);
  return {
    temp: Math.round(cur.temperature_2m),
    tempC: cur.temperature_2m,
    code: cur.weather_code,
    text: describe(cur.weather_code),
    isDay: cur.is_day !== 0,
    humidity: cur.relative_humidity_2m ?? 0,
    wind: cur.wind_speed_10m ?? 0,
    rainSoon: minutely.slice(0, 4).reduce((a, b) => a + (b || 0), 0),
    rain,
    daily,
    hours: next(h?.temperature_2m, i, 24),
    hoursRain: next(h?.precipitation, i, 24),
    savedNote: saved ? savedNote(savedAt, nowMs) : '',
  };
}
