/**
 * The picture layouts (port of Layouts.java; the definitions are src/data/layouts.json, the same
 * file as assets/layouts/layouts.json in the Android version): a full-screen picture with round,
 * pill and card parts on it, as an alternative to the boxes. Settings > Screen layout picks one,
 * and each part can be shown or hidden. Names here are English; screens pass them through t().
 */
import * as Features from './features.ts';
import type { Prefs } from './prefs.ts';
import { current as profile } from './profiles.ts';

/** The pref value for the boxes dashboard (no picture layout). */
export const BOXES = 'boxes';

/** The design every layout is drawn in, scaled to the screen and centred. */
export const W = 1024;
export const H = 600;

export interface Part {
  kind: string;
  style: string;
  shape: string;
  src: string;
  opt: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** colours as #RRGGBB */
  fill: string;
  fill2: string;
  ink: string;
  sub: string;
  accent: string;
  alpha: number;
  hasFill: boolean;
  labels: boolean;
  tiles: boolean;
  clock: boolean;
  items: string[];
}

export interface Layout {
  id: string;
  name: string;
  bg: string;
  light: boolean;
  /** the road's vanishing point; horizon -1 = no moving road */
  roadHorizon: number;
  roadX: number;
  roadHalf: number;
  roadDash: string;
  lines: [number, number, number, number][];
  parts: Part[];
}

/** "#RRGGBB" to an opaque colour; anything else is white. */
export function color(hex: unknown): string {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}/.test(hex)) return hex.substring(0, 7).toUpperCase();
  return '#FFFFFF';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const numOr = (v: any, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const strOr = (v: any, def: string) => (typeof v === 'string' ? v : def);

export function parse(o: any): Layout {
  const road = o.road;
  const l: Layout = {
    id: String(o.id),
    name: String(o.name),
    bg: String(o.bg),
    light: o.light ?? true,
    roadHorizon: road ? numOr(road.horizon, -1) : -1,
    roadX: road ? numOr(road.x, 0) : 0,
    roadHalf: road ? numOr(road.half, 0) : 0,
    roadDash: road ? color(strOr(road.dash, '#FFFFFF')) : '#FFFFFF',
    lines: (o.lines ?? []).map((a: number[]) => [a[0], a[1], a[2], a[3]]),
    parts: [],
  };
  for (const j of o.parts ?? []) {
    const fill = strOr(j.fill, '#000000');
    const ink = strOr(j.ink, '#FFFFFF');
    l.parts.push({
      kind: String(j.kind),
      style: strOr(j.style, ''),
      shape: strOr(j.shape, ''),
      src: strOr(j.src, ''),
      opt: strOr(j.opt, ''),
      x: numOr(j.x, 0),
      y: numOr(j.y, 0),
      w: numOr(j.w, 0),
      h: numOr(j.h, 0),
      r: numOr(j.r, 12),
      hasFill: 'fill' in j,
      alpha: numOr(j.alpha, 1),
      fill: color(fill),
      fill2: color(strOr(j.fill2, fill)),
      ink: color(ink),
      sub: color(strOr(j.sub, ink)),
      accent: color(strOr(j.accent, '#3A8DFF')),
      labels: j.labels === true,
      tiles: j.tiles === true,
      clock: j.clock === true,
      items: Array.isArray(j.items) ? j.items.map(String) : [],
    });
  }
  return l;
}

/** Every layout in a layouts.json; a broken file gives none, as in the Android version. */
export function parseAll(json: any): Layout[] {
  try {
    return (json.layouts as any[]).map(parse);
  } catch {
    return [];
  }
}

/** The chosen layout's id, or "boxes". */
export function current(p: Prefs): string {
  return p.str('layout', BOXES);
}

export function get(all: Layout[], id: string): Layout | null {
  return all.find((l) => l.id === id) ?? null;
}

/** The layout to show instead of the boxes, or null for the boxes. */
export function chosen(p: Prefs, all: Layout[]): Layout | null {
  return get(all, current(p));
}

export function choose(p: Prefs, id: string): void {
  p.put('layout', id);
}

// ------------------------------------------------------------------ parts that can be hidden

/** What a switch is called in Settings. */
export const OPT_NAMES: Record<string, string> = {
  speed: 'Speed',
  time: 'Time',
  clock: 'Clock',
  weather: 'Weather',
  forecast: 'Weather for the next days',
  media: 'Music and radio',
  direction: 'Compass and direction',
  stats: 'Temperature, altitude and direction',
  user: "Driver's name",
  car: 'The car',
  trip: "Today's distance",
};

/** Things in a list part (stats) that can each be shown. */
export const STAT_ITEMS = ['temp', 'altitude', 'direction', 'pressure', 'latlon', 'tyres'];
export const STAT_NAMES = ['Temperature', 'Altitude', 'Direction', 'Air pressure', 'Latitude and longitude', 'Tyre pressures'];

export function hidden(p: Prefs, id: string): Set<string> {
  return new Set(p.str('lay:' + id + ':off', '').split(','));
}

export function shown(p: Prefs, id: string, opt: string | null | undefined): boolean {
  return !opt || !hidden(p, id).has(opt);
}

export function setShown(p: Prefs, id: string, opt: string, on: boolean): void {
  const h = hidden(p, id);
  h.delete('');
  if (on) h.delete(opt);
  else h.add(opt);
  p.put('lay:' + id + ':off', [...h].map((x) => x + ',').join(''));
}

/** All the list's items in the owner's order: the part's own first, then the rest. */
export function statOrder(p: Prefs, id: string, part: Part): string[] {
  const out: string[] = [];
  for (const it of p.str('lay:' + id + ':order', '').split(',')) if (STAT_ITEMS.includes(it) && !out.includes(it)) out.push(it);
  for (const it of part.items) if (!out.includes(it)) out.push(it);
  for (const it of STAT_ITEMS) if (!out.includes(it)) out.push(it);
  return out;
}

/** The items a stats part shows: its own by default, the extra ones once switched on. */
export function statItems(p: Prefs, id: string, part: Part): string[] {
  const h = hidden(p, id);
  return statOrder(p, id, part).filter((it) => {
    const key = 'stat-' + it;
    return part.items.includes(it) ? !h.has(key) : h.has('+' + key);
  });
}

/** Move an item to the top of the list. */
export function toTop(p: Prefs, id: string, part: Part, item: string): void {
  const o = statOrder(p, id, part).filter((x) => x !== item);
  o.unshift(item);
  p.put('lay:' + id + ':order', o.map((x) => x + ',').join(''));
}

export function statName(item: string): string {
  const i = STAT_ITEMS.indexOf(item);
  return i < 0 ? item : STAT_NAMES[i];
}

export function setStat(p: Prefs, id: string, part: Part, item: string, on: boolean): void {
  const key = 'stat-' + item;
  if (part.items.includes(item)) setShown(p, id, key, on);
  else setShown(p, id, '+' + key, !on);
}

/** The first part of a kind, or null. */
export function part(l: Layout, kind: string): Part | null {
  return l.parts.find((x) => x.kind === kind) ?? null;
}

/** The switches a layout has, in order, without repeats. */
export function opts(l: Layout): string[] {
  const out: string[] = [];
  for (const x of l.parts) if (x.opt && !out.includes(x.opt)) out.push(x.opt);
  return out;
}

/**
 * Layout-wide switches: moving road lines, gentle background movement. The road is the same
 * switch as the dashboard's moving road (since 1.35; "layRoad" is no longer read).
 */
export const roadOn = (p: Prefs) => Features.on(p, 'road');
/** A phone-mirroring button added to each layout's dock. */
export const mirrorOn = (p: Prefs) => p.str('layMirror', 'off') === 'on';
export const animOn = (p: Prefs) => p.str('layAnim', 'off') === 'on';
/** "layout" = the layout's own picture, "mine" = the owner's, "cycle" = take turns every hour. */
export const wall = (p: Prefs) => p.str('layWall', 'layout');

/** Compass point for a bearing: N, NE, E… */
export function compass(deg: number): string {
  const n = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return n[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ------------------------------------------------------------------ the dock and taps (from LayoutView)

export const DOCK_NAMES: Record<string, string> = {
  navi: 'Navigation',
  music: 'Music',
  radio: 'Radio',
  bt: 'Bluetooth',
  phone: 'Phone',
  apps: 'Apps',
  settings: 'Settings',
  user: 'Driver',
  dash: 'Dashboard',
  mirror: 'Phone mirroring',
};

export function label(item: string): string {
  return DOCK_NAMES[item] ?? item;
}

/** The pref suffix for a dock button's app ("app:" + this holds the package). */
export function dockKey(name: string): string {
  if (name === 'music') return 'media:music';
  if (name === 'radio') return 'media:radio';
  return 'dock:' + name;
}

/** The app chosen for a dock button; navigation defaults to Google Maps as in Prefs.app. */
export function dockApp(p: Prefs, name: string): string {
  const key = dockKey(name);
  return p.str('app:' + key, key === 'dock:navi' ? 'com.google.android.apps.maps' : '');
}

/** The dock's buttons, with the mirroring button when it is switched on. */
export function dockItems(p: Prefs, part: Part): string[] {
  const out = [...part.items];
  if (mirrorOn(p) && !out.includes('mirror')) out.splice(out.includes('apps') ? out.indexOf('apps') : out.length, 0, 'mirror');
  return out;
}

/** Favourite apps in the Cards layout: six package names in "layApps". */
export const FAVOURITES = 6;

export function favourite(p: Prefs, i: number): string | null {
  const s = p.str('layApps', '').split(',');
  return i < s.length && s[i] !== '' ? s[i] : null;
}

export function setFavourite(p: Prefs, i: number, pkg: string): void {
  const s = p.str('layApps', '').split(',');
  const out: string[] = [];
  for (let j = 0; j < FAVOURITES; j++) out.push(j < s.length ? s[j] : '');
  out[i] = pkg;
  p.put('layApps', out.join(','));
}

/** A saved place ("place:Home" = "lat,lon"), or null. */
export function place(p: Prefs, name: string): [number, number] | null {
  const s = p.str('place:' + name, '').split(',');
  const la = parseFloat(s[0]);
  const lo = parseFloat(s[1]);
  return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo] : null;
}

/**
 * The owner's name, shared since 1.35 by the home screen's greeting and the layouts' driver part.
 * It is kept under "welcome", as the Android version and its backups call it; installs made with
 * this port before 1.42 wrote "ownerName", so that is still read.
 */
export function owner(p: Prefs): string {
  return p.str('welcome', '').trim() || p.str('ownerName', '').trim();
}

/** Saves that name. Like Java's editWelcome, it clears the layouts' own older name. */
export function saveOwner(p: Prefs, v: string): void {
  p.put('welcome', v.trim());
  p.put('layUser', '');
}

/**
 * The name on the driver part: "layUser" was the layouts' own name before there was one setting,
 * and still wins when set (saving the name clears it); then the owner's name, then the profile's.
 */
export function driver(p: Prefs): string {
  const n = p.str('layUser', '').trim() || owner(p);
  return n || profile(p);
}
