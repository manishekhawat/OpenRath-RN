/**
 * Hindi for everything OpenRath shows (Hindi.java). src/data/hi.json pairs the English the code
 * uses with its Hindi; scripts/hindi.py makes it from the ui*.xml string files in the Android
 * project's res folders.
 * Code passes its English through t(), or f() for text with numbers or names in it
 * ("Toll in %1$s km"); anything not translated stays in English, so new text never shows blank.
 * The owner picks the language in Settings ('lang'); it starts as the unit's own language.
 *
 * Every ₹ on screen also passes through here (1.44): outside India it becomes the local
 * currency's sign, which is why the app can write prices with ₹ everywhere (src/logic/money.ts).
 */
import words from '../data/hi.json' with { type: 'json' };

import * as Money from './money.ts';
import type { Prefs } from './prefs.ts';

const HI = words as Record<string, string>;
let on = false;

/** 'hi' or 'en': the owner's choice, else the unit's language. */
export function lang(p: Prefs): string {
  let def = 'en';
  try {
    if (Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('hi')) def = 'hi';
  } catch {
    // no Intl: English
  }
  return p.str('lang', def) === 'hi' ? 'hi' : 'en';
}

/** Read the language and the country once at start-up and whenever Settings changes them. */
export function load(p: Prefs): void {
  on = lang(p) === 'hi';
  Money.load(p);
}

export function hindi(): boolean {
  return on;
}

/** The Hindi for this English, when Hindi is on and there is one, in the owner's currency. */
export function t(s: string): string {
  if (!s) return s;
  return Money.shown(on ? HI[s] ?? s : s);
}

/** Text with numbers or names in it: "%1$s km" (or plain "%s", "%d") filled in after translating. */
export function f(format: string, ...args: unknown[]): string {
  return Money.shown(fill(t(format), args));
}

export function fill(format: string, args: unknown[]): string {
  let next = 0;
  return format.replace(/%(?:(\d+)\$)?([sd%])/g, (_m, pos: string | undefined, kind: string) => {
    if (kind === '%') return '%';
    const i = pos ? parseInt(pos, 10) - 1 : next++;
    const v = args[i];
    return kind === 'd' && typeof v === 'number' ? String(Math.round(v)) : String(v ?? '');
  });
}

/** For tests: switch without prefs. */
export function setOn(v: boolean): void {
  on = v;
}
