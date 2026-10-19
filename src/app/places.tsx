/**
 * Saved places for any navigation app (Places.java, 1.38): Home, Office, where the car is parked
 * and your own spots, each handed to the navigation app as a geo: link. You can type an address,
 * or save where the car is, only while it is stopped. A long press on one of your own forgets it.
 *
 * The Android version was a long press on the dock's Navigation button; here it is this screen.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { Button, Field, Heading, ListScreen, Row } from '../components/ui';
import * as ChildLock from '../logic/childlock';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Places from '../logic/places';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** Hand the place to the navigation app the owner chose, else to whichever app takes geo: links. */
function go(pkg: string, link: string) {
  if (Platform.OS !== 'android') return Alert.alert(t('Opening other apps works on Android only'));
  if (pkg !== '') {
    try {
      IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: link, packageName: pkg });
      return;
    } catch {
      // that app doesn't take geo: links
    }
  }
  Linking.openURL(link).catch(() => Alert.alert(t('No navigation app on this unit takes places')));
}

export default function PlacesScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip, liveFix } = useDrive();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const on = Features.on(prefs, 'places');
  const pkg = prefs.str(Places.NAV_KEY, '');
  const moving = ChildLock.moving(trip.kmh, trip.prevAt);
  void version;

  // Home, Office and the parked car first, then the owner's own, which a tap on the ✕ forgets
  const saved: { name: string; value: string; link: string | null; own: boolean }[] = [];
  for (const n of ['Home', 'Office']) {
    const at = Places.point(prefs.str('place:' + n, ''));
    if (at) saved.push({ name: t(n), value: t('Open navigation'), link: Places.geo(at[0], at[1], n), own: false });
  }
  if (trip.park) {
    saved.push({ name: t('Where the car is parked'), value: t('Open navigation'), link: Places.geo(trip.park.lat, trip.park.lon, 'Parked car'), own: false });
  }
  for (const [pn, at] of Places.own(prefs.str('places', ''))) {
    const point = Places.point(at);
    saved.push({ name: pn, value: at, link: point ? Places.geo(point[0], point[1], pn) : null, own: true });
  }

  const forget = (pn: string) =>
    Alert.alert(f('Forgot %1$s', pn), undefined, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Forget'), style: 'destructive', onPress: () => prefs.put('places', Places.drop(prefs.str('places', ''), pn)) },
    ]);

  const saveHere = () => {
    const at = liveFix();
    if (!at) return Alert.alert(t('Waiting for GPS'));
    if (name.trim() === '') return;
    prefs.put('places', Places.add(prefs.str('places', ''), name.trim(), at.lat, at.lon));
    setName('');
  };

  return (
    <ListScreen
      title={t('Saved places')}
      data={saved}
      keyOf={(p) => (p.own ? 'own:' : 'fixed:') + p.name}
      row={(p) => (
        <Row
          name={p.name}
          value={p.value}
          onPress={() => p.link && go(pkg, p.link)}
          right={p.own ? <Text style={{ color: look.textDim }} onPress={() => forget(p.name)}>✕</Text> : undefined}
        />
      )}
      initialNumToRender={10}
      header={
        !on ? (
          <Text style={{ color: look.textDim, marginBottom: 8 }}>{t('Turn on "Saved places for any navigation app" in Settings > Road helpers.')}</Text>
        ) : null
      }
      footer={
        <>
          {saved.length === 0 ? (
            <Text style={{ color: look.textDim, marginVertical: 8 }}>{t('No places saved yet. Save Home and Office on the map, or save where you are below.')}</Text>
          ) : null}

          <Heading>{t('Type an address…')}</Heading>
          {moving ? (
            <Text style={{ color: look.textDim }}>{t('Typing is blocked while the car is moving')}</Text>
          ) : (
            <>
              <Field label={t('Address or place')} value={address} onChange={setAddress} />
              <Button
                label={t('Go')}
                kind="primary"
                onPress={() => {
                  if (address.trim() !== '') go(pkg, Places.search(address));
                }}
              />
              <Heading>{t('Save where I am now…')}</Heading>
              <Field label={t('Name, like Gym')} value={name} onChange={setName} />
              <Button label={t('Save')} onPress={saveHere} />
            </>
          )}
          <Text style={{ color: look.textDim, marginTop: 12 }}>
            {t('Places are handed to the navigation app chosen in Apps, as a geo: link. Nothing is sent online.')}
          </Text>
        </>
      }
    />
  );
}
