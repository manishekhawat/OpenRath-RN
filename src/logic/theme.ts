/**
 * Theme packs (port of Theme.java): a theme.json sets colours and switches; anything it leaves
 * out falls back to the built-in look. See THEMES.md in the original source for the format.
 * Eight themes are built in (ids start with @); others are folders of plain files, imported from a
 * .zip of the folder or a lone theme.json (see src/state/look.ts for where they are kept).
 * ThemeAuto (src/logic/themeauto.ts) can show another theme for a while: `override`.
 */
import { unzipSync } from 'fflate';

import type { Glass } from './glass.ts';
import { f, t } from './i18n.ts';
import type { Prefs } from './prefs.ts';

export interface ThemeJson {
  name?: string;
  author?: string;
  description?: string;
  colours?: Record<string, string>;
  colors?: Record<string, string>;
  backgroundGradient?: string[];
  cornerRadius?: number;
  road?: boolean;
  chromeText?: boolean;
  welcomeTitle?: string;
  carName?: string;
}

export interface Look {
  text: string;
  textDim: string;
  accent: string;
  edge: string;
  panelTop: string;
  panel: string;
  background: string;
  icons: string;
  roadFill: string;
  roadLine: string;
  gradient: string[] | null;
  radius: number;
  road: boolean;
  chrome: boolean;
  welcomeTitle: string;
  /** what was wrong with the theme file, for Settings; "" when it was fine */
  problem: string;
  /** the pack's background.jpg or .png, cropped to fill the screen; absent for none */
  backgroundImage?: string;
  /** the Glass look's wallpaper, when Glass is on (1.44); absent when it is off */
  glass?: Glass;
}

/** The car-paint accent used by themes that don't set their own. */
export const PAINT_ACCENT = '#8A8F96';
export const PAINT_EDGE = '#4C5056';

/**
 * A colour as React Native wants it. Android writes alpha first (#AARRGGBB); React Native
 * wants it last (#RRGGBBAA). Returns null for anything that isn't a colour.
 */
export function colour(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return ('#' + s.substring(3) + s.substring(1, 3)).toUpperCase();
  return null;
}

export function lookOf(json: ThemeJson, defAccent = PAINT_ACCENT, defEdge = PAINT_EDGE): Look {
  const col = json.colours ?? json.colors ?? {};
  let problem = '';
  const c = (key: string, def: string) => {
    if (!(key in col)) return def;
    const v = colour(col[key]);
    if (v == null) {
      problem = f("Colour %1$s isn't a colour like #D8DCE2", key);
      return def;
    }
    return v;
  };
  // the colours first, then the gradient, so the mistake shown is the last one, as in Java
  const text = c('text', '#D8DCE2');
  const textDim = c('textDim', '#8A8F96');
  const accent = c('accent', defAccent);
  const edge = c('edge', defEdge);
  const panelTop = c('panelTop', '#111215');
  const panel = c('panel', '#0B0C0E');
  const background = c('background', '#000000');
  const icons = c('icons', text);
  const roadFill = c('road', '#1D1F23');
  const roadLine = c('roadLine', '#C9CDD3');
  let gradient: string[] | null = null;
  if (Array.isArray(json.backgroundGradient) && json.backgroundGradient.length >= 2) {
    const g = json.backgroundGradient.map(colour);
    if (g.every((x) => x != null)) gradient = g as string[];
    else problem = t('backgroundGradient needs colours like #3A0D5C');
  }
  return {
    text,
    textDim,
    accent,
    edge,
    panelTop,
    panel,
    background,
    icons,
    roadFill,
    roadLine,
    gradient,
    radius: typeof json.cornerRadius === 'number' ? json.cornerRadius : 14,
    road: json.road ?? true,
    chrome: json.chromeText ?? true,
    welcomeTitle: json.welcomeTitle ?? 'WELCOME',
    problem,
  };
}

// ------------------------------------------------------------------ packs

export const DEFAULT = '@magma-grey';

/** The themes built into the app, in src/data/theme-<id>.json; their ids start with @. */
export const BUILT_IN = ['magma-grey', 'light', 'minimal', 'auto', 'genz', 'mission', 'electric', 'roadster'];

/** A theme the owner can choose: built in, or a folder of their own. */
export interface Pack {
  id: string;
  name: string;
  author: string;
  description: string;
  json: ThemeJson;
  /** the folder name for an imported theme; null for a built-in one */
  folder: string | null;
}

export function packOf(id: string, json: ThemeJson, folder: string | null): Pack {
  return {
    id,
    json,
    folder,
    name: typeof json.name === 'string' ? json.name : id.startsWith('@') ? id.substring(1) : id,
    author: typeof json.author === 'string' ? json.author : '',
    description: typeof json.description === 'string' ? json.description : '',
  };
}

/** A pack whose theme.json couldn't be read: listed, with the mistake as its description. */
export function brokenPack(folder: string, why: string): Pack {
  return packOf(folder, { name: folder, description: 'theme.json has a mistake: ' + why }, folder);
}

/** The line under a theme's picture in the gallery; a built-in theme's words are translated. */
export function about(p: Pack): string {
  let s = p.folder == null ? t(p.description) : p.description;
  if (p.folder != null && p.author) s = (s ? s + '  ·  ' : '') + f('by %1$s', p.author);
  if (p.folder != null) s = (s ? s + '  ·  ' : '') + 'themes/' + p.folder;
  return s;
}

/** A theme picked by ThemeAuto (night) instead of the owner's own, or null. */
let override: string | null = null;

export function getOverride(): string | null {
  return override;
}

export function setOverride(id: string | null): void {
  override = id;
}

/** The theme on screen: ThemeAuto's pick while there is one, else the owner's own. */
export function chosen(p: Prefs): string {
  return override ?? own(p);
}

/**
 * The owner's own theme's id ("themePack", as in the Android version, where "theme" is the car-paint
 * accent). The old built-in name from 1.10 means Magma Grey; an id kept in "theme" by the first
 * React Native builds still counts.
 */
export function own(p: Prefs): string {
  const want = p.str('themePack', '');
  if (want === '' || want === 'Built-in Dzire chrome') {
    const old = p.str('theme', '');
    return want === '' && old.startsWith('@') ? old : DEFAULT;
  }
  return want;
}

export function choose(p: Prefs, id: string): void {
  p.put('themePack', id);
}

/** theme.json's text as a theme; throws with what is wrong. */
export function parseJson(text: string): ThemeJson {
  const j = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('theme.json should be an object like {"name": ...}');
  return j as ThemeJson;
}

/** A safe folder name from a file name: "Oxford Blue (1).zip" -> "Oxford Blue _1_". */
export function folderName(file: string): string {
  const n = file.replace(/\.(zip|json)$/i, '').replace(/[^A-Za-z0-9 _.-]/g, '_').replace(/^\.+/, '');
  return n === '' ? 'theme' : n;
}

/** Pictures and fonts bigger than this are skipped, as in the Android version. */
const MAX_FILE = 8 * 1024 * 1024;

/**
 * The files of a theme .zip, flat: a zip of the folder itself has them one level down. Throws
 * "no theme.json in <name>" when there is none.
 */
export function zipFiles(bytes: Uint8Array, zipName: string): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error(zipName + " isn't a .zip file");
  }
  let prefix = '';
  for (const n of Object.keys(entries)) {
    if (n.endsWith('theme.json')) {
      prefix = n.substring(0, n.length - 'theme.json'.length);
      break;
    }
  }
  const out: Record<string, Uint8Array> = {};
  for (const [n, b] of Object.entries(entries)) {
    if (n.endsWith('/') || !n.startsWith(prefix)) continue;
    const rel = n.substring(prefix.length);
    if (rel === '' || rel.includes('/') || rel.includes('..')) continue; // flat folder only
    if (b.length > MAX_FILE) continue;
    out[rel] = b;
  }
  if (!out['theme.json']) throw new Error('no theme.json in ' + zipName);
  return out;
}
