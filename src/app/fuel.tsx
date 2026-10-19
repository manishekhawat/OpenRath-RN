/**
 * The fuel log (Fuel.add / Fuel.history): add a fill-up, see mileage per tank by the full-to-full
 * method, and delete a wrong entry. A sharp drop after a full tank raises the leak or theft check.
 * Also the fuel-low planner's rows (petrol left, tank size, when to warn) and the month's tolls.
 * One switch covers all of it since 1.35: Fuel and mileage (fuelPrice).
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Car from '../logic/car';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import * as Fuel from '../logic/fuel';
import * as FuelPlan from '../logic/fuelplan';
import { f, t } from '../logic/i18n';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export default function FuelLog() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const list = useMemo(() => Fuel.log(prefs), [prefs, version]);
  const stats = useMemo(() => Fuel.stats(list), [list]);
  const price = Fuel.price(prefs);
  const unit = Car.fuel(prefs) === 'cng' ? 'kg' : 'L';

  const [adding, setAdding] = useState(false);
  const [litres, setLitres] = useState('');
  const [rupees, setRupees] = useState('');
  const [odo, setOdo] = useState('');
  const [full, setFull] = useState(true);
  const [tankEdit, setTankEdit] = useState<string | null>(null);

  const startAdding = () => {
    setLitres('');
    setRupees('');
    setOdo(String(Fuel.suggestOdo(list, trip.odoKm)));
    setFull(true);
    setAdding(true);
  };

  const save = () => {
    const l = parseFloat(litres);
    const o = parseFloat(odo);
    if (!(l > 0) || !Number.isFinite(o)) {
      Alert.alert(t('Enter the litres and the odometer as numbers'));
      return;
    }
    // left empty: work it out from the litres and the known price
    const rs = rupees.trim() === '' ? Math.round(l * price) : parseFloat(rupees);
    const next = [...list, { t: Date.now(), l, rs, city: prefs.str('city', ''), odo: o, gps: trip.odoKm, full }];
    Fuel.setLog(prefs, next);
    setAdding(false);
    if (full && Features.on(prefs, 'fuelCheck')) {
      const warn = Errands.fuelDrop(Fuel.fullTankKmpl(next));
      if (warn) Alert.alert(t('Mileage dropped'), warn);
    }
  };

  const remove = (index: number) =>
    Alert.alert(t('Delete this fill-up?'), undefined, [
      { text: t('Keep'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => Fuel.setLog(prefs, list.filter((_, i) => i !== index)) },
    ]);

  return (
    <Screen title={Car.fuel(prefs) === 'petrol' ? t('Petrol log') : `${Car.word(Car.fuel(prefs)).replace(/^./, (c) => c.toUpperCase())} log`}>
      <View style={{ flexDirection: 'row', gap: 24, marginBottom: 8 }}>
        <Stat label={t('Average')} value={stats.avgKmpl > 0 ? `${Fuel.fmt(stats.avgKmpl)} km/${unit.toLowerCase()}` : '–'} />
        <Stat label={t('Last tank')} value={stats.lastKmpl > 0 ? `${Fuel.fmt(stats.lastKmpl)} km/${unit.toLowerCase()}` : '–'} />
        <Stat label={t('Cost a km')} value={stats.rupeesPerKm > 0 ? `₹${Fuel.fmt(stats.rupeesPerKm)}` : '–'} />
      </View>
      <Text style={{ color: look.textDim }}>{t('Petrol price')}: {Fuel.priceText(prefs)}</Text>
      <Text style={{ color: look.textDim }}>
        {f('%1$s fill-ups', stats.fills)}
        {Care.tollsThisMonth(prefs)}
      </Text>

      <Heading>{t('Petrol left')}</Heading>
      <Row
        name={Car.fuel(prefs) === 'petrol' ? t('Petrol left') : `${Car.word(Car.fuel(prefs)).replace(/^./, (c) => c.toUpperCase())} left`}
        value={Features.on(prefs, 'fuelPrice') ? FuelPlan.text(prefs, trip.odoKm) : t('off (switch above)')}
      />
      <Row name={t('Tank size')} value={unit === 'kg' ? `${FuelPlan.tank(prefs)} kg` : f('%1$s litres', FuelPlan.tank(prefs))} onPress={() => setTankEdit(String(FuelPlan.tank(prefs)))} />
      {tankEdit !== null ? (
        <View>
          <Field label={t(unit === 'kg' ? 'CNG cylinder, kg' : 'Fuel tank, litres')} value={tankEdit} onChange={setTankEdit} numeric />
          <Button
            label={t('Save')}
            kind="primary"
            onPress={() => {
              const v = parseFloat(tankEdit);
              if (!(v > 0)) return Alert.alert(t(unit === 'kg' ? 'CNG cylinder, kg' : 'Fuel tank, litres'));
              FuelPlan.setTank(prefs, v);
              setTankEdit(null);
            }}
          />
          <Button label={t('Cancel')} onPress={() => setTankEdit(null)} />
        </View>
      ) : null}
      <Row
        name={Car.fuel(prefs) === 'petrol' ? t('Warn when the petrol is below') : `Warn when the ${Car.word(Car.fuel(prefs))} is below`}
        value={f('%1$s km of driving', FuelPlan.warnKm(prefs))}
        onPress={() => prefs.put('fuelWarnKm', String(FuelPlan.nextWarnKm(FuelPlan.warnKm(prefs))))}
      />
      <Row name={t('Tolls')} value={t('Add a toll payment')} onPress={() => router.push('/tolls')} />

      {adding ? (
        <View style={{ marginTop: 16 }}>
          <Heading>{t('Add a fill-up')}</Heading>
          <Field label={t(unit === 'kg' ? 'Kilograms' : 'Litres')} value={litres} onChange={setLitres} numeric />
          <Field
            label={price > 0 ? f('Amount paid (₹), or leave empty for ₹%1$s a litre', Fuel.fmt(price)) : t('Amount paid (₹)')}
            value={rupees}
            onChange={setRupees}
            numeric
          />
          <Field label={t('Odometer (km)')} value={odo} onChange={setOdo} numeric />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: look.text }}>{t('Filled the tank to full')}</Text>
            <Switch value={full} onValueChange={setFull} />
          </View>
          <Button label={t('Save')} kind="primary" onPress={save} />
          <Button label={t('Cancel')} onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button label={t('Add a fill-up')} kind="primary" onPress={startAdding} />
      )}

      <Heading>{list.length === 0 ? t('No fill-ups yet') : t('Fill-ups (tap one to delete it)')}</Heading>
      {list
        .map((e, i) => ({ e, i }))
        .reverse()
        .map(({ e, i }) => (
          <Row
            key={e.t + ':' + i}
            name={`${date(e.t)}   ${Fuel.fmt(e.l)} ${unit}   ₹${Math.round(e.rs)}`}
            value={`${Math.round(e.odo)} km${e.full === false ? '   ' + t('(part fill)') : ''}${e.city ? '   ' + e.city : ''}`}
            onPress={() => remove(i)}
          />
        ))}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const look = useLook();
  return (
    <View>
      <Text style={{ color: look.textDim, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: look.text, fontSize: 22 }}>{value}</Text>
    </View>
  );
}
