/**
 * Kids or valet mode (Valet.java): while someone else drives, there's a voice warning above a set
 * speed and Settings needs the owner's PIN. The Android version also capped the music volume;
 * that needs native audio code (see PORTING.md).
 */
import { f } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

export function on(p: Prefs): boolean {
  return p.str('valet', 'off') === 'on';
}

export function pin(p: Prefs): string {
  return p.str('valetPin', '');
}

/** Highest music volume allowed, as a share of the maximum (percent). */
export function volumeCap(p: Prefs): number {
  return num(p, 'valetVol', 50);
}

/** Speed above which the voice warns, km/h. */
export function speed(p: Prefs): number {
  return num(p, 'valetSpeed', 80);
}

/** The speed to warn above anywhere: the owner's setting, lowered to the valet speed when it's on. */
export function warnAt(p: Prefs): number {
  const w = num(p, 'warnSpeed', 0);
  if (!on(p)) return w;
  return w > 0 ? Math.min(w, speed(p)) : speed(p);
}

/** Wrong PINs in a row before no PIN is taken for a while (Valet.Tries). */
export const MAX_TRIES = 5;
export const LOCK_MS = 60000;

/** The wrong tries so far and, after five of them, the moment a PIN may be tried again. */
export interface Tries {
  wrong: number;
  until: number;
}

export const noTries: Tries = { wrong: 0, until: 0 };

/** Milliseconds left before a PIN may be tried again; 0 when it may be now. */
export function waitMs(tries: Tries, now: number): number {
  return now < tries.until ? tries.until - now : 0;
}

/** A wrong PIN: the fifth in a row locks entry for a minute. Kept while the app runs, as in Java. */
export function failed(tries: Tries, now: number): Tries {
  const wrong = tries.wrong + 1;
  return wrong >= MAX_TRIES ? { wrong: 0, until: now + LOCK_MS } : { wrong, until: tries.until };
}

/** The right PIN: the count and any wait go. */
export function passed(): Tries {
  return { wrong: 0, until: 0 };
}

/** "Too many wrong PINs. Try again in 43 s", for the screen that asked. */
export function lockedText(leftMs: number): string {
  return f('Too many wrong PINs. Try again in %1$s s', Math.ceil(leftMs / 1000));
}

export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function onText(p: Prefs): string {
  return f('Valet mode is on: volume up to %1$s%%, warning above %2$s km/h, Settings locked', volumeCap(p), speed(p));
}
