/**
 * One-tap SOS (CabSos.sos): five seconds to cancel a mistaken tap, then the SOS text with the car's
 * location goes to the two contacts. An app can't send a text by itself here, so the messaging
 * app opens with it filled in, and a QR code lets the driver's phone send it (as the Android
 * version did on stereos without a SIM); a button calls the first contact.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrCode } from '../../components/Qr';
import { Button, Screen } from '../../components/ui';
import * as CabSos from '../../logic/cabSos';
import { f, t } from '../../logic/i18n';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function Sos() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const c1 = CabSos.contact(prefs, 1);
  const c2 = CabSos.contact(prefs, 2);
  const [left, setLeft] = useState(5);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!c1 && !c2) return;
    if (left <= 0) {
      const text = CabSos.sosText(prefs, trip.lat, trip.lon, Date.now());
      setMsg(text);
      Linking.openURL(CabSos.sosSms(prefs, text)).catch(() => {});
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  if (!c1 && !c2) {
    return (
      <Screen title={t('No SOS contacts yet')}>
        <Text style={{ color: look.text, marginBottom: 12 }}>{t('Add two people to text in an emergency.')}</Text>
        <Button label={t('Add them')} kind="primary" onPress={() => router.replace('/cab/settings')} />
        <Button label={t('Call 112')} kind="danger" onPress={() => Linking.openURL('tel:112')} />
      </Screen>
    );
  }
  const first = (c1 ?? c2) as [string, string];
  const who = CabSos.sosWho(prefs);
  return (
    <SafeAreaView style={styles.page}>
      {msg === '' ? (
        <>
          <Text style={styles.info}>{f('Sending SOS with your location to %1$s', who)}</Text>
          <Text style={styles.count}>{left}</Text>
        </>
      ) : (
        <>
          <Text style={styles.info}>{msg}</Text>
          <Text style={styles.small}>{t('Scan to send the SOS text from your phone.')}</Text>
          <View style={{ marginVertical: 12 }}>
            <QrCode text={CabSos.sosQr(prefs, msg)} size={220} />
          </View>
          <View style={styles.row}>
            <Big label={t('SOS text')} colour="#7A1F1F" onPress={() => Linking.openURL(CabSos.sosSms(prefs, msg)).catch(() => {})} />
            <Big label={t('Call') + ' ' + first[0]} colour="#1F6F45" onPress={() => Linking.openURL('tel:' + first[1]).catch(() => {})} />
          </View>
        </>
      )}
      <Big label={t(msg === '' ? 'Cancel' : 'Close')} colour="#33363C" onPress={() => router.back()} />
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#120808', alignItems: 'center', justifyContent: 'center', padding: 16 },
  info: { color: '#FFFFFF', fontSize: 24, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24, paddingBottom: 10 },
  count: { color: '#FF6A5A', fontSize: 96, fontWeight: '200' },
  small: { color: '#E8C8C4', fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 },
  big: { minWidth: 220, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 20 },
  bigText: { color: '#FFFFFF', fontSize: 22, fontWeight: '500' },
});
