/**
 * Tap sound and buzz (Tap.java, 1.39; off until turned on): a short tick and a buzz on each box
 * and dock button, so a tap is felt without looking. Android's tone generator isn't reachable
 * from Expo, so the tick is a tiny WAV made here and played with expo-audio (components/Tap.tsx).
 */
import * as Features from './features.ts';
import type { Prefs } from './prefs.ts';

export const RATE = 22050;
/** the tick's length, as Java's 25 ms beep */
export const TICK_MS = 25;
export const FREQ = 1200;
/** the buzz */
export const BUZZ_MS = 20;
/** Java plays at 45 of 100 on the system stream */
export const VOLUME = 0.45;

export function on(p: Prefs | null | undefined): boolean {
  return !!p && Features.on(p, 'tapFeedback');
}

/** A mono 16-bit WAV of a short beep that fades out, so it ends without a click. */
export function wav(ms: number = TICK_MS, freq: number = FREQ, rate: number = RATE): Uint8Array {
  const n = Math.round((rate * ms) / 1000);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const fade = 1 - i / n;
    const s = Math.sin((2 * Math.PI * freq * i) / rate) * fade * 0.8;
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return out;
}
