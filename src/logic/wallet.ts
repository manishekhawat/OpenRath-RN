/**
 * The car documents wallet (port of Wallet.java): photos (or PDFs) of the RC, insurance, PUC and
 * driving licence, kept inside the app's own folder so they show with no network and nobody
 * deletes them by accident, to show at a check. Each is stored as "<doc>-<time>.<ext>" in the
 * 'documents' folder (the time, so a replaced picture never shows from the image cache); the
 * screen does the file work, this the naming.
 */
import { f, t } from './i18n.ts';

export const DOCS = ['rc', 'insurance', 'puc', 'licence'];
export const NAMES = ['RC (registration)', 'Insurance', 'PUC certificate', 'Driving licence'];
/** The folder inside the app's document directory. */
export const DIR = 'documents';

const PICTURE = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

/**
 * Which document a file is, by its name, or -1: "RC_front.jpg" is the RC. Like the Android
 * version only pictures count, unless `pdf` allows PDFs too.
 */
export function which(fileName: string, pdf = false): number {
  const n = fileName.toLowerCase();
  if (!(n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || (pdf && n.endsWith('.pdf')))) return -1;
  if (n.startsWith('rc') || n.includes('registration')) return 0;
  if (n.startsWith('insurance') || n.startsWith('policy')) return 1;
  if (n.startsWith('puc') || n.includes('pollution')) return 2;
  if (n.startsWith('licence') || n.startsWith('license') || n.startsWith('dl')) return 3;
  return -1;
}

/** The extension to keep a picked file under: from its name, else its type; "jpg" when unsure. */
export function ext(name: string | null | undefined, mime: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name ?? '');
  const e = m ? m[1].toLowerCase() : '';
  if (e === 'pdf' || PICTURE.includes(e)) return e === 'jpeg' ? 'jpg' : e;
  const t = (mime ?? '').toLowerCase();
  if (t === 'application/pdf') return 'pdf';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/heic') return 'heic';
  return 'jpg';
}

export function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

export function mime(name: string): string {
  const e = ext(name, null);
  return e === 'pdf' ? 'application/pdf' : e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : e === 'heic' ? 'image/heic' : 'image/jpeg';
}

/** The file name a document is kept under: "rc-1760000000000.jpg", or "rc.jpg" with no time. */
export function fileName(i: number, e: string, t?: number): string {
  return DOCS[i] + (t ? '-' + t : '') + '.' + e;
}

/** Of the files in the folder, the one holding document i (the newest if there are several), or null. */
export function stored(names: string[], i: number): string | null {
  const re = new RegExp('^' + DOCS[i] + '(-(\\d+))?\\.[a-z0-9]+$', 'i');
  let best: string | null = null;
  let bestT = -1;
  for (const n of names) {
    const m = re.exec(n);
    if (!m) continue;
    const t = m[2] ? Number(m[2]) : 0;
    if (t > bestT) {
      best = n;
      bestT = t;
    }
  }
  return best;
}

/** For each document, its file in the folder (or null). */
export function index(names: string[]): (string | null)[] {
  return DOCS.map((_, i) => stored(names, i));
}

/** "2 of 4 added", for the Settings row. */
export function countText(names: string[]): string {
  return f('%1$s of 4 added', index(names).filter((n) => n != null).length);
}

/** Under the picture while showing: the name, and how to get to the next one. */
export function label(i: number, at: number, have: number): string {
  return t(NAMES[i]) + (have > 1 ? f('   ·   tap for the next (%1$s of %2$s)', at + 1, have) : '');
}

/** What an import of several files found, by name. */
export function importText(got: string[]): string {
  return got.length === 0
    ? t('Nothing to import. Pick files named rc, insurance, puc or licence (.jpg, .png or .pdf).')
    : f('Imported: %1$s.', got.join(', '));
}
