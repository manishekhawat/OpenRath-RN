/**
 * The Cab menu (Cab.menu: a tap on the Cab box or a steering-wheel button): everything the cab
 * tools do, each line only when its own switch is on, with today's net in the title.
 *
 * Voice commands open it with parameters: /cab?open=meter&meter=start|stop starts or stops the
 * fare meter, /cab?open=earnings&speak=1 says today's earnings and shows them.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking, Platform, Text } from 'react-native';

import { Button, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { boxFoot, spoken } from '../../logic/cabEarnings';
import * as Meter from '../../logic/cabMeter';
import * as Features from '../../logic/features';
import { f, t } from '../../logic/i18n';
import { num } from '../../logic/prefs';
import { say, useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast, useCabTick } from './meter';

export default function CabMenu() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const params = useLocalSearchParams<{ open?: string; meter?: string; speak?: string }>();
  useCabTick();

  // voice commands: once for each set of parameters
  const handled = useRef('');
  useEffect(() => {
    const key = JSON.stringify(params);
    if (!params.open || handled.current === key || !Features.on(prefs, 'cab')) return;
    handled.current = key;
    if (params.open === 'meter') {
      router.push({ pathname: '/cab/meter', params: params.meter ? { action: params.meter } : {} });
    } else if (params.open === 'earnings') {
      if (params.speak === '1') say(spoken(prefs, Date.now()));
      router.push('/cab/earnings');
    }
  }, [params, prefs]);

  if (!Features.on(prefs, 'cab')) {
    return (
      <Screen title={t('Cab driver')}>
        <Text style={{ color: look.text, marginBottom: 12 }}>{t('Turn on Cab driver tools in Settings > Cab driver')}</Text>
        <Button label={t('Cab driver tools')} kind="primary" onPress={() => router.push('/cab/settings')} />
      </Screen>
    );
  }

  const now = Date.now();
  const on = (id: string) => Cab.on(prefs, id);
  const quiet = Cab.quiet(prefs);
  const setQuiet = (yes: boolean) => toast(Cab.setQuiet(prefs, yes));
  const openApp = (pkg: string) => {
    prefs.put('cabLastRideApp', pkg);
    if (Platform.OS === 'android') {
      try {
        IntentLauncher.openApplication(pkg);
        return;
      } catch {
        // not installed: its Play Store page
      }
    }
    Linking.openURL(Cab.playStore(pkg)).catch(() =>
      toast(t('No ride apps found. Install Uber Driver, Ola Driver, Rapido Captain or another from the Play Store.')));
  };
  const anything = ['cabMeter', 'cabEarnings', 'cabApps', 'cabQuiet', 'cabPhrases', 'cabSpots', 'cabCng', 'cabNotes', 'cabPapers', 'cabTarget', 'cabSos'].some(on);

  return (
    <Screen title={Cab.title(prefs, now)}>
      <Text style={{ color: look.textDim, marginBottom: 4 }}>{boxFoot(prefs, now, trip.odoKm)}</Text>
      {!anything ? <Text style={{ color: look.text }}>{t('All the cab tools are switched off in Settings > Cab driver')}</Text> : null}
      {on('cabMeter') ? (
        <Row
          name={Meter.running(prefs) ? f('Meter: %1$s  (show it)', Cab.rs(Meter.fareNow(prefs, trip.odoKm, now))) : t('Start the fare meter')}
          onPress={() => router.push({ pathname: '/cab/meter', params: Meter.running(prefs) ? {} : { action: 'start' } })}
        />
      ) : null}
      {on('cabEarnings') ? (
        <>
          <Row name={t('Add a ride')} onPress={() => router.push({ pathname: '/cab/earnings', params: { add: 'ride' } })} />
          <Row name={t('Add a cost (fuel, toll, food…)')} onPress={() => router.push({ pathname: '/cab/earnings', params: { add: 'cost' } })} />
          <Row name={t('Earnings: today and this week')} onPress={() => router.push('/cab/earnings')} />
        </>
      ) : null}
      {on('cabQuiet') ? <Row name={t(quiet ? 'Quiet ride: on (tap to end)' : 'Passenger in: quiet ride')} onPress={() => setQuiet(!quiet)} /> : null}
      {on('cabPhrases') ? <Row name={t('Phrases for the passenger')} onPress={() => router.push('/cab/phrases')} /> : null}
      {on('cabSpots') ? <Row name={t('Pickup hotspots now')} onPress={() => router.push('/cab/hotspots')} /> : null}
      {on('cabCng') ? (
        <>
          <Row
            name={t('CNG stations near here')}
            onPress={() => Linking.openURL(Cab.cngSearch(trip.lat, trip.lon)).catch(() => toast(t('Needs a map app (Google Maps, Organic Maps or OsmAnd)')))}
          />
          <Row name={t('CNG fill-ups')} onPress={() => router.push('/cab/cng')} />
        </>
      ) : null}
      {on('cabNotes') ? <Row name={t('Ride notes and lost items')} onPress={() => router.push('/cab/notes')} /> : null}
      {on('cabPapers') ? <Row name={t('Papers due')} onPress={() => router.push('/cab/papers')} /> : null}
      {on('cabTarget') ? (
        <Row
          name={Cab.onDuty(prefs, now) ? f('End duty (on for %1$s)', Cab.hm(now - num(prefs, 'cabDutyAt', 0))) : t('Start duty now')}
          onPress={() => {
            const msg = Cab.toggleDuty(prefs, Date.now());
            if (msg) toast(msg);
          }}
        />
      ) : null}
      {on('cabSos') ? <Row name={t('SOS: send my location')} onPress={() => router.push('/cab/sos')} /> : null}
      {on('cabApps') ? (
        <>
          <Heading>{t('Ride apps')}</Heading>
          {Cab.rideApps(prefs).map(([name, pkg]) => (
            <Row key={pkg} name={name} value={pkg} onPress={() => openApp(pkg)} />
          ))}
        </>
      ) : null}
      <Heading>{t('Settings')}</Heading>
      <Row name={t('Cab driver')} value={t('Turn on or off')} onPress={() => router.push('/cab/settings')} />
    </Screen>
  );
}
