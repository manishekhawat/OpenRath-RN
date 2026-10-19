import * as Features from './features.ts';
import { f, hindi, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';
import { extraSteps } from './tracks.ts';

/**
 * The player-side sound rules (Sound.java, Quiet.java, ParkedMusic.java, Duck.java and the volume
 * parts of Drive.java). The Android version moved the unit's music volume; here they set the
 * volume of the app's own player only, since the system volume and other apps need native code.
 * The volume is worked out from the owner's own level each time, so nothing has to be undone:
 * steps from speed and the sound profile are added, quiet hours turn it down once, and it dips
 * while the car speaks.
 */

/** One volume step, as a share of full volume: Android's music volume has 15 steps. */
export const STEP = 1 / 15;
/** How far the music dips under speech (Player.java's duck volume). */
export const DUCK = 0.2;

/**
 * The player's volume, 0–1: the owner's level (0–100) plus `steps` (speed and sound profile), and
 * ducked while the car speaks.
 */
export function volume(base: number, steps: number, ducked: boolean): number {
  const v = Math.max(0, Math.min(1, Math.max(0, Math.min(100, base)) / 100 + steps * STEP));
  return ducked ? v * DUCK : v;
}

// ------------------------------------------------------------------ louder with speed

export const PER_NAMES = ['off', 'gently (a step every 30 km/h)', 'medium (every 20 km/h)', 'strongly (every 15 km/h)'];

/** km/h for each extra step, from the 'speedVolPer' choice (0 = off). */
export function speedPer(p: Prefs): number {
  return [0, 30, 20, 15][Math.max(0, Math.min(3, num(p, 'speedVolPer', 2)))];
}

/** Steps to add at this speed (0 when the feature is off). */
export function speedSteps(p: Prefs, kmh: number): number {
  return Features.on(p, 'speedVolume') ? extraSteps(kmh, speedPer(p)) : 0;
}

/**
 * Keeps the speed steps from pumping up and down at a steady speed: a new value is taken at most
 * every 4 seconds, except dropping back to none, which is at once.
 */
export class SpeedVolume {
  steps = 0;
  at = 0;

  update(want: number, now: number): number {
    if (want === this.steps) return this.steps;
    if (now - this.at < 4000 && want !== 0) return this.steps;
    this.steps = want;
    this.at = now;
    return this.steps;
  }
}

// ------------------------------------------------------------------ sound profiles

export const PROFILES = ['city', 'highway', 'night'] as const;
export type Profile = (typeof PROFILES)[number];

/** Volume steps added for a profile, by default: louder over road noise, softer at night. */
export function profileVolDefault(profile: string): number {
  return profile === 'highway' ? 2 : profile === 'night' ? -2 : 0;
}

/** The steps for a profile, as set by the owner ('sndVol:<profile>', -5 to 5). */
export function profileVol(p: Prefs, profile: string): number {
  if (profile === '') return 0;
  return Math.max(-5, Math.min(5, num(p, 'sndVol:' + profile, profileVolDefault(profile))));
}

/** The equalizer preset for a profile; "" keeps the owner's own setting (kept for the native equalizer). */
export function profileEq(p: Prefs, profile: string): string {
  const def = profile === 'highway' ? 'Rock' : profile === 'night' ? 'Vocal' : '';
  return p.str('sndEq:' + profile, def);
}

/** The steps the sound profile adds now ("" when profiles are off). */
export function profileSteps(p: Prefs, profile: string): number {
  return Features.on(p, 'soundProfiles') ? profileVol(p, profile) : 0;
}

// ------------------------------------------------------------------ quiet hours

export function quietFrom(p: Prefs): number {
  return num(p, 'quietFrom', 22);
}

export function quietTo(p: Prefs): number {
  return num(p, 'quietTo', 6);
}

/** Percent of full volume the music is turned down to. */
export function quietVol(p: Prefs): number {
  return num(p, 'quietVol', 40);
}

/** Whether hour `h` (0–23) is inside from..to, which may run past midnight. */
export function inside(h: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

export function quietNow(p: Prefs, hour: number): boolean {
  return Features.on(p, 'quiet') && inside(hour, quietFrom(p), quietTo(p));
}

/**
 * The owner's level as quiet hours begin (or the app starts in them): turned down to the quiet
 * volume when above it, once; turning it up again afterwards is left alone.
 */
export function quietLevel(base: number, cap: number): number {
  return base > cap ? Math.max(1, cap) : base;
}

/** "10 pm", "midnight", "noon"; in Hindi the part of the day ("रात 2 बजे"), which am/pm alone doesn't tell. */
export function hour(h: number): string {
  if (h === 0) return t('midnight');
  if (h === 12) return t('noon');
  if (hindi()) return f(h < 4 || h >= 20 ? '%1$s at night' : h < 12 ? '%1$s in the morning' : h < 16 ? '%1$s in the afternoon' : '%1$s in the evening', h % 12);
  return (h % 12) + (h < 12 ? ' am' : ' pm');
}

export const QUIET_FROM = [20, 21, 22, 23, 0];
export const QUIET_TO = [5, 6, 7];
export const QUIET_VOL = [20, 30, 40, 50];

/** The next value in a settings cycle, starting over after the last (or when `cur` isn't one of them). */
export function cycle(values: number[], cur: number): number {
  const i = values.indexOf(cur);
  return values[i < 0 ? 0 : (i + 1) % values.length];
}

// ------------------------------------------------------------------ parked music

/**
 * Battery saver for music while parked. With an OBD adapter (engine off: no rpm, or the battery
 * not charging) it warns a minute before the limit and then pauses; without one the engine can't
 * be told apart from idling with the AC on, so it only reminds once per stop, after 30 minutes at
 * least. Returns "" nothing, "warn", "pause" or "remind".
 */
export function parkedDecide(playing: boolean, stillMs: number, limitMin: number, obd: boolean, rpm: number, volts: number): string {
  if (!playing) return '';
  if (obd) {
    const engineOff = rpm === 0 || (volts > 0 && volts < 12.9);
    if (!engineOff) return '';
    if (volts > 0 && volts < 11.9) return 'pause';
    const limit = limitMin * 60000;
    if (stillMs >= limit) return 'pause';
    if (stillMs >= limit - 60000) return 'warn';
    return '';
  }
  return stillMs >= Math.max(30, limitMin) * 60000 ? 'remind' : '';
}

export const PARKED_TEXT: Record<string, string> = {
  warn: 'The engine is off. The music will pause in a minute to save the battery.',
  remind: 'If the engine is off, the music is using the car battery.',
  pause: 'Music paused to save the battery.',
};

/** Minutes before parked music pauses ('parkedMusicMin', 5 at least). */
export function parkedMin(p: Prefs): number {
  return Math.max(5, num(p, 'parkedMusicMin', 20));
}

/** Follows one stop: how long the car has stood, and what was already said this stop. */
export class Parked {
  stillSince = -1;
  done = '';

  /** One GPS reading; returns what to do now ("" nothing), at most once per stop. */
  tick(kmh: number, now: number, playing: boolean, limitMin: number, obd = false, rpm = -1, volts = -1): string {
    if (kmh >= 3) {
      this.stillSince = -1;
      this.done = '';
      return '';
    }
    if (this.stillSince < 0) this.stillSince = now;
    const what = parkedDecide(playing, now - this.stillSince, limitMin, obd, rpm, volts);
    if (what === '' || what === this.done || this.done === 'pause' || this.done === 'remind') return '';
    this.done = what;
    return what;
  }
}

// ------------------------------------------------------------------ duck

/**
 * Counts the car's sentences being spoken (Duck.java): the music dips with the first to start
 * and comes back when the last ends, however they overlap.
 */
export class Speaking {
  count = 0;

  start(): boolean {
    return this.count++ === 0;
  }

  /** True when this was the last one. */
  end(): boolean {
    if (this.count === 0) return false;
    return --this.count === 0;
  }

  get on(): boolean {
    return this.count > 0;
  }
}
