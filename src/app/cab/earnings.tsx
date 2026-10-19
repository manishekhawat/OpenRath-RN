/**
 * Earnings (CabEarnings.earnings / rideDialog / costDialog / entries): today, yesterday, this week and the
 * last 30 days, by app and by payment; add a ride or a cost; tap an entry to delete it.
 * /cab/earnings?add=ride or ?add=cost opens with that form.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Choice, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { APPS, COSTS, entryRow, PAYS, report } from '../../logic/cabEarnings';
import { t } from '../../logic/i18n';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { logRide, toast } from './meter';

export default function Earnings() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [form, setForm] = useState<'ride' | 'cost' | null>(add === 'ride' || add === 'cost' ? add : null);
  const [amount, setAmount] = useState('');
  const [app, setApp] = useState(prefs.str('cabLastApp', 'Uber'));
  const [pay, setPay] = useState(prefs.str('cabLastPay', 'Cash'));
  const [what, setWhat] = useState(prefs.str('cabLastCost', COSTS[0]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => Cab.log(prefs), [prefs, version]);

  const save = () => {
    const v = parseFloat(amount);
    if (!(v > 0)) return toast(t(form === 'ride' ? 'Enter the fare in rupees' : 'Enter the amount in rupees'));
    if (form === 'ride') {
      prefs.put('cabLastApp', app);
      prefs.put('cabLastPay', pay);
      logRide(prefs, { rs: v, app, pay, lat: trip.lat, lon: trip.lon });
    } else {
      prefs.put('cabLastCost', what);
      Cab.addCost(prefs, v, what, Date.now());
    }
    setAmount('');
    setForm(null);
  };

  const remove = (index: number) =>
    Alert.alert(t('Delete this entry?'), entryRow(list[index]), [
      { text: t('Keep'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => Cab.removeEntry(prefs, index) },
    ]);

  const options = (l: string[]) => l.map((x) => ({ id: x, label: t(x) }));
  const shown = list.map((e, i) => ({ e, i })).slice(-200).reverse();

  return (
    <Screen title={t('Earnings')}>
      {form ? (
        <View>
          <Heading>{t(form === 'ride' ? 'Add a ride' : 'Add a cost')}</Heading>
          <Field label={t(form === 'ride' ? 'Fare (₹)' : 'Amount (₹)')} value={amount} onChange={setAmount} numeric />
          {form === 'ride' ? (
            <>
              <Text style={{ color: look.textDim, marginBottom: 4 }}>{t('App')}</Text>
              <Choice options={options(APPS)} value={app} onChange={setApp} />
              <Text style={{ color: look.textDim, marginBottom: 4 }}>{t('Paid by')}</Text>
              <Choice options={options(PAYS)} value={pay} onChange={setPay} />
            </>
          ) : (
            <>
              <Text style={{ color: look.textDim, marginBottom: 4 }}>{t('For')}</Text>
              <Choice options={options(COSTS)} value={what} onChange={setWhat} />
            </>
          )}
          <Button label={t('Save')} kind="primary" onPress={save} />
          <Button label={t('Cancel')} onPress={() => setForm(null)} />
        </View>
      ) : (
        <>
          <Text style={{ color: look.text, fontSize: 16, lineHeight: 24 }}>{report(prefs, Date.now())}</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <Button label={t('Add a ride')} kind="primary" onPress={() => setForm('ride')} />
            <Button label={t('Add a cost')} onPress={() => setForm('cost')} />
          </View>
        </>
      )}
      <Heading>{t(list.length === 0 ? 'Nothing logged yet' : 'Rides and costs (tap one to delete it)')}</Heading>
      {shown.map(({ e, i }) => (
        <Row key={e.t + ':' + i} name={entryRow(e)} onPress={() => remove(i)} />
      ))}
    </Screen>
  );
}
