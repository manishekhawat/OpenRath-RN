/**
 * Apps (AppsActivity in the Android version). A launcher lists every installed app through
 * PackageManager, which Expo has no module for; until a small native module adds that (see
 * PORTING.md), this page opens the apps you add by their package name.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Heading, Screen } from '../components/ui';
import * as ChildLock from '../logic/childlock';
import * as Features from '../logic/features';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

interface App {
  label: string;
  pkg: string;
}

const DEFAULTS: App[] = [
  { label: 'Google Maps', pkg: 'com.google.android.apps.maps' },
  { label: 'YouTube Music', pkg: 'com.google.android.apps.youtube.music' },
  { label: 'Spotify', pkg: 'com.spotify.music' },
  { label: 'Phone', pkg: 'com.google.android.dialer' },
  { label: 'Settings', pkg: 'com.android.settings' },
];

export default function Apps() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const locked = ChildLock.apps(prefs);
  const apps = useMemo<App[]>(() => {
    try {
      return JSON.parse(prefs.str('apps', JSON.stringify(DEFAULTS)));
    } catch {
      return DEFAULTS;
    }
  }, [prefs, version]);
  const [label, setLabel] = useState('');
  const [pkg, setPkg] = useState('');

  const open = (a: App) => {
    if (Platform.OS !== 'android') return Alert.alert('Opening other apps works on Android only');
    if (ChildLock.blocked(prefs, a.pkg, trip.kmh, trip.prevAt)) return Alert.alert(ChildLock.SORRY);
    try {
      IntentLauncher.openApplication(a.pkg);
    } catch {
      Alert.alert(`${a.label} isn't installed`, a.pkg);
    }
  };

  const remove = (a: App) =>
    Alert.alert(a.label, undefined, [
      ...(Features.on(prefs, 'childLock')
        ? [{ text: locked.has(a.pkg) ? 'Unlock while moving' : 'Lock while moving', onPress: () => void ChildLock.toggle(prefs, a.pkg) }]
        : []),
      { text: 'Remove', style: 'destructive' as const, onPress: () => prefs.put('apps', JSON.stringify(apps.filter((x) => x.pkg !== a.pkg))) },
      { text: 'Keep', style: 'cancel' as const },
    ]);

  return (
    <Screen title="Apps">
      <View style={styles.grid}>
        {apps.map((a) => (
          <Pressable
            key={a.pkg}
            onPress={() => open(a)}
            onLongPress={() => remove(a)}
            style={[styles.tile, { backgroundColor: look.panel, borderColor: look.edge, borderRadius: look.radius }]}
          >
            <Text style={[styles.initial, { color: look.accent }]}>{a.label.substring(0, 1)}</Text>
            <Text style={{ color: look.text, textAlign: 'center' }} numberOfLines={2}>
              {a.label}
              {locked.has(a.pkg) ? ' 🔒' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: look.textDim, marginTop: 8 }}>Long-press an app to remove it, or to lock it while the car is moving (Child-lock in Features).</Text>
      <Heading>Add an app</Heading>
      <Field label="Name" value={label} onChange={setLabel} />
      <Field label="Package name (from the app's Play Store link, id=…)" value={pkg} onChange={setPkg} placeholder="com.example.app" />
      <Button
        label="Add"
        kind="primary"
        onPress={() => {
          if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg.trim())) return Alert.alert('That is not a package name', 'It looks like com.example.app');
          prefs.put('apps', JSON.stringify([...apps, { label: label.trim() || pkg.trim(), pkg: pkg.trim() }]));
          setLabel('');
          setPkg('');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: 120, height: 110, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  initial: { fontSize: 34, fontWeight: '600' },
});
