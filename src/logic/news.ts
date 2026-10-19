import * as Features from './features.ts';
import { f, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

/**
 * The top five headlines for the news box, from Google News (RSS, no account or key) (port of
 * News.java). Refreshed every 30 minutes while there is internet; the last five are kept in
 * 'newsCache' so the box still shows them offline. read() turns them into one passage for the
 * car's voice.
 */

export const TOPICS = ['top', 'NATION', 'WORLD', 'BUSINESS', 'SPORTS', 'TECHNOLOGY', 'ENTERTAINMENT'];
export const TOPIC_NAMES = ['Top stories', 'India', 'World', 'Business', 'Sports', 'Technology', 'Entertainment'];
export const COUNT = 5;
export const FRESH_MS = 30 * 60 * 1000;
export const RETRY_MS = 3 * 60 * 1000;

export interface Item {
  title: string;
  source: string;
}

export function url(topic: string | null | undefined): string {
  const tail = 'hl=en-IN&gl=IN&ceid=IN:en';
  return !topic || topic === 'top'
    ? 'https://news.google.com/rss?' + tail
    : 'https://news.google.com/rss/headlines/section/topic/' + topic + '?' + tail;
}

export function topicName(topic: string): string {
  const i = TOPICS.indexOf(topic);
  return TOPIC_NAMES[i < 0 ? 0 : i];
}

function tag(body: string, name: string): string {
  const m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>').exec(body);
  return m ? m[1] : '';
}

/** Feed text to plain words: CDATA, tags and entities removed, spaces collapsed. */
export function clean(s: string): string {
  s = s.trim();
  if (s.startsWith('<![CDATA[') && s.endsWith(']]>')) s = s.substring(9, s.length - 3);
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&#(x?)([0-9a-fA-F]+);/g, (_, x: string, n: string) => {
    if (!x && !/^[0-9]+$/.test(n)) return '?';
    const cp = parseInt(n, x ? 16 : 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : '?';
  });
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first `max` items of an RSS feed. Google News titles end in " - Source", which is split off. */
export function parse(xml: string | null | undefined, max: number): Item[] {
  const out: Item[] = [];
  if (xml == null) return out;
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < max) {
    const body = m[1];
    let title = clean(tag(body, 'title'));
    let source = clean(tag(body, 'source'));
    if (title === '') continue;
    if (source !== '' && title.endsWith(' - ' + source)) title = title.substring(0, title.length - source.length - 3).trim();
    else if (source === '') {
      const d = title.lastIndexOf(' - ');
      if (d > 20 && title.length - d < 40) {
        source = title.substring(d + 3).trim();
        title = title.substring(0, d).trim();
      }
    }
    out.push({ title, source });
  }
  return out;
}

const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/** What the voice says: "Here are the top headlines. One. … Two. …". */
export function read(list: Item[] | null | undefined, name: string): string {
  if (!list || list.length === 0) return "There's no news to read yet.";
  let b = 'Here are the ' + (name === 'Top stories' ? 'top' : name) + ' headlines. ';
  for (let i = 0; i < list.length && i < NUMBERS.length; i++) {
    const it = list[i];
    b += NUMBERS[i] + '. ' + it.title;
    if (!it.title.endsWith('.') && !it.title.endsWith('?') && !it.title.endsWith('!')) b += '.';
    if (it.source !== '') b += ' From ' + it.source + '.';
    b += ' ';
  }
  return b.trim();
}

/** One headline, for tapping it in the box. */
export function readOne(it: Item): string {
  return it.title + (it.source === '' ? '' : '. From ' + it.source) + '.';
}

/** "12 min ago" for the box; "" when never fetched. */
export function age(at: number, now: number): string {
  if (at <= 0) return '';
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return f('%1$s min ago', m);
  const h = Math.floor(m / 60);
  return h < 48 ? f('%1$s h ago', h) : f('%1$s days ago', Math.floor(h / 24));
}

/** The box heading: "TOP NEWS · 12 min ago". */
export function heading(topic: string, at: number, now: number, online = true): string {
  const name = topicName(topic);
  const a = age(at, now);
  return (name === 'Top stories' ? t('TOP NEWS') : f('%1$s NEWS', t(name).toUpperCase())) + (a === '' ? '' : '  ·  ' + a + (online ? '' : t(', offline')));
}

/** The kept headlines as stored: one "title<TAB>source" per line. */
export function encode(list: Item[]): string {
  return list.map((it) => it.title.replaceAll('\t', ' ') + '\t' + it.source.replaceAll('\n', ' ') + '\n').join('');
}

export function decode(s: string): Item[] {
  const out: Item[] = [];
  for (const line of s.split('\n')) {
    const t = line.indexOf('\t');
    if (t > 0) out.push({ title: line.substring(0, t), source: line.substring(t + 1) });
  }
  return out;
}

// ------------------------------------------------------------------ the shared headlines

/** The headlines on screen, newest fetch; at = when they were fetched (0 = never). */
export const state = { items: [] as Item[], at: 0, version: 0, busy: false, tried: 0, loaded: false };
const listeners = new Set<() => void>();

/** Called on every change (for boxes to redraw); returns the unsubscribe. */
export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function changed() {
  state.version++;
  for (const f of listeners) f();
}

/** Fetches a page as text; the app passes fetch, tests a fake. */
export type Get = (url: string) => Promise<string>;

export const get: Get = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'OpenRath (car head unit; open source home screen)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
};

/**
 * Load the kept headlines once, then fetch new ones if they are old (or `force`) and there is
 * internet. Resolves when done; a failure keeps the last headlines.
 */
export async function refresh(p: Prefs, force: boolean, now = Date.now(), fetchText: Get = get, online = true): Promise<void> {
  if (!state.loaded) {
    state.loaded = true;
    const l = decode(p.str('newsCache', ''));
    if (l.length > 0) {
      state.items = l;
      state.at = num(p, 'newsAt', 0);
      changed();
    }
  }
  if (state.busy || !Features.on(p, 'news')) return;
  if (!force && (now - state.at < FRESH_MS || now - state.tried < RETRY_MS)) return;
  if (!online) return;
  state.tried = now;
  state.busy = true;
  const topic = p.str('newsTopic', 'top');
  try {
    const l = parse(await fetchText(url(topic)), COUNT);
    if (l.length > 0) {
      state.items = l;
      state.at = now;
      p.put('newsCache', encode(l));
      p.put('newsAt', String(state.at));
      changed();
    }
  } catch {
    // offline or blocked: keep the last headlines
  } finally {
    state.busy = false;
  }
}

/** Show another topic: the next refresh fetches it straight away. */
export function setTopic(p: Prefs, topic: string): void {
  p.put('newsTopic', topic);
  state.at = 0;
  changed();
}
