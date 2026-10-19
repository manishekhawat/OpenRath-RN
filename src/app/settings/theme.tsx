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
import { memo, useMemo, useState } from 'react';
import { Alert, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { mix, ThemePreview } from '../../components/LayoutView';
import { Button, Heading, ListScreen, Row } from '../../components/ui';
import * as Features from '../../logic/features';
import { f, hindi, t } from '../../logic/i18n';
import { about, chosen, choose, DEFAULT, type Pack } from '../../logic/theme';
import * as ThemeAuto from '../../logic/themeauto';
import { available, importTheme, lookFor, removeTheme, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

function nameOf(packs: Pack[], id: string): string {
  return packs.find((k) => k.id === id)?.name ?? t('none');
}

/** A preview is roughly forty-five shapes, so it is only drawn again when its theme changes. */
const Preview = memo(ThemePreview);

/** The space between the tiles, and how many fit across the screen. */
const GAP = 14;

export default function ThemeScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { width } = useWindowDimensions();
  const [refresh, setRefresh] = useState(0);
  const [pickingNight, setPickingNight] = useState(false);
  const current = chosen(prefs);
  // the same theme objects from one render to the next, so a tap doesn't draw every preview again
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 'refresh' is the counter that bumps when a theme pack is added
  const packs = useMemo(() => available(), [refresh]);
  const tile = Math.max(140, Math.min(360, (width - 32 - GAP) / 2));
  const autoOn = Features.on(prefs, 'autoTheme');
  const nightTheme = prefs.str('nightTheme', '');
  void version;
  // an imported theme's look is read off the storage, so work each one out once; the previews
  // carry words, which change with the language
  const inHindi = hindi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const looks = useMemo(() => new Map(packs.map((p) => [p.id, lookFor(p)] as const)), [packs, inHindi]);
  const cols = Math.max(1, Math.floor((width - 32 + GAP) / (tile + 16 + GAP)));
  const rows: Pack[][] = [];
  packs.forEach((p, i) => {
    if (i % cols === 0) rows.push([]);
    rows[rows.length - 1].push(p);
  });

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

  const tileFor = (p: Pack) => {
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
        <Preview pack={p} look={looks.get(p.id) ?? lookFor(p)} width={tile} />
        <Text style={{ color: look.text, fontSize: 17, fontWeight: '500', paddingHorizontal: 6, paddingTop: 10 }}>
          {on ? f('%1$s   ✓ in use', name) : name}
        </Text>
        <Text numberOfLines={2} style={{ color: look.textDim, fontSize: 13, paddingHorizontal: 6, paddingTop: 4 }}>
          {desc || ' '}
        </Text>
      </Pressable>
    );
  };

  return (
    <ListScreen
      title="Themes"
      data={rows}
      keyOf={(r) => r[0].id}
      row={(r) => <View style={{ flexDirection: 'row', gap: GAP }}>{r.map(tileFor)}</View>}
      gap={GAP}
      initialNumToRender={2}
      windowSize={3}
      header={look.problem ? <Text style={{ color: '#E5484D', marginBottom: 10 }}>{look.problem}</Text> : null}
      footer={
        <>
          <Heading>Theme changes by itself</Heading>
          <Row name="Theme changes by itself" value="A theme for the night" on={autoOn} onPress={() => Features.set(prefs, 'autoTheme', !autoOn)} />
          <Row name={f('At night: %1$s', nameOf(packs, nightTheme))} value="Which theme?" chevron onPress={() => setPickingNight(!pickingNight)} />
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

          <Heading>Your own themes</Heading>
          <Text style={{ color: look.textDim, marginBottom: 8 }}>
            {t(
              'A theme is a folder with a theme.json and any pictures. Zip the folder to share it. Add one from a .zip or a theme.json file; long-press an added theme to remove it.',
            )}
          </Text>
          <Button label="Add a theme from a file" kind="primary" onPress={pickTheme} />
        </>
      }
    />
  );
}
