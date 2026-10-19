/**
 * How the settings screen is arranged (SettingsView.java, 1.37 on): sections down the left, each
 * gathering some of the old groups under small headings, with that section's feature switches first
 * under "Turn on or off". A row's value splits into a short state on the right and a grey hint
 * under the title. "Recently used" holds the last four settings the owner changed.
 */
import * as Features from './features.ts';

/** One setting: a group it is shown under, its title (English), its value, and what a tap does. */
export interface Row {
  group: string;
  title: string;
  value?: string | null;
  action?: () => void;
  /** shown as an on/off switch when set; value is then the line under the title */
  on?: boolean;
  /** for a feature's switch: the feature's id, which decides the section it sits in */
  feature?: string;
  /** a screen to open instead of an action */
  route?: string;
}

/** A section on the left: the old groups it gathers, each shown under its own small heading. */
export interface Section {
  name: string;
  about: string;
  groups: string[];
  headings: string[];
}

export const SECTIONS: Section[] = [
  { name: 'OpenRath level', about: 'Simple, Full or Custom', groups: ['Level'], headings: ['How much OpenRath shows'] },
  { name: 'Home screen', about: 'Boxes, pages, night mode, voice', groups: ['Dashboard', 'Voice'], headings: ['Boxes and layout', 'Voice commands'] },
  {
    name: 'Look',
    about: 'Layouts, themes, car picture, buttons bar',
    groups: ['Layout', 'Themes', 'Car', 'Buttons bar'],
    headings: ['Screen layout', 'Themes', 'Car picture', 'Buttons bar'],
  },
  { name: 'Radio and music', about: 'FM, online radio, sound', groups: ['Radio and music'], headings: ['Radio and music'] },
  { name: 'Phone and messages', about: 'Favourites, message ticker', groups: ['Phone', 'Notifications'], headings: ['Phone', 'Messages'] },
  {
    name: 'Driving',
    about: 'Map, alerts, trips, fuel, dashcam',
    groups: ['Map and navigation', 'Driving', 'Monsoon', 'Dashcam'],
    headings: ['Map and navigation', 'Trips, fuel and alerts', 'Monsoon', 'Dashcam'],
  },
  { name: 'Family', about: 'Valet, child-lock, drivers', groups: ['Valet', 'Family'], headings: ['Kids or valet mode', 'Child-lock and drivers'] },
  {
    name: 'Car',
    about: 'Service, engine, lights, buttons',
    groups: ['Car care', 'Engine and tyres', 'Car signals', 'Steering-wheel buttons'],
    headings: ['Service reminders', 'Engine and tyres', 'Lights, indicators and reverse', 'Steering-wheel buttons'],
  },
  { name: 'Cab driver', about: 'Earnings, fare meter, SOS, papers', groups: ['Cab'], headings: ['Cab driver'] },
  { name: 'Backup and about', about: 'Backup, privacy, version', groups: ['Backup', 'Help'], headings: ['Backup', 'About'] },
  { name: 'Troubleshooting', about: 'Tests and reports if something fails', groups: ['Troubleshooting'], headings: ['Reports'] },
];

export const RECENT = 'Recently used';
const RECENT_SECTION: Section = { name: RECENT, about: 'The settings you changed last', groups: [], headings: [] };

/** Help rows that are for finding faults rather than everyday use. */
const TROUBLE = new Set(['Diagnostics', 'Crash reports', 'Reset GPS']);

/** Fault-finding rows that only developer mode shows. */
export const DEV_ROWS = new Set(['Diagnostics', 'Crash reports']);

/** The section a feature's switch goes in. */
export function sectionOf(f: Features.Feature): string {
  if (f.id === 'ticker' || f.id === 'readAloud') return 'Phone and messages';
  if (f.group === 'Dashboard') return 'Home screen';
  if (f.group === 'Sound') return 'Radio and music';
  if (f.group === 'Data') return 'Backup and about';
  if (f.group === 'Family') return 'Family';
  if (f.group === 'Cab') return 'Cab driver';
  return f.group; // Driving, Car, Phone, Radio and music
}

function groupOf(r: Row): string {
  return TROUBLE.has(r.title) ? 'Troubleshooting' : r.group;
}

export function section(name: string): Section {
  if (name === RECENT) return RECENT_SECTION;
  return SECTIONS.find((s) => s.name === name) ?? SECTIONS[0];
}

/** An item of a section: a small heading, or a row. */
export type Item = string | Row;

/** The rows each section shows, in order: feature switches first, then each old group under its heading. */
export function arrange(rows: Row[]): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const sec of SECTIONS) {
    const items: Item[] = [];
    const switches: Row[] = [];
    const switchNames = new Set<string>();
    for (const r of rows) {
      if (r.feature == null) continue;
      const f = Features.get(r.feature);
      if (f && sectionOf(f) === sec.name) {
        switches.push(r);
        switchNames.add(r.title.toLowerCase());
      }
    }
    if (switches.length > 0) items.push('Turn on or off', ...switches);
    sec.groups.forEach((g, i) => {
      const mine = rows.filter(
        (r) => r.feature == null && (r.action != null || r.route != null) && groupOf(r) === g && !switchNames.has(r.title.toLowerCase()),
      );
      if (mine.length === 0) return;
      items.push(sec.headings[i], ...mine);
    });
    if (items.length > 0) out.set(sec.name, items);
  }
  return out;
}

/** Remembers a setting the owner just used, newest first, at most four. */
export function remember(list: string | null | undefined, title: string): string {
  const l = [title];
  if (list) for (const t of list.split('\n')) if (t !== '' && t !== title && l.length < 4) l.push(t);
  return l.join('\n');
}

/** The rows the owner used last, found again by title among today's rows (a row that's gone is skipped). */
export function recent(list: string, all: Map<string, Item[]>): Row[] {
  const out: Row[] = [];
  for (const t of list.split('\n')) {
    if (t === '') continue;
    let found: Row | undefined;
    for (const items of all.values()) {
      found = items.find((o): o is Row => typeof o !== 'string' && o.title === t);
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}

/**
 * A row's value as [state, hint]: a short state ("on", "₹100", "not set up") goes on the right;
 * anything after "; " or a long sentence goes in the grey line under the title.
 */
export function split(v: string | null | undefined): [string, string] {
  if (v == null || v === '') return ['', ''];
  const semi = v.indexOf('; ');
  const state = semi > 0 ? v.substring(0, semi) : v;
  const hint = semi > 0 ? v.substring(semi + 2) : '';
  if (state.length > 24) return ['', v];
  return [state, hint];
}

/** Whether a row matches the search box, in English or in the language shown (`tr`). */
export function matches(r: Row, sectionName: string, q: string, tr: (s: string) => string): boolean {
  const v = r.value ?? '';
  const hay = [r.title, v, sectionName, tr(r.title), tr(v), tr(sectionName)].join(' ').toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}
