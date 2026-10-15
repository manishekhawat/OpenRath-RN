/**
 * Tolls paid (Care.addToll and the toll lines of the trip history): add a payment, see this and
 * last week's and month's totals next to the fuel spent, and delete a wrong entry.
 */
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Fuel from '../logic/fuel';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (t: number) => {
  const d = new Date(t);
  const h = d.getHours() % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

export default function TollsScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const list = useMemo(() => Care.tolls(prefs), [prefs, version]);
  const [rs, setRs] = useState('');

  const totals = useMemo(() => {
    const fuel = Fuel.log(prefs);
    return Care.periods(new Date()).map((p) => ({ name: p.name, toll: Care.spent(list, p.from, p.to), fuel: Care.spent(fuel, p.from, p.to) }));
  }, [prefs, version, list]);

  const add = () => {
    const v = parseFloat(rs);
    if (!(v > 0)) return Alert.alert('Enter the toll paid in rupees');
    Care.addToll(prefs, v);
    setRs('');
  };

  const remove = (index: number) =>
    Alert.alert('Delete this toll?', undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => Care.setTolls(prefs, list.filter((_, i) => i !== index)) },
    ]);

  return (
    <Screen title="Tolls">
      <Field label="Toll paid (₹)" value={rs} onChange={setRs} numeric placeholder="e.g. 115" />
      <Button label="Add a toll payment" kind="primary" onPress={add} />

      <Heading>Spent</Heading>
      {totals.map((t) => (
        <View key={t.name} style={{ flexDirection: 'row', paddingVertical: 6 }}>
          <Text style={{ color: look.text, flex: 1 }}>{t.name}</Text>
          <Text style={{ color: look.text, width: 110, textAlign: 'right' }}>tolls ₹{Math.round(t.toll)}</Text>
          <Text style={{ color: look.textDim, width: 110, textAlign: 'right' }}>fuel ₹{Math.round(t.fuel)}</Text>
        </View>
      ))}

      <Heading>{list.length === 0 ? 'No tolls yet' : 'Tolls paid (tap one to delete it)'}</Heading>
      {list
        .map((e, i) => ({ e, i }))
        .reverse()
        .map(({ e, i }) => (
          <Row key={e.t + ':' + i} name={`₹${Math.round(e.rs)}`} value={date(e.t)} onPress={() => remove(i)} />
        ))}
    </Screen>
  );
}
