/**
 * The settings for the screens: the store in store.ts (which the background trip task shares),
 * with a version number so components that call usePrefs() re-render when anything changes.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Prefs } from '../logic/prefs';
import * as Store from './store';

interface Ctx {
  prefs: Prefs;
  /** bumps on every change, so memoised values can depend on it */
  version: number;
}

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(Store.loaded());
  const [version, setVersion] = useState(Store.version());

  useEffect(() => {
    const off = Store.subscribe(() => setVersion(Store.version()));
    Store.load().then(() => {
      setVersion(Store.version());
      setLoaded(true);
    });
    return off;
  }, []);

  const value = useMemo(() => ({ prefs: Store.prefs, version }), [version]);
  if (!loaded) return null;
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}
