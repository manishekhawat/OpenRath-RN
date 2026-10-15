/**
 * The settings themselves (the React Native side of Prefs.java), outside React so the background
 * trip task can read them too: every value is a string by key, kept in memory for synchronous
 * reads, loaded from AsyncStorage once and saved shortly after a change. prefs.tsx wraps this for
 * the screens; `subscribe` tells it about changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Prefs } from '../logic/prefs';

const KEY = 'openrath:prefs';

const values = new Map<string, string>();
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let isLoaded = false;
let changes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Reads the saved settings, once; later calls get the same promise. It never fails. */
export function load(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) values.set(k, v);
      })
      .catch(() => {})
      .finally(() => {
        isLoaded = true;
      });
  }
  return loading;
}

export function loaded(): boolean {
  return isLoaded;
}

/** Bumps on every change. */
export function version(): number {
  return changes;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function write(): Promise<void> {
  // never save over the stored settings with a half-loaded map
  return load().then(() => AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(values))).catch(() => {}));
}

/** Saves now instead of in a moment (timers can wait while the app is behind another one). */
export function flush(): Promise<void> {
  if (!saveTimer) return Promise.resolve();
  clearTimeout(saveTimer);
  saveTimer = null;
  return write();
}

function changed() {
  changes++;
  for (const fn of [...listeners]) fn();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    write();
  }, 300);
}

export const prefs: Prefs = {
  str: (k, d) => values.get(k) ?? d,
  put: (k, v) => {
    if (values.get(k) === v) return;
    values.set(k, v);
    changed();
  },
  all: () => Object.fromEntries(values),
  remove: (k) => {
    if (values.delete(k)) changed();
  },
};
