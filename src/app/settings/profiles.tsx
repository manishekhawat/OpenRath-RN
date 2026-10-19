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
import { f, t } from '../../logic/i18n';
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
    if (!r) return Alert.alert(n ? f('%1$s is already a driver', n) : t('Type a name'));
    setAdding(false);
    setName('');
    Alert.alert(r === 'added' ? f('%1$s added', n) : f('Hello %1$s', n));
  };

  const remove = (n: string) =>
    Alert.alert(t('Remove a driver'), f('Remove %1$s?', n), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Remove'), style: 'destructive', onPress: () => Profiles.remove(prefs, n) },
    ]);

  return (
    <Screen title={t("Who's driving?")}>
      <Row
        name={t('Driver profiles')}
        value={t(on ? 'On: the driver part of a layout opens this page' : 'off')}
        right={<Text style={{ color: look.accent, fontSize: 18 }}>{on ? '✓' : ''}</Text>}
        onPress={() => Features.set(prefs, 'profiles', !on)}
      />
      <Heading>{t('Drivers')}</Heading>
      {names.length === 0 ? <Text style={{ color: look.textDim, marginVertical: 8 }}>{t('No drivers yet.')}</Text> : null}
      {names.map((n) => (
        <Row
          key={n}
          name={(n === current ? '✓  ' : '     ') + n}
          value={t(n === current ? 'Driving now' : 'Tap to switch')}
          onPress={() => {
            if (n === current) return;
            Profiles.switchTo(prefs, n);
            Alert.alert(f('Hello %1$s', n));
          }}
        />
      ))}
      {adding ? (
        <>
          {names.length === 0 ? (
            <Text style={{ color: look.textDim, marginVertical: 8 }}>
              {t("Your current settings become this driver's. Add a second driver to switch between them.")}
            </Text>
          ) : null}
          <Field label={t('Name')} value={name} onChange={setName} />
          <Button label={t('Add')} kind="primary" onPress={add} />
          <Button label={t('Cancel')} onPress={() => setAdding(false)} />
        </>
      ) : (
        <Button label={t('Add a driver…')} onPress={() => setAdding(true)} />
      )}
      {names.length > 0 ? (
        <>
          <Heading>{t('Remove a driver')}</Heading>
          {names.filter((n) => n !== current).length === 0 ? (
            <Text style={{ color: look.textDim }}>{f('Switch to another driver to remove %1$s', current)}</Text>
          ) : (
            names.filter((n) => n !== current).map((n) => <Button key={n} label={f('Remove %1$s', n)} kind="danger" onPress={() => remove(n)} />)
          )}
        </>
      ) : null}
      <Text style={{ color: look.textDim, marginTop: 16 }}>
        {t(
          'Each driver keeps their own boxes, theme, screen layout, alert speed, voice and message settings. The fuel log, drives, car setup and service reminders are shared by everyone.',
        )}
      </Text>
    </Screen>
  );
}
