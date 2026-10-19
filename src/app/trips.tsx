/**
 * Trip history and driving score (from the trip menu, as in 1.35), with the Mileage coach,
 * 0–100 km/h and the GPX rows of the Android version's Settings > Driving on one page: weekly and
 * monthly totals, the drives that used the most extra fuel and why, the best standing start, and
 * the recorded routes to share as GPX.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Coach from '../logic/coach';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Tracks from '../logic/tracks';
import * as Trip from '../logic/trip';
import { history, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import * as TrackFiles from '../state/tracks';

type DayInfo = { day: string; km: number; points: number; from: number; to: number };

export default function TripsScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const [hist, setHist] = useState<Trip.History>({});
  const [days, setDays] = useState<DayInfo[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    history().then(setHist).catch(() => {});
  }, []);

  const loadDays = async () => {
    const out: DayInfo[] = [];
    for (const day of TrackFiles.days()) out.push({ day, ...Tracks.summarize(await TrackFiles.points(day)) });
    setDays(out);
  };
  useEffect(() => {
    loadDays().catch(() => {});
  }, []);

  // today's running figures, as the Android version's history had them
  const withToday = useMemo(
    () => Care.withToday(hist, trip.day, [Math.round(trip.todayKm * 10) / 10, trip.todaySec, trip.todayBrakes, trip.todayAccels, trip.todaySpeedSec, Trip.score(trip)]),
    [hist, trip],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' is the store counter the memo depends on; Store.prefs keeps one identity
  const periods = useMemo(() => Care.periods(new Date()).map((p) => Care.periodLine(p.name, Care.totals(prefs, withToday, p.from, p.to))), [prefs, version, withToday]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' is the store counter the memo depends on; Store.prefs keeps one identity
  const coach = useMemo(() => Coach.summarize(prefs), [prefs, version]);
  const recent = [...coach.all].reverse().slice(0, showAll ? 40 : 6);

  const share = async (day: string) => {
    setBusy(day);
    try {
      await TrackFiles.shareGpx(day);
    } catch (e) {
      Alert.alert(f("Couldn't export: %1$s", String(e instanceof Error ? e.message : e)));
    } finally {
      setBusy('');
    }
  };

  const accel = () =>
    Alert.alert(t('0–100 km/h timer'), Tracks.accelAbout(), [
      { text: t('OK'), style: 'cancel' },
      { text: t('Forget the best time'), style: 'destructive', onPress: () => Tracks.forgetAccel(prefs) },
    ]);

  const deleteRoutes = () =>
    Alert.alert(t('Delete every recorded route on the unit?'), undefined, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: () => {
          TrackFiles.deleteAll();
          setDays([]);
        },
      },
    ]);

  const off = (id: string) => (Features.on(prefs, id) ? '' : ' ' + t('(off in Settings > Features)'));
  const dim = { color: look.textDim };
  const body = { color: look.text, lineHeight: 21 };

  return (
    <Screen title={t('Trip history and driving score')}>
      <Heading>{t('Trip history')}</Heading>
      {periods.map((l) => (
        <Text key={l} style={[body, { marginBottom: 8 }]}>
          {l}
        </Text>
      ))}
      <Text style={dim}>{Care.scoreLine(Trip.score(trip), trip.todayBrakes, trip.todayAccels, trip.todaySpeedSec)}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={t("This week's report")} onPress={() => router.push('/report')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('Tolls')} onPress={() => router.push('/tolls')} />
        </View>
      </View>

      <Heading>{t('Mileage coach') + off('fuelPrice')}</Heading>
      {coach.all.length === 0 ? (
        <Text style={dim}>{Coach.empty()}</Text>
      ) : (
        <>
          <Text style={body}>{Coach.headline(coach)}</Text>
          <Text style={[body, { color: look.accent, marginVertical: 8 }]}>{Coach.tip(coach.sum)}</Text>
          <Text style={[dim, { marginTop: 4 }]}>{Coach.worstHeading()}</Text>
          {coach.sorted.slice(0, 8).map((t, i) => (
            <DriveRow key={'w' + i + ':' + t.start} t={t} kmpl={coach.kmpl} price={coach.price} />
          ))}
          <Text style={[dim, { marginTop: 16 }]}>{t('Recent drives')}</Text>
          {recent.map((t, i) => (
            <DriveRow key={'r' + i + ':' + t.start} t={t} kmpl={coach.kmpl} price={coach.price} />
          ))}
          {coach.all.length > 6 ? <Button label={showAll ? t('Fewer') : f('All %1$s recent drives', Math.min(40, coach.all.length))} onPress={() => setShowAll(!showAll)} /> : null}
          <Text style={[dim, { marginTop: 8, fontSize: 12 }]}>{Coach.footnote(coach.kmpl)}</Text>
        </>
      )}

      <Heading>{t('0–100 km/h timer') + off('accel')}</Heading>
      <Row name={t('0–100 km/h')} value={Tracks.accelText(prefs)} onPress={accel} />

      <Heading>{t('Export routes as GPX') + off('gpx')}</Heading>
      {days.length === 0 ? (
        <Text style={dim}>{Features.on(prefs, 'gpx') ? t('No routes recorded yet') : t('Route recording is off in Settings > Driving')}</Text>
      ) : (
        days.map((d) => (
          <Row
            key={d.day}
            name={(d.day === Trip.dayKey(Date.now()) ? t('Today') + ', ' : '') + d.day}
            value={f('%1$s km  ·  %2$s points', d.km.toFixed(1), d.points) + (d.from ? `  ·  ${Coach.when(d.from).split(', ')[1]}–${Coach.when(d.to).split(', ')[1]}` : '')}
            onPress={() => share(d.day)}
            right={<Text style={{ color: look.accent }}>{busy === d.day ? '…' : t('Share')}</Text>}
          />
        ))
      )}
      <Text style={[dim, { fontSize: 12, marginTop: 6 }]}>{f('Kept %1$s days on this device only. Share opens a GPX file in Google Earth, OsmAnd or Strava.', Tracks.KEEP_DAYS)}</Text>
      {days.length > 0 ? <Button label={t('Delete recorded routes')} kind="danger" onPress={deleteRoutes} /> : null}
    </Screen>
  );
}

function DriveRow({ t: trip, kmpl, price }: { t: Coach.Trip; kmpl: number; price: number }) {
  const look = useLook();
  const w = Coach.waste(trip, kmpl);
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderColor: look.edge }}>
      <Text style={{ color: look.text }}>
        {Coach.when(trip.start)}  ·  {Coach.kmMin(trip)}
      </Text>
      <Text style={{ color: look.textDim, marginTop: 2 }}>
        {Coach.reasons(trip, w)}
        {Coach.extra(w, price)}
      </Text>
    </View>
  );
}
