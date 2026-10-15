/**
 * CNG fill-ups (Cab.cngLog / addCng): km per kg between fills, and the stations near here. A fill
 * with an amount is a cost in the earnings too.
 */
import { useState } from 'react';
import { Linking } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import * as Care from '../../logic/care';
import { useDrive } from '../../state/drive';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

export default function Cng() {
  const { prefs } = usePrefs();
  const { trip } = useDrive();
  const list = Cab.cng(prefs);
  const [adding, setAdding] = useState(false);
  const [kg, setKg] = useState('');
  const [rupees, setRupees] = useState('');
  const [odo, setOdo] = useState('');

  const start = () => {
    setKg('');
    setRupees('');
    setOdo(String(Care.odo(prefs, trip.odoKm)));
    setAdding(true);
  };
  const save = () => {
    const k = parseFloat(kg);
    const r = parseFloat(rupees);
    const o = parseFloat(odo);
    if (!(k > 0) || !(o > 0)) return toast('Enter the kg and the odometer as numbers');
    Cab.addCng(prefs, k, Number.isFinite(r) ? r : 0, o, Date.now());
    setAdding(false);
  };

  return (
    <Screen title={Cab.cngHead(list)}>
      {adding ? (
        <>
          <Heading>Add a CNG fill</Heading>
          <Field label="Kg" value={kg} onChange={setKg} numeric />
          <Field label="Amount paid (₹)" value={rupees} onChange={setRupees} numeric />
          <Field label="Odometer (km)" value={odo} onChange={setOdo} numeric />
          <Button label="Save" kind="primary" onPress={save} />
          <Button label="Cancel" onPress={() => setAdding(false)} />
        </>
      ) : (
        <>
          <Button label="Add a fill" kind="primary" onPress={start} />
          <Button
            label="CNG stations near here"
            onPress={() => Linking.openURL(Cab.cngSearch(trip.lat, trip.lon)).catch(() => toast('Needs a map app (Google Maps, Organic Maps or OsmAnd)'))}
          />
        </>
      )}
      <Heading>Fills</Heading>
      {[...list].reverse().map((e, i) => (
        <Row key={e.t + ':' + i} name={Cab.cngRow(e)} />
      ))}
    </Screen>
  );
}
