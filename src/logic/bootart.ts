/**
 * Makes a still boot logo (a 24-bit BMP) and a boot animation (bootanimation.zip) from the car
 * profile (port of BootArt.java): the brand's badge or the OpenRath wheel, with the brand and the
 * car's name under it. Android doesn't let an app install either, so the files are saved for the
 * stereo's factory settings (logo) and its boot animation app or ADB (animation), with the steps.
 *
 * Everything here is plain TypeScript: frames are drawn into an RGBA buffer by a small
 * anti-aliased rasteriser, written as PNG (deflated by fflate) and put in a zip with every entry
 * STORED, as Android's boot animation player requires. The Android version drew text with the
 * Inter font; here letters are drawn as strokes from a small built-in capital-letter font.
 */
import { zlibSync } from 'fflate';

import * as Car from './car.ts';
import type { Prefs } from './prefs.ts';

/** 25 frames a second for 3.6 s; the last frame then holds until Android has started. */
export const FPS = 25;
export const FRAMES = 90;

/** The sizes offered besides this screen's own. */
export const SIZES: [number, number][] = [[1024, 600], [1280, 720], [1280, 800], [1920, 720]];

// ------------------------------------------------------------------ timeline (seconds), tested

export function ease(x: number): number {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

export function markAlpha(t: number): number {
  return ease((t - 0.3) / 1.2);
}

/** The wheel rolls in: degrees still to turn. */
export function spin(t: number): number {
  return -300 * (1 - ease(t / 1.8));
}

/** The light sweeping across the mark: 0 to 1 while it crosses, outside that range otherwise. */
export function shine(t: number): number {
  return (t - 1.6) / 1.0;
}

export function rule(t: number): number {
  return ease((t - 2.0) / 0.7);
}

export function brandAlpha(t: number): number {
  return ease((t - 2.3) / 0.8);
}

export function nameAlpha(t: number): number {
  return ease((t - 2.8) / 0.8);
}

/** The animation's desc.txt: play part0 once, then hold part1 until boot completes. */
export function desc(w: number, h: number): string {
  return w + ' ' + h + ' ' + FPS + '\np 1 0 part0\np 0 0 part1\n';
}

/** The zip's entry name for frame i: part0/000.png … part0/089.png, then part1/000.png. */
export function frameName(i: number): string {
  return i < FRAMES ? 'part0/' + String(i).padStart(3, '0') + '.png' : 'part1/000.png';
}

// ------------------------------------------------------------------ file formats

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

const le32 = (b: Uint8Array, at: number, v: number) => {
  b[at] = v & 255;
  b[at + 1] = (v >>> 8) & 255;
  b[at + 2] = (v >>> 16) & 255;
  b[at + 3] = (v >>> 24) & 255;
};
const le16 = (b: Uint8Array, at: number, v: number) => {
  b[at] = v & 255;
  b[at + 1] = (v >>> 8) & 255;
};
const be32 = (b: Uint8Array, at: number, v: number) => {
  b[at] = (v >>> 24) & 255;
  b[at + 1] = (v >>> 16) & 255;
  b[at + 2] = (v >>> 8) & 255;
  b[at + 3] = v & 255;
};

/** A 24-bit uncompressed BMP (what stereo logo menus import): bottom-up rows padded to 4 bytes. */
export function bmp(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const row = Math.floor((w * 3 + 3) / 4) * 4;
  const size = 54 + row * h;
  const b = new Uint8Array(size);
  b[0] = 0x42; // B
  b[1] = 0x4d; // M
  le32(b, 2, size);
  le32(b, 10, 54);
  le32(b, 14, 40);
  le32(b, 18, w);
  le32(b, 22, h);
  b[26] = 1;
  b[28] = 24;
  le32(b, 34, row * h);
  le32(b, 38, 2835); // 72 dpi
  le32(b, 42, 2835);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      b[o++] = rgba[i + 2];
      b[o++] = rgba[i + 1];
      b[o++] = rgba[i];
    }
  }
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 as zip and PNG use it. */
export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

/** An opaque RGB PNG of an RGBA buffer (rows filtered with "Sub", then deflated). */
export function png(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 3 + 1;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const o = y * stride;
    raw[o] = 1; // Sub: each byte minus the one a pixel to the left
    let pr = 0;
    let pg = 0;
    let pb = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const j = o + 1 + x * 3;
      raw[j] = (r - pr) & 255;
      raw[j + 1] = (g - pg) & 255;
      raw[j + 2] = (b - pb) & 255;
      pr = r;
      pg = g;
      pb = b;
    }
  }
  const ihdr = new Uint8Array(13);
  be32(ihdr, 0, w);
  be32(ihdr, 4, h);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 2; // RGB
  const chunks: [string, Uint8Array][] = [['IHDR', ihdr], ['IDAT', zlibSync(raw, { level: 6 })], ['IEND', new Uint8Array(0)]];
  const out = new Uint8Array(8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0));
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8;
  for (const [type, d] of chunks) {
    be32(out, o, d.length);
    const td = new Uint8Array(4 + d.length);
    td.set(ascii(type));
    td.set(d, 4);
    out.set(td, o + 4);
    be32(out, o + 8 + d.length, crc32(td));
    o += 12 + d.length;
  }
  return out;
}

/**
 * A zip with every file STORED (no compression), as Android's boot animation player requires:
 * sizes and CRC in each local header, no data descriptors.
 */
export function storedZip(files: [string, Uint8Array][]): Uint8Array {
  const DOS_TIME = 0;
  const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 1 Jan 2026
  const names = files.map(([n]) => ascii(n));
  const local = files.reduce((n, [, d], i) => n + 30 + names[i].length + d.length, 0);
  const central = names.reduce((n, nm) => n + 46 + nm.length, 0);
  const out = new Uint8Array(local + central + 22);
  const offsets: number[] = [];
  const crcs: number[] = [];
  let o = 0;
  files.forEach(([, d], i) => {
    const nm = names[i];
    const crc = crc32(d);
    offsets.push(o);
    crcs.push(crc);
    le32(out, o, 0x04034b50);
    le16(out, o + 4, 10); // version needed: 1.0, plain stored
    le16(out, o + 6, 0); // no flags
    le16(out, o + 8, 0); // method: stored
    le16(out, o + 10, DOS_TIME);
    le16(out, o + 12, DOS_DATE);
    le32(out, o + 14, crc);
    le32(out, o + 18, d.length);
    le32(out, o + 22, d.length);
    le16(out, o + 26, nm.length);
    le16(out, o + 28, 0);
    out.set(nm, o + 30);
    out.set(d, o + 30 + nm.length);
    o += 30 + nm.length + d.length;
  });
  const cd = o;
  files.forEach(([, d], i) => {
    const nm = names[i];
    le32(out, o, 0x02014b50);
    le16(out, o + 4, 20);
    le16(out, o + 6, 10);
    le16(out, o + 8, 0);
    le16(out, o + 10, 0);
    le16(out, o + 12, DOS_TIME);
    le16(out, o + 14, DOS_DATE);
    le32(out, o + 16, crcs[i]);
    le32(out, o + 20, d.length);
    le32(out, o + 24, d.length);
    le16(out, o + 28, nm.length);
    // extra, comment, disk, attributes: all 0
    le32(out, o + 42, offsets[i]);
    out.set(nm, o + 46);
    o += 46 + nm.length;
  });
  le32(out, o, 0x06054b50);
  le16(out, o + 8, files.length);
  le16(out, o + 10, files.length);
  le32(out, o + 12, o - cd);
  le32(out, o + 16, cd);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64, for a data: URI of the preview. */
export function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}

// ------------------------------------------------------------------ what is drawn

/** The mark: outlines (24 units tall) of a built-in badge, or the wheel. */
export interface Mark {
  polys: number[][];
  w: number;
  h: number;
  wheel: boolean;
}

export interface Badge {
  w: number;
  h: number;
  /** each outline as [[x, y], …] */
  polys: number[][][];
}

/**
 * The brand's badge from a badges.json map (the Android build made it from the brand packs,
 * which aren't published), else the OpenRath wheel.
 */
export function mark(brandId: string, badges?: Record<string, Badge>): Mark {
  const b = brandId && badges ? badges[brandId] : undefined;
  if (b) return { w: b.w, h: b.h, polys: b.polys.map((pts) => pts.flat()), wheel: false };
  return { w: 24, h: 24, polys: [], wheel: true };
}

/** The line above the car's name: the brand, else OPENRATH. */
export function brandLine(p: Prefs): string {
  const b = Car.brandName(p).trim();
  return (b === '' ? 'OpenRath' : b).toUpperCase();
}

export function nameLine(p: Prefs): string {
  return Car.name(p).toUpperCase();
}

/** A frame being drawn: RGBA bytes, opaque. */
export interface Canvas {
  w: number;
  h: number;
  px: Uint8ClampedArray;
  /** the glow's shape, worked out once per size */
  glow?: Float32Array;
}

export function canvas(w: number, h: number): Canvas {
  return { w, h, px: new Uint8ClampedArray(w * h * 4) };
}

// chrome: bright sky, dark horizon, bright ground (as the boot logo's artwork)
const CHROME_AT = [0, 0.38, 0.5, 0.56, 0.8, 1];
const CHROME_L = [0.95, 0.78, 0.3, 0.55, 0.85, 0.62];
const CHROME = CHROME_L.map((l) => [
  Math.min(255, Math.round(l * 0.96 * 255)), Math.min(255, Math.round(l * 0.98 * 255)), Math.min(255, Math.round(l * 1.03 * 255)),
]);

/** The chrome colour at y on a gradient from top to bottom. */
function chrome(y: number, top: number, bottom: number, out: number[]): number[] {
  const f = Math.max(0, Math.min(1, (y - top) / Math.max(1e-6, bottom - top)));
  let i = 0;
  while (i < CHROME_AT.length - 2 && f > CHROME_AT[i + 1]) i++;
  const s = (f - CHROME_AT[i]) / (CHROME_AT[i + 1] - CHROME_AT[i]);
  for (let k = 0; k < 3; k++) out[k] = CHROME[i][k] + (CHROME[i + 1][k] - CHROME[i][k]) * Math.max(0, Math.min(1, s));
  return out;
}

/** Paint one pixel over what is there: colour (0–255) at an opacity (0–1). */
function blend(c: Canvas, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const i = (y * c.w + x) * 4;
  const px = c.px;
  px[i] = r * a + px[i] * (1 - a);
  px[i + 1] = g * a + px[i + 1] * (1 - a);
  px[i + 2] = b * a + px[i + 2] * (1 - a);
  px[i + 3] = 255;
}

/** Add coverage w over [a, b) of a row, with partial pixels at the ends. */
function span(acc: Float32Array, a: number, b: number, w: number): void {
  a = Math.max(0, a);
  b = Math.min(acc.length, b);
  if (b <= a) return;
  const ia = Math.floor(a);
  const ib = Math.floor(b);
  if (ia === ib) {
    acc[ia] += (b - a) * w;
    return;
  }
  acc[ia] += (ia + 1 - a) * w;
  for (let i = ia + 1; i < ib; i++) acc[i] += w;
  if (ib < acc.length) acc[ib] += (b - ib) * w;
}

/** A region of coverage values (0–1), x0/y0 its top-left pixel on the canvas. */
interface Mask {
  x0: number;
  y0: number;
  w: number;
  h: number;
  a: Float32Array;
}

const SUB = 5; // sub-scanlines per pixel row for anti-aliasing

/**
 * Fill outlines (each [x0, y0, x1, y1, …], closed) into a mask, anti-aliased, by the non-zero or
 * even-odd rule; drawn over what the mask already has, as a second path on the same layer would be.
 */
function fill(m: Mask, contours: number[][], evenOdd: boolean): void {
  const edges: number[] = []; // x0, y0, x1, y1, direction
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const x0 = c[2 * i];
      const y0 = c[2 * i + 1];
      const x1 = c[(2 * i + 2) % c.length];
      const y1 = c[(2 * i + 3) % c.length];
      if (y0 === y1) continue;
      edges.push(x0, y0, x1, y1, y1 > y0 ? 1 : -1);
      minY = Math.min(minY, y0, y1);
      maxY = Math.max(maxY, y0, y1);
    }
  }
  const from = Math.max(m.y0, Math.floor(minY));
  const to = Math.min(m.y0 + m.h, Math.ceil(maxY));
  const acc = new Float32Array(m.w);
  const xs: number[] = [];
  const ds: number[] = [];
  const order: number[] = [];
  for (let py = from; py < to; py++) {
    acc.fill(0);
    for (let s = 0; s < SUB; s++) {
      const sy = py + (s + 0.5) / SUB;
      xs.length = 0;
      ds.length = 0;
      for (let e = 0; e < edges.length; e += 5) {
        const y0 = edges[e + 1];
        const y1 = edges[e + 3];
        if (sy < Math.min(y0, y1) || sy >= Math.max(y0, y1)) continue;
        xs.push(edges[e] + ((sy - y0) * (edges[e + 2] - edges[e])) / (y1 - y0));
        ds.push(edges[e + 4]);
      }
      order.length = 0;
      for (let i = 0; i < xs.length; i++) order.push(i);
      order.sort((a, b) => xs[a] - xs[b]);
      let wind = 0;
      for (let k = 0; k < order.length - 1; k++) {
        wind += evenOdd ? 1 : ds[order[k]];
        const inside = evenOdd ? wind % 2 === 1 : wind !== 0;
        if (inside) span(acc, xs[order[k]] - m.x0, xs[order[k + 1]] - m.x0, 1 / SUB);
      }
    }
    const row = (py - m.y0) * m.w;
    for (let x = 0; x < m.w; x++) {
      const c = Math.min(1, acc[x]);
      if (c > 0) m.a[row + x] = m.a[row + x] + c - m.a[row + x] * c;
    }
  }
}

function circle(cx: number, cy: number, r: number): number[] {
  const n = Math.max(48, Math.min(256, Math.ceil(r * 1.5)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** The wheel (rim, hub, eight spokes) at (cx, cy), u per unit, turned by deg; each part with its fill rule. */
function wheel(cx: number, cy: number, u: number, deg: number): [number[][], boolean][] {
  const rot = (deg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const tr = (pts: number[]) => {
    const o: number[] = [];
    for (let i = 0; i < pts.length; i += 2) o.push(cx + pts[i] * cos - pts[i + 1] * sin, cy + pts[i] * sin + pts[i + 1] * cos);
    return o;
  };
  const out: [number[][], boolean][] = [
    [[circle(cx, cy, 11.8 * u), circle(cx, cy, 9.6 * u)], true], // the rim
    [[circle(cx, cy, 4.0 * u), circle(cx, cy, 2.2 * u)], true], // the hub
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy * 0.75 * u;
    const py = dx * 0.75 * u;
    out.push([[tr([
      dx * 3.6 * u + px, dy * 3.6 * u + py, dx * 9.9 * u + px, dy * 9.9 * u + py,
      dx * 9.9 * u - px, dy * 9.9 * u - py, dx * 3.6 * u - px, dy * 3.6 * u - py,
    ])], false]);
  }
  return out;
}

// ------------------------------------------------------------------ the letters

/**
 * Capital letters, digits and a little punctuation as strokes on a grid 4 wide and 6 tall (y down,
 * 6 = the baseline); "|" separates strokes. Anything else (other scripts) is left as a space.
 */
const O = '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0';
const P = '0,6 0,0 3,0 4,1 4,2 3,3 0,3';
const FONT: Record<string, string> = {
  A: '0,6 2,0 4,6|0.7,4 3.3,4',
  B: '0,6 0,0 3,0 4,1 4,2 3,3 0,3|3,3 4,4 4,5 3,6 0,6',
  C: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
  D: '0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0',
  E: '4,0 0,0 0,6 4,6|0,3 3,3',
  F: '4,0 0,0 0,6|0,3 3,3',
  G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3 2,3',
  H: '0,0 0,6|4,0 4,6|0,3 4,3',
  I: '1,0 3,0|2,0 2,6|1,6 3,6',
  J: '4,0 4,5 3,6 1,6 0,5',
  K: '0,0 0,6|4,0 0,3.5|1.4,2.6 4,6',
  L: '0,0 0,6 4,6',
  M: '0,6 0,0 2,3 4,0 4,6',
  N: '0,6 0,0 4,6 4,0',
  O,
  P,
  Q: O + '|2.5,4.5 4,6',
  R: P + '|2,3 4,6',
  S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
  T: '0,0 4,0|2,0 2,6',
  U: '0,0 0,5 1,6 3,6 4,5 4,0',
  V: '0,0 2,6 4,0',
  W: '0,0 1,6 2,2 3,6 4,0',
  X: '0,0 4,6|4,0 0,6',
  Y: '0,0 2,3 4,0|2,3 2,6',
  Z: '0,0 4,0 0,6 4,6',
  '0': O + '|4,1 0,5',
  '1': '1,1 2,0 2,6|1,6 3,6',
  '2': '0,1 1,0 3,0 4,1 4,2 0,6 4,6',
  '3': '0,1 1,0 3,0 4,1 4,2 3,3 1.5,3|3,3 4,4 4,5 3,6 1,6 0,5',
  '4': '3,6 3,0 0,4 4,4',
  '5': '4,0 0,0 0,3 3,3 4,4 4,5 3,6 0,6',
  '6': '3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3',
  '7': '0,0 4,0 1.5,6',
  '8': '1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3|1,3 0,2 0,1 1,0',
  '9': '4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,5 3,6 1,6',
  '-': '1,3 3,3',
  '.': '2,5.9 2,6',
  "'": '2,0 2,1.5',
  '/': '4,0 0,6',
  '+': '0,3 4,3|2,1 2,5',
  '&': '4,6 1,2 1,1 2,0 3,1 3,2 0,4 0,5 1,6 2,6 4,4',
};
const STROKES: Record<string, number[][]> = {};
for (const [k, v] of Object.entries(FONT)) STROKES[k] = v.split('|').map((s) => s.split(' ').flatMap((pt) => pt.split(',').map(Number)));

function plain(s: string): string {
  try {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  } catch {
    return s.toUpperCase();
  }
}

/** Width of one letter's advance, in text sizes. */
const ADVANCE = 0.62;
const SPACE = 0.3;
const CAP = 0.72;

/** How wide a line of text is drawn, at size 1. */
export function textWidth(s: string, spacing: number): number {
  let w = 0;
  for (const ch of plain(s)) w += (STROKES[ch] ? ADVANCE : SPACE) + spacing;
  return w;
}

/** A line of text centred on x with its baseline at y, in chrome, at an opacity; shrunk to fit. */
function text(c: Canvas, s: string, x: number, y: number, size: number, spacing: number, weight: number, a: number): void {
  if (s === '' || a <= 0) return;
  const top = y - size * 0.75;
  const bottom = y + size * 0.1;
  // keep it on screen: shrink a long name to fit
  const max = c.w * 0.86;
  if (textWidth(s, spacing) * size > max) size = max / textWidth(s, spacing);
  const u = (size * CAP) / 6;
  const half = weight * size;
  let pen = x - (textWidth(s, spacing) * size) / 2 + (spacing * size) / 2;
  const col = [0, 0, 0];
  for (const ch of plain(s)) {
    const strokes = STROKES[ch];
    if (!strokes) {
      pen += (SPACE + spacing) * size;
      continue;
    }
    const left = pen + ((ADVANCE - 0.48) * size) / 2;
    const segs: number[] = [];
    for (const st of strokes) {
      for (let i = 0; i + 3 < st.length; i += 2) segs.push(left + st[i] * u, y - (6 - st[i + 1]) * u, left + st[i + 2] * u, y - (6 - st[i + 3]) * u);
      if (st.length === 2) segs.push(left + st[0] * u, y - (6 - st[1]) * u, left + st[0] * u, y - (6 - st[1]) * u);
    }
    const x0 = Math.max(0, Math.floor(left - half - 1));
    const x1 = Math.min(c.w, Math.ceil(left + 4 * u + half + 1));
    const y0 = Math.max(0, Math.floor(y - 6 * u - half - 1));
    const y1 = Math.min(c.h, Math.ceil(y + half + 1));
    for (let py = y0; py < y1; py++) {
      chrome(py + 0.5, top, bottom, col);
      for (let px = x0; px < x1; px++) {
        const qx = px + 0.5;
        const qy = py + 0.5;
        let d = Infinity;
        for (let k = 0; k < segs.length; k += 4) d = Math.min(d, segDist(qx, qy, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]));
        const cov = Math.max(0, Math.min(1, half + 0.5 - d));
        if (cov > 0) blend(c, px, py, col[0], col[1], col[2], cov * a);
      }
    }
    pen += (ADVANCE + spacing) * size;
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

// ------------------------------------------------------------------ one frame

/** The shine's opacity along its gradient: clear, 0x99, 0xEE, 0x99, clear. */
function shineAlpha(f: number): number {
  const at = [0, 0.4, 0.5, 0.6, 1];
  const al = [0, 0x99 / 255, 0xee / 255, 0x99 / 255, 0];
  if (f <= 0 || f >= 1) return 0;
  let i = 0;
  while (f > at[i + 1]) i++;
  return al[i] + ((al[i + 1] - al[i]) * (f - at[i])) / (at[i + 1] - at[i]);
}

/** One frame at time t (seconds): cleared to black, then glow, mark, rule, brand and name. */
export function draw(c: Canvas, t: number, m: Mark, brand: string, name: string): void {
  const { w, h } = c;
  const k = Math.min(h / 600, w / 700);
  const cx = w / 2;
  const oy = (h - 600 * k) / 2; // centred on a portrait or tall screen
  let cy = oy + 222 * k;
  const lineY = oy + 378 * k;
  const brandY = oy + 424 * k;
  const nameY = oy + 496 * k;
  if (name === '' && brand === '') cy = h / 2;
  const px = c.px;

  // a faint glow behind the mark (an ellipse 520 by 300 fading out), over black
  const g = 0.1 * ease((t - 0.8) / 1.5);
  if (g > 0) {
    if (!c.glow) {
      c.glow = new Float32Array(w * h);
      const rx = 520 * k;
      const ry = 300 * k;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
          c.glow[y * w + x] = d < 1 ? (1 - d) * (1 - d) : 0;
        }
      }
    }
    const gl = c.glow;
    for (let i = 0, j = 0; i < gl.length; i++, j += 4) {
      const v = gl[i] * g;
      px[j] = 0xc0 * v;
      px[j + 1] = 0xcc * v;
      px[j + 2] = 0xe0 * v;
      px[j + 3] = 255;
    }
  } else {
    px.fill(0);
    for (let j = 3; j < px.length; j += 4) px[j] = 255;
  }

  // the mark, fading and growing in (the wheel rolling), then a light sweeping across it
  const a = markAlpha(t);
  if (a > 0) {
    const markH = 200 * k * (m.wheel ? 0.95 : 1);
    const u = (markH / 24) * (0.9 + 0.1 * a);
    const mw = m.w * u;
    const mh = m.h * u;
    const left = cx - mw / 2;
    const top = cy - mh / 2;
    const x0 = Math.max(0, Math.floor(left - 4 * k));
    const y0 = Math.max(0, Math.floor(top - 4 * k));
    const x1 = Math.min(w, Math.ceil(left + mw + 4 * k));
    const y1 = Math.min(h, Math.ceil(top + mh + 4 * k));
    const mask: Mask = { x0, y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), a: new Float32Array(Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) };
    if (m.wheel) {
      for (const [parts, evenOdd] of wheel(cx, cy, u, spin(t))) fill(mask, parts, evenOdd);
    } else {
      // one path, filled by winding like the SVG it came from, so rings keep their holes
      fill(mask, m.polys.map((f) => f.map((v, i) => (i % 2 === 0 ? left + v * u : top + v * u))), false);
    }
    const sp = shine(t);
    const sweep = sp >= 0 && sp <= 1;
    const bx = left - 60 * k + sp * (mw + 120 * k);
    const gx0 = bx - 50 * k;
    const gy0 = cy - 22 * k;
    const gdx = 100 * k;
    const gdy = 44 * k;
    const gl2 = gdx * gdx + gdy * gdy;
    const col = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
      chrome(y + 0.5, top, top + mh, col);
      for (let x = x0; x < x1; x++) {
        const cov = mask.a[(y - y0) * mask.w + (x - x0)];
        if (cov <= 0) continue;
        let r = col[0];
        let gg = col[1];
        let b = col[2];
        if (sweep) {
          // the light only where the mark is (source-atop)
          const s = shineAlpha(((x + 0.5 - gx0) * gdx + (y + 0.5 - gy0) * gdy) / gl2);
          r += (255 - r) * s;
          gg += (255 - gg) * s;
          b += (255 - b) * s;
        }
        blend(c, x, y, r, gg, b, cov * a);
      }
    }
  }

  // a thin rule growing from the middle
  const r = rule(t);
  if (r > 0 && !(brand === '' && name === '')) {
    const half = 230 * k * r;
    const top = lineY - 1.2 * k;
    const bottom = lineY + 1.2 * k;
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(h, Math.ceil(bottom)); y++) {
      const vy = Math.min(y + 1, bottom) - Math.max(y, top);
      for (let x = Math.max(0, Math.floor(cx - half)); x < Math.min(w, Math.ceil(cx + half)); x++) {
        const vx = Math.min(x + 1, cx + half) - Math.max(x, cx - half);
        const fade = 1 - Math.abs(x + 0.5 - cx) / half;
        blend(c, x, y, 0xb3, 0xb8, 0xbf, Math.max(0, vx * vy * fade));
      }
    }
  }

  // the brand, then the car's name
  text(c, brand, cx, brandY, 34 * k, 0.35, 0.045, brandAlpha(t));
  text(c, name, cx, nameY, 58 * k, 0.5, 0.026, nameAlpha(t));
}

// ------------------------------------------------------------------ making the files

/**
 * bootanimation.zip and bootlogo.bmp (the last frame) for a w x h screen. `progress` is awaited
 * after each frame, so a screen can show it and stay responsive.
 */
export async function make(
  w: number, h: number, m: Mark, brand: string, name: string, progress?: (frame: number) => void | Promise<void>,
): Promise<{ zip: Uint8Array; logo: Uint8Array }> {
  const c = canvas(w, h);
  const files: [string, Uint8Array][] = [['desc.txt', ascii(desc(w, h))]];
  for (let i = 0; i <= FRAMES; i++) {
    draw(c, i / FPS, m, brand, name);
    // part0 is the animation; part1 is the last frame, held until boot completes
    files.push([frameName(i), png(c.px, w, h)]);
    if (progress) await progress(i);
  }
  return { zip: storedZip(files), logo: bmp(c.px, w, h) };
}

/** One frame as a PNG, for a preview. */
export function preview(w: number, h: number, t: number, m: Mark, brand: string, name: string): Uint8Array {
  const c = canvas(w, h);
  draw(c, t, m, brand, name);
  return png(c.px, w, h);
}

/** What to do with the files, as the Android version said it once they were made. */
export function instructions(where: string, usbPath: string | null, appLabel: string | null): string {
  const saved = 'Saved in ' + where + (usbPath ? ' and on ' + usbPath : '') + '.';
  const usb = usbPath === null
    ? 'Copy bootlogo.bmp and bootanimation.zip to the top folder of a USB stick, plus bootlogo.bmp into a folder ' +
      'named logo on it (with the file manager, or from a computer), and plug it into the stereo.'
    : "They're already on the USB stick; keep it plugged in.";
  return saved + '\n\n' + usb + '\n\n' +
    'STILL BOOT LOGO (safe):\n' +
    "1. Open the stereo's Settings, then Factory settings (the code is in the stereo's manual or from the seller).\n" +
    '2. Find Logo, Car logo or Boot logo, choose Custom or Import, and pick bootlogo.bmp.\n' +
    '3. Note which logo was chosen before, so you can go back to it.\n\n' +
    'BOOT ANIMATION:\n' +
    (appLabel !== null
      ? 'This stereo has "' + appLabel + '". Open it and import bootanimation.zip from the USB stick.\n'
      : 'Some stereos have a Boot animation app (in the app list, or in Factory settings) that imports bootanimation.zip from a USB stick. ') +
    (appLabel !== null ? '' : 'Without one it needs a computer with ADB, and a mistake can stop the stereo from starting, so ' +
      "follow BOOT.md in OpenRath's source carefully and keep a copy of the original.");
}
