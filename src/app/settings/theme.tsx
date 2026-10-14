/** Settings > Theme: the five built-in themes, each shown in its own colours. */
import { Pressable, Text, View } from 'react-native';

import { Screen } from '../../components/ui';
import { lookOf } from '../../logic/theme';
import { BUILT_IN, DEFAULT_THEME, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function ThemeScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const current = prefs.str('theme', DEFAULT_THEME);
  return (
    <Screen title="Theme">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {BUILT_IN.map((t) => {
          const l = lookOf(t.json);
          const on = t.id === current;
          return (
            <Pressable
              key={t.id}
              onPress={() => prefs.put('theme', t.id)}
              style={{
                width: 220,
                padding: 14,
                borderRadius: l.radius,
                backgroundColor: l.gradient ? l.gradient[0] : l.background,
                borderWidth: on ? 3 : 1,
                borderColor: on ? look.accent : l.edge,
              }}
            >
              <View style={{ backgroundColor: l.panel, borderRadius: l.radius / 2, padding: 10, borderWidth: 1, borderColor: l.edge }}>
                <Text style={{ color: l.text, fontSize: 18, fontWeight: '600' }}>{t.json.name}</Text>
                <Text style={{ color: l.textDim, fontSize: 12 }}>{t.json.description}</Text>
                <View style={{ height: 6, backgroundColor: l.accent, borderRadius: 3, marginTop: 8, width: '40%' }} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
