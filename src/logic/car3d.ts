/**
 * The owner's car in 3D (port of Car3D.java, new in 1.30): a low-poly body in one of four shapes
 * (hatchback, saloon, SUV, MUV), in the car's colour, with the number plate, lamps and wheels, on
 * a 360 ground ring. No model files and no 3D library: the faces are built here and painted back
 * to front (the screen draws them as SVG polygons). Metres; x to the car's right, y up, z forward.
 */
import type { Prefs } from './prefs.ts';

export type V3 = [number, number, number];
export type P2 = [number, number, number]; // screen x, y and depth

export const SHAPES = ['hatch', 'sedan', 'suv', 'muv'] as const;
export const SHAPE_NAMES = ['Hatchback', 'Saloon (sedan)', 'SUV', 'MUV / people carrier'];

export const BODY = 0, GLASS = 1, TYRE = 2, HUB = 3, HEAD = 4, TAIL = 5, GRILLE = 6, PLATE = 7, UNDER = 8;

/** Common Indian car colours: name and colour. */
export const COLOUR_NAMES = ['Pearl white', 'Silver', 'Grey', 'Black', 'Red', 'Blue', 'Brown', 'Orange', 'Green', 'Beige'];
export const COLOURS = ['#E9ECEF', '#B7BCC2', '#5E646B', '#16181B', '#B3121B', '#1E4F9C', '#5A3A26', '#D3601E', '#2F5E3A', '#CDBA96'];

/** A flat polygon, its outward normal and the smaller shapes painted on it. */
export interface Face {
  p: V3[];
  kind: number;
  n: V3;
  c: V3;
  /** [kind, u0, u1, v0, v1]: windows, lamps, the plate, laid on a four-cornered face. */
  decals: number[][];
  /** Drawing layer: underbody 0, wheels 1, lower body 2, cabin 3. */
  layer: number;
}

export const v = (x: number, y: number, z: number): V3 => [x, y, z];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.sqrt(dot(a, a));
export function norm(a: V3): V3 {
  const l = len(a);
  return l === 0 ? a : [a[0] / l, a[1] / l, a[2] / l];
}

function centroid(p: V3[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const q of p) for (let i = 0; i < 3; i++) c[i] += q[i] / p.length;
  return c;
}

/** Newell's normal: right for any flat-ish polygon, whatever its first three points. */
export function normal(p: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm(n);
}

function face(kind: number, layer: number, centre: V3, ...pts: V3[]): Face {
  const c = centroid(pts);
  let n = normal(pts);
  // outward: away from the part's centre
  if (dot(n, sub(c, centre)) < 0) n = [-n[0], -n[1], -n[2]];
  return { p: pts, kind, n, c, decals: [], layer };
}

function decal(f: Face, k: number, u0: number, u1: number, v0: number, v1: number): Face {
  f.decals.push([k, u0, u1, v0, v1]);
  return f;
}

/** Sizes of each shape: L, W, H, sill, belt, hood, wheelbase, tyre radius, rearGlassBase, roofRear, roofFront, windscreenBase. */
export function dims(shape: string): number[] {
  if (shape === 'sedan') return [4.4, 1.73, 1.48, 0.17, 0.92, 0.78, 2.6, 0.3, -1.35, -0.75, 0.35, 1.05];
  if (shape === 'suv') return [4.3, 1.79, 1.68, 0.24, 1.05, 0.98, 2.6, 0.34, -2.07, -1.97, 0.55, 1.15];
  if (shape === 'muv') return [4.4, 1.75, 1.75, 0.2, 1.0, 0.9, 2.75, 0.32, -2.14, -2.08, 0.75, 1.4];
  return [3.85, 1.73, 1.5, 0.18, 0.95, 0.8, 2.45, 0.3, -1.81, -1.63, 0.35, 1.05];
}

export function shape(p: Prefs): string {
  const s = p.str('carShape', '');
  if ((SHAPES as readonly string[]).includes(s)) return s;
  return p.str('carBody', 'car') === 'suv' ? 'suv' : 'hatch';
}

/**
 * The car's colour as #RRGGBB. Saved the way the Android version saves it (the signed ARGB
 * integer, e.g. "-1446673" for pearl white) so backups carry over; #RRGGBB is read too.
 */
export function colour(p: Prefs): string {
  const s = p.str('carColour', '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  const n = parseInt(s, 10);
  if (/^-?\d+$/.test(s) && Number.isFinite(n)) return '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
  return COLOURS[0];
}

/** What to save as 'carColour' for a #RRGGBB colour: Java's String.valueOf(int) of the opaque ARGB. */
export function colourPref(hex: string): string {
  return String((0xff000000 | parseInt(hex.substring(1, 7), 16)) | 0);
}

/** The number plate: the cab's vehicle number when there is one. */
export function plate(p: Prefs): string {
  let s = p.str('carPlate', '');
  if (s === '') s = p.str('cabVehicle', '');
  return s.trim().toUpperCase();
}

/** Every face of the car. */
export function build(shapeId: string): Face[] {
  const d = dims(shapeId);
  const [L, W, H, sill, belt, hood, wb, r, zRB, zRR, zRF, zWS] = d;
  const f: Face[] = [];
  const lowC = v(0, (sill + belt) / 2, 0);

  // lower body: five stations from the rear bumper to the nose
  const zs = [-L / 2, -L / 2 + 0.12, zWS, L / 2 - 0.12, L / 2];
  const top = [belt - 0.05, belt, belt, hood, hood - 0.1];
  const bot = [sill + 0.12, sill, sill, sill, sill + 0.15];
  const hw = [W / 2 - 0.1, W / 2, W / 2, W / 2 - 0.04, W / 2 - 0.14];
  for (let i = 0; i < 4; i++)
    f.push(face(BODY, 2, lowC, v(-hw[i], top[i], zs[i]), v(hw[i], top[i], zs[i]), v(hw[i + 1], top[i + 1], zs[i + 1]), v(-hw[i + 1], top[i + 1], zs[i + 1])));
  // the sides, with the wheel arches cut out
  for (let side = -1; side <= 1; side += 2) {
    const pts: V3[] = [];
    for (let i = 0; i < 5; i++) pts.push(v(side * hw[i], top[i], zs[i]));
    pts.push(v(side * hw[4], bot[4], zs[4]));
    const ra = r + 0.05;
    for (const zc of [wb / 2, -wb / 2]) {
      const t0 = Math.asin(Math.max(-1, (sill - r) / ra));
      for (let k = 0; k <= 10; k++) {
        const t = t0 + ((Math.PI - 2 * t0) * k) / 10;
        pts.push(v((side * W) / 2, r + ra * Math.sin(t), zc + ra * Math.cos(t)));
      }
    }
    pts.push(v(side * hw[0], bot[0], zs[0]));
    f.push(face(BODY, 2, lowC, ...pts));
  }
  // rear and front, seen from outside: bottom-left, bottom-right, top-right, top-left
  const rear = face(BODY, 2, lowC, v(hw[0], bot[0], zs[0]), v(-hw[0], bot[0], zs[0]), v(-hw[0], top[0], zs[0]), v(hw[0], top[0], zs[0]));
  decal(decal(decal(rear, TAIL, 0.03, 0.24, 0.62, 0.9), TAIL, 0.76, 0.97, 0.62, 0.9), PLATE, 0.35, 0.65, 0.22, 0.48);
  f.push(rear);
  const front = face(BODY, 2, lowC, v(-hw[4], bot[4], zs[4]), v(hw[4], bot[4], zs[4]), v(hw[4], top[4], zs[4]), v(-hw[4], top[4], zs[4]));
  decal(decal(decal(decal(front, HEAD, 0.05, 0.3, 0.58, 0.9), HEAD, 0.7, 0.95, 0.58, 0.9), GRILLE, 0.34, 0.66, 0.38, 0.8), PLATE, 0.37, 0.63, 0.06, 0.3);
  f.push(front);
  // underbody, so nothing shows through under the car
  f.push(face(UNDER, 0, v(0, sill + 1, 0), v(-hw[2], sill, zs[0]), v(hw[2], sill, zs[0]), v(hw[2], sill, zs[4]), v(-hw[2], sill, zs[4])));

  // the cabin: a frustum from the waist to the roof
  const bw = W / 2 - 0.03;
  const rw = W / 2 - 0.15;
  const cabC = v(0, (belt + H) / 2, (zRB + zWS) / 2);
  f.push(face(BODY, 3, cabC, v(-rw, H, zRR), v(rw, H, zRR), v(rw, H, zRF), v(-rw, H, zRF)));
  f.push(decal(face(BODY, 3, cabC, v(bw, belt, zRB), v(-bw, belt, zRB), v(-rw, H, zRR), v(rw, H, zRR)), GLASS, 0.07, 0.93, 0.1, 0.9));
  f.push(decal(face(BODY, 3, cabC, v(-bw, belt, zWS), v(bw, belt, zWS), v(rw, H, zRF), v(-rw, H, zRF)), GLASS, 0.05, 0.95, 0.06, 0.92));
  for (let side = -1; side <= 1; side += 2) {
    const a = v(side * bw, belt, side < 0 ? zWS : zRB);
    const b = v(side * bw, belt, side < 0 ? zRB : zWS);
    const c = v(side * rw, H, side < 0 ? zRR : zRF);
    const e = v(side * rw, H, side < 0 ? zRF : zRR);
    // two windows either side of the B pillar
    f.push(decal(decal(face(BODY, 3, cabC, a, b, c, e), GLASS, 0.05, 0.48, 0.1, 0.88), GLASS, 0.53, 0.95, 0.1, 0.88));
  }

  // wheels: twelve-sided tyres with a hub
  for (let sx = -1; sx <= 1; sx += 2)
    for (let sz = -1; sz <= 1; sz += 2) {
      const xo = sx * (W / 2 + 0.01);
      const xi = sx * (W / 2 - 0.19);
      const zc = (sz * wb) / 2;
      const wc = v(sx * (W / 2 - 0.09), r, zc);
      const n = 12;
      const cap: V3[] = [];
      const hub: V3[] = [];
      for (let k = 0; k < n; k++) {
        const a0 = (2 * Math.PI * k) / n;
        const a1 = (2 * Math.PI * (k + 1)) / n;
        cap.push(v(xo, r + r * Math.sin(a0), zc + r * Math.cos(a0)));
        hub.push(v(xo + sx * 0.005, r + 0.62 * r * Math.sin(a0), zc + 0.62 * r * Math.cos(a0)));
        f.push(
          face(TYRE, 1, wc,
            v(xo, r + r * Math.sin(a0), zc + r * Math.cos(a0)), v(xo, r + r * Math.sin(a1), zc + r * Math.cos(a1)),
            v(xi, r + r * Math.sin(a1), zc + r * Math.cos(a1)), v(xi, r + r * Math.sin(a0), zc + r * Math.cos(a0))),
        );
      }
      f.push(face(TYRE, 1, wc, ...cap));
      f.push(face(HUB, 1, wc, ...hub));
    }
  return f;
}

// ------------------------------------------------------------------ the camera

/** Where the eye is, orbiting the car: yaw 0 looks at the nose, yaw pi at the tail; pitch 0 level, pi/2 from above. */
export class Cam {
  yaw = 0.7;
  pitch = 0.42;
  dist = 6.8;
  readonly target: V3 = [0, 0.7, 0];
  eye: V3 = [0, 0, 0];
  f: V3 = [0, 0, 1];
  r: V3 = [1, 0, 0];
  u: V3 = [0, 1, 0];
  cx = 0;
  cy = 0;
  focal = 1;

  setup(w: number, h: number) {
    const cp = Math.cos(this.pitch);
    // further back from above, so the whole car and its ring fit
    const dd = this.dist + 3.2 * Math.pow(this.pitch / 1.53, 3);
    const t = this.target;
    this.eye = [t[0] + dd * cp * Math.sin(this.yaw), t[1] + dd * Math.sin(this.pitch), t[2] + dd * cp * Math.cos(this.yaw)];
    this.f = norm(sub(t, this.eye));
    this.r = norm(cross(this.f, [0, 1, 0]));
    this.u = cross(this.r, this.f);
    this.cx = w / 2;
    this.cy = h / 2;
    this.focal = Math.min(w, h * 1.45) * 1.05;
  }

  /** Screen x, y and depth. */
  project(p: V3): P2 {
    const d = sub(p, this.eye);
    const z = Math.max(0.05, dot(d, this.f));
    return [this.cx + (dot(d, this.r) / z) * this.focal, this.cy - (dot(d, this.u) / z) * this.focal, z];
  }
}

// ------------------------------------------------------------------ painting

const LIGHT = norm([-0.3, 0.9, 0.3]);

export function base(kind: number, col: string, lightsOn: boolean): string {
  switch (kind) {
    case GLASS:
      return '#233140';
    case TYRE:
      return '#17181A';
    case HUB:
      return '#C3C7CC';
    case HEAD:
      return lightsOn ? '#FFF6D8' : '#D9E2EC';
    case TAIL:
      return lightsOn ? '#FF2A2A' : '#A3121A';
    case GRILLE:
      return '#101113';
    case UNDER:
      return '#0B0B0C';
    default:
      return col;
  }
}

/** Lambert light from above, front left; glass and lamps keep more of their colour. */
export function shade(hex: string, n: V3, kind: number): string {
  const l = Math.max(0, dot(n, LIGHT));
  const k = kind === HEAD || kind === TAIL ? 0.8 + 0.2 * l : kind === GLASS ? 0.55 + 0.65 * l : 0.46 + 0.62 * l;
  const v = parseInt(hex.substring(1), 16);
  const ch = (x: number) => Math.min(255, Math.trunc(x * k));
  const r = ch((v >> 16) & 255);
  const g = ch((v >> 8) & 255);
  const b = ch(v & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const lerp = (a: number[], b: number[], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A point on a four-cornered screen polygon (bottom-left, bottom-right, top-right, top-left). */
export function bilerp(q: number[][], u: number, w: number): [number, number] {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), w);
}

/**
 * What to draw: the ground, then the polygons back to front with their fill. The number plates
 * come as four screen corners (bottom-left, bottom-right, top-right, top-left); each is drawn
 * right after polys[at - 1], so it sits in its face's place in the painting order.
 */
export interface Paint {
  ground: { rings: { pts: number[][]; colour: string; opacity: number }[]; spokes: number[][][]; shadow: number[][] };
  polys: { pts: number[][]; fill: string }[];
  plates: { q: number[][]; at: number }[];
}

/** Ring, spoke and shadow colours (Car3D.ground's 0x40FFC14D, 0x2EFFFFFF, 0x22FFFFFF, 0xA0000000). */
export const GROUND = { inner: ['#FFC14D', 0x40 / 255], outer: ['#FFFFFF', 0x2e / 255], spoke: ['#FFFFFF', 0x22 / 255], shadow: ['#000000', 0xa0 / 255] } as const;

/** Everything the camera sees, back to front, ready to draw (Car3D.draw without the Canvas). */
export function paint(cam: Cam, w: number, h: number, faces: Face[], d: number[], col: string, lightsOn: boolean): Paint {
  cam.setup(w, h);
  // the 360 ring around the car, and its shadow
  const rings = [3.0, 4.6].map((rad) => ({
    pts: Array.from({ length: 48 }, (_, i) => {
      const a = (2 * Math.PI * i) / 48;
      return cam.project(v(rad * Math.sin(a) * 0.82, 0, rad * Math.cos(a)));
    }),
    colour: rad < 4 ? GROUND.inner[0] : GROUND.outer[0],
    opacity: rad < 4 ? GROUND.inner[1] : GROUND.outer[1],
  }));
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
    return [cam.project(v(2.3 * Math.sin(a) * 0.82, 0, 2.3 * Math.cos(a))), cam.project(v(4.6 * Math.sin(a) * 0.82, 0, 4.6 * Math.cos(a)))];
  });
  const shadow = Array.from({ length: 24 }, (_, i) => {
    const a = (2 * Math.PI * i) / 24;
    return cam.project(v(d[1] * 0.62 * Math.sin(a), 0, d[0] * 0.56 * Math.cos(a)));
  });

  // faces turned towards the eye (the underbody always), by layer, then furthest first
  const vis = faces.filter((fa) => fa.layer === 0 || dot(fa.n, sub(cam.eye, fa.c)) > 0);
  vis.sort((a, b) => (a.layer !== b.layer ? a.layer - b.layer : len(sub(b.c, cam.eye)) - len(sub(a.c, cam.eye))));
  const polys: Paint['polys'] = [];
  const plates: Paint['plates'] = [];
  for (const fa of vis) {
    const s = fa.p.map((p) => cam.project(p));
    polys.push({ pts: s, fill: shade(base(fa.kind, col, lightsOn), fa.n, fa.kind) });
    for (const dc of fa.decals) {
      const kind = dc[0];
      const q = [bilerp(s, dc[1], dc[3]), bilerp(s, dc[2], dc[3]), bilerp(s, dc[2], dc[4]), bilerp(s, dc[1], dc[4])];
      if (kind === PLATE) plates.push({ q, at: polys.length });
      else polys.push({ pts: q, fill: shade(base(kind, col, lightsOn), fa.n, kind) });
    }
  }
  return { ground: { rings, spokes, shadow }, polys, plates };
}

/** The plate picture's size and look (Car3D.plate): white, or yellow for a taxi, with the blue IND strip. */
export const PLATE_W = 520;
export const PLATE_H = 112;
export function plateText(text: string): string {
  return text === '' ? 'OPENRATH' : text;
}

/**
 * The affine matrix [a, b, c, d, e, f] (SVG's matrix()) that lays the plate picture on its
 * quad: picture bottom-left, bottom-right and top-left go to q[0], q[1] and q[3]. Android used
 * a full perspective setPolyToPoly; on a plate this small the affine fit looks the same.
 */
export function plateMatrix(q: number[][]): number[] {
  const [x0, y0] = q[0];
  const [x1, y1] = q[1];
  const [x3, y3] = q[3];
  // picture (u, v) → screen: u along the bottom edge, v up the left edge, origin at the top-left
  const a = (x1 - x0) / PLATE_W;
  const b = (y1 - y0) / PLATE_W;
  const c = (x0 - x3) / PLATE_H;
  const d = (y0 - y3) / PLATE_H;
  return [a, b, c, d, x3, y3];
}

/** Names that 360 camera apps go by (View360.looks360). */
export function looks360(pkg: string, label: string): boolean {
  const s = (pkg + ' ' + label).toLowerCase();
  return /(360|\bavm\b|\.avm|panoram|surround|bird.?s?.?eye|around.?view|全景)/.test(s);
}
