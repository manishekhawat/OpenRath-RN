/**
 * The dock along the bottom of the dashboard (HomeDock.dock): the main pages, all apps and
 * Settings, with the status icons (dockStatus) for stereos that hide Android's status bar. Each
 * button gives the tap sound and buzz when that is on.
 */
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { StatusIcons } from './StatusIcons';
import { useTap } from './Tap';

const BUTTONS: [string, Href][] = [
  ['Map', '/map'],
  ['Music', '/music'],
  ['All apps', '/apps'],
  ['Fuel', '/fuel'],
  ['Care', '/care'],
];

export function Dock() {
  const { prefs } = usePrefs();
  const look = useLook();
  const tap = useTap();
  return (
    <View style={[styles.dock, { borderColor: look.edge, backgroundColor: look.panelTop }]}>
      {BUTTONS.map(([label, href]) => (
        <Pressable key={label} onPress={tap(() => router.push(href))} style={styles.item} hitSlop={8} accessibilityLabel={t(label)}>
          <Text style={[styles.text, { color: look.icons }]}>{t(label)}</Text>
        </Pressable>
      ))}
      {Features.on(prefs, 'dockStatus') ? <StatusIcons style={styles.status} /> : null}
      <Pressable onPress={tap(() => router.push('/settings'))} style={styles.item} hitSlop={8} accessibilityLabel={t('Settings')}>
        <Text style={[styles.text, { color: look.icons }]}>{t('Settings')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  item: { paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 16, fontWeight: '500' },
  status: { paddingHorizontal: 8 },
});
