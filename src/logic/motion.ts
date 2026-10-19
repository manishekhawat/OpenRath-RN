/**
 * Less movement (Motion.java), in Home screen: Standard, Reduced or Off for animations and the
 * moving road, for slow stereos and drivers who find motion distracting.
 */
import type { Prefs } from './prefs.ts';

export const LEVELS = ['standard', 'reduced', 'off'];
export const NAMES = ['Standard', 'Reduced', 'Off'];

export function pick(v: string): string {
  return LEVELS.includes(v) ? v : 'standard';
}

export function level(p: Prefs): string {
  return pick(p.str('motion', 'standard'));
}

/** An animation's length at this level. */
export function ms(level: string, standard: number): number {
  if (level === 'off') return 0;
  return level === 'reduced' ? standard / 2 : standard;
}

/** Time between frames of something that keeps moving, or -1 for not at all. */
export function frame(level: string): number {
  if (level === 'off') return -1;
  return level === 'reduced' ? 100 : 33;
}
