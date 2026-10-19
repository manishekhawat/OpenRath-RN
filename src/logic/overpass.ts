/**
 * Good manners towards the free Overpass API (OverpassGate.java), shared by the speed alerts and
 * the road ahead: at least 8 seconds between any two questions, and after a failed one a wait that
 * doubles each time (a minute at least when the server says it is busy), up to 5 minutes, until a
 * question gets an answer again. Speed cameras are kept for each square of about 5 km, in memory
 * and on the unit for a week, so driving there again needn't ask for them again.
 */

export const GAP_MS = 8000;
export const FIRST_WAIT_MS = 10000;
export const BUSY_WAIT_MS = 60000;
export const MAX_WAIT_MS = 5 * 60000;

/** The statuses that mean the server is busy rather than the question being wrong. */
export const BUSY_CODES = [429, 503, 504];

/** How long between questions, and how long to stand back after one failed. */
export class Gate {
  private nextAt = 0;
  private wait = 0;

  /** Whether a question may go out now. */
  may(now: number): boolean {
    return now >= this.nextAt;
  }

  /** True, and counted as sent, when a question may go out now; false to wait. */
  take(now: number): boolean {
    if (now < this.nextAt) return false;
    this.nextAt = now + GAP_MS;
    return true;
  }

  /** An answer came: no more waiting than the usual gap. */
  worked(): void {
    this.wait = 0;
  }

  /** No answer: `code` is the server's HTTP status, or 0 when it couldn't be reached. */
  failed(now: number, code: number): void {
    this.wait = this.wait === 0 ? FIRST_WAIT_MS : Math.min(MAX_WAIT_MS, this.wait * 2);
    if (BUSY_CODES.includes(code)) this.wait = Math.max(this.wait, BUSY_WAIT_MS);
    this.nextAt = Math.max(this.nextAt, now + this.wait);
  }

  /** How long the last failure made us wait, in ms (0 after an answer). */
  waiting(): number {
    return this.wait;
  }
}

/** The one the app uses, for the limits, the cameras and the road ahead alike. */
export const shared = new Gate();

/** The HTTP status behind an error thrown by the fetch helpers, or 0. */
export function code(e: unknown): number {
  const m = /\b(\d{3})\b/.exec(e instanceof Error ? e.message : String(e));
  return m ? parseInt(m[1], 10) : 0;
}

// ------------------------------------------------------------------ speed cameras by square

/** A square's side in degrees: about 5.5 km. */
export const CELL = 0.05;
/** How far past its square a square's cameras are fetched, in degrees (about 1 km). */
export const MARGIN = 0.01;
/** A square's cameras are asked for again after this long. */
export const KEEP_MS = 7 * 24 * 3600 * 1000;
/** Squares kept in memory. */
export const SQUARES = 32;

export interface Camera {
  lat: number;
  lon: number;
  limit: number;
}

/** The square a place is in, as "row_column". */
export function cell(lat: number, lon: number): string {
  return Math.floor(lat / CELL) + '_' + Math.floor(lon / CELL);
}

/** [south, west, north, east] of a square with the margin around it, for an Overpass bbox. */
export function box(id: string): [number, number, number, number] {
  const [r, c] = id.split('_').map((x) => parseInt(x, 10));
  const s = r * CELL;
  const w = c * CELL;
  return [s - MARGIN, w - MARGIN, s + CELL + MARGIN, w + CELL + MARGIN];
}

/** Overpass's "(south,west,north,east)" for a square. */
export function bbox(id: string): string {
  return '(' + box(id).map((v) => v.toFixed(5)).join(',') + ')';
}

/** A square's cameras as text: the time they were fetched, then a line each. */
export function write(cams: readonly Camera[], at: number): string {
  return (
    at +
    '\n' +
    cams.map((c) => `${c.lat.toFixed(6)},${c.lon.toFixed(6)},${Math.round(c.limit)}`).join('\n') +
    (cams.length ? '\n' : '')
  );
}

/** The cameras in text from write(), or null when it is older than a week or unreadable. */
export function read(text: string | null | undefined, now: number): Camera[] | null {
  if (!text) return null;
  const lines = text.split('\n');
  const at = parseInt(lines[0].trim(), 10);
  if (!Number.isFinite(at) || now - at > KEEP_MS || at > now + 3600000) return null;
  const out: Camera[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.split(',').map(Number);
    if (f.length < 3 || !f.every((v) => Number.isFinite(v))) return null;
    out.push({ lat: f[0], lon: f[1], limit: f[2] });
  }
  return out;
}

/** The cameras of the squares driven through lately, the newest-used 32 of them. */
export class Cameras {
  private mem = new Map<string, { at: number; cams: Camera[] }>();

  /** From memory, or null: cheap enough for every fix. */
  remembered(id: string, now: number): Camera[] | null {
    const kept = this.mem.get(id);
    if (!kept) return null;
    if (now - kept.at > KEEP_MS) {
      this.mem.delete(id);
      return null;
    }
    // used again, so it goes to the back of the queue of squares to let go of
    this.mem.delete(id);
    this.mem.set(id, kept);
    return kept.cams;
  }

  /** Keep a square's cameras, letting the least recently used square go. */
  keep(id: string, cams: Camera[], now: number): void {
    this.mem.delete(id);
    this.mem.set(id, { at: now, cams });
    while (this.mem.size > SQUARES) {
      const oldest = this.mem.keys().next();
      if (oldest.done) break;
      this.mem.delete(oldest.value);
    }
  }

  size(): number {
    return this.mem.size;
  }

  forget(): void {
    this.mem.clear();
  }
}

/** The key a square's cameras are kept under on the unit. */
export function key(id: string): string {
  return 'cams:' + id;
}

/** The keys of squares last fetched over a week ago, to drop from the unit. */
export function stale(keys: readonly string[], text: (k: string) => string, now: number): string[] {
  return keys.filter((k) => k.startsWith('cams:') && read(text(k), now) === null);
}
