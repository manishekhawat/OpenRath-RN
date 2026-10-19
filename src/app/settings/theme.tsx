/**
 * Settings > Theme (ThemeGallery in the Android version): every theme as a small picture of the
 * home screen drawn in that theme's colours, two to a row. Tapping one switches to it. A theme
 * pack can ship its own preview.png to show instead. Theme packs (.zip of a theme folder, or a
 * lone theme.json; see THEMES.md) are imported from a file; long-press an imported one to remove it.
 * Below, "Theme changes by itself" (ThemeAuto.menu): a theme for the night. The Android version's
 * theme for when a chosen phone connects needs Bluetooth from native code, so it isn't offered.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { mix, ThemePreview } from '../../components/LayoutView';
import { Button, Heading, Row, Screen } from '../../components/ui';
import * as Features from '../../logic/features';
import { f, t } from '../../logic/i18n';
import { about, chosen, choose, DEFAULT, type Pack } from '../../logic/theme';
import * as ThemeAuto from '../../logic/themeauto';
import { available, importTheme, lookFor, removeTheme, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

function nameOf(packs: Pack[], id: string): string {
  return packs.find((k) => k.id === id)?.name ?? t('none');
}

export default function ThemeScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { width } = useWindowDimensions();
  const [, setRefresh] = useState(0);
  const [pickingNight, setPickingNight] = useState(false);
  const current = chosen(prefs);
  const packs = available();
  const tile = Math.max(140, Math.min(360, (width - 32 - 14) / 2));
  const autoOn = Features.on(prefs, 'autoTheme');
  const nightTheme = prefs.str('nightTheme', '');
  void version;

  const pickTheme = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try {
      const id = importTheme(a.name, await new File(a.uri).bytes());
      choose(prefs, id);
      setRefresh((n) => n + 1);
      Alert.alert(f('Theme "%1$s" is on', id));
    } catch (e) {
      Alert.alert(f('Not a theme: %1$s', e instanceof Error ? e.message : String(e)));
    }
  };

  const remove = (p: Pack) => {
    if (p.folder == null) return;
    Alert.alert(f('Remove %1$s?', p.name), undefined, [
      { text: t('Keep'), style: 'cancel' },
      {
        text: t('Remove'),
        style: 'destructive',
        onPress: () => {
          removeTheme(p.folder as string);
          if (current === p.id) choose(prefs, DEFAULT);
          if (nightTheme === p.id) prefs.put('nightTheme', '');
          setRefresh((n) => n + 1);
        },
      },
    ]);
  };

  return (
    <Screen title={t('Themes')}>
      {look.problem ? <Text style={{ color: '#E5484D', marginBottom: 10 }}>{look.problem}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {packs.map((p) => {
          const on = p.id === current;
          const desc = about(p);
          const name = p.folder == null ? t(p.name) : p.name;
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
              <Text style={{ color: look.text, fontSize: 17, fontWeight: '500', paddingHorizontal: 6, paddingTop: 10 }}>
                {on ? f('%1$s   ✓ in use', name) : name}
              </Text>
              <Text numberOfLines={2} style={{ color: look.textDim, fontSize: 13, paddingHorizontal: 6, paddingTop: 4 }}>
                {desc || ' '}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Heading>{t('Theme changes by itself')}</Heading>
      <Row
        name={t('Theme changes by itself')}
        value={t(autoOn ? 'on' : 'off')}
        right={<Text style={{ color: look.accent, fontSize: 18 }}>{autoOn ? '✓' : ''}</Text>}
        onPress={() => Features.set(prefs, 'autoTheme', !autoOn)}
      />
      <Row name={f('At night: %1$s', nameOf(packs, nightTheme))} value={t('Which theme?')} onPress={() => setPickingNight(!pickingNight)} />
      {pickingNight ? (
        <>
          <Row
            name={(nightTheme === '' ? '✓  ' : '     ') + t('None (keep my theme)')}
            onPress={() => {
              ThemeAuto.setNight(prefs, '');
              setPickingNight(false);
            }}
          />
          {packs.map((p) => (
            <Row
              key={p.id}
              name={(nightTheme === p.id ? '✓  ' : '     ') + (p.folder == null ? t(p.name) : p.name)}
              onPress={() => {
                ThemeAuto.setNight(prefs, p.id);
                setPickingNight(false);
              }}
            />
          ))}
        </>
      ) : null}

      <Heading>{t('Your own themes')}</Heading>
      <Text style={{ color: look.textDim, marginBottom: 8 }}>
        {t(
          'A theme is a folder with a theme.json and any pictures. Zip the folder to share it. Add one from a .zip or a theme.json file; long-press an added theme to remove it.',
        )}
      </Text>
      <Button label={t('Add a theme from a file')} kind="primary" onPress={pickTheme} />
    </Screen>
  );
}
