/**
 * The fare meter, big, for the passenger to see (Cab.showMeter / stopMeter): distance by the GPS
 * odometer, waiting while standing, night charge; then save the ride and show a UPI code to pay.
 * Opened as /cab/meter, or /cab/meter?action=start|stop from the Cab menu and voice commands.
 *
 * This file also has useCabTick, which re-renders the Cab screens every second so the meter and
 * duty time count up (Cab.tick itself runs in the drive service, behind every screen).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrSheet } from '../../components/Qr';
import * as Cab from '../../logic/cab';
import * as Errands from '../../logic/errands';
import { say, useDrive } from '../../state/drive';
import { usePrefs } from '../../state/prefs';

export function toast(text: string) {
  if (Platform.OS === 'android') ToastAndroid.show(text, ToastAndroid.LONG);
  else Alert.alert(text);
}

/** Re-renders a Cab screen every second, so the meter and duty time count up. */
export function useCabTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

/** Log a ride, and say the target when it is passed. */
export function logRide(prefs: Parameters<typeof Cab.addRide>[0], v: Parameters<typeof Cab.addRide>[1]) {
  const msg = Cab.addRide(prefs, v, Date.now());
  if (msg) {
    toast(msg);
    if (!Cab.quiet(prefs)) say(msg.replace('₹', 'rupees '));
  }
}

export default function Meter() {
  const { prefs } = usePrefs();
  const { trip } = useDrive();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [done, setDone] = useState<Cab.Stopped | null>(null);
  const [qr, setQr] = useState(false);
  useCabTick();

  const stop = () => {
    const s = Cab.stopMeter(prefs, trip.odoKm, Date.now());
    if (s) setDone(s);
  };

  // from the menu or a voice command: start or stop once
  const handled = useRef('');
  useEffect(() => {
    if (!action || handled.current === action) return;
    handled.current = action;
    if (action === 'start' && !Cab.running(prefs)) Cab.startMeter(prefs, trip.odoKm, trip.lat, trip.lon, Date.now());
    if (action === 'stop') {
      if (Cab.running(prefs)) stop();
      else toast('The meter is not running');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const now = Date.now();
  const log = Cab.on(prefs, 'cabEarnings');
  const upi = prefs.str('upiId', '');

  if (done) {
    const save = (pay: string) => {
      if (log) logRide(prefs, { rs: done.fare, km: done.km, app: 'Meter', pay, lat: done.lat, lon: done.lon });
    };
    return (
      <SafeAreaView style={styles.page}>
        <Text style={styles.head}>FARE  ·  किराया</Text>
        <Text style={styles.fare}>{Cab.rs(done.fare)}</Text>
        <Text style={styles.info}>{done.said + (log ? '\n\nSave it to the earnings log?' : '')}</Text>
        <View style={styles.row}>
          <Big label={log ? 'Paid in cash' : 'OK'} colour="#1F6F45" onPress={() => {
            save('Cash');
            router.back();
          }} />
          <Big label={Errands.validVpa(upi) ? 'UPI QR' : 'Paid by UPI'} colour="#33363C" onPress={() => {
            save('UPI');
            if (Errands.validVpa(upi)) setQr(true);
            else {
              toast('Set your UPI id in Settings > Cab driver to show a QR code');
              router.back();
            }
          }} />
          {log ? <Big label="Don't save" colour="#33363C" onPress={() => router.back()} /> : null}
        </View>
        <QrSheet
          visible={qr}
          title={'Pay ' + Cab.rs(done.fare)}
          text={Errands.upiLink(upi, prefs.str('upiName', ''), done.fare, 'Cab fare')}
          caption={'Scan with any UPI app (GPay, PhonePe, Paytm, BHIM); the fare is filled in. Pays ' + upi + '.'}
          onClose={() => {
            setQr(false);
            router.back();
          }}
        />
      </SafeAreaView>
    );
  }

  if (!Cab.running(prefs)) {
    return (
      <SafeAreaView style={styles.page}>
        <Text style={styles.head}>FARE METER</Text>
        <Text style={styles.info}>{Cab.ratesText(Cab.rates(prefs))}</Text>
        <View style={styles.row}>
          <Big label="Hide" colour="#33363C" onPress={() => router.back()} />
          <Big label="Start the fare meter" colour="#1F6F45" onPress={() => Cab.startMeter(prefs, trip.odoKm, trip.lat, trip.lon, Date.now())} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.head}>FARE  ·  किराया</Text>
      <Text style={styles.fare} adjustsFontSizeToFit numberOfLines={1}>{Cab.rs(Cab.fareNow(prefs, trip.odoKm, now))}</Text>
      <Text style={styles.info}>{Cab.meterInfo(prefs, trip.odoKm, now)}</Text>
      <View style={styles.row}>
        <Big label="Hide" colour="#33363C" onPress={() => router.back()} />
        <Big label="Stop and charge" colour="#1F6F45" onPress={stop} />
      </View>
      {Cab.quiet(prefs) ? <Text style={styles.small}>Quiet ride on</Text> : null}
    </SafeAreaView>
  );
}

function Big({ label, colour, onPress }: { label: string; colour: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.big, { backgroundColor: colour }]}>
      <Text style={styles.bigText}>{label}</Text>
    </Pressable>
  );
}

// the Android version's colours: near-black, silver text, green to charge
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#050607', alignItems: 'center', justifyContent: 'center', padding: 16 },
  head: { color: '#8A9099', fontSize: 22, fontWeight: '500', letterSpacing: 2 },
  fare: { color: '#FFFFFF', fontSize: 120, fontWeight: '200' },
  info: { color: '#C9CDD3', fontSize: 22, textAlign: 'center', paddingBottom: 26, lineHeight: 32 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 28 },
  big: { minWidth: 220, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  bigText: { color: '#FFFFFF', fontSize: 22, fontWeight: '500' },
  small: { color: '#8A9099', marginTop: 16 },
});
