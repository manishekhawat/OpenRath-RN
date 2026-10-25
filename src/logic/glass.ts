/**
 * The Glass look (port of Glass.java, 1.44, Settings > Look > Glass look): see-through panels with
 * a thin light edge and big round corners, over a soft, blurred, colourful wallpaper. It is the
 * look the app starts with; switching it off leaves the chosen theme exactly as it was.
 *
 * The Android version blurs the wallpaper once into a small bitmap, because the stereos it runs on
 * (Android 8 to 10) cannot blur what is behind a view. Here the wallpaper is drawn instead as one
 * SVG of a top-to-bottom gradient with five soft spots of colour on it (src/components/GlassBack.tsx),
 * which is what the blurred bitmap looks like and costs nothing per frame. `spots()` gives that
 * drawing its numbers; `paint()`, `blur()` and `shade()` are the Android version's own pixel
 * versions, kept because the boot animation really does draw pixels, and because they are what the
 * tests can check.
 *
 * Alpha comes last here (#RRGGBBAA) as React Native wants it, where Java wrote it first.
 */
import { mix as mix6 } from './paint.ts';
import type { Prefs } from './prefs.ts';
import type { Look } from './theme.ts';

/** The wallpapers, and their names for Settings. */
export const WALLS = ['aurora', 'sunset', 'ocean', 'mine'] as const;
export const WALL_NAMES = ['Aurora', 'Sunset', 'Ocean', 'My picture'];

/** The glass by day (white, see-through) and at night (darker). */
export const DAY_FILL = '#FFFFFF26';
export const DAY_TOP = '#FFFFFF3D';
export const DAY_EDGE = '#FFFFFF47';
export const NIGHT_FILL = '#00000059';
export const NIGHT_TOP = '#FFFFFF1A';
export const NIGHT_EDGE = '#FFFFFF2E';
/** Text on glass: white, and a light grey that still reads in daylight. */
export const TEXT = '#FFFFFF';
export const DAY_DIM = '#D3D9E4';
export const NIGHT_DIM = '#B4BCCA';
/** The road drawn on glass. */
export const ROAD_FILL = '#00000047';
export const ROAD_LINE = '#FFFFFFD9';
/** Corner radius of glass panels. */
export const RADIUS = 24;
/** How much of the wallpaper's brightness stays (darker so white text reads on it). */
export const DAY_SHADE = 0.72;
export const NIGHT_SHADE = 0.42;
/** The size the Android version makes and blurs the wallpaper at. */
export const SMALL_W = 320;
export const SMALL_H = 180;

/** Glass is the look the app starts with; the owner can switch it off in Settings > Look. */
export function wanted(p: Prefs): boolean {
  return p.str('glass', 'on') !== 'off';
}

export function set(p: Prefs, on: boolean): void {
  p.put('glass', on ? 'on' : 'off');
}

/** The wallpaper chosen: one of WALLS, Aurora for anything else. */
export function wall(p: Prefs): string {
  const w = p.str('glassWall', WALLS[0]);
  return (WALLS as readonly string[]).includes(w) ? w : WALLS[0];
}

export function wallName(p: Prefs): string {
  return WALL_NAMES[(WALLS as readonly string[]).indexOf(wall(p))];
}

export function setWall(p: Prefs, w: string): void {
  p.put('glassWall', (WALLS as readonly string[]).includes(w) ? w : WALLS[0]);
}

// ------------------------------------------------------------------ colours

/** A colour's alpha, 0 to 1 (a colour without one is opaque). */
export function alpha(c: string): number {
  return c.length === 9 ? parseInt(c.substring(7, 9), 16) / 255 : 1;
}

/** The same colour with its alpha scaled by `a` (0 to 1). */
export function fade(c: string, a: number): string {
  const al = Math.round(alpha(c) * Math.max(0, Math.min(1, a)) * 255);
  return (c.substring(0, 7) + al.toString(16).padStart(2, '0')).toUpperCase();
}

/**
 * `t` of a over the rest of b, their alphas mixed as their colours are, so a colour mixed with a
 * glass panel stays glass. Ui.mix does this while Glass is on.
 */
export function mix(a: string, b: string, t: number): string {
  const rgb = mix6(a, b, t);
  const al = Math.round((alpha(a) * t + alpha(b) * (1 - t)) * 255);
  return al === 255 ? rgb : (rgb + al.toString(16).padStart(2, '0')).toUpperCase();
}

/** What a see-through colour looks like over an opaque one. */
export function over(top: string, under: string): string {
  return mix6(top, under, alpha(top));
}

/** An opaque panel colour for pop-ups with nothing behind the glass to show. */
export function solid(background: string, night: boolean): string {
  return over(night ? '#FFFFFF1F' : '#FFFFFF2E', background);
}

// ------------------------------------------------------------------ the wallpaper

/** A wallpaper's top and bottom colour. */
const BASE = [
  ['#0B1233', '#1A0F33'],
  ['#2B1036', '#140A26'],
  ['#06213A', '#041222'],
];
const SPOT_COLOURS = [
  ['#1FA3A0', '#3E5BD8', '#8A3FC8', '#D2477E', '#1D7FC4'],
  ['#F0743E', '#D8406A', '#6A2FA8', '#F2A63C', '#9C2D6B'],
  ['#1E88C8', '#14B3A6', '#2A4FB8', '#58C7E0', '#164E8A'],
];
/** Each spot's centre (share of the width, of the height) and size (share of the height). */
const SPOTS = [
  [
    [0.12, 0.2, 0.6],
    [0.52, 0.1, 0.55],
    [0.88, 0.55, 0.62],
    [0.32, 0.92, 0.55],
    [0.72, 1.0, 0.45],
  ],
  [
    [0.15, 0.25, 0.6],
    [0.55, 0.15, 0.55],
    [0.92, 0.6, 0.62],
    [0.3, 0.95, 0.55],
    [0.75, 0.98, 0.45],
  ],
  [
    [0.18, 0.18, 0.62],
    [0.7, 0.28, 0.58],
    [0.5, 0.95, 0.62],
    [0.95, 0.82, 0.4],
    [0.02, 0.75, 0.48],
  ],
];
const SPOT_STRENGTH = 0.85;

/** Which of the three painted wallpapers a choice means (Aurora for "mine", which has no picture). */
export function which(w: string): number {
  const i = (WALLS as readonly string[]).indexOf(w);
  return i >= 0 && i < BASE.length ? i : 0;
}

export interface Spot {
  /** the centre, as a share of the width and of the height */
  x: number;
  y: number;
  /** the radius, as a share of the height */
  r: number;
  colour: string;
  /** how much of the colour lands at the centre */
  strength: number;
}

/** Wallpaper `n`'s top and bottom colour, and its five spots, for the drawing. */
export function spots(n: number): { top: string; bottom: string; spots: Spot[] } {
  const i = n >= 0 && n < BASE.length ? n : 0;
  return {
    top: BASE[i][0],
    bottom: BASE[i][1],
    spots: SPOTS[i].map((s, k) => ({ x: s[0], y: s[1], r: s[2], colour: SPOT_COLOURS[i][k], strength: SPOT_STRENGTH })),
  };
}

/** Wallpaper `n` as w x h opaque "#RRGGBB" colours, row by row, as Android paints it. */
export function paint(n: number, w: number, h: number): string[] {
  const i = n >= 0 && n < BASE.length ? n : 0;
  const px: string[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = mix6(BASE[i][1], BASE[i][0], h > 1 ? y / (h - 1) : 0);
    for (let x = 0; x < w; x++) {
      let c = row;
      for (let s = 0; s < SPOTS[i].length; s++) {
        const sp = SPOTS[i][s];
        const dx = (x - sp[0] * w) / h;
        const dy = (y - sp[1] * h) / h;
        const tt = 1 - Math.sqrt(dx * dx + dy * dy) / sp[2];
        if (tt <= 0) continue;
        c = mix6(SPOT_COLOURS[i][s], c, SPOT_STRENGTH * tt * tt * (3 - 2 * tt));
      }
      px[y * w + x] = c;
    }
  }
  return px;
}

function channel(c: string, i: number): number {
  return parseInt(c.substring(1 + i * 2, 3 + i * 2), 16);
}

function hex(r: number, g: number, b: number): string {
  return ('#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')).toUpperCase();
}

/** Opaque colours blurred: three box blurs of `radius` each way, edges held, any radius at one cost. */
export function blur(px: string[], w: number, h: number, radius: number): string[] {
  let a = px.slice();
  if (radius < 1 || w < 1 || h < 1) return a;
  for (let pass = 0; pass < 3; pass++) {
    a = box(box(a, w, h, radius, true), w, h, radius, false);
  }
  return a;
}

/** One box blur along rows (across) or columns, with a running sum. */
function box(input: string[], w: number, h: number, rad: number, across: boolean): string[] {
  const out: string[] = new Array(input.length);
  const lines = across ? h : w;
  const len = across ? w : h;
  const n = 2 * rad + 1;
  const at = (line: number, i: number) => (across ? line * w + i : i * w + line);
  for (let l = 0; l < lines; l++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let d = -rad; d <= rad; d++) {
      const p = input[at(l, Math.max(0, Math.min(len - 1, d)))];
      r += channel(p, 0);
      g += channel(p, 1);
      b += channel(p, 2);
    }
    for (let i = 0; i < len; i++) {
      out[at(l, i)] = hex(Math.floor((r + ((n / 2) | 0)) / n), Math.floor((g + ((n / 2) | 0)) / n), Math.floor((b + ((n / 2) | 0)) / n));
      const add = input[at(l, Math.min(len - 1, i + rad + 1))];
      const drop = input[at(l, Math.max(0, i - rad))];
      r += channel(add, 0) - channel(drop, 0);
      g += channel(add, 1) - channel(drop, 1);
      b += channel(add, 2) - channel(drop, 2);
    }
  }
  return out;
}

/** Each colour times f (0 black, 1 as it was). */
export function shade(px: string[], f: number): string[] {
  return px.map((p) => hex(Math.round(channel(p, 0) * f), Math.round(channel(p, 1) * f), Math.round(channel(p, 2) * f)));
}

/** The average of opaque colours. */
export function average(px: string[]): string {
  if (px.length === 0) return '#000000';
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of px) {
    r += channel(p, 0);
    g += channel(p, 1);
    b += channel(p, 2);
  }
  return hex(Math.floor(r / px.length), Math.floor(g / px.length), Math.floor(b / px.length));
}

/**
 * The opaque colour under everything while Glass is on: the wallpaper's average, darker. It is
 * what a screen falls back to before the wallpaper is drawn, and what pop-ups mix with. The
 * average is taken from the painted wallpaper rather than the blurred one, which has the same
 * average; a coarse grid is enough for colours this smooth.
 */
export function backgroundOf(n: number, night: boolean): string {
  const key = n + (night ? 'n' : 'd');
  const had = backgrounds.get(key);
  if (had) return had;
  const px = shade(paint(n, 80, 45), night ? NIGHT_SHADE : DAY_SHADE);
  const c = shade([average(px)], 0.7)[0];
  backgrounds.set(key, c);
  return c;
}

/** There are six of these (three wallpapers, day and night), so each is worked out once. */
const backgrounds = new Map<string, string>();

// ------------------------------------------------------------------ the look

/** What the glass wallpaper needs to draw itself; `picture` is the owner's own, when there is one. */
export interface Glass {
  wall: string;
  which: number;
  night: boolean;
  shade: number;
  picture?: string;
}

/**
 * The theme's look dressed in glass (Glass.apply): see-through panels, white text, the road
 * drawn light on dark, and the wallpaper in place of the theme's background. The theme's accent
 * colour stays, so a glass dashboard is still that theme's colour. With Glass off this is never
 * called and the look is the theme's own.
 */
export function apply(look: Look, w: string, night: boolean): Look {
  const n = which(w);
  // "My picture" uses the theme's own background picture; the port has no wallpapers folder
  const picture = w === 'mine' ? look.backgroundImage : undefined;
  return {
    ...look,
    text: TEXT,
    textDim: night ? NIGHT_DIM : DAY_DIM,
    // the grey labels become the light grey, so a theme that highlights with grey stays readable
    accent: look.accent === look.textDim ? (night ? NIGHT_DIM : DAY_DIM) : look.accent,
    panel: night ? NIGHT_FILL : DAY_FILL,
    panelTop: night ? NIGHT_TOP : DAY_TOP,
    edge: night ? NIGHT_EDGE : DAY_EDGE,
    icons: TEXT,
    roadFill: ROAD_FILL,
    roadLine: ROAD_LINE,
    radius: RADIUS,
    chrome: false,
    background: backgroundOf(n, night),
    gradient: null,
    backgroundImage: undefined,
    glass: { wall: w, which: n, night, shade: night ? NIGHT_SHADE : DAY_SHADE, picture },
  };
}
