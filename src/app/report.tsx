/**
 * The weekly report ("Your week in the car", Chores.weekly): the last seven days' km and time,
 * petrol and toll spending, the average driving score, and the best and worst drive. The
 * dashboard opens it on Sundays (Weekly.due, part of "Daily and weekly summary"); it can also be
 * opened any time from the trip history or by saying "weekly report".
 */
import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { Button, Heading, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Coach from '../logic/coach';
import { hindi, t } from '../logic/i18n';
import * as Trip from '../logic/trip';
import * as Weekly from '../logic/weekly';
import { history, say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

export default function ReportScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const [hist, setHist] = useState<Trip.History>({});

  useEffect(() => {
    history().then(setHist).catch(() => {});
  }, []);

  const week = useMemo(() => {
    const h = Care.withToday(hist, trip.day, [Math.round(trip.todayKm * 10) / 10, trip.todaySec, trip.todayBrakes, trip.todayAccels, trip.todaySpeedSec, Trip.score(trip)]);
    return Weekly.week(prefs, h);
    // the running trip changes every second; the report only needs it when opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, version, hist]);

  const lines = week.text.split('\n');
  return (
    <Screen title={Weekly.title()}>
      <Text style={{ color: look.textDim, marginBottom: 12 }}>
        {Coach.when(week.from).split(',')[0]} – {Coach.when(week.to).split(',')[0]}
      </Text>
      {lines.map((l, i) => {
        // "Driven: 120 km …": the name dim; a translation without ": " shows as one line
        const at = l.indexOf(': ');
        return (
          <Text key={i} style={{ color: look.text, fontSize: 17, lineHeight: 26 }}>
            {at < 0 ? l : <><Text style={{ color: look.textDim }}>{l.substring(0, at + 2)}</Text>{l.substring(at + 2)}</>}
          </Text>
        );
      })}
      {week.best || week.worst ? null : (
        <>
          <Heading>{t('Drives')}</Heading>
          <Text style={{ color: look.textDim }}>{t('No drives of 3 km or more this week for the best and worst.')}</Text>
        </>
      )}
      {/* spoken prompts stay English, so not when the report shows in Hindi */}
      {hindi() ? null : <Button label={t('Read it aloud')} onPress={() => say(week.text.replace(/\n/g, '. '))} />}
    </Screen>
  );
}
