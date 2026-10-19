/**
 * Recover after deep sleep (port of Wake.java, 1.39). Many stereos don't shut down with the
 * ignition: they go into deep sleep with OpenRath still on screen, often without telling apps the
 * screen went off. On waking, the GPS, the music apps' link and the map can be stale. A check every
 * 15 seconds while the app is on screen (and on coming back to it) spots the sleep, and everything
 * that goes stale is started again.
 *
 * Android compares the boot clock (which runs on in sleep) with the awake clock (which doesn't);
 * here they are Date.now() and performance.now(), whose monotonic clock stops in deep sleep.
 */

export const CHECK_MS = 15000;
export const SLEPT_MS = 60000;

/** How long the unit was in deep sleep between two readings of the clocks, in ms. */
export function slept(elapsedBefore: number, uptimeBefore: number, elapsedNow: number, uptimeNow: number): number {
  if (elapsedBefore <= 0) return 0;
  return Math.max(0, elapsedNow - elapsedBefore - (uptimeNow - uptimeBefore));
}

/** The two clocks now: [boot-like, awake-only]. */
export function clocks(): [number, number] {
  const up = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  return [Date.now(), up];
}

const listeners = new Set<() => void>();

/** Run `fn` after each deep sleep (the music link and the map can start again here). */
export function onWoke(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The unit just woke from deep sleep: tell everyone who asked. */
export function woke(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      // one stale part doesn't stop the others
    }
  }
}

/**
 * The 15-second watch: feed it the clocks each time; true once per deep sleep longer than a
 * minute. A fresh start (or a pause, `reset`) never counts as sleep.
 */
export class Watch {
  private elapsed = 0;
  private uptime = 0;

  feed(elapsedNow: number, uptimeNow: number): boolean {
    const s = slept(this.elapsed, this.uptime, elapsedNow, uptimeNow);
    this.elapsed = elapsedNow;
    this.uptime = uptimeNow;
    return s > SLEPT_MS;
  }

  reset(): void {
    this.elapsed = 0;
    this.uptime = 0;
  }
}
