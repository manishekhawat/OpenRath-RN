/**
 * The settings store for the app (the React Native side of Prefs.java): every value is a string
 * by key, kept in memory for synchronous reads and saved to AsyncStorage shortly after a change.
 * Components that call usePrefs() re-render when anything changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Prefs } from '../logic/prefs';

const KEY = 'openrath:prefs';

interface Ctx {
  prefs: Prefs;
  /** bumps on every change, so memoised values can depend on it */
  version: number;
}

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const values = useRef(new Map<string, string>());
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) values.current.set(k, v);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const prefs = useMemo<Prefs>(() => {
    const changed = () => {
      setVersion((n) => n + 1);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(values.current))).catch(() => {});
      }, 300);
    };
    return {
      str: (k, d) => values.current.get(k) ?? d,
      put: (k, v) => {
        if (values.current.get(k) === v) return;
        values.current.set(k, v);
        changed();
      },
      all: () => Object.fromEntries(values.current),
      remove: (k) => {
        if (values.current.delete(k)) changed();
      },
    };
  }, []);

  const value = useMemo(() => ({ prefs, version }), [prefs, version]);
  if (!loaded) return null;
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}
