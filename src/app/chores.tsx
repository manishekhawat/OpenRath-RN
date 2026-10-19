/**
 * The everyday helpers (Chores.java): split a trip's cost by UPI QR code, a paid-parking reminder
 * on the phone, a QR code for passengers to join the guest Wi-Fi, and one
 * for family to follow the trip. ?open=split|parkTimer|parkPhoto|hotspot|share puts that one
 * first ("share" also shows its code at once).
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Text, View } from 'react-native';

import { QrSheet } from '../components/Qr';
import { Button, Choice, Field, Heading, Row, Screen } from '../components/ui';
import * as Chores from '../logic/chores';
import { validVpa } from '../logic/errands';
import { t } from '../logic/i18n';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** Open the unit's hotspot settings: the tether screen if the unit has one, else wireless settings. */
async function hotspotSettings() {
  if (Platform.OS !== 'android') return Alert.alert(t("Open the unit's Settings > Network > Hotspot"));
  const tries: [string, IntentLauncher.IntentLauncherParams?][] = [
    ['android.intent.action.MAIN', { packageName: 'com.android.settings', className: 'com.android.settings.TetherSettings' }],
    ['android.intent.action.MAIN', { packageName: 'com.android.settings', className: 'com.android.settings.Settings$TetherSettingsActivity' }],
    [IntentLauncher.ActivityAction.WIRELESS_SETTINGS],
  ];
  for (const [action, params] of tries) {
    try {
      await IntentLauncher.startActivityAsync(action, params);
      return;
    } catch {
      // try the next
    }
  }
  Alert.alert(t("Open the unit's Settings > Network > Hotspot"));
}

const SECTIONS = ['split', 'parkTimer', 'hotspot', 'share'] as const;
type Section = (typeof SECTIONS)[number];

/** ?open= from the voice commands: the section to put first (no parking photo yet: the parking section). */
function sectionOf(open: string | undefined): Section {
  if (open === 'parkPhoto') return 'parkTimer';
  return (SECTIONS as readonly string[]).includes(open ?? '') ? (open as Section) : 'split';
}

export default function ChoresScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const first = sectionOf(open);
  const [code, setCode] = useState<Chores.Code | null>(null);

  // splitting
  const fill = Chores.lastFill(prefs);
  const [upi, setUpi] = useState(prefs.str('upiId', ''));
  const [upiName, setUpiName] = useState(prefs.str('upiName', ''));
  const [total, setTotal] = useState(fill > 0 ? String(Math.round(fill)) : '');
  const [people, setPeople] = useState(prefs.str('splitPeople', '2'));

  // parking, Wi-Fi
  const [mins, setMins] = useState('60');
  const [apName, setApName] = useState(prefs.str('apName', ''));
  const [apPass, setApPass] = useState(prefs.str('apPass', ''));

  const need = (id: string) => {
    const off = Chores.off(prefs, id);
    if (off) Alert.alert(off);
    return off == null;
  };

  const split = () => {
    if (!need('split')) return;
    if (upi.trim() !== prefs.str('upiId', '') || upiName.trim() !== prefs.str('upiName', '')) {
      const bad = Chores.setUpi(prefs, upi, upiName);
      if (bad) return Alert.alert(bad);
    }
    const r = Chores.split(prefs, parseFloat(total), people.trim() === '' ? 2 : parseFloat(people));
    if (typeof r === 'string') return Alert.alert(r);
    setCode(r);
  };

  const park = () => {
    if (!need('parkTimer')) return;
    setCode(Chores.startParking(prefs, parseInt(mins, 10)));
  };

  const wifi = () => {
    if (!need('hotspot')) return;
    if (apName.trim() !== prefs.str('apName', '') || apPass !== prefs.str('apPass', '')) {
      const bad = Chores.setHotspot(prefs, apName, apPass);
      if (bad) return Alert.alert(bad);
    }
    const c = Chores.hotspot(prefs);
    if (!c) return Alert.alert(t('Hotspot name (as set on the unit)'), t('e.g. MyCar'));
    setCode(c);
  };

  const shareTrip = () => {
    if (!need('tripShare')) return;
    const r = Chores.tripShare(prefs, trip.lat, trip.lon);
    if (typeof r === 'string') return Alert.alert(r);
    setCode(r);
  };

  // "share my trip" shows its code straight away
  useEffect(() => {
    if (open === 'share') shareTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sections: Record<Section, ReactNode> = {
    share: (
      <>
        <Heading>{t('Share the trip by QR code')}</Heading>
        <Text style={{ color: look.textDim, marginBottom: 6 }}>
          {t('A code family scan to see where you are and the route; nothing is sent online')}
        </Text>
        <Button label={t('Show the code')} kind="primary" onPress={shareTrip} />
      </>
    ),
    split: (
      <>
        <Heading>{t('Split the cost by UPI')}</Heading>
        <Field label={t('Your UPI id (like name@okbank)')} value={upi} onChange={setUpi} placeholder="name@bank" />
        {upi.trim() !== '' && !validVpa(upi) ? (
          <Text style={{ color: '#E5484D', marginTop: -6, marginBottom: 8 }}>{t("That doesn't look like a UPI id (name@bank)")}</Text>
        ) : null}
        <Field label={t('Name shown to the payer (optional)')} value={upiName} onChange={setUpiName} />
        <Field label={fill > 0 ? t('Total to split, ₹ (last fill-up shown)') : t('Total to split, ₹')} value={total} onChange={setTotal} numeric />
        <Field label={t('How many people, you included?')} value={people} onChange={setPeople} numeric />
        <Button label={t('Show the code')} kind="primary" onPress={split} />
      </>
    ),
    parkTimer: (
      <>
        <Heading>{t('Paid parking reminder')}</Heading>
        <Row name={t('Parking')} value={Chores.parkingRow(prefs)} />
        <Text style={{ color: look.textDim, marginTop: 8 }}>{t('Parking paid for')}</Text>
        <View style={{ marginTop: 6 }}>
          <Choice options={Chores.PARK_MINUTES.map((m, i) => ({ id: String(m), label: t(Chores.PARK_LABELS[i]) }))} value={mins} onChange={setMins} />
        </View>
        <Button label={t('Show the code for my phone')} kind="primary" onPress={park} />
      </>
    ),
    hotspot: (
      <>
        <Heading>{t('Guest Wi-Fi')}</Heading>
        <Text style={{ color: look.textDim, marginBottom: 10 }}>{Chores.hotspotNote()}</Text>
        <Field label={t('Hotspot name (as set on the unit)')} value={apName} onChange={setApName} placeholder={t('e.g. MyCar')} />
        <Field label={t('Hotspot password')} value={apPass} onChange={setApPass} />
        <Button label={t('Show the code')} kind="primary" onPress={wifi} />
        <Button label={t('Hotspot settings')} onPress={hotspotSettings} />
      </>
    ),
  };
  // the section asked for (by the voice command) comes first
  const order = [first, ...SECTIONS.filter((k) => k !== first)];

  return (
    <Screen title={t('Everyday helpers')}>
      {order.map((k) => (
        <View key={k}>{sections[k]}</View>
      ))}

      <QrSheet
        visible={code != null}
        title={code?.title ?? ''}
        text={code?.text ?? ''}
        caption={code?.caption ?? ''}
        onClose={() => setCode(null)}
      />
    </Screen>
  );
}
