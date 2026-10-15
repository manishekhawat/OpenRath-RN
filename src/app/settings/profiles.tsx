/**
 * Settings > Family > Driver profiles (Profiles.menu in the Android version, "Who's driving?"):
 * each driver keeps their own boxes, theme, layout, alert speed, voice and message settings.
 * Switching saves the current driver's settings and loads the other's. The fuel log, drives, car
 * setup and service reminders are shared by everyone.
 */
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Features from '../../logic/features';
import * as Profiles from '../../logic/profiles';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function ProfilesScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const names = Profiles.names(prefs);
  const current = Profiles.current(prefs);
  const on = Features.on(prefs, 'profiles');

  const add = () => {
    const n = name.trim();
    const r = Profiles.add(prefs, n);
    if (!r) return Alert.alert(n ? `${n} is already a driver` : 'Type a name');
    setAdding(false);
    setName('');
    Alert.alert(r === 'added' ? `${n} added` : `Hello ${n}`);
  };

  const remove = (n: string) =>
    Alert.alert('Remove a driver', `Remove ${n}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => Profiles.remove(prefs, n) },
    ]);

  return (
    <Screen title="Who's driving?">
      <Row
        name="Driver profiles"
        value={on ? 'On: the driver part of a layout opens this page' : 'Off'}
        right={<Text style={{ color: look.accent, fontSize: 18 }}>{on ? '✓' : ''}</Text>}
        onPress={() => Features.set(prefs, 'profiles', !on)}
      />
      <Heading>Drivers</Heading>
      {names.length === 0 ? <Text style={{ color: look.textDim, marginVertical: 8 }}>No drivers yet.</Text> : null}
      {names.map((n) => (
        <Row
          key={n}
          name={(n === current ? '✓  ' : '     ') + n}
          value={n === current ? 'Driving now' : 'Tap to switch'}
          onPress={() => {
            if (n === current) return;
            Profiles.switchTo(prefs, n);
            Alert.alert(`Hello ${n}`);
          }}
        />
      ))}
      {adding ? (
        <>
          {names.length === 0 ? (
            <Text style={{ color: look.textDim, marginVertical: 8 }}>
              Your current settings become this driver's. Add a second driver to switch between them.
            </Text>
          ) : null}
          <Field label="Name" value={name} onChange={setName} />
          <Button label="Add" kind="primary" onPress={add} />
          <Button label="Cancel" onPress={() => setAdding(false)} />
        </>
      ) : (
        <Button label="Add a driver…" onPress={() => setAdding(true)} />
      )}
      {names.length > 0 ? (
        <>
          <Heading>Remove a driver</Heading>
          {names.filter((n) => n !== current).length === 0 ? (
            <Text style={{ color: look.textDim }}>Switch to another driver to remove {current}</Text>
          ) : (
            names.filter((n) => n !== current).map((n) => <Button key={n} label={`Remove ${n}`} kind="danger" onPress={() => remove(n)} />)
          )}
        </>
      ) : null}
      <Text style={{ color: look.textDim, marginTop: 16 }}>
        Each driver keeps their own boxes, theme, screen layout, alert speed, voice and message settings. The fuel log, drives, car setup and service
        reminders are shared by everyone.
      </Text>
    </Screen>
  );
}
