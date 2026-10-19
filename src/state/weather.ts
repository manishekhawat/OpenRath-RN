/**
 * The weather box's data: Open-Meteo every 15 minutes, air quality from the same service, and
 * the place name. The last answer is kept, so the box still shows the hour that is now from it,
 * and the next 24 hours for the tall box's curve, while there is no internet.
 *
 * One loop for the whole app: the dashboard and LayoutView both ask for the weather, so the
 * fetching and the answer live in this module (as engine.ts keeps the drive) and useWeather only
 * reads them. A loop per caller meant two of every fetch on each drive, and the air alert spoken
 * twice. The forecast is kept under its own key (store.ts) because it is far too big to be
 * written again with the settings every time one of them changes.
 */
import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform, ToastAndroid } from 'react-native';

import * as Air from '../logic/air';
import * as Diag from '../logic/diag';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Weather from '../logic/weather';
import { say } from './drive';
import { usePrefs } from './prefs';
import * as Store from './store';

const WEATHER_MS = 15 * 60000;

export interface WeatherInfo {
  wx: Weather.Wx | null;
  aqi: number;
  place: string;
}

/** What the boxes get with the Weather switch off: the one object, so reading it is cheap. */
const OFF: WeatherInfo = { wx: null, aqi: -1, place: '' };

let info: WeatherInfo | null = null;
let fetchedAt = 0;
/** where the boxes last asked about, for the next fetch */
let where = { lat: 0, lon: 0 };
let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

/** The same object until something changes, as useSyncExternalStore needs. */
function read(): WeatherInfo {
  if (!info) info = { wx: saved(), aqi: -1, place: Store.prefs.str('city', '') };
  return info;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(change: Partial<WeatherInfo>) {
  info = { ...read(), ...change };
  for (const fn of [...listeners]) fn();
}

/** The kept forecast; an older install still has it in the settings, so that is the fallback. */
function saved(): Weather.Wx | null {
  const body = Store.forecast.str('wxSaved', Store.prefs.str('wxSaved', ''));
  if (!body) return null;
  const at = Number(Store.forecast.str('wxSavedAt', Store.prefs.str('wxSavedAt', '0')));
  try {
    return Weather.read(JSON.parse(body), Date.now(), true, at);
  } catch {
    return null;
  }
}

/** fetch() never times out here, so a stalled service would hold this one loop open all drive. */
async function text(url: string): Promise<string> {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 10000);
  try {
    return await (await fetch(url, { signal: ctl.signal })).text();
  } finally {
    clearTimeout(timeout);
  }
}

/** The forecast, the air quality and the place name, at most once every 15 minutes. */
async function run() {
  const prefs = Store.prefs;
  if (!Features.on(prefs, 'weather')) return;
  if (Date.now() - fetchedAt < WEATHER_MS) return;
  fetchedAt = Date.now();
  const { lat, lon } = where;
  try {
    const body = await text(Weather.url(lat, lon));
    const wx = Weather.read(JSON.parse(body), Date.now(), false);
    let aqi = -1;
    if (Features.on(prefs, 'rain')) {
      // air quality is part of Weather alerts since 1.35 (the old 'aqi' switch)
      try {
        const cur = JSON.parse(await text(Air.url(lat, lon))).current;
        aqi = Air.index(cur?.pm2_5 ?? NaN, cur?.pm10 ?? NaN);
        const told = Number(prefs.str('aqiTold', '0'));
        const s = Air.alert(aqi, Date.now(), told);
        if (s) {
          prefs.put('aqiTold', String(Date.now()));
          if (Platform.OS === 'android') ToastAndroid.show(f('Air quality: %1$s (AQI %2$s)', t(Air.band(aqi)), aqi), ToastAndroid.LONG);
          say(s);
        }
      } catch {
        // the weather still shows without it
      }
    }
    let place = prefs.str('city', '');
    try {
      const a = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }))[0];
      const p = a?.city ?? a?.subregion ?? null;
      if (p) {
        place = p;
        prefs.put('city', p); // fill-ups remember the city's petrol price
      }
    } catch {
      // many head units have no geocoder
    }
    if (Weather.keep(body)) {
      Store.forecast.put('wxSaved', body);
      Store.forecast.put('wxSavedAt', String(Date.now()));
    }
    set({ wx, aqi, place });
  } catch (e) {
    Diag.note('weather', e);
    fetchedAt = Date.now() - WEATHER_MS + 60000; // retry in a minute
    set({ wx: saved() });
  }
}

/** One timer for however many boxes are on screen: it runs while at least one of them wants it. */
function watch(lat: number, lon: number): () => void {
  where = { lat, lon };
  watchers++;
  if (!timer) timer = setInterval(run, 60000);
  run();
  return () => {
    watchers--;
    if (watchers <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useWeather(lat: number, lon: number): WeatherInfo {
  const { prefs } = usePrefs();
  const on = Features.on(prefs, 'weather');
  const shown = useSyncExternalStore(subscribe, read);
  const known = lat !== 0 || lon !== 0;

  useEffect(() => {
    if (!on || !known) return;
    return watch(lat, lon);
    // the position changes every second; once a minute is plenty to check the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, known, Math.round(lat * 100), Math.round(lon * 100)]);

  return on ? shown : OFF;
}
