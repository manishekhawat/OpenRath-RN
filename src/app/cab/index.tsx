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
import * as Features from '../../logic/features';
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
      if (params.speak === '1') say(Cab.spoken(prefs, Date.now()));
      router.push('/cab/earnings');
    }
  }, [params, prefs]);

  if (!Features.on(prefs, 'cab')) {
    return (
      <Screen title="Cab">
        <Text style={{ color: look.text, marginBottom: 12 }}>Turn on Cab driver tools in Settings &gt; Cab driver</Text>
        <Button label="Open Features" kind="primary" onPress={() => router.push('/settings/features')} />
      </Screen>
    );
  }

  const now = Date.now();
  const on = (id: string) => Cab.on(prefs, id);
  const quiet = Cab.quiet(prefs);
  const setQuiet = (yes: boolean) => {
    // the Android version also turned the music down to "cabQuietPct" (needs the system volume)
    prefs.put('cabQuietNow', yes ? 'on' : '');
    toast(yes ? 'Quiet ride: music down, messages not read aloud' : 'Quiet ride ended');
  };
  const openApp = (name: string, pkg: string) => {
    prefs.put('cabLastRideApp', pkg);
    if (Platform.OS === 'android') {
      try {
        IntentLauncher.openApplication(pkg);
        return;
      } catch {
        // not installed: its Play Store page
      }
    }
    Linking.openURL(Cab.playStore(pkg)).catch(() => toast(name + " isn't installed"));
  };
  const anything = ['cabMeter', 'cabEarnings', 'cabApps', 'cabQuiet', 'cabPhrases', 'cabSpots', 'cabCng', 'cabNotes', 'cabPapers', 'cabTarget', 'cabSos'].some(on);
  const share = Cab.targetShare(prefs, now);

  return (
    <Screen title={Cab.title(prefs, now)}>
      {share >= 0 ? (
        <Text style={{ color: look.textDim, marginBottom: 4 }}>
          Daily target {Cab.rs(num(prefs, 'cabTargetRs', 2000))}: {Math.round(share * 100)}%
        </Text>
      ) : null}
      {!anything ? <Text style={{ color: look.text }}>All the cab tools are switched off in Settings &gt; Cab driver</Text> : null}
      {on('cabMeter') ? (
        <Row
          name={Cab.running(prefs) ? 'Meter: ' + Cab.rs(Cab.fareNow(prefs, trip.odoKm, now)) + '  (show it)' : 'Start the fare meter'}
          onPress={() => router.push({ pathname: '/cab/meter', params: Cab.running(prefs) ? {} : { action: 'start' } })}
        />
      ) : null}
      {on('cabEarnings') ? (
        <>
          <Row name="Add a ride" onPress={() => router.push({ pathname: '/cab/earnings', params: { add: 'ride' } })} />
          <Row name="Add a cost (fuel, toll, food…)" onPress={() => router.push({ pathname: '/cab/earnings', params: { add: 'cost' } })} />
          <Row name="Earnings: today and this week" onPress={() => router.push('/cab/earnings')} />
        </>
      ) : null}
      {on('cabQuiet') ? <Row name={quiet ? 'Quiet ride: on (tap to end)' : 'Passenger in: quiet ride'} onPress={() => setQuiet(!quiet)} /> : null}
      {on('cabPhrases') ? <Row name="Phrases for the passenger" onPress={() => router.push('/cab/phrases')} /> : null}
      {on('cabSpots') ? <Row name="Pickup hotspots now" onPress={() => router.push('/cab/hotspots')} /> : null}
      {on('cabCng') ? (
        <>
          <Row
            name="CNG stations near here"
            onPress={() => Linking.openURL(Cab.cngSearch(trip.lat, trip.lon)).catch(() => toast('Needs a map app (Google Maps, Organic Maps or OsmAnd)'))}
          />
          <Row name="CNG fill-ups" onPress={() => router.push('/cab/cng')} />
        </>
      ) : null}
      {on('cabNotes') ? <Row name="Ride notes and lost items" onPress={() => router.push('/cab/notes')} /> : null}
      {on('cabPapers') ? <Row name="Papers due" onPress={() => router.push('/cab/papers')} /> : null}
      {on('cabTarget') ? (
        <Row
          name={Cab.onDuty(prefs, now) ? 'End duty (on for ' + Cab.hm(now - num(prefs, 'cabDutyAt', 0)) + ')' : 'Start duty now'}
          onPress={() => {
            const msg = Cab.toggleDuty(prefs, Date.now());
            if (msg) toast(msg);
          }}
        />
      ) : null}
      {on('cabSos') ? <Row name="SOS: send my location" onPress={() => router.push('/cab/sos')} /> : null}
      {on('cabApps') ? (
        <>
          <Heading>Ride apps</Heading>
          {Cab.rideApps(prefs).map(([name, pkg]) => (
            <Row key={pkg} name={name} value={pkg} onPress={() => openApp(name, pkg)} />
          ))}
        </>
      ) : null}
      <Heading>Settings</Heading>
      <Row name="Cab driver settings" value="target, meter rates, UPI id, SOS contacts, papers, phrases" onPress={() => router.push('/cab/settings')} />
    </Screen>
  );
}
