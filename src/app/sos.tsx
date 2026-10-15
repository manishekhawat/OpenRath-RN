/**
 * Accident help (Rescue.java). Opened with ?crash=1 (see Rescue.sosHref) it is the "Are you OK?"
 * cover: a 30-second countdown, then the messaging app opens with a text to the emergency
 * contact saying where the car is (a tap on Send sends it), and a call button. Opened plainly
 * (the voice command "SOS") it is the same countdown at the car's position now; with ?setup=1 it
 * is the setup: who to contact, and a test run that never sends or calls.
 */
import { useKeepAwake } from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrCode, QrSheet } from '../components/Qr';
import { Button, Field, Heading, Row, Screen } from '../components/ui';
import * as Features from '../logic/features';
import { mapsLink } from '../logic/geo';
import * as Rescue from '../logic/rescue';
import { say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

function open(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open " + (url.startsWith('tel:') ? 'the dialler' : 'the messaging app')));
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function Countdown({ lat, lon, test, manual }: { lat: number; lon: number; test: boolean; manual: boolean }) {
  useKeepAwake();
  const { prefs } = usePrefs();
  const [left, setLeft] = useState(Rescue.SECONDS);
  const [info, setInfo] = useState(() => Rescue.startText(prefs, manual));
  const [done, setDone] = useState(false);
  const [big, setBig] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const number = Rescue.contact(prefs);
  const who = Rescue.contactName(prefs);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const text = () => {
    if (!test && number !== '') open(Rescue.smsLink(number, Rescue.message(lat, lon), Platform.OS === 'ios'));
  };

  const send = () => {
    stop();
    setDone(true);
    setInfo(Rescue.sentText(prefs, test));
    text();
  };

  useEffect(() => {
    say(Rescue.spoken(prefs, test, manual));
    timer.current = setInterval(() => setLeft((n) => n - 1), 1000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (left > 0 || done) return;
    if (number === '') {
      stop();
      setDone(true);
      setInfo(Rescue.sentText(prefs, test));
    } else send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const call = (n: string) => {
    stop();
    if (test) return Alert.alert('Test: would call ' + (n === Rescue.EMERGENCY ? Rescue.EMERGENCY : who));
    open(Rescue.telLink(n));
  };

  return (
    <SafeAreaView style={styles.cover}>
      <Text style={styles.title}>{test ? 'Are you OK?  (test)' : manual ? 'SOS' : 'Are you OK?'}</Text>
      <Text style={styles.info}>{info}</Text>
      <Text style={styles.count}>{done ? '' : String(Math.max(0, left))}</Text>
      <View style={styles.row}>
        <Pressable style={[styles.button, { backgroundColor: '#2E7D4F' }]} onPress={close}>
          <Text style={styles.buttonText}>I'm OK</Text>
        </Pressable>
        {number === '' ? (
          <Pressable style={[styles.button, { backgroundColor: '#B3261E' }]} onPress={() => call(Rescue.EMERGENCY)}>
            <Text style={styles.buttonText}>Call 112</Text>
          </Pressable>
        ) : done ? (
          <>
            <Pressable style={[styles.button, { backgroundColor: '#B3261E' }]} onPress={() => call(number)}>
              <Text style={styles.buttonText}>Call {who}</Text>
            </Pressable>
            <Pressable style={[styles.button, { backgroundColor: '#5A2A26' }]} onPress={text}>
              <Text style={styles.buttonText}>Text again</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.button, { backgroundColor: '#B3261E' }]} onPress={send}>
            <Text style={styles.buttonText}>Message now</Text>
          </Pressable>
        )}
      </View>
      {Rescue.known(lat, lon) ? (
        <View style={styles.place}>
          <QrCode text={mapsLink(lat, lon)} size={170} onPress={() => setBig(true)} />
          <Text style={styles.where}>{'The car is at\n' + Rescue.where(lat, lon) + '\nScan for the spot in Google Maps'}</Text>
        </View>
      ) : null}
      <QrSheet
        visible={big}
        title="Where the car is"
        text={mapsLink(lat, lon)}
        caption="Scan to open the spot in Google Maps."
        onClose={() => setBig(false)}
      />
    </SafeAreaView>
  );
}

function Setup() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const [name, setName] = useState(prefs.str('sosName', ''));
  const [number, setNumber] = useState(Rescue.contact(prefs));
  const on = Features.on(prefs, 'accidentHelp');
  return (
    <Screen title="Accident help">
      {!on ? <Text style={{ color: look.accent, marginBottom: 8 }}>Accident help is off: turn it on in Settings &gt; Features.</Text> : null}
      <Row name="Emergency contact" value={Rescue.contactRow(prefs, on)} />
      <Heading>Emergency contact</Heading>
      <Text style={{ color: look.textDim, marginBottom: 10 }}>
        Texted where the car is after a crash if nobody taps "I'm OK" within 30 seconds; the message opens ready to send.
      </Text>
      <Field label="Name (e.g. Papa)" value={name} onChange={setName} />
      <Field label="Phone number" value={number} onChange={setNumber} numeric />
      <Button
        label="Save"
        kind="primary"
        onPress={() => {
          Rescue.setContact(prefs, name, number);
          setNumber(Rescue.contact(prefs));
          Alert.alert('Saved');
        }}
      />
      <Heading>Try it</Heading>
      <Row name="Try accident help" value="shows the countdown; doesn't text or call" onPress={() => router.push(Rescue.sosHref(trip.lat, trip.lon, true))} />
    </Screen>
  );
}

export default function SosScreen() {
  const q = useLocalSearchParams<{ crash?: string; lat?: string; lon?: string; test?: string; setup?: string }>();
  const { trip } = useDrive();
  if (q.setup === '1') return <Setup />;
  const lat = q.lat != null ? parseFloat(q.lat) : trip.lat;
  const lon = q.lon != null ? parseFloat(q.lon) : trip.lon;
  return <Countdown lat={Number.isFinite(lat) ? lat : 0} lon={Number.isFinite(lon) ? lon : 0} test={q.test === '1'} manual={q.crash !== '1'} />;
}

const styles = StyleSheet.create({
  cover: { flex: 1, backgroundColor: '#120808', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '500', textAlign: 'center' },
  info: { color: '#E8C8C8', fontSize: 18, textAlign: 'center', paddingHorizontal: 40, paddingTop: 10, paddingBottom: 18 },
  count: { color: '#FF6A5A', fontSize: 96, fontWeight: '300', minHeight: 110, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  button: { width: 240, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginVertical: 6 },
  buttonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '500' },
  place: { flexDirection: 'row', alignItems: 'center', paddingTop: 22 },
  where: { color: '#FFFFFF', fontSize: 18, paddingLeft: 18 },
});
