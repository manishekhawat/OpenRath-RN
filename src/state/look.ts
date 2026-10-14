/** The active theme, from Settings > Dashboard > Theme. */
import { useMemo } from 'react';

import auto from '../data/theme-auto.json';
import genz from '../data/theme-genz.json';
import light from '../data/theme-light.json';
import magmaGrey from '../data/theme-magma-grey.json';
import minimal from '../data/theme-minimal.json';
import { lookOf, type Look, type ThemeJson } from '../logic/theme';
import { usePrefs } from './prefs';

/** The five themes built into the app; ids start with @ as in the Android version. */
export const BUILT_IN: { id: string; json: ThemeJson }[] = [
  { id: '@magma-grey', json: magmaGrey },
  { id: '@light', json: light },
  { id: '@minimal', json: minimal },
  { id: '@auto', json: auto },
  { id: '@genz', json: genz },
];
export const DEFAULT_THEME = '@magma-grey';

export function themeJson(id: string): ThemeJson {
  return (BUILT_IN.find((t) => t.id === id) ?? BUILT_IN[0]).json;
}

export function useLook(): Look {
  const { prefs, version } = usePrefs();
  const id = prefs.str('theme', DEFAULT_THEME);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => lookOf(themeJson(id)), [id, version]);
}
