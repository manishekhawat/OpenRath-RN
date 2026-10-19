/**
 * The settings themselves (the React Native side of Prefs.java), outside React so the background
 * trip task can read them too: every value is a string by key, kept in memory for synchronous
 * reads, loaded from AsyncStorage once and saved shortly after a change. prefs.tsx wraps this for
 * the screens; `subscribe` tells it about changes. The language is read as soon as they are in.
 * `reports` keeps the opt-in usage counts and crash notes (Reports.java) under their own key, so
 * they never go into backups or driver profiles, and `forecast` keeps the weather box's last
 * Open-Meteo answer under one of its own, as it is far too big to rewrite with every setting.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as I18n from '../logic/i18n';
import type { Prefs } from '../logic/prefs';

const KEY = 'openrath:prefs';
const REPORTS_KEY = 'openrath:reports';
const WEATHER_KEY = 'openrath:weather';
const MAPS_KEY = 'openrath:maps';

const values = new Map<string, string>();
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let isLoaded = false;
let changes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const mapValues = new Map<string, string>();

/** Reads the saved settings, once; later calls get the same promise. It never fails. */
export function load(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) values.set(k, v);
      })
      .catch(() => {})
      .then(() => AsyncStorage.getItem(REPORTS_KEY))
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) reportValues.set(k, v);
      })
      .catch(() => {})
      .then(() => AsyncStorage.getItem(WEATHER_KEY))
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) wxValues.set(k, v);
        takeOldForecast();
      })
      .catch(() => {})
      .then(() => AsyncStorage.getItem(MAPS_KEY))
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) mapValues.set(k, v);
      })
      .catch(() => {})
      .finally(() => {
        I18n.load(prefs);
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
  const jobs: Promise<void>[] = [];
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    jobs.push(write());
  }
  if (wxTimer) {
    clearTimeout(wxTimer);
    wxTimer = null;
    jobs.push(writeForecast());
  }
  return Promise.all(jobs).then(() => {});
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

// ------------------------------------------------------------------ usage reports' own store

const reportValues = new Map<string, string>();
let reportTimer: ReturnType<typeof setTimeout> | null = null;

function reportChanged() {
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    reportTimer = null;
    load().then(() => AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(Object.fromEntries(reportValues))).catch(() => {}));
  }, 300);
}

export const reports: Prefs = {
  str: (k, d) => reportValues.get(k) ?? d,
  put: (k, v) => {
    if (reportValues.get(k) === v) return;
    reportValues.set(k, v);
    reportChanged();
  },
  all: () => Object.fromEntries(reportValues),
  remove: (k) => {
    if (reportValues.delete(k)) reportChanged();
  },
};

// ------------------------------------------------------------------ the kept forecast's own store

const wxValues = new Map<string, string>();
let wxTimer: ReturnType<typeof setTimeout> | null = null;

function writeForecast(): Promise<void> {
  return load().then(() => AsyncStorage.setItem(WEATHER_KEY, JSON.stringify(Object.fromEntries(wxValues))).catch(() => {}));
}

function wxChanged() {
  if (wxTimer) clearTimeout(wxTimer);
  wxTimer = setTimeout(() => {
    wxTimer = null;
    writeForecast();
  }, 300);
}

/**
 * Up to 1.42 the forecast sat in the settings under 'wxSaved', so every later setting rewrote it:
 * an older install (or a backup restored into the settings) hands it over here, once.
 */
function takeOldForecast() {
  const body = values.get('wxSaved');
  if (body === undefined || wxValues.size > 0) return;
  wxValues.set('wxSaved', body);
  const at = values.get('wxSavedAt');
  if (at !== undefined) wxValues.set('wxSavedAt', at);
  wxChanged();
  values.delete('wxSaved');
  values.delete('wxSavedAt');
  changed();
}

/**
 * The weather box's last Open-Meteo answer ('wxSaved') and when it came in ('wxSavedAt'), under
 * their own key: tens of KB that would otherwise be written again with the whole settings map
 * every time any other setting changed.
 */
export const forecast: Prefs = {
  str: (k, d) => wxValues.get(k) ?? d,
  put: (k, v) => {
    if (wxValues.get(k) === v) return;
    wxValues.set(k, v);
    wxChanged();
  },
  all: () => Object.fromEntries(wxValues),
  remove: (k) => {
    if (wxValues.delete(k)) wxChanged();
  },
};

// ------------------------------------------------------------------ the map data kept for offline

let mapTimer: ReturnType<typeof setTimeout> | null = null;

function writeMaps(): Promise<void> {
  return load().then(() => AsyncStorage.setItem(MAPS_KEY, JSON.stringify(Object.fromEntries(mapValues))).catch(() => {}));
}

function mapsChanged() {
  if (mapTimer) clearTimeout(mapTimer);
  mapTimer = setTimeout(() => {
    mapTimer = null;
    writeMaps();
  }, 300);
}

/**
 * What the map answers are kept in: the speed cameras of each square of about 5 km, under their own
 * key, so a week of squares never rewrites the settings and never grows the file read at start-up.
 */
export const maps: Prefs = {
  str: (k, d) => mapValues.get(k) ?? d,
  put: (k, v) => {
    if (mapValues.get(k) === v) return;
    mapValues.set(k, v);
    mapsChanged();
  },
  all: () => Object.fromEntries(mapValues),
  remove: (k) => {
    if (mapValues.delete(k)) mapsChanged();
  },
};
