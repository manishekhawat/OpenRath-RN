/**
 * Papers (Cab.papers): permit, fitness, badge, road tax, insurance and PUC expiry dates, reminded
 * 15 days ahead. Insurance and PUC are the same dates as the service reminders in Car care.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { f, t } from '../../logic/i18n';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

export default function Papers() {
  const { prefs } = usePrefs();
  const now = Date.now();
  const [editing, setEditing] = useState<number | null>(null);
  const [date, setDate] = useState('');

  const save = () => {
    if (editing === null) return;
    const v = date.trim();
    if (v !== '' && Cab.daysTo(v, now) === null) return toast(f('Enter the date as yyyy-mm-dd, for example %1$s', Cab.isoDay(now)));
    prefs.put(Cab.paperKey(Cab.PAPERS[editing]), v);
    prefs.put('cabPapersDay', ''); // check again today
    setEditing(null);
  };

  return (
    <Screen title={t('Papers (reminded 15 days ahead)')}>
      {Cab.PAPERS.map((id, i) => {
        const due = prefs.str(Cab.paperKey(id), '');
        const d = Cab.daysTo(due, now);
        return (
          <View key={id}>
            <Row
              name={d === null ? f('%1$s: tap to set the expiry date', t(Cab.PAPER_NAMES[i])) : Cab.dueShow(Cab.PAPER_NAMES[i], d) + '  (' + due + ')'}
              onPress={() => {
                setDate(due);
                setEditing(i);
              }}
            />
            {editing === i ? (
              <View style={{ marginVertical: 12 }}>
                <Heading>{t(Cab.PAPER_NAMES[i])}</Heading>
                <Field label={t('Expires on (yyyy-mm-dd)')} value={date} onChange={setDate} placeholder={Cab.isoDay(now)} />
                <Button label={t('Save')} kind="primary" onPress={save} />
                <Button label={t('Cancel')} onPress={() => setEditing(null)} />
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}
