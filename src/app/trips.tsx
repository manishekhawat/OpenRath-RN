/**
 * Trips (Trip history, Mileage coach, Commute insights, 0–100 km/h and the GPX rows of the
 * Android version's Settings > Driving, on one page): weekly and monthly totals, the drives that
 * used the most extra fuel and why, the quickest time to leave, the best standing start, and the
 * recorded routes to share as GPX.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Heading, Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Coach from '../logic/coach';
import * as Commute from '../logic/commute';
import * as Features from '../logic/features';
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
  const periods = useMemo(() => Care.periods(new Date()).map((p) => Care.periodLine(p.name, Care.totals(prefs, withToday, p.from, p.to))), [prefs, version, withToday]);
  const coach = useMemo(() => Coach.summarize(prefs), [prefs, version]);
  const routes = useMemo(() => Commute.learn(coach.all, Commute.places(prefs)), [coach, prefs, version]);
  const recent = [...coach.all].reverse().slice(0, showAll ? 40 : 6);

  const share = async (day: string) => {
    setBusy(day);
    try {
      await TrackFiles.shareGpx(day);
    } catch (e) {
      Alert.alert("Couldn't export", String(e instanceof Error ? e.message : e));
    } finally {
      setBusy('');
    }
  };

  const accel = () =>
    Alert.alert('0–100 km/h timer', Tracks.ACCEL_ABOUT, [
      { text: 'OK', style: 'cancel' },
      { text: 'Forget the best time', style: 'destructive', onPress: () => Tracks.forgetAccel(prefs) },
    ]);

  const deleteRoutes = () =>
    Alert.alert('Delete every recorded route on the unit?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          TrackFiles.deleteAll();
          setDays([]);
        },
      },
    ]);

  const off = (id: string) => (Features.on(prefs, id) ? '' : ' (off in Settings > Features)');
  const dim = { color: look.textDim };
  const body = { color: look.text, lineHeight: 21 };

  return (
    <Screen title="Trips">
      <Heading>Trip history</Heading>
      {periods.map((l) => (
        <Text key={l} style={[body, { marginBottom: 8 }]}>
          {l}
        </Text>
      ))}
      <Text style={dim}>{Care.scoreLine(Trip.score(trip), trip.todayBrakes, trip.todayAccels, trip.todaySpeedSec)}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Weekly report" onPress={() => router.push('/report')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Tolls" onPress={() => router.push('/tolls')} />
        </View>
      </View>

      <Heading>{'Mileage coach' + off('coach')}</Heading>
      {coach.all.length === 0 ? (
        <Text style={dim}>{Coach.EMPTY}</Text>
      ) : (
        <>
          <Text style={body}>{Coach.headline(coach)}</Text>
          <Text style={[body, { color: look.accent, marginVertical: 8 }]}>{Coach.tip(coach.sum)}</Text>
          <Text style={[dim, { marginTop: 4 }]}>The drives that used the most extra fuel:</Text>
          {coach.sorted.slice(0, 8).map((t, i) => (
            <DriveRow key={'w' + i + ':' + t.start} t={t} kmpl={coach.kmpl} price={coach.price} />
          ))}
          <Text style={[dim, { marginTop: 16 }]}>Recent drives</Text>
          {recent.map((t, i) => (
            <DriveRow key={'r' + i + ':' + t.start} t={t} kmpl={coach.kmpl} price={coach.price} />
          ))}
          {coach.all.length > 6 ? <Button label={showAll ? 'Fewer' : `All ${Math.min(40, coach.all.length)} recent drives`} onPress={() => setShowAll(!showAll)} /> : null}
          <Text style={[dim, { marginTop: 8, fontSize: 12 }]}>Estimates for a 1.2 litre petrol engine, using {coach.kmpl.toFixed(1)} km/l.</Text>
        </>
      )}

      <Heading>{'Commute insights' + off('commute')}</Heading>
      {routes.length === 0 ? (
        <Text style={dim}>{Commute.EMPTY}</Text>
      ) : (
        routes.map((r, i) => (
          <View key={i} style={{ marginBottom: 12 }}>
            {Commute.lines(r).map((l, j) => (
              <Text key={j} style={j === 0 ? [body, { fontWeight: '600' }] : l.startsWith('Quickest') ? [body, { color: look.accent }] : body}>
                {l}
              </Text>
            ))}
          </View>
        ))
      )}
      <Text style={[dim, { fontSize: 12 }]}>{Commute.HINT}</Text>

      <Heading>{'Standing starts' + off('accel')}</Heading>
      <Row name="0–100 km/h" value={Tracks.accelText(prefs)} onPress={accel} />

      <Heading>{'Routes (GPX)' + off('gpx')}</Heading>
      {days.length === 0 ? (
        <Text style={dim}>{Features.on(prefs, 'gpx') ? 'No routes recorded yet' : 'Route recording is off in Settings > Features'}</Text>
      ) : (
        days.map((d) => (
          <Row
            key={d.day}
            name={(d.day === Trip.dayKey(Date.now()) ? 'Today, ' : '') + d.day}
            value={`${d.km.toFixed(1)} km  ·  ${d.points} points` + (d.from ? `  ·  ${Coach.when(d.from).split(', ')[1]}–${Coach.when(d.to).split(', ')[1]}` : '')}
            onPress={() => share(d.day)}
            right={<Text style={{ color: look.accent }}>{busy === d.day ? '…' : 'Share'}</Text>}
          />
        ))
      )}
      <Text style={[dim, { fontSize: 12, marginTop: 6 }]}>Kept {Tracks.KEEP_DAYS} days on this device only. Share opens a GPX file in Google Earth, OsmAnd or Strava.</Text>
      {days.length > 0 ? <Button label="Delete recorded routes" kind="danger" onPress={deleteRoutes} /> : null}
    </Screen>
  );
}

function DriveRow({ t, kmpl, price }: { t: Coach.Trip; kmpl: number; price: number }) {
  const look = useLook();
  const w = Coach.waste(t, kmpl);
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderColor: look.edge }}>
      <Text style={{ color: look.text }}>
        {Coach.when(t.start)}  ·  {t.km.toFixed(1)} km, {Coach.minutes(t)} min
      </Text>
      <Text style={{ color: look.textDim, marginTop: 2 }}>
        {Coach.reasons(t, w)}
        {Coach.extra(w, price)}
      </Text>
    </View>
  );
}
