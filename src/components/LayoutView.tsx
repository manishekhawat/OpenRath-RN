/**
 * A picture layout on screen (port of LayoutView.java; see src/logic/layouts.ts): the background
 * picture, the parts' round and card shapes, and what they show, all drawn with
 * react-native-svg in a 1024 x 600 design that is scaled to the screen and centred. While the
 * car moves, the road lines run and the background drifts gently, if those are switched on.
 *
 * Differences from the Android drawing, where a canvas could do more than SVG does here:
 * - soft shadows under the shapes are a plain offset shape, not a blur;
 * - text is measured from average letter widths, so "…" shortening is approximate;
 * - the music parts show their "Nothing playing" state: what's playing comes from media
 *   sessions, which need a native module (see PORTING.md). Tapping opens the chosen music app;
 * - weather and dock icons are drawn as shapes in one colour instead of the chrome pictures,
 *   and the logo part always shows the OpenRath wheel (the brand badges are pictures);
 * - favourite apps show the app's icon from expo-intent-launcher, or its first letter;
 * - "Your own pictures" as the background (layWall) is left out (the layout's own picture shows);
 *   air pressure, altitude and tyre pressures show "--" (no barometer, GPS altitude or TPMS yet).
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { cloneElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Image as SvgImage,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import data from '../data/layouts.json';
import * as Features from '../logic/features';
import { mapsLink, routeLink } from '../logic/geo';
import * as Layouts from '../logic/layouts';
import type { Layout, Part } from '../logic/layouts';
import type { Look, Pack } from '../logic/theme';
import type { Wx } from '../logic/weather';
import { useDrive } from '../state/drive';
import { packPicture } from '../state/look';
import { usePrefs } from '../state/prefs';
import { useWeather } from '../state/weather';
import { Button, Field } from './ui';

const { W, H } = Layouts;

/** Every layout from src/data/layouts.json. */
export const LAYOUTS: Layout[] = Layouts.parseAll(data);

/** The layout to show instead of the boxes, or null for the boxes. */
export function useLayout(): Layout | null {
  const { prefs, version } = usePrefs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Layouts.chosen(prefs, LAYOUTS), [prefs, version]);
}

/** The pictures from art/scenes.py, by name (assets/layouts). */
export const PICTURES: Record<string, number> = {
  bubbles: require('../../assets/layouts/bubbles.jpg'),
  bubbles_pill: require('../../assets/layouts/bubbles_pill.jpg'),
  scenery: require('../../assets/layouts/scenery.jpg'),
  columns: require('../../assets/layouts/columns.jpg'),
  picture_clock: require('../../assets/layouts/picture_clock.jpg'),
  strip: require('../../assets/layouts/strip.jpg'),
  twin_dials: require('../../assets/layouts/twin_dials.jpg'),
  room: require('../../assets/layouts/room.jpg'),
  big_clock: require('../../assets/layouts/big_clock.jpg'),
  lyrics: require('../../assets/layouts/lyrics.jpg'),
  cards: require('../../assets/layouts/cards.jpg'),
  car_rear_silver: require('../../assets/layouts/car_rear_silver.png'),
  car_rear_white: require('../../assets/layouts/car_rear_white.png'),
  car_rear_grey: require('../../assets/layouts/car_rear_grey.png'),
};

/** Small pictures of each layout for the gallery (art/layout_preview.py). */
export const PREVIEWS: Record<string, number> = {
  bubbles: require('../../assets/layouts/prev_bubbles.jpg'),
  scenery: require('../../assets/layouts/prev_scenery.jpg'),
  columns: require('../../assets/layouts/prev_columns.jpg'),
  picture_clock: require('../../assets/layouts/prev_picture_clock.jpg'),
  strip: require('../../assets/layouts/prev_strip.jpg'),
  twin_dials: require('../../assets/layouts/prev_twin_dials.jpg'),
  room: require('../../assets/layouts/prev_room.jpg'),
  big_clock: require('../../assets/layouts/prev_big_clock.jpg'),
  lyrics: require('../../assets/layouts/prev_lyrics.jpg'),
  cards: require('../../assets/layouts/prev_cards.jpg'),
};

// ------------------------------------------------------------------ drawing helpers

type Weight = 'light' | 'reg' | 'med' | 'bold';
const WEIGHT: Record<Weight, '300' | '400' | '500' | '700'> = { light: '300', reg: '400', med: '500', bold: '700' };
/** Average letter width per point of size, for fitting text (Roboto). */
const AVG: Record<Weight, number> = { light: 0.5, reg: 0.52, med: 0.54, bold: 0.56 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function charW(c: string, size: number, wt: Weight): number {
  if (c === ' ') return size * 0.26;
  if (/[il.,:;'|!]/.test(c)) return size * 0.26;
  if (/[mwMW]/.test(c)) return size * 0.86;
  if (/[A-Z]/.test(c)) return size * (AVG[wt] + 0.1);
  if (/[0-9]/.test(c)) return size * 0.56;
  return size * AVG[wt];
}

export function width(s: string, size: number, wt: Weight = 'reg'): number {
  let w = 0;
  for (const c of s) w += charW(c, size, wt);
  return w;
}

/** The text shortened with "…" to fit maxw at that size. */
export function fit(s: string | null | undefined, size: number, maxw: number, wt: Weight = 'reg'): string {
  if (!s) return '';
  if (width(s, size, wt) <= maxw) return s;
  let t = s;
  while (t.length > 0 && width(t + '…', size, wt) > maxw) t = t.substring(0, t.length - 1);
  return t.trimEnd() + '…';
}

/** Collects drawn elements with keys, and the places that do something when tapped. */
class Pen {
  els: ReactElement[] = [];
  hits: { x: number; y: number; w: number; h: number; action: string }[] = [];
  private n = 0;
  constructor(private prefix: string) {}
  id(): string {
    return `${this.prefix}${this.n++}`;
  }
  add(e: ReactElement): void {
    this.els.push(cloneElement(e, { key: this.n++ }));
  }
  hit(x: number, y: number, w: number, h: number, action: string): void {
    this.hits.push({ x, y, w, h, action });
  }
}

/**
 * Text placed like PIL's anchors: first letter l/m/r (left, middle, right), second t (top),
 * m (middle), s (baseline) or b (bottom).
 */
function text(c: Pen, s: string | null | undefined, x: number, y: number, size: number, ink: string, wt: Weight, anchor: string) {
  if (!s) return;
  const hz = anchor[0];
  const vt = anchor[1];
  // Roboto's ascent and descent are about 0.93 and 0.24 of the size
  const base = vt === 'm' ? y + size * 0.342 : vt === 't' || vt === 'a' ? y + size * 0.928 : vt === 'b' ? y - size * 0.244 : y;
  c.add(
    <SvgText x={x} y={base} fontSize={size} fill={ink} fontWeight={WEIGHT[wt]} textAnchor={hz === 'm' ? 'middle' : hz === 'r' ? 'end' : 'start'}>
      {s}
    </SvgText>,
  );
}

/** A point on a circle at an Android canvas angle (degrees, clockwise from 3 o'clock). */
function at(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** An arc like Canvas.drawArc: from `start` degrees, `sweep` degrees clockwise. */
function arc(cx: number, cy: number, r: number, start: number, sweep: number): string {
  const [x0, y0] = at(cx, cy, r, start);
  const [x1, y1] = at(cx, cy, r, start + sweep);
  return `M${x0} ${y0} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
}

/** A colour with its alpha replaced. */
function faded(col: string, alpha: number): string {
  return col.substring(0, 7) + Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  shape?: string;
  fill: string;
  fill2: string;
  alpha: number;
}

/** A part's background: a circle or rounded card, with a top-to-bottom gradient and a shadow. */
function shape(c: Pen, p: Box, has: boolean, shadow: boolean) {
  if (!has) return;
  const circle = p.shape === 'circle';
  const geo = (dy: number, fill: string, opacity: number) =>
    circle ? (
      <Ellipse cx={p.x + p.w / 2} cy={p.y + p.h / 2 + dy} rx={p.w / 2} ry={p.h / 2} fill={fill} opacity={opacity} />
    ) : (
      <Rect x={p.x} y={p.y + dy} width={p.w} height={p.h} rx={p.r} ry={p.r} fill={fill} opacity={opacity} />
    );
  if (shadow) c.add(geo(6, '#000000', 0.12 * p.alpha));
  if (p.fill === p.fill2) return c.add(geo(0, p.fill, p.alpha));
  const id = c.id();
  c.add(
    <Defs>
      <LinearGradient id={id} x1={0} y1={p.y} x2={0} y2={p.y + p.h} gradientUnits="userSpaceOnUse">
        <Stop offset={0} stopColor={p.fill} />
        <Stop offset={1} stopColor={p.fill2} />
      </LinearGradient>
    </Defs>,
  );
  c.add(geo(0, `url(#${id})`, p.alpha));
}

/** A clip path for a circle or rounded rectangle; returns the url to use. */
function clip(c: Pen, x: number, y: number, w: number, h: number, circle: boolean, radius: number): string {
  const id = c.id();
  c.add(
    <Defs>
      <ClipPath id={id}>
        {circle ? <Ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} /> : <Path d={roundRect(x, y, w, h, radius)} />}
      </ClipPath>
    </Defs>,
  );
  return `url(#${id})`;
}

function image(c: Pen, src: number | { uri: string }, x: number, y: number, w: number, h: number, circle: boolean, radius: number) {
  const cp = circle || radius > 0 ? clip(c, x, y, w, h, circle, radius) : undefined;
  c.add(<SvgImage href={src} x={x} y={y} width={w} height={h} preserveAspectRatio="none" clipPath={cp} />);
}

// ------------------------------------------------------------------ glyphs (a 24-unit box)

const gearPath = (() => {
  let d = '';
  for (let i = 0; i < 48; i++) {
    const an = (i / 48) * 2 * Math.PI;
    const r = Math.floor(i / 3) % 2 === 0 ? 9.5 : 7.6;
    d += `${i === 0 ? 'M' : 'L'}${(12 + r * Math.cos(an)).toFixed(2)} ${(12 + r * Math.sin(an)).toFixed(2)}`;
  }
  return d + 'Z M15.4 12 A3.4 3.4 0 1 0 8.6 12 A3.4 3.4 0 1 0 15.4 12 Z';
})();

/** The dock and media glyphs of LayoutView.glyph, drawn at (x, y) in a size x size box. */
export function Glyph({ name, x, y, size, ink }: { name: string; x: number; y: number; size: number; ink: string }) {
  const st = { stroke: ink, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: ReactElement | null = null;
  if (name === 'navi') body = <Path d="M12 3L20 21L12 16.5L4 21Z" fill={ink} />;
  else if (name === 'music')
    body = (
      <G>
        <Path d="M9 17L9 5L19 3L19 15" {...st} />
        <Ellipse cx={6.6} cy={17} rx={3} ry={2.4} fill={ink} />
        <Ellipse cx={16.6} cy={15} rx={3} ry={2.4} fill={ink} />
      </G>
    );
  else if (name === 'radio')
    body = (
      <G>
        <Rect x={3} y={8} width={18} height={12} rx={2} {...st} />
        <Circle cx={8.5} cy={14} r={3} {...st} />
        <Path d="M14 12L18.5 12M14 16L18.5 16M6 8L17 3" {...st} />
      </G>
    );
  else if (name === 'bt') body = <Path d="M7 7L17 16.5L12 21.5L12 2.5L17 7.5L7 17" {...st} />;
  else if (name === 'phone')
    body = (
      <G>
        <Path d="M14.78 21.95A14 14 0 0 1 2.05 9.22" {...st} strokeWidth={4} />
        <Circle cx={6.5} cy={5.5} r={3} fill={ink} />
        <Circle cx={18.5} cy={17.5} r={3} fill={ink} />
      </G>
    );
  else if (name === 'apps')
    body = (
      <G>
        {[0, 1].flatMap((ix) =>
          [0, 1].map((iy) => <Rect key={`${ix}${iy}`} x={3.5 + ix * 9.5} y={3.5 + iy * 9.5} width={7} height={7} rx={2.2} fill={ink} />),
        )}
      </G>
    );
  else if (name === 'settings') body = <Path d={gearPath} fill={ink} fillRule="evenodd" />;
  else if (name === 'user')
    body = (
      <G>
        <Circle cx={12} cy={7} r={4} {...st} />
        <Path d="M4 21A8 8 0 0 1 20 21" {...st} />
      </G>
    );
  else if (name === 'dash')
    body = (
      <G>
        <Rect x={3} y={11} width={18} height={7} rx={2} {...st} />
        <Path d="M6 11L8 6L16 6L18 11" {...st} />
        <Circle cx={7.5} cy={19} r={2} fill={ink} />
        <Circle cx={16.5} cy={19} r={2} fill={ink} />
      </G>
    );
  else if (name === 'mirror')
    body = (
      <G>
        <Rect x={2} y={4} width={16} height={11} rx={1.5} {...st} />
        <Path d="M7 19L13 19M10 15L10 19" {...st} />
        <Rect x={15.5} y={9} width={6.5} height={12} rx={1.5} fill={ink} />
      </G>
    );
  else if (name === 'home') body = <Path d="M4 11L12 4L20 11L20 20L4 20Z" {...st} />;
  else if (name === 'office')
    body = (
      <G>
        <Rect x={6} y={4} width={12} height={17} {...st} strokeLinecap="butt" strokeLinejoin="miter" />
        <Path d="M9 8L15 8M9 12L15 12M9 16L15 16" {...st} strokeWidth={1} />
      </G>
    );
  else if (name === 'play') body = <Path d="M7 4L20 12L7 20Z" fill={ink} />;
  else if (name === 'pause')
    body = (
      <G>
        <Rect x={6} y={4} width={4} height={16} fill={ink} />
        <Rect x={14} y={4} width={4} height={16} fill={ink} />
      </G>
    );
  else if (name === 'next' || name === 'prev')
    body = (
      <G transform={name === 'prev' ? 'translate(24 0) scale(-1 1)' : undefined}>
        <Path d="M4 4L16 12L4 20Z" fill={ink} />
        <Rect x={17} y={4} width={3} height={16} fill={ink} />
      </G>
    );
  if (!body) return null;
  return <G transform={`translate(${x} ${y}) scale(${size / 24})`}>{body}</G>;
}

function glyph(c: Pen, name: string, x: number, y: number, size: number, ink: string) {
  c.add(<Glyph name={name} x={x} y={y} size={size} ink={ink} />);
}

/** The weather icons (art/lib/weather.py), in one light colour instead of chrome. */
export function WeatherIcon({ name, x, y, size, ink = '#D9DDE3' }: { name: string; x: number; y: number; size: number; ink?: string }) {
  const lw = 0.055;
  const sun = (cx: number, cy: number, r: number) => (
    <G>
      <Circle cx={cx} cy={cy} r={r * 0.5} fill={ink} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <Line key={i} x1={cx + Math.cos(a) * r * 0.7} y1={cy + Math.sin(a) * r * 0.7} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke={ink} strokeWidth={lw} />
        );
      })}
    </G>
  );
  const cloud = (cx: number, cy: number, r: number) => (
    <G>
      <Ellipse cx={cx - r * 0.1} cy={cy - r * 0.3} rx={r * 0.45} ry={r * 0.45} fill={ink} />
      <Ellipse cx={cx - r * 0.6} cy={cy + r * 0.05} rx={r * 0.4} ry={r * 0.4} fill={ink} />
      <Rect x={cx - r} y={cy - r * 0.05} width={r * 1.9} height={r * 0.5} rx={r * 0.25} fill={ink} />
      <Ellipse cx={cx + r * 0.45} cy={cy - r * 0.05} rx={r * 0.45} ry={r * 0.45} fill={ink} />
    </G>
  );
  let body: ReactElement;
  if (name === 'w_sun') body = sun(0.5, 0.5, 0.4);
  else if (name === 'w_moon') body = <Path d="M0.62 0.19A0.32 0.32 0 1 0 0.81 0.62A0.31 0.31 0 0 1 0.62 0.19Z" fill={ink} />;
  else if (name === 'w_partly')
    body = (
      <G>
        {sun(0.62, 0.36, 0.26)}
        {cloud(0.45, 0.62, 0.3)}
      </G>
    );
  else if (name === 'w_rain' || name === 'w_snow' || name === 'w_storm')
    body = (
      <G>
        {cloud(0.5, 0.4, 0.32)}
        {name === 'w_rain'
          ? [0, 1, 2].map((i) => <Line key={i} x1={0.32 + i * 0.18} y1={0.7} x2={0.26 + i * 0.18} y2={0.9} stroke={ink} strokeWidth={lw} />)
          : name === 'w_snow'
            ? [0, 1, 2].map((i) => <Circle key={i} cx={0.32 + i * 0.18} cy={0.8} r={0.04} fill={ink} />)
            : [<Path key={0} d="M0.52 0.6L0.38 0.8L0.5 0.8L0.44 0.98L0.64 0.72L0.52 0.72Z" fill={ink} />]}
      </G>
    );
  else if (name === 'w_fog')
    body = (
      <G>
        {[0, 1, 2, 3].map((i) => (
          <Rect key={i} x={0.15 + (i % 2) * 0.08} y={0.3 + i * 0.14} width={0.7 - (i % 2) * 0.16} height={0.06} rx={0.03} fill={ink} />
        ))}
      </G>
    );
  else body = cloud(0.5, 0.525, 0.36);
  return <G transform={`translate(${x} ${y}) scale(${size})`}>{body}</G>;
}

/** Hub.weatherIcon: the picture for a WMO weather code. */
export function weatherIcon(c: number, day: boolean): string {
  if (c === 0) return day ? 'w_sun' : 'w_moon';
  if (c <= 2) return day ? 'w_partly' : 'w_moon';
  if (c === 3) return 'w_cloud';
  if (c <= 48) return 'w_fog';
  if (c <= 67 || (c >= 80 && c <= 82)) return 'w_rain';
  if (c <= 86) return 'w_snow';
  return 'w_storm';
}

function icon(c: Pen, name: string | null, x: number, y: number, size: number) {
  c.add(<WeatherIcon name={name ?? 'w_cloud'} x={x} y={y} size={size} />);
}

// ------------------------------------------------------------------ live values

/** What a layout shows, gathered once a render (Hub and Drive in the Android version). */
interface Live {
  now: Date;
  h24: boolean;
  speed: string;
  heading: number;
  lat: number;
  lon: number;
  todayKm: number;
  temp: string;
  desc: string;
  place: string;
  humidity: string;
  wind: string;
  pressure: string;
  icon: string;
  /** {date, icon, hi, lo} by day, today first */
  forecast: [string, string, string, string][];
  driver: string;
  /** tyre unit */
  tpmsUnit: string;
}

/** What's playing: always nothing here, until a media session module is ported. */
const NOW = { title: 'Nothing playing', sub: 'Tap to choose music', playing: false, radio: false, progress: -1 };

const pad = (n: number) => String(n).padStart(2, '0');

function time(l: Live): string {
  const h = l.now.getHours();
  return l.h24 ? `${pad(h)}:${pad(l.now.getMinutes())}` : `${h % 12 || 12}:${pad(l.now.getMinutes())}`;
}

const dMMM = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const weekday = (d: Date) => WEEKDAYS[d.getDay()];

function direction(l: Live): string {
  return l.heading < 0 ? '--' : Layouts.compass(l.heading) + '  ' + Math.round(l.heading) + '°';
}

const today = (l: Live) => (l.forecast.length > 0 ? l.forecast[0] : null);
const hi = (l: Live) => today(l)?.[2] ?? '';
const lo = (l: Live) => today(l)?.[3] ?? '';
const range = (l: Live) => (today(l) ? lo(l) + '–' + hi(l) : '');

function lastWord(s: string): string {
  const w = s.trim().split(' ');
  return w[w.length - 1];
}

function is24h(): boolean {
  try {
    const o = Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as { hourCycle?: string; hour12?: boolean };
    return o.hourCycle ? o.hourCycle === 'h23' || o.hourCycle === 'h24' : o.hour12 === false;
  } catch {
    return false;
  }
}

function live(wx: Wx | null, place: string, trip: ReturnType<typeof useDrive>['trip'], driver: string, tpmsUnit: string, now: Date): Live {
  const fresh = trip.last != null && now.getTime() - trip.last.t < 5000;
  return {
    now,
    h24: is24h(),
    speed: fresh ? String(Math.round(trip.kmh)) : '--',
    heading: trip.heading,
    lat: trip.lat,
    lon: trip.lon,
    todayKm: trip.todayKm,
    temp: wx ? wx.temp + '°' : '--°',
    desc: wx ? wx.text : 'Weather',
    place,
    humidity: wx ? Math.round(wx.humidity) + '%' : '',
    wind: wx ? Math.round(wx.wind) + ' km/h' : '',
    pressure: '',
    icon: wx ? weatherIcon(wx.code, wx.isDay) : 'w_cloud',
    forecast: wx ? wx.daily.map((d) => [d.date, weatherIcon(d.code, true), Math.round(d.max) + '°', Math.round(d.min) + '°']) : [],
    driver,
    tpmsUnit,
  };
}

// ------------------------------------------------------------------ the still layer

function drawStill(c: Pen, lay: Layout, p: Part, prefs: ReturnType<typeof usePrefs>['prefs']) {
  shape(c, p, p.hasFill, lay.light || p.alpha > 0.8);
  const k = p.kind;
  if (k === 'picture' || k === 'car') {
    const src = PICTURES[p.src];
    if (src != null) image(c, src, p.x, p.y, p.w, p.h, false, k === 'picture' ? p.r : 0);
  } else if (k === 'logo') logo(c, p);
  else if (k === 'dock') dockStill(c, p, prefs);
  else if (k === 'gear') glyph(c, 'settings', p.x, p.y, p.w, p.ink);
  else if (k === 'apps') glyph(c, 'apps', p.x + p.w / 2 - p.w * 0.2, p.y + p.h / 2 - p.w * 0.2, p.w * 0.4, p.ink);
  else if (k === 'places') {
    glyph(c, 'home', p.x, p.y + 10, 30, p.ink);
    glyph(c, 'office', p.x + p.w - 50, p.y + 10, 30, p.ink);
  } else if (k === 'music' && p.style === 'card') {
    shape(c, { x: p.x, y: p.y + p.h + 12, w: p.w, h: 70, r: 8, fill: '#151A22', fill2: '#151A22', alpha: 0.9 }, true, false);
  } else if (k === 'music' && p.style === 'record') {
    const r = Math.min(p.w, p.h) * 0.36;
    const cx = p.x + p.w / 2;
    c.add(<Ellipse cx={cx} cy={p.y + 10 + r} rx={r + 8} ry={r + 8} fill="#FFFFFF" opacity={0.9} />);
  } else if (k === 'weather' && p.style === 'calendar') {
    for (const dx of [0.3, 0.7]) c.add(<Circle cx={p.x + p.w * dx} cy={p.y + 13} r={5} fill="#8A8076" />);
    c.add(<Line x1={p.x + 6} y1={p.y + 30} x2={p.x + p.w - 6} y2={p.y + 30} stroke="#CFC6BA" strokeWidth={1} />);
  } else if (k === 'weather' && p.style === 'bubble') {
    // a soft sun glow inside the bubble's top right
    const cp = clip(c, p.x, p.y, p.w, p.h, true, 0);
    c.add(
      <Ellipse cx={p.x + p.w * 0.85} cy={p.y + p.h * 0.15} rx={p.w * 0.3} ry={p.h * 0.3} fill="#FFD66E" opacity={0.59} clipPath={cp} />,
    );
  }
}

function logo(c: Pen, p: Part) {
  c.add(<Ellipse cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={p.w / 2 - 4} ry={p.h / 2 - 4} stroke={p.ink} strokeWidth={2} fill="none" />);
  // the OpenRath wheel (the Android version shows a brand's badge when one is built in)
  const k = (p.h * 0.5) / 24;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const [ro, ri] of [
    [11.8, 9.6],
    [4.0, 2.2],
  ])
    c.add(<Circle cx={cx} cy={cy} r={((ro + ri) / 2) * k} stroke={p.ink} strokeWidth={(ro - ri) * k} fill="none" />);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    c.add(
      <Line
        x1={cx + Math.cos(a) * 3.6 * k}
        y1={cy + Math.sin(a) * 3.6 * k}
        x2={cx + Math.cos(a) * 9.9 * k}
        y2={cy + Math.sin(a) * 9.9 * k}
        stroke={p.ink}
        strokeWidth={1.5 * k}
      />,
    );
  }
}

function dockStill(c: Pen, p: Part, prefs: ReturnType<typeof usePrefs>['prefs']) {
  const items = Layouts.dockItems(prefs, p);
  const n = items.length + (p.clock ? 1 : 0);
  const size = Math.min(p.h * 0.5, 34);
  items.forEach((it, i) => {
    const cx = p.x + (p.w * (i + 0.5)) / n;
    if (p.tiles) shape(c, { x: cx - p.h / 2, y: p.y, w: p.h, h: p.h, r: 8, fill: p.fill, fill2: p.fill, alpha: p.alpha }, true, false);
    const gy = p.y + (p.h - size) / 2 - (p.labels ? 8 : 0);
    glyph(c, it, cx - size / 2, gy, size, p.ink);
    if (p.labels) text(c, Layouts.label(it), cx, gy + size + 16, 13, p.ink, 'med', 'mm');
  });
}

// ------------------------------------------------------------------ live parts

function clock(c: Pen, p: Part, l: Live) {
  const { x, y, w, h } = p;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const st = p.style || 'digital';
  const d = l.now;
  if (st === 'digital') {
    text(c, time(l), cx, cy - 6, h * 0.26, p.ink, 'med', 'mm');
    text(c, dMMM(d), cx, cy + h * 0.17, h * 0.09, p.sub, 'reg', 'mm');
  } else if (st === 'digital-line') {
    text(c, time(l), x, y + h * 0.5, h * 0.62, p.ink, 'med', 'ls');
    text(c, weekday(d) + '   ' + dMMM(d), x + 4, y + h * 0.82, h * 0.14, p.sub, 'reg', 'ls');
  } else if (st === 'analog-date') {
    text(c, weekday(d) + '  ' + dMMM(d), cx, y + 16, 17, p.sub, 'reg', 'mt');
    analog(c, l, cx, y + 60 + (h - 60) / 2, Math.min(w, h - 60) * 0.42, p.ink, p.sub, p.accent, 12, true, null);
  } else if (st === 'analog-digital') {
    const r = h * 0.38;
    analog(c, l, x + 16 + r, cy, r, p.ink, p.sub, p.accent, 12, false, '#FFFFFF');
    text(c, time(l), x + 32 + 2 * r, cy - 2, h * 0.3, p.ink, 'med', 'ls');
    text(c, weekday(d), x + 34 + 2 * r, cy + h * 0.2, h * 0.13, p.sub, 'reg', 'ls');
  } else if (st === 'wall') {
    const r = h * 0.4;
    analog(c, l, x + 20 + r, cy, r, p.ink, p.sub, p.accent, 60, false, '#FFFFFF');
    text(c, pad(d.getMonth() + 1), x + w - 24, cy - 6, h * 0.34, p.ink, 'bold', 'rs');
    text(c, pad(d.getDate()), x + w - 24, cy + h * 0.32, h * 0.34, p.ink, 'bold', 'rs');
  } else if (st === 'analog-big') {
    analog(c, l, cx, cy, Math.min(w, h) / 2, p.ink, p.sub, null, 12, false, null);
  } else if (st === 'analog-dark') {
    analog(c, l, cx, cy, Math.min(w, h) * 0.42, p.ink, p.sub, p.accent, 12, true, null);
  } else if (st === 'digital-analog') {
    text(c, time(l), x, y + h * 0.55, h * 0.38, p.ink, 'med', 'ls');
    text(c, weekday(d), x + 2, y + h * 0.8, h * 0.14, p.sub, 'reg', 'ls');
    const r = h * 0.42;
    analog(c, l, x + w - r - 6, cy, r, p.ink, p.sub, null, 60, false, null);
  }
}

/** An analog clock face: ticks (12, or 60 with every fifth long), optional numbers, three hands. */
function analog(c: Pen, l: Live, cx: number, cy: number, r: number, ink: string, sub: string, accent: string | null, ticks: number, numbers: boolean, face: string | null) {
  if (face) c.add(<Circle cx={cx} cy={cy} r={r} fill={face} />);
  for (let i = 0; i < ticks; i++) {
    const an = (i / ticks) * 2 * Math.PI;
    const major = ticks !== 60 || i % 5 === 0;
    const r0 = r * (major ? 0.86 : 0.92);
    c.add(
      <Line
        x1={cx + Math.sin(an) * r0}
        y1={cy - Math.cos(an) * r0}
        x2={cx + Math.sin(an) * r * 0.97}
        y2={cy - Math.cos(an) * r * 0.97}
        stroke={major ? ink : sub}
        strokeWidth={((major ? 2.4 : 1.2) * r) / 100}
      />,
    );
  }
  if (numbers) {
    for (const n of [12, 3, 6, 9]) {
      const an = (n / 12) * 2 * Math.PI;
      text(c, String(n), cx + Math.sin(an) * r * 0.7, cy - Math.cos(an) * r * 0.7, r * 0.16, ink, 'med', 'mm');
    }
  }
  const d = l.now;
  const hr = (d.getHours() % 12) + d.getMinutes() / 60;
  const mn = d.getMinutes() + d.getSeconds() / 60;
  const hands: [number, number, number, string][] = [
    [hr / 12, 0.5, 4.5, ink],
    [mn / 60, 0.75, 3, ink],
    [d.getSeconds() / 60, 0.85, 1.4, accent ?? sub],
  ];
  for (const [f, len, wd, col] of hands) {
    const an = f * 2 * Math.PI;
    c.add(
      <Line x1={cx} y1={cy} x2={cx + Math.sin(an) * r * len} y2={cy - Math.cos(an) * r * len} stroke={col} strokeWidth={(wd * r) / 100} strokeLinecap="round" />,
    );
  }
  c.add(<Circle cx={cx} cy={cy} r={r * 0.05} fill={ink} />);
}

function weather(c: Pen, p: Part, l: Live) {
  const { x, y, w, h } = p;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const { temp, desc, place } = l;
  const st = p.style;
  if (st === 'bubble') {
    text(c, temp, cx, cy - 4, h * 0.26, p.ink, 'med', 'mm');
    text(c, fit(desc, h * 0.085, w * 0.8), cx, cy + h * 0.17, h * 0.085, p.sub, 'reg', 'mm');
  } else if (st === 'detail') {
    text(c, temp, x + 6, y + 70, 72, p.ink, 'bold', 'ls');
    text(c, place, x + w, y + 18, 14, p.sub, 'reg', 'rt');
    const rows = [
      ['Humidity', l.humidity],
      ['Wind', l.wind],
      ['Air pressure', l.pressure],
    ];
    rows.forEach(([name, v], i) => {
      const yy = y + 118 + i * 38;
      text(c, name, x + 6, yy, 15, p.sub, 'reg', 'lm');
      text(c, v || '--', x + w, yy, 15, p.sub, 'reg', 'rm');
    });
  } else if (st === 'range') {
    text(c, temp, x, y + h * 0.42, h * 0.36, p.ink, 'med', 'ls');
    if (today(l)) text(c, lo(l) + '/' + hi(l), x + 2, y + h * 0.7, h * 0.15, p.sub, 'reg', 'ls');
  } else if (st === 'wide') {
    icon(c, l.icon, x + w - 60, y - 6, 52);
    const t = temp.replace('°', '°C');
    text(c, t, x, y + 40, 40, p.ink, 'med', 'ls');
    text(c, desc, x + width(t, 40, 'med') + 12, y + 40, 15, p.sub, 'reg', 'ls');
    const line2 = place + (l.humidity ? (place ? '  ·  ' : '') + 'humidity ' + l.humidity : '');
    text(c, line2, x + 2, y + 70, 14, p.sub, 'reg', 'ls');
  } else if (st === 'calendar') {
    text(c, today(l) ? range(l) : temp, cx, y + 64, 19, p.ink, 'bold', 'mm');
    icon(c, l.icon, cx - 22, y + 84, 44);
    text(c, fit(lastWord(desc), 12, w - 12), cx, y + 138, 12, p.sub, 'reg', 'mm');
  } else if (st === 'row') {
    icon(c, l.icon, x, y + h / 2 - 30, 60);
    text(c, temp.replace('°', '°C'), x + w - 20, y + h / 2, 40, p.ink, 'med', 'rm');
  } else if (st === 'card') {
    text(c, fit(place, 14, w - 28), x + 16, y + 26, 14, p.sub, 'reg', 'lm');
    text(c, temp, x + 14, y + 74, 46, p.ink, 'med', 'lm');
    icon(c, l.icon, x + 16, y + 98, 28);
    text(c, lastWord(desc) + (today(l) ? '  ' + range(l) : ''), x + 16, y + 136, 13, p.sub, 'reg', 'lm');
  }
}

function forecast(c: Pen, p: Part, l: Live) {
  const f = l.forecast;
  if (f.length < 2) {
    text(c, 'Forecast after the first weather update', p.x + p.w / 2, p.y + p.h / 2, 12, p.sub, 'reg', 'mm');
    return;
  }
  const n = Math.min(4, f.length - 1);
  for (let i = 0; i < n; i++) {
    const d = f[i + 1];
    const cx = p.x + (p.w * (i + 0.5)) / n;
    icon(c, d[1], cx - 20, p.y + 8, 40);
    text(c, d[2], cx, p.y + 66, 16, p.ink, 'med', 'mm');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d[0]);
    const day = m ? DAYS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : d[0];
    text(c, day, cx, p.y + 92, 13, p.sub, 'reg', 'mm');
  }
}

function ring(c: Pen, cx: number, cy: number, r: number, wd: number, frac: number, ink: string, track: string) {
  c.add(<Path d={arc(cx, cy, r, 135, 270)} stroke={track} strokeWidth={wd} fill="none" />);
  if (frac > 0) c.add(<Path d={arc(cx, cy, r, 135, 270 * Math.min(1, frac))} stroke={ink} strokeWidth={wd} fill="none" />);
}

function speedPart(c: Pen, p: Part, l: Live) {
  const { x, y, w, h } = p;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const v = l.speed;
  const frac = (parseInt(v, 10) || 0) / 180;
  const st = p.style;
  c.hit(x, y, w, h, 'dock:navi');
  if (st === 'ring') {
    ring(c, cx, cy, w * 0.4, w * 0.035, frac, '#FFFFFF', '#FFFFFF55');
    text(c, v, cx, cy - 6, h * 0.27, p.ink, 'med', 'mm');
    text(c, 'km/h', cx, cy + h * 0.17, h * 0.085, p.sub, 'reg', 'mm');
  } else if (st === 'number') {
    text(c, v, cx, y + h * 0.72, h * 0.8, p.ink, 'med', 'ms');
    text(c, 'km/h', cx, y + h * 0.95, h * 0.13, p.sub, 'reg', 'ms');
  } else if (st === 'badge') {
    text(c, v + ' km/h', cx, cy, h * 0.38, p.ink, 'med', 'mm');
  } else if (st === 'gauge-small') {
    const r = h * 0.36;
    ring(c, x + 18 + r, cy, r, 4, frac, p.accent, '#00000022');
    text(c, v, x + 18 + r, cy - 2, r * 0.62, p.ink, 'med', 'mm');
    text(c, 'km/h', x + 18 + r, cy + r * 0.5, 10, p.sub, 'reg', 'mm');
    text(c, direction(l), x + w - 16, cy - 10, 15, p.ink, 'med', 'rm');
    text(c, '--', x + w - 16, cy + 16, 13, p.sub, 'reg', 'rm'); // altitude: not known here
  } else if (st === 'dial') {
    const r = w / 2;
    for (let i = 0; i <= 180; i += 10) {
      const an = ((225 - (i / 180) * 270) * Math.PI) / 180;
      const major = i % 20 === 0;
      const r0 = r * (major ? 0.78 : 0.82);
      c.add(
        <Line
          x1={cx + Math.cos(an) * r0}
          y1={cy - Math.sin(an) * r0}
          x2={cx + Math.cos(an) * r * 0.88}
          y2={cy - Math.sin(an) * r * 0.88}
          stroke={major ? p.ink : p.sub}
          strokeWidth={major ? 3 : 1.5}
        />,
      );
      if (major) text(c, String(i), cx + Math.cos(an) * r * 0.66, cy - Math.sin(an) * r * 0.66, r * 0.085, i < 140 ? p.sub : p.accent, 'med', 'mm');
    }
    if (frac > 0) c.add(<Path d={arc(cx, cy, r * 0.93, 135, 270 * Math.min(1, frac))} stroke={p.accent} strokeWidth={5} fill="none" />);
    c.add(<Circle cx={cx} cy={cy} r={r * 0.42} stroke={faded(p.sub, 0.6)} strokeWidth={2} fill="none" />);
    text(c, v, cx, cy - 2, r * 0.3, p.ink, 'med', 'mm');
    text(c, 'km/h', cx, cy + r * 0.24, r * 0.09, p.sub, 'reg', 'mm');
  } else if (st === 'row') {
    text(c, v, x, cy + 14, 52, p.ink, 'med', 'ls');
    text(c, 'km/h', x + width(v, 52, 'med') + 12, cy + 14, 15, p.sub, 'reg', 'ls');
  } else if (st === 'card') {
    text(c, v, cx, y + 64, 64, p.ink, 'med', 'mm');
    text(c, 'km/h', cx, y + 104, 15, p.sub, 'reg', 'mm');
    for (const sg of [-1, 1])
      c.add(<Line x1={cx + sg * 14} y1={y + 140} x2={cx + sg * 70} y2={y + h - 20} stroke="#9AC8F0" strokeWidth={2} strokeLinecap="round" />);
    c.add(<SvgImage href={PICTURES.car_rear_white} x={cx - 55} y={y + h - 110} width={110} height={79} preserveAspectRatio="none" />);
  }
}

/** prev, play/pause, next spread over w, each a tap target. */
function controls(c: Pen, x: number, y: number, w: number, size: number, ink: string, playing: boolean) {
  const g = ['prev', playing ? 'pause' : 'play', 'next'];
  const act = ['prev', 'toggle', 'next'];
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (0.12 + 0.38 * i);
    glyph(c, g[i], cx - size / 2, y, size, ink);
    c.hit(cx - size, y - size / 2, size * 2, size * 2, 'media:' + act[i]);
  }
}

/** A record: a dark disc with grooves and the album cover (here the warm stand-in) in the middle. */
function disc(c: Pen, cx: number, cy: number, r: number) {
  c.add(<Circle cx={cx} cy={cy} r={r} fill="#101012" />);
  for (const f of [0.92, 0.84, 0.76]) c.add(<Circle cx={cx} cy={cy} r={r * f} stroke="#28282C" strokeWidth={1} fill="none" />);
  cover(c, cx - r * 0.62, cy - r * 0.62, r * 1.24, r * 1.24, true, 0);
}

/** The album cover's stand-in: a warm gradient with a soft sun. */
function cover(c: Pen, x: number, y: number, w: number, h: number, circle: boolean, radius: number) {
  const cp = clip(c, x, y, w, h, circle, radius);
  const id = c.id();
  c.add(
    <Defs>
      <LinearGradient id={id} x1={0} y1={y} x2={0} y2={y + h} gradientUnits="userSpaceOnUse">
        <Stop offset={0} stopColor="#283C78" />
        <Stop offset={1} stopColor="#DC6E50" />
      </LinearGradient>
    </Defs>,
  );
  c.add(
    <G clipPath={cp}>
      <Rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />
      <Ellipse cx={x + w * 0.525} cy={y + h * 0.475} rx={w * 0.275} ry={h * 0.275} fill="#FABE78" />
    </G>,
  );
}

function bar(c: Pen, x0: number, x1: number, y: number, frac: number, ink: string, track: string | null, wd: number) {
  if (track) c.add(<Line x1={x0} y1={y} x2={x1} y2={y} stroke={track} strokeWidth={wd / 2} strokeLinecap="round" />);
  if (frac < 0) return;
  c.add(<Line x1={x0} y1={y} x2={x0 + (x1 - x0) * frac} y2={y} stroke={ink} strokeWidth={wd} strokeLinecap="round" />);
}

function music(c: Pen, p: Part) {
  const { x, y, w, h } = p;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const n = NOW;
  const t = n.title;
  const ar = n.sub;
  const { ink, sub } = p;
  c.hit(x, y, w, h, 'media:open');
  const st = p.style;
  if (st === 'pill') {
    disc(c, x + h / 2, cy, h * 0.38);
    const tx = x + h + 6;
    const tw = w - h - 30;
    glyph(c, n.radio ? 'radio' : 'music', tx, y + 36, 18, ink);
    text(c, n.radio ? 'Radio' : 'Music', tx + 26, y + 45, 15, ink, 'med', 'lm');
    text(c, fit(t, 22, tw, 'med'), tx, y + 88, 22, ink, 'med', 'lm');
    c.add(<Line x1={tx} y1={y + 116} x2={tx + 60} y2={y + 116} stroke={p.accent} strokeWidth={3} strokeLinecap="round" />);
    controls(c, tx, y + 136, tw, 24, ink, n.playing);
  } else if (st === 'float') {
    text(c, fit(t, 30, w - 36, 'bold'), x + 18, y + 40, 30, ink, 'bold', 'lm');
    text(c, fit(ar, 15, w - 36), x + 18, y + 76, 15, sub, 'reg', 'lm');
    controls(c, x + 18, y + 112, w - 36, 24, ink, n.playing);
  } else if (st === 'card') {
    cover(c, x + 8, y + 8, w - 16, h - 90, false, 4);
    text(c, fit(t, 20, w - 20, 'bold'), cx, y + h - 56, 20, ink, 'bold', 'mm');
    text(c, fit(ar, 13, w - 20), cx, y + h - 28, 13, sub, 'reg', 'mm');
    controls(c, x + 10, y + h + 32, w - 20, 30, ink, n.playing);
  } else if (st === 'row') {
    const sz = Math.min(70, h - 64);
    cover(c, x + 14, y + 12, sz, sz, false, 6);
    text(c, fit(t, 17, w - sz - 40, 'med'), x + 26 + sz, y + 12 + sz * 0.35, 17, ink, 'med', 'lm');
    text(c, fit(ar, 12, w - sz - 40), x + 26 + sz, y + 12 + sz * 0.75, 12, sub, 'reg', 'lm');
    controls(c, x + 10, y + h - 42, w - 20, 22, ink, n.playing);
    bar(c, x + 14, x + w - 14, y + h - 8, n.progress, ink, null, 3);
  } else if (st === 'dial') {
    const r = w / 2;
    disc(c, cx, cy, r * 0.62);
    c.add(<Circle cx={cx} cy={cy} r={r * 0.98} stroke="#5A6A80" strokeWidth={4} fill="none" />);
    text(c, fit(t, r * 0.11, r * 1.2, 'med'), cx, y + r * 0.26, r * 0.11, ink, 'med', 'mm');
    text(c, fit(ar, r * 0.11, r * 1.2, 'med'), cx, y + h - r * 0.26, r * 0.11, ink, 'med', 'mm');
    glyph(c, 'prev', x + r * 0.1, cy - 14, 28, ink);
    glyph(c, 'next', x + w - r * 0.1 - 28, cy - 14, 28, ink);
    glyph(c, n.playing ? 'pause' : 'play', cx - 16, cy - 16, 32, '#FFFFFF');
    c.hit(x + r * 0.1 - 10, cy - 30, 48, 60, 'media:prev');
    c.hit(x + w - r * 0.1 - 38, cy - 30, 48, 60, 'media:next');
    c.hit(cx - 36, cy - 36, 72, 72, 'media:toggle');
  } else if (st === 'record') {
    const r = Math.min(w, h) * 0.36;
    disc(c, cx, y + 10 + r, r);
    text(c, fit(t, 17, w - 10, 'med'), cx, y + 2 * r + 46, 17, sub, 'med', 'mm');
    bar(c, x + 10, x + w - 10, y + 2 * r + 72, n.progress, ink, faded(sub, 0.4), 2);
    controls(c, x + 10, y + 2 * r + 92, w - 20, 30, ink, n.playing);
  } else if (st === 'list') {
    glyph(c, n.radio ? 'radio' : 'music', x, y + 8, 30, ink);
    text(c, fit(t, 20, w - 60, 'med'), x + w - 20, y + 24, 20, ink, 'med', 'rm');
    controls(c, x - 6, y + 70, w - 20, 26, ink, n.playing);
    for (const yy of [y + h - 4, y - 10]) c.add(<Line x1={x} y1={yy} x2={x + w - 20} y2={yy} stroke={faded(sub, 0.3)} strokeWidth={1} />);
  } else if (st === 'lyrics') {
    glyph(c, n.radio ? 'radio' : 'music', x + 24, y + 22, 18, sub);
    text(c, fit(t + (ar ? '  ·  ' + ar : ''), 14, w - 80), x + 50, y + 31, 14, sub, 'reg', 'lm');
    // the songs around this one, this one large; with nothing playing, the title and the hint
    const lines = ['', t, ar];
    lines.forEach((s, i) => {
      const cur = i === 1;
      const size = cur ? 30 : 18;
      text(c, fit(s, size, w - 80, cur ? 'bold' : 'reg'), cx, y + 120 + i * 58, size, cur ? ink : sub, cur ? 'bold' : 'reg', 'mm');
    });
    bar(c, x + 60, x + w - 60, y + h - 96, n.progress, ink, faded(sub, 0.4), 4);
    controls(c, x + 80, y + h - 70, w - 160, 36, ink, n.playing);
  } else if (st === 'wide') {
    glyph(c, n.radio ? 'radio' : 'music', x + 22, y + 20, 16, sub);
    text(c, n.radio ? 'Radio' : 'Music', x + 46, y + 28, 13, sub, 'reg', 'lm');
    text(c, fit(t, 26, w * 0.6, 'med'), x + 22, y + 72, 26, ink, 'med', 'lm');
    controls(c, x + 10, y + 108, w * 0.55, 28, ink, n.playing);
    disc(c, x + w - 90, cy + 4, 66);
  }
}

function stat(it: string, l: Live): [string, string] {
  if (it === 'temp') return ['Temp (°C)', l.temp];
  if (it === 'altitude') return ['Altitude', '--'];
  if (it === 'direction') return [l.heading < 0 ? 'Direction' : 'Direction ' + Layouts.compass(l.heading), l.heading < 0 ? '--' : Math.round(l.heading) + '°'];
  if (it === 'pressure') return ['Air pressure', l.pressure || '--'];
  if (it === 'tyres') return [`Tyres (${l.tpmsUnit === 'bar' ? 'bar' : 'psi'})`, '-- -- -- --'];
  if (l.lat === 0 && l.lon === 0) return ['Position', '--'];
  return [`${Math.abs(l.lon).toFixed(4)}° ${l.lon >= 0 ? 'E' : 'W'}`, `${Math.abs(l.lat).toFixed(4)}° ${l.lat >= 0 ? 'N' : 'S'}`];
}

function stats(c: Pen, p: Part, l: Live, items: string[]) {
  const { x, y, h } = p;
  if (items.length === 0) return;
  if (p.style === 'frame') {
    cover(c, x + 16, y + 16, h - 32, h - 32, false, 2);
    const step = Math.min(56, (h - 20) / items.length);
    items.forEach((it, i) => {
      const s = stat(it, l);
      const sz = items.length > 2 ? 20 : 26;
      text(c, s[1], x + h + 10, y + 44 + i * step - (items.length > 2 ? 14 : 0), sz, p.ink, 'bold', 'lm');
      text(c, s[0], x + h + 10, y + 70 + i * step - (items.length > 2 ? 20 : 0), 12, p.sub, 'reg', 'lm');
    });
    return;
  }
  const step = Math.min(100, h / items.length);
  const ln = { stroke: p.ink, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  items.forEach((it, i) => {
    const s = stat(it, l);
    const yy = y + i * step;
    if (it === 'temp') {
      c.add(<Path d={arc(x + 24, yy + 30, 20, 150, 240)} {...ln} />);
      c.add(<Line x1={x + 24} y1={yy + 30} x2={x + 34} y2={yy + 18} {...ln} />);
    } else if (it === 'altitude') {
      c.add(<Path d={`M${x + 4} ${yy + 44}L${x + 18} ${yy + 18}L${x + 28} ${yy + 32}L${x + 34} ${yy + 24}L${x + 46} ${yy + 44}`} {...ln} />);
    } else if (it === 'tyres') {
      c.add(<Circle cx={x + 24} cy={yy + 30} r={20} {...ln} />);
      c.add(<Circle cx={x + 24} cy={yy + 30} r={9} {...ln} />);
    } else {
      c.add(<Circle cx={x + 24} cy={yy + 30} r={20} {...ln} />);
      c.add(<Path d={`M${x + 33} ${yy + 21}L${x + 27} ${yy + 33}L${x + 15} ${yy + 39}L${x + 21} ${yy + 27}Z`} fill={p.ink} />);
    }
    text(c, s[1], x + 70, yy + 30, it === 'latlon' || it === 'tyres' ? 22 : 34, p.ink, 'bold', 'ls');
    text(c, s[0], x + 70, yy + 54, 14, p.sub, 'reg', 'ls');
  });
}

function compassPart(c: Pen, p: Part, l: Live) {
  const { x, y, w, h } = p;
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  for (let i = 0; i < 5; i++) {
    const yy = cy + 10 + i * 22;
    c.add(<Line x1={x + 10} y1={yy} x2={x + w - 10} y2={yy} stroke={faded(p.sub, 0.25)} strokeWidth={1} />);
  }
  // the arrow points the way the car is going; north is up on the grid
  const hd = l.heading;
  c.add(
    <G transform={hd >= 0 ? `rotate(${hd} ${cx} ${cy - 20})` : undefined}>
      <Path d={`M${cx} ${cy - 70}L${cx + 46} ${cy + 30}L${cx} ${cy + 10}L${cx - 46} ${cy + 30}Z`} fill={faded(p.ink, 0.85)} />
    </G>,
  );
  c.add(<Line x1={cx} y1={cy + 34} x2={cx} y2={cy + 110} stroke={faded(p.ink, 0.35)} strokeWidth={8} />);
  text(c, direction(l), cx, y + 12, 18, p.ink, 'med', 'mt');
}

function avatar(c: Pen, cx: number, cy: number, r: number) {
  c.add(<Circle cx={cx} cy={cy} r={r} fill="#C89A60" />);
  glyph(c, 'user', cx - r * 0.82, cy - r * 0.82, r * 1.64, '#FFFFFF');
}

function userPart(c: Pen, p: Part, l: Live) {
  const { x, y, w, h } = p;
  const name = l.driver;
  c.hit(x, y, w, h, 'user');
  if (p.style === 'line') {
    avatar(c, x + 16, y + 20, 16);
    text(c, name ? "Let's go, " + name + '!' : "Let's go!", x + 44, y + h / 2, 16, p.sub, 'reg', 'lm');
    return;
  }
  const r = h * 0.34;
  avatar(c, x + 18 + r, y + h / 2, r);
  text(c, fit(name || 'Hello', 20, w - 2 * r - 44, 'bold'), x + 30 + 2 * r, y + h / 2 - 10, 20, p.ink, 'bold', 'lm');
  text(c, 'Drive safe', x + 30 + 2 * r, y + h / 2 + 16, 13, p.sub, 'reg', 'lm');
}

const TILE = [
  ['#F06A4A', '#F7B048'],
  ['#4AA8F0', '#7A5CF0'],
  ['#38C07A', '#2A9AD0'],
  ['#F0C040', '#F07A30'],
  ['#9A6AF0', '#F06AB0'],
  ['#2E3440', '#4C566A'],
];

interface AppInfo {
  label: string;
  icon: string;
}

function favourites(c: Pen, p: Part, prefs: ReturnType<typeof usePrefs>['prefs'], apps: Record<string, AppInfo>) {
  const { x, y, w, h } = p;
  const s = Math.min(w / 3, h / 2) * 0.62;
  for (let i = 0; i < Layouts.FAVOURITES; i++) {
    const cx = x + (w * ((i % 3) + 0.5)) / 3;
    const cy = y + (h * (Math.floor(i / 3) + 0.5)) / 2;
    const tx = cx - s / 2;
    const ty = cy - s / 2 - 6;
    const pkg = Layouts.favourite(prefs, i);
    c.hit(cx - w / 6, cy - h / 4, w / 3, h / 2, 'fav:' + i);
    if (pkg) {
      const info = apps[pkg] ?? { label: appLabel(prefs, pkg), icon: '' };
      shape(c, { x: tx, y: ty, w: s, h: s, r: s * 0.24, fill: TILE[i][0], fill2: TILE[i][1], alpha: 1 }, true, false);
      const inset = s * 0.16;
      if (info.icon) c.add(<SvgImage href={{ uri: info.icon }} x={tx + inset} y={ty + inset} width={s - 2 * inset} height={s - 2 * inset} />);
      else text(c, info.label.substring(0, 1).toUpperCase(), cx, ty + s / 2, s * 0.45, '#FFFFFF', 'bold', 'mm');
      text(c, fit(info.label, 11, w / 3 - 8), cx, cy + s / 2 + 6, 11, p.ink, 'reg', 'mm');
    } else {
      c.add(<Rect x={tx} y={ty} width={s} height={s} rx={s * 0.24} fill="#FFFFFF33" />);
      c.add(
        <Path d={`M${cx - s * 0.18} ${ty + s / 2}L${cx + s * 0.18} ${ty + s / 2}M${cx} ${ty + s / 2 - s * 0.18}L${cx} ${ty + s / 2 + s * 0.18}`} stroke={p.ink} strokeWidth={2.5} strokeLinecap="round" />,
      );
      text(c, 'Add app', cx, cy + s / 2 + 6, 11, p.ink, 'reg', 'mm');
    }
  }
}

function drawLive(c: Pen, lay: Layout, p: Part, l: Live, prefs: ReturnType<typeof usePrefs>['prefs'], apps: Record<string, AppInfo>) {
  const k = p.kind;
  if (k === 'clock') clock(c, p, l);
  else if (k === 'weather') weather(c, p, l);
  else if (k === 'forecast') forecast(c, p, l);
  else if (k === 'speed') speedPart(c, p, l);
  else if (k === 'music') music(c, p);
  else if (k === 'stats') stats(c, p, l, Layouts.statItems(prefs, lay.id, p));
  else if (k === 'compass') compassPart(c, p, l);
  else if (k === 'user') userPart(c, p, l);
  else if (k === 'favourites') favourites(c, p, prefs, apps);
  else if (k === 'picture' && p.style === 'trip') {
    const km = l.todayKm < 100 ? fmtKm(l.todayKm) : String(Math.round(l.todayKm));
    text(c, km + ' km', p.x + p.w / 2, p.y + p.h * 0.42, 40, p.ink, 'med', 'mm');
    text(c, l.place ? 'today · ' + l.place : 'today', p.x + p.w / 2, p.y + p.h * 0.42 + 40, 15, p.sub, 'reg', 'mm');
  } else if (k === 'dock') {
    const items = Layouts.dockItems(prefs, p);
    const n = items.length + (p.clock ? 1 : 0);
    items.forEach((it, i) => {
      const cx = p.x + (p.w * (i + 0.5)) / n;
      const cw = p.w / n;
      c.hit(cx - cw / 2, p.y, cw, p.h, 'dock:' + it);
    });
    if (p.clock) text(c, time(l), p.x + p.w - 10, p.y + p.h / 2, 26, p.ink, 'med', 'rm');
  } else if (k === 'apps') c.hit(p.x, p.y, p.w, p.h, 'dock:apps');
  else if (k === 'gear') c.hit(p.x - 8, p.y - 8, p.w + 16, p.h + 16, 'settings');
  else if (k === 'places') {
    c.hit(p.x - 6, p.y, 60, p.h, 'place:Home');
    c.hit(p.x + p.w - 60, p.y, 60, p.h, 'place:Office');
  }
}

/** Fuel.fmt: one decimal. */
function fmtKm(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

// ------------------------------------------------------------------ apps

interface App {
  label: string;
  pkg: string;
}

/** The apps added on the Apps page (prefs "apps"), to choose from. */
function appList(prefs: ReturnType<typeof usePrefs>['prefs']): App[] {
  try {
    const a = JSON.parse(prefs.str('apps', '[]'));
    return Array.isArray(a) ? a.filter((x) => x && typeof x.pkg === 'string') : [];
  } catch {
    return [];
  }
}

function appLabel(prefs: ReturnType<typeof usePrefs>['prefs'], pkg: string): string {
  return appList(prefs).find((a) => a.pkg === pkg)?.label ?? pkg.split('.').pop() ?? pkg;
}

function openApp(pkg: string, label: string): boolean {
  if (Platform.OS !== 'android') {
    Alert.alert('Opening other apps works on Android only');
    return true;
  }
  try {
    IntentLauncher.openApplication(pkg);
    return true;
  } catch {
    Alert.alert(`${label} isn't installed`, pkg);
    return false;
  }
}

/** Choose an app: from the Apps page's list, or by package name. */
function AppPicker({ title, apps, onPick, onClose }: { title: string; apps: App[]; onPick: (pkg: string) => void; onClose: () => void }) {
  const [pkg, setPkg] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBack}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 260 }}>
            {apps.map((a) => (
              <Pressable key={a.pkg} onPress={() => onPick(a.pkg)} style={styles.modalRow}>
                <Text style={styles.modalText}>{a.label}</Text>
                <Text style={styles.modalSub}>{a.pkg}</Text>
              </Pressable>
            ))}
            {apps.length === 0 ? <Text style={styles.modalSub}>Add apps on the Apps page, or type a package name.</Text> : null}
          </ScrollView>
          <Field label="Package name" value={pkg} onChange={setPkg} placeholder="com.spotify.music" />
          <Button label="Use this app" kind="primary" onPress={() => pkg.trim() && onPick(pkg.trim())} />
          <Button label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ the background and the road

function useMoving(trip: ReturnType<typeof useDrive>['trip']): boolean {
  return trip.kmh > 5 && trip.last != null && Date.now() - trip.last.t < 5000;
}

/** The background picture, a little larger and drifting while driving, and the moving road lines. */
function Backdrop({ lay, kmh, moving, k, ox, oy, w, h }: { lay: Layout; kmh: number; moving: boolean; k: number; ox: number; oy: number; w: number; h: number }) {
  const { prefs } = usePrefs();
  const road = lay.roadHorizon > 0 && Layouts.roadOn(prefs);
  const anim = Layouts.animOn(prefs);
  const drift = anim && moving;
  const [frame, setFrame] = useState({ phase: 0, t: 0 });
  const kmhRef = useRef(kmh);
  kmhRef.current = kmh;

  useEffect(() => {
    if (!((road || drift) && moving)) return;
    let last = 0;
    let raf = 0;
    const step = (now: number) => {
      const dt = last === 0 ? 0 : Math.min(0.2, (now - last) / 1000);
      last = now;
      setFrame((f) => ({ phase: (f.phase + (kmhRef.current / 3.6 / 8) * dt) % 1.6, t: Date.now() / 1000 }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [road, drift, moving]);

  const src = PICTURES[lay.bg];
  const s = anim ? 1.05 : 1;
  const dx = drift ? Math.sin(frame.t / 9) * w * 0.018 : 0;
  const dy = drift ? Math.cos(frame.t / 13) * h * 0.012 : 0;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: lay.light ? '#DDE3EA' : '#14181E', overflow: 'hidden' }]}>
      {src != null ? (
        <Image source={src} resizeMode="cover" style={[StyleSheet.absoluteFill, { transform: [{ translateX: dx }, { translateY: dy }, { scale: s }] }]} />
      ) : null}
      {road ? (
        <Svg style={{ position: 'absolute', left: ox, top: oy }} width={W * k} height={H * k} viewBox={`0 0 ${W} ${H}`}>
          {roadDashes(lay, frame.phase)}
        </Svg>
      ) : null}
    </View>
  );
}

function roadDashes(lay: Layout, phase: number): ReactElement[] {
  const hz = lay.roadHorizon;
  const vx = lay.roadX;
  const out: ReactElement[] = [];
  for (let i = 0; i < 40; i++) {
    const depth = i * 1.6 + 0.6 - phase;
    if (depth < 0.35) continue;
    const t0 = 1 / depth;
    const t1 = 1 / (depth + 0.8);
    let y0 = hz + (H - hz) * t0;
    const y1 = hz + (H - hz) * t1;
    if (y1 <= hz + 6 || y1 > H) continue;
    y0 = Math.min(y0, H);
    const wd = 1.5 + 4 * Math.min(1, t0);
    out.push(<Path key={i} d={`M${vx - wd} ${y0}L${vx + wd} ${y0}L${vx + wd * 0.7} ${y1}L${vx - wd * 0.7} ${y1}Z`} fill={lay.roadDash} opacity={0.9} />);
  }
  return out;
}

// ------------------------------------------------------------------ the view

function useSecond(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 10); // the clocks' second hands
    };
    t = setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
    return () => clearTimeout(t);
  }, []);
  return now;
}

export default function LayoutView({ layout: lay }: { layout: Layout }) {
  const { prefs, version } = usePrefs();
  const drive = useDrive();
  const { trip } = drive;
  const weather = useWeather(trip.lat, trip.lon);
  const now = useSecond();
  const moving = useMoving(trip);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [picking, setPicking] = useState<{ title: string; onPick: (pkg: string) => void } | null>(null);
  const [apps, setApps] = useState<Record<string, AppInfo>>({});

  // favourite apps' names and icons
  const favPkgs = prefs.str('layApps', '');
  useEffect(() => {
    let gone = false;
    (async () => {
      const out: Record<string, AppInfo> = {};
      for (const pkg of favPkgs.split(',').filter(Boolean)) {
        let iconUri = '';
        if (Platform.OS === 'android') {
          try {
            iconUri = await IntentLauncher.getApplicationIconAsync(pkg);
          } catch {
            // not installed: the tile shows its first letter
          }
        }
        out[pkg] = { label: appLabel(prefs, pkg), icon: iconUri };
      }
      if (!gone) setApps(out);
    })();
    return () => {
      gone = true;
    };
  }, [favPkgs, prefs]);

  const { w, h } = size;
  const k = w > 0 && h > 0 ? Math.min(h / H, w / W) : 0; // fit the design, centred, on any shape of screen
  const ox = (w - W * k) / 2;
  const oy = (h - H * k) / 2;

  const on = (p: Part) => Layouts.shown(prefs, lay.id, p.opt);

  // shapes and pictures: only redrawn when a setting changes
  const still = useMemo(() => {
    const c = new Pen('s');
    lay.lines.forEach(([x0, y0, x1, y1]) => c.add(<Line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#FFFFFF32" strokeWidth={1} />));
    for (const p of lay.parts) if (on(p)) drawStill(c, lay, p, prefs);
    return c.els;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lay, prefs, version]);

  const l = live(weather.wx, weather.place, trip, Layouts.driver(prefs), prefs.str('tpmsUnit', 'psi'), now);
  const pen = new Pen('l');
  for (const p of lay.parts) if (on(p)) drawLive(pen, lay, p, l, prefs, apps);

  const pickFavourite = (i: number) =>
    setPicking({
      title: 'Choose an app',
      onPick: (pkg) => {
        Layouts.setFavourite(prefs, i, pkg);
        setPicking(null);
      },
    });

  const tap = (action: string) => {
    if (action.startsWith('dock:')) {
      const n = action.substring(5);
      if (n === 'apps') router.push('/apps');
      else if (n === 'settings') router.push('/settings');
      else if (n === 'user') user();
      else if (n === 'dash') prefs.put('layout', Layouts.BOXES); // back to the boxes
      else if (n === 'navi' && prefs.str('src:navi', 'own') !== 'google') router.push('/map');
      else {
        const pkg = Layouts.dockApp(prefs, n);
        if (pkg) openApp(pkg, Layouts.label(n));
        else Alert.alert(Layouts.label(n), `Long-press to choose the app for ${Layouts.label(n)}`);
      }
    } else if (action.startsWith('media:')) {
      const pkg = prefs.str('app:media:music', '');
      if (action === 'media:open' && pkg) openApp(pkg, 'Music');
      else Alert.alert('Music', "What's playing and the music buttons need the media module, which isn't in this version yet. Long-press the Music button on the dock to choose your music app.");
    } else if (action.startsWith('place:')) {
      const name = action.substring(6);
      const ll = Layouts.place(prefs, name);
      if (!ll) Alert.alert(name, `Save ${name} on the map first (the star in the map box)`);
      else Linking.openURL(trip.lat !== 0 ? routeLink(trip.lat, trip.lon, ll[0], ll[1]) : mapsLink(ll[0], ll[1])).catch(() => {});
    } else if (action.startsWith('fav:')) {
      const i = parseInt(action.substring(4), 10);
      const pkg = Layouts.favourite(prefs, i);
      if (!pkg) pickFavourite(i);
      else if (!openApp(pkg, appLabel(prefs, pkg))) pickFavourite(i);
    } else if (action === 'user') user();
    else if (action === 'settings') router.push('/settings');
  };

  /** Long-press: choose the app for a dock button or a favourite. False to open Settings instead. */
  const longTap = (action: string): boolean => {
    if (action.startsWith('fav:')) {
      pickFavourite(parseInt(action.substring(4), 10));
      return true;
    }
    if (action.startsWith('dock:')) {
      const n = action.substring(5);
      if (['apps', 'settings', 'user', 'dash'].includes(n)) return false;
      setPicking({
        title: 'App for ' + Layouts.label(n),
        onPick: (pkg) => {
          prefs.put('app:' + Layouts.dockKey(n), pkg);
          setPicking(null);
        },
      });
      return true;
    }
    return false;
  };

  const user = () => router.push(Features.on(prefs, 'profiles') ? '/settings/profiles' : '/settings');

  return (
    <Pressable
      style={styles.fill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onLongPress={() => router.push('/settings')}
    >
      {k > 0 ? (
        <>
          <Backdrop lay={lay} kmh={trip.kmh} moving={moving} k={k} ox={ox} oy={oy} w={w} h={h} />
          <Svg style={{ position: 'absolute', left: ox, top: oy }} width={W * k} height={H * k} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
            {still}
            {pen.els}
          </Svg>
          {pen.hits.map((t, i) => (
            <Pressable
              key={i}
              accessibilityLabel={t.action}
              onPress={() => tap(t.action)}
              onLongPress={() => {
                if (!longTap(t.action)) router.push('/settings');
              }}
              style={{ position: 'absolute', left: ox + (t.x - 6) * k, top: oy + (t.y - 6) * k, width: (t.w + 12) * k, height: (t.h + 12) * k }}
            />
          ))}
        </>
      ) : null}
      {picking ? <AppPicker title={picking.title} apps={appList(prefs)} onPick={picking.onPick} onClose={() => setPicking(null)} /> : null}
    </Pressable>
  );
}

/** Ui.mix: t of a, the rest of b. */
export function mix(a: string, b: string, t: number): string {
  const ch = (c: string, i: number) => parseInt(c.substring(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0'));
  return ('#' + out.join('')).toUpperCase();
}

// ------------------------------------------------------------------ theme previews (ThemeGallery.Preview)

/** The home screen in miniature: dock, five boxes, the car and a few numbers. */
export function ThemePreview({ pack, look, width }: { pack: Pack; look: Look; width: number }) {
  const height = (width * 600) / 1024;
  const own = packPicture(pack, 'preview');
  if (own) return <Image source={{ uri: own }} style={{ width, height, borderRadius: 8 }} resizeMode="stretch" />;
  const bg = look.backgroundImage;
  const box = (l: number, t: number, r: number, b: number) => (
    <Rect x={l} y={t} width={r - l} height={b - t} rx={look.radius} fill="url(#panel)" stroke={look.edge.length === 9 && look.edge.endsWith('00') ? 'none' : look.edge} strokeWidth={1.6} />
  );
  const txt = (s: string, x: number, y: number, size: number, fill: string, weight: '300' | '400' | '500', anchor: 'start' | 'middle' | 'end' = 'start', spacing = 0) => (
    <SvgText x={x} y={y} fontSize={size} fill={fill} fontWeight={weight} textAnchor={anchor} letterSpacing={spacing * size}>
      {s}
    </SvgText>
  );
  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox="0 0 1024 600">
        <Defs>
          <LinearGradient id="bg" x1={0} y1={0} x2={1024} y2={600} gradientUnits="userSpaceOnUse">
            {(look.gradient ?? [look.background, look.background]).map((c, i, a) => (
              <Stop key={i} offset={i / (a.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
          <LinearGradient id="panel" x1={0} y1={0} x2={0} y2={1}>
            <Stop offset={0} stopColor={look.panelTop} />
            <Stop offset={1} stopColor={look.panel} />
          </LinearGradient>
          <LinearGradient id="road" x1={0} y1={200} x2={0} y2={282} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={look.roadFill} stopOpacity={0} />
            <Stop offset={1} stopColor={look.roadFill} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={1024} height={600} fill="url(#bg)" />
        {bg ? <SvgImage href={{ uri: bg }} x={0} y={0} width={1024} height={600} preserveAspectRatio="xMidYMid slice" /> : null}
        {['navi', 'music', 'radio', 'bt', 'phone', 'apps'].map((d, i) => (
          <Glyph key={d} name={d} x={48 - 24} y={65 + i * 95 - 24} size={48} ink={look.icons} />
        ))}
        {box(110, 18, 497, 285)}
        {box(110, 300, 497, 433)}
        {box(110, 448, 497, 580)}
        {box(512, 18, 1004, 428)}
        {box(512, 444, 1004, 580)}
        {look.road ? (
          <G>
            <Path d="M290 200L317 200L470 282L137 282Z" fill="url(#road)" />
            <Rect x={301} y={262} width={5} height={20} fill={look.roadLine} />
          </G>
        ) : null}
        <SvgImage href={PICTURES.car_rear_silver} x={303 - 110} y={262 - 157} width={220} height={157} preserveAspectRatio="none" />
        {txt('OPENRATH', 132, 50, 13, look.text, '400', 'start', 0.3)}
        {txt('62', 382, 62, 38, look.text, '300')}
        {txt('LIGHTS ON', 128, 272, 12, look.accent, '500', 'start', 0.18)}
        {txt('FM1', 534, 480, 12, look.accent, '500', 'start', 0.18)}
        {txt('17:31', 303, 372, 58, look.text, '300', 'middle')}
        {txt('Sunday 11 October', 303, 408, 15, look.textDim, '400', 'middle')}
        {txt('28°', 210, 520, 42, look.text, '300')}
        {txt('Cloudy', 475, 505, 16, look.text, '500', 'end')}
        {txt('New Delhi', 475, 535, 13, look.textDim, '400', 'end')}
        <WeatherIcon name="w_cloud" x={138} y={482} size={56} />
        {txt('98.30', 758, 528, 46, look.text, '300', 'middle')}
        <Glyph name="prev" x={545} y={490} size={45} ink={look.icons} />
        <Glyph name="next" x={927} y={490} size={45} ink={look.icons} />
        {/* map: a few streets and the route in the accent colour */}
        {[
          [530, 60, 990, 40],
          [520, 160, 1000, 150],
          [520, 280, 1000, 300],
          [600, 25, 640, 420],
          [720, 25, 700, 420],
          [850, 25, 890, 420],
          [950, 25, 940, 420],
        ].map(([x1, y1, x2, y2], i) => (
          <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={mix(look.textDim, look.panel, 0.25)} strokeWidth={2} />
        ))}
        <Path d="M760 330L760 245L818 190L818 100L905 52" stroke={look.accent} strokeWidth={5} strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  modalBack: { flex: 1, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#15171B', borderRadius: 14, padding: 18, width: '100%', maxWidth: 460 },
  modalTitle: { color: '#E6E8EB', fontSize: 18, fontWeight: '600', marginBottom: 10 },
  modalRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#33363C' },
  modalText: { color: '#E6E8EB', fontSize: 16 },
  modalSub: { color: '#8A8F96', fontSize: 12 },
});
