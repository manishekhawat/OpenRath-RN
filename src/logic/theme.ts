/**
 * Theme packs (port of Theme.java): a theme.json sets colours and switches; anything it leaves
 * out falls back to the built-in look. See THEMES.md in the original source for the format.
 */

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
      problem = `Colour ${key} isn't a colour like #D8DCE2`;
      return def;
    }
    return v;
  };
  const text = c('text', '#D8DCE2');
  let gradient: string[] | null = null;
  if (Array.isArray(json.backgroundGradient) && json.backgroundGradient.length >= 2) {
    const g = json.backgroundGradient.map(colour);
    if (g.every((x) => x != null)) gradient = g as string[];
    else problem = 'backgroundGradient needs colours like #3A0D5C';
  }
  return {
    text,
    textDim: c('textDim', '#8A8F96'),
    accent: c('accent', defAccent),
    edge: c('edge', defEdge),
    panelTop: c('panelTop', '#111215'),
    panel: c('panel', '#0B0C0E'),
    background: c('background', '#000000'),
    icons: c('icons', text),
    roadFill: c('road', '#1D1F23'),
    roadLine: c('roadLine', '#C9CDD3'),
    gradient,
    radius: typeof json.cornerRadius === 'number' ? json.cornerRadius : 14,
    road: json.road ?? true,
    chrome: json.chromeText ?? true,
    welcomeTitle: json.welcomeTitle ?? 'WELCOME',
    problem,
  };
}
