/**
 * Rain and fog right now, for monsoon and fog modes (Hub.wet and Hub.fog in the Android
 * version), from the Open-Meteo answer the weather box saves in "wxSaved". A fresh answer gives
 * rain within the hour from its 15-minute forecast; an older one gives this hour and the next
 * from its hourly forecast.
 */
import { hourKey, slot } from './weather.ts';

/** A weather code that the Android version shows with the fog icon. */
export function fogCode(c: number): boolean {
  return c > 3 && c <= 48;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** { wet, fog } now; `fresh` when the answer was fetched in the last 20 minutes. */
export function now(j: any, nowMs: number, fresh: boolean): { wet: boolean; fog: boolean } {
  let wet = false;
  let code = NaN;
  if (fresh) {
    const mm: number[] = j?.minutely_15?.precipitation ?? [];
    for (let k = 0; k < mm.length && k < 5; k++) if (mm[k] >= 0.3) wet = true;
    code = j?.current?.weather_code;
  } else {
    const h = j?.hourly;
    const i = h?.time ? slot(h.time, hourKey(nowMs, j.utc_offset_seconds ?? 0)) : -1;
    if (i >= 0) {
      const pr: number[] = h.precipitation ?? [];
      wet = pr[i] >= 0.3 || pr[i + 1] >= 0.3;
      code = h.weather_code?.[i];
    }
  }
  return { wet, fog: Number.isFinite(code) && fogCode(code) };
}
