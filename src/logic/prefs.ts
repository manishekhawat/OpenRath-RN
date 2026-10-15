/**
 * The settings store every feature reads from, as plain strings by key (the same keys the
 * Android app's Prefs.str/put used, so a backup's values carry over). The logic in this folder
 * only needs this interface, so it runs in tests with an in-memory map.
 */
export interface Prefs {
  str(key: string, def: string): string;
  put(key: string, value: string): void;
  /** every key and value, for profiles and backups */
  all?(): Record<string, string>;
  remove?(key: string): void;
}

export function num(p: Prefs, key: string, def: number): number {
  const v = parseInt(p.str(key, String(def)), 10);
  return Number.isFinite(v) ? v : def;
}

export function memoryPrefs(init: Record<string, string> = {}): Prefs {
  const m = new Map(Object.entries(init));
  return {
    str: (k, d) => (m.has(k) ? (m.get(k) as string) : d),
    put: (k, v) => {
      m.set(k, v);
    },
    all: () => Object.fromEntries(m),
    remove: (k) => {
      m.delete(k);
    },
  };
}
