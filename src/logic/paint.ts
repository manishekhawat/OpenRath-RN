/**
 * The sums behind the picture layouts (src/components/LayoutView.tsx): how wide a piece of text
 * comes out, where a point on a dial sits, the paths of an arc and a rounded card, and the two
 * colour tricks the drawing needs. They were part of LayoutView.java's drawing code; here they
 * are kept apart from the drawing so the numbers can be checked without a screen.
 */

export type Weight = 'light' | 'reg' | 'med' | 'bold';

/** Average letter width per point of size, for fitting text (Roboto). */
const AVG: Record<Weight, number> = { light: 0.5, reg: 0.52, med: 0.54, bold: 0.56 };

export function charW(c: string, size: number, wt: Weight): number {
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

/** A point on a circle at an Android canvas angle (degrees, clockwise from 3 o'clock). */
export function at(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** An arc like Canvas.drawArc: from `start` degrees, `sweep` degrees clockwise. */
export function arc(cx: number, cy: number, r: number, start: number, sweep: number): string {
  const [x0, y0] = at(cx, cy, r, start);
  const [x1, y1] = at(cx, cy, r, start + sweep);
  return `M${x0} ${y0} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
}

/** A colour with its alpha replaced. */
export function faded(col: string, alpha: number): string {
  return col.substring(0, 7) + Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Ui.mix: t of a, the rest of b. Only the six hex digits of each colour are read, so a colour
 * that carries an alpha ("#1A1A1AFF") mixes the same as the plain "#1A1A1A" the settings screens
 * cut it down to.
 */
export function mix(a: string, b: string, t: number): string {
  const ch = (c: string, i: number) => parseInt(c.substring(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0'));
  return ('#' + out.join('')).toUpperCase();
}
