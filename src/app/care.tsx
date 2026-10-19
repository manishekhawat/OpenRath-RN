/**
 * Car care (Settings > Car care in the Android version): the odometer, service reminders by
 * distance (oil, tyres, alignment, service) or by date (insurance, PUC), and the way to the trip
 * menu (trips, fuel and tolls, one row since 1.35).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import { f, t } from '../logic/i18n';
import * as Fuel from '../logic/fuel';
import * as Trip from '../logic/trip';
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
      if (!Number.isFinite(v)) return Alert.alert(t('Odometer reading now (km)'));
      Care.setOdo(prefs, v, trip.odoKm);
    } else if (Care.byDate(editing)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.trim())) return Alert.alert(f('%1$s: next due date', t(Care.NAMES[editing])), today());
      prefs.put(`care:${Care.ITEMS[editing]}:due`, a.trim());
    } else {
      const last = parseInt(a, 10);
      const every = parseInt(b, 10);
      if (!Number.isFinite(last) || !(every > 0)) return Alert.alert(t('Odometer when it was last done (km)'));
      prefs.put(`care:${Care.ITEMS[editing]}:last`, String(last));
      prefs.put(`care:${Care.ITEMS[editing]}:every`, String(every));
    }
    setEditing(null);
  };

  const editor =
    editing === null ? null : (
      <View style={{ marginVertical: 12 }}>
        <Heading>{editing === 'odo' ? t('Odometer reading now (km)') : t(Care.NAMES[editing])}</Heading>
        {editing === 'odo' ? (
          <Field label={t('Odometer (km)')} value={a} onChange={setA} numeric />
        ) : Care.byDate(editing) ? (
          <Field label={f('%1$s: next due date', t(Care.NAMES[editing]))} value={a} onChange={setA} placeholder={today()} />
        ) : (
          <>
            <Field label={t('Odometer when it was last done (km)')} value={a} onChange={setA} numeric />
            <Field label={f('Change how often (now every %1$s km)', Care.every(prefs, editing))} value={b} onChange={setB} numeric />
          </>
        )}
        <Button label={t('Save')} kind="primary" onPress={save} />
        <Button label={t('Cancel')} onPress={() => setEditing(null)} />
      </View>
    );

  const alert = Care.alert(prefs, odo);
  return (
    <Screen title={t('Car care')}>
      {alert ? <Text style={{ color: look.accent, marginBottom: 8 }}>{alert}</Text> : null}
      <Row name={t('Odometer')} value={`${odo} km`} onPress={() => open('odo')} />
      {editing === 'odo' ? editor : null}
      <Heading>{t('Service reminders')}</Heading>
      {Care.ITEMS.map((_, i) => (
        <View key={i}>
          <Row name={t(Care.NAMES[i])} value={Care.describe(prefs, i, odo)} onPress={() => open(i)} />
          {editing === i ? editor : null}
        </View>
      ))}
      <Heading>{t('Trips, fuel and tolls')}</Heading>
      {/* one row since 1.35: it opens the trip menu, with the history, the score and the tolls */}
      <Row
        name={t('Trips, fuel and tolls')}
        value={Care.tripRow(trip.todayKm, Trip.score(trip), Fuel.stats(Fuel.log(prefs)).fills)}
        onPress={() => router.push('/tripmenu')}
      />
      <Row name={t("This week's report")} value={t('km, time, petrol, tolls, score; or say "weekly report"')} onPress={() => router.push('/report')} />
    </Screen>
  );
}
