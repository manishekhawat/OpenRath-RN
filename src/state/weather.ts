/**
 * The weather box's data: Open-Meteo every 15 minutes, air quality from the same service, and
 * the place name. The last answer is kept, so the box still shows the hour that is now from it
 * while there is no internet.
 */
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import * as Air from '../logic/air';
import * as Features from '../logic/features';
import * as Weather from '../logic/weather';
import { say } from './drive';
import { usePrefs } from './prefs';

const WEATHER_MS = 15 * 60000;

export interface WeatherInfo {
  wx: Weather.Wx | null;
  aqi: number;
  place: string;
}

export function useWeather(lat: number, lon: number): WeatherInfo {
  const { prefs } = usePrefs();
  const on = Features.on(prefs, 'weather');
  const [info, setInfo] = useState<WeatherInfo>(() => ({
    wx: savedWeather(prefs.str('wxSaved', ''), Number(prefs.str('wxSavedAt', '0'))),
    aqi: -1,
    place: prefs.str('city', ''),
  }));
  const fetchedAt = useRef(0);
  const known = lat !== 0 || lon !== 0;

  useEffect(() => {
    if (!on || !known) return;
    const run = async () => {
      if (Date.now() - fetchedAt.current < WEATHER_MS) return;
      fetchedAt.current = Date.now();
      try {
        const body = await (await fetch(Weather.url(lat, lon))).text();
        const wx = Weather.read(JSON.parse(body), Date.now(), false);
        let aqi = -1;
        if (Features.on(prefs, 'aqi')) {
          try {
            const cur = (await (await fetch(Air.url(lat, lon))).json()).current;
            aqi = Air.index(cur?.pm2_5 ?? NaN, cur?.pm10 ?? NaN);
            const told = Number(prefs.str('aqiTold', '0'));
            const s = Air.alert(aqi, Date.now(), told);
            if (s) {
              prefs.put('aqiTold', String(Date.now()));
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
        prefs.put('wxSaved', body);
        prefs.put('wxSavedAt', String(Date.now()));
        setInfo({ wx, aqi, place });
      } catch {
        fetchedAt.current = Date.now() - WEATHER_MS + 60000; // retry in a minute
        setInfo((i) => ({ ...i, wx: savedWeather(prefs.str('wxSaved', ''), Number(prefs.str('wxSavedAt', '0'))) }));
      }
    };
    run();
    const timer = setInterval(run, 60000);
    return () => clearInterval(timer);
    // the position changes every second; once a minute is plenty to check the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, known, Math.round(lat * 100), Math.round(lon * 100)]);

  return on ? info : { wx: null, aqi: -1, place: '' };
}

function savedWeather(body: string, at: number): Weather.Wx | null {
  if (!body) return null;
  try {
    return Weather.read(JSON.parse(body), Date.now(), true, at);
  } catch {
    return null;
  }
}
