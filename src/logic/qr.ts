import qrcode from 'qrcode-generator';

/**
 * A QR code for a phone to scan: a link to the parking spot, a trip, a UPI payment (port of
 * Qr.java). Phones read a code off a car screen badly when it is small, dim or smoothed, so the
 * screens draw it large, in sharp whole pixels, with a wide white border.
 */

/** Quiet border in modules; the standard asks for 4. */
export const BORDER = 4;

const LEVELS = ['L', 'M', 'Q', 'H'] as const;

/** The text as one character per UTF-8 byte, which is how the library's byte mode reads it. */
function utf8(text: string): string {
  let s = '';
  for (const b of new TextEncoder().encode(text)) s += String.fromCharCode(b);
  return s;
}

function make(text: string, version: number, level: (typeof LEVELS)[number]) {
  const q = qrcode(version as Parameters<typeof qrcode>[0], level);
  q.addData(utf8(text), 'Byte');
  q.make();
  return q;
}

/**
 * The code's modules, rows of columns: true is dark. Low error correction keeps the modules big;
 * like the Android encoder, a higher level is used when it fits in the same size.
 */
export function modules(text: string): boolean[][] {
  let q = make(text, 0, 'L');
  const version = (q.getModuleCount() - 17) / 4;
  for (const level of LEVELS.slice(1)) {
    try {
      q = make(text, version, level);
    } catch {
      break; // doesn't fit at this size
    }
  }
  const n = q.getModuleCount();
  const m: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x++) row.push(q.isDark(y, x));
    m.push(row);
  }
  return m;
}

/**
 * The dark modules as one SVG path in module units, with the quiet border already added
 * (so the viewBox is 0 0 size size), and that size.
 */
export function path(m: boolean[][]): { d: string; size: number } {
  let d = '';
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) {
      if (!m[y][x]) continue;
      // run of dark modules along the row, drawn as one rectangle
      let w = 1;
      while (x + w < m.length && m[y][x + w]) w++;
      d += `M${x + BORDER} ${y + BORDER}h${w}v1h${-w}z`;
      x += w - 1;
    }
  }
  return { d, size: m.length + 2 * BORDER };
}

/** The pixels per module for a code at most `px` wide: a whole number, at least 1. */
export function scale(m: boolean[][], px: number): number {
  return Math.max(1, Math.floor(px / (m.length + 2 * BORDER)));
}
