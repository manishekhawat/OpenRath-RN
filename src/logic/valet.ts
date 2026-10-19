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

export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function onText(p: Prefs): string {
  return f('Valet mode is on: volume up to %1$s%%, warning above %2$s km/h, Settings locked', volumeCap(p), speed(p));
}
