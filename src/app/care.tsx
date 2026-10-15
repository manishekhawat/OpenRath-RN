/**
 * Car care (Settings > Car care in the Android version): the odometer, service reminders by
 * distance (oil, tyres, alignment, service) or by date (insurance, PUC), and links to the trip
 * history and the toll log.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function CareScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const odo = Care.odo(prefs, trip.odoKm);
  const [editing, setEditing] = useState<number | 'odo' | null>(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const open = (what: number | 'odo') => {
    setEditing(what);
    if (what === 'odo') setA(String(odo));
    else if (Care.byDate(what)) setA(prefs.str(`care:${Care.ITEMS[what]}:due`, ''));
    else {
      setA(prefs.str(`care:${Care.ITEMS[what]}:last`, String(odo)));
      setB(String(Care.every(prefs, what)));
    }
  };

  const save = () => {
    if (editing === null) return;
    if (editing === 'odo') {
      const v = parseFloat(a);
      if (!Number.isFinite(v)) return Alert.alert('Enter the odometer in km');
      Care.setOdo(prefs, v, trip.odoKm);
    } else if (Care.byDate(editing)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.trim())) return Alert.alert('Enter the date as yyyy-mm-dd', `For example ${today()}`);
      prefs.put(`care:${Care.ITEMS[editing]}:due`, a.trim());
    } else {
      const last = parseInt(a, 10);
      const every = parseInt(b, 10);
      if (!Number.isFinite(last) || !(every > 0)) return Alert.alert('Enter the odometer and the distance as numbers');
      prefs.put(`care:${Care.ITEMS[editing]}:last`, String(last));
      prefs.put(`care:${Care.ITEMS[editing]}:every`, String(every));
    }
    setEditing(null);
  };

  const editor =
    editing === null ? null : (
      <View style={{ marginVertical: 12 }}>
        <Heading>{editing === 'odo' ? 'Odometer reading now' : Care.NAMES[editing]}</Heading>
        {editing === 'odo' ? (
          <Field label="Odometer (km)" value={a} onChange={setA} numeric />
        ) : Care.byDate(editing) ? (
          <Field label="Due date (yyyy-mm-dd)" value={a} onChange={setA} placeholder={today()} />
        ) : (
          <>
            <Field label="Odometer at the last one (km)" value={a} onChange={setA} numeric />
            <Field label="Every (km)" value={b} onChange={setB} numeric />
          </>
        )}
        <Button label="Save" kind="primary" onPress={save} />
        <Button label="Cancel" onPress={() => setEditing(null)} />
      </View>
    );

  const alert = Care.alert(prefs, odo);
  return (
    <Screen title="Car care">
      {alert ? <Text style={{ color: look.accent, marginBottom: 8 }}>{alert}</Text> : null}
      <Row name="Odometer" value={`${odo} km (corrected once, then counted by GPS)`} onPress={() => open('odo')} />
      {editing === 'odo' ? editor : null}
      <Heading>Service reminders</Heading>
      {Care.ITEMS.map((_, i) => (
        <View key={i}>
          <Row name={Care.NAMES[i]} value={Care.describe(prefs, i, odo)} onPress={() => open(i)} />
          {editing === i ? editor : null}
        </View>
      ))}
      <Heading>Trips and spending</Heading>
      <Row name="Trip history" value="weekly and monthly distance, time and costs" onPress={() => router.push('/trips')} />
      <Row name="Add a toll payment" value={Care.tollsThisMonth(prefs).replace('  ·  ', '') || 'no tolls this month'} onPress={() => router.push('/tolls')} />
      <Row name="Weekly report" value="the last seven days in one card" onPress={() => router.push('/report')} />
    </Screen>
  );
}
