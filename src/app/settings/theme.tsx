/**
 * Settings > Theme (ThemeGallery in the Android version): every theme as a small picture of the
 * home screen drawn in that theme's colours, two to a row. Tapping one switches to it. A theme
 * pack can ship its own preview.png to show instead. Theme packs (.zip of a theme folder, or a
 * lone theme.json; see THEMES.md) are imported from a file; long-press an imported one to remove it.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { mix, ThemePreview } from '../../components/LayoutView';
import { Button, Heading, Screen } from '../../components/ui';
import { about, chosen, choose, type Pack } from '../../logic/theme';
import { available, importTheme, lookFor, removeTheme, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function ThemeScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { width } = useWindowDimensions();
  const [, setRefresh] = useState(0);
  const current = chosen(prefs);
  const packs = available();
  const tile = Math.max(140, Math.min(360, (width - 32 - 14) / 2));
  void version;

  const pickTheme = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try {
      const id = importTheme(a.name, await new File(a.uri).bytes());
      choose(prefs, id);
      setRefresh((n) => n + 1);
      Alert.alert('Theme added', `${id} is now in use.`);
    } catch (e) {
      Alert.alert("Couldn't add the theme", e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (p: Pack) => {
    if (p.folder == null) return;
    Alert.alert(`Remove ${p.name}?`, undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeTheme(p.folder as string);
          if (current === p.id) choose(prefs, '@magma-grey');
          setRefresh((n) => n + 1);
        },
      },
    ]);
  };

  return (
    <Screen title="Theme">
      {look.problem ? <Text style={{ color: '#E5484D', marginBottom: 10 }}>{look.problem}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {packs.map((p) => {
          const on = p.id === current;
          const desc = about(p);
          return (
            <Pressable
              key={p.id}
              onPress={() => choose(prefs, p.id)}
              onLongPress={() => remove(p)}
              style={{
                width: tile + 16,
                padding: 8,
                paddingBottom: 12,
                borderRadius: 14,
                backgroundColor: on ? look.panelTop : look.panel,
                borderWidth: on ? 2.5 : 1.2,
                borderColor: on ? look.accent : mix(look.edge.substring(0, 7), look.panel.substring(0, 7), 0.6),
              }}
            >
              <ThemePreview pack={p} look={lookFor(p)} width={tile} />
              <Text style={{ color: look.text, fontSize: 17, fontWeight: '500', paddingHorizontal: 6, paddingTop: 10 }}>{on ? p.name + '   ✓ in use' : p.name}</Text>
              <Text numberOfLines={2} style={{ color: look.textDim, fontSize: 13, paddingHorizontal: 6, paddingTop: 4 }}>
                {desc || ' '}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Heading>Your own themes</Heading>
      <Text style={{ color: look.textDim, marginBottom: 8 }}>
        A theme is a folder with a theme.json and any pictures. Zip the folder to share it. Add one from a .zip or a theme.json file; long-press an added theme
        to remove it.
      </Text>
      <Button label="Add a theme from a file" kind="primary" onPress={pickTheme} />
    </Screen>
  );
}
