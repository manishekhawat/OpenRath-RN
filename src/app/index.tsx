/**
 * The dashboard (HomeActivity + Cards in the Android version): the car with live speed and the
 * moving road, the clock, weather, trip computer and fuel log, and the dock along the bottom.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LayoutView, { useLayout } from '../components/LayoutView';
import { DashcamView } from '../components/DashcamView';
import MicButton from '../components/MicButton';
import { MusicBox } from '../components/MusicBox';
import { NewsBox } from '../components/NewsBox';
import { RoadAhead } from '../components/RoadAhead';
import { Box } from '../components/ui';
import { Road } from '../components/Road';
import * as Air from '../logic/air';
import * as Cab from '../logic/cab';
import * as Car from '../logic/car';
import * as Care from '../logic/care';
import * as Chores from '../logic/chores';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import * as Fuel from '../logic/fuel';
import * as Holidays from '../logic/holidays';
import { num } from '../logic/prefs';
import * as Trip from '../logic/trip';
import * as Weekly from '../logic/weekly';
import { useParkedSnap } from '../state/camera';
import { say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { useWeather } from '../state/weather';
import { dailyBackup } from './settings/backup';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Home() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const drive = useDrive();
  const { trip } = drive;
  const now = useClock();
  const weather = useWeather(trip.lat, trip.lon);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const layout = useLayout();
  // the parking photo when the car parks
  useParkedSnap();

  const fuelStats = useMemo(() => Fuel.stats(Fuel.log(prefs)), [prefs, version]);
  const odoKm = Care.odo(prefs, trip.odoKm);
  const tripCost = Fuel.cost(prefs, trip.todayKm, Car.kmpl(Car.fuel(prefs)));
  const careAlert = Features.on(prefs, 'care') ? Care.alert(prefs, odoKm, now) : '';
  const rush = Features.on(prefs, 'holidayTraffic') ? Holidays.rush(now) : null;
  const dark = trip.lat !== 0 && Errands.dark(trip.lat, trip.lon, now.getTime());
  const nightDrive = Features.on(prefs, 'nightDrive') && dark && trip.kmh > 20;

  // the start-up summary, once a day, when the weather is in
  useEffect(() => {
    if (!Car.ready(prefs) || !Features.on(prefs, 'startSummary')) return;
    const today = Trip.dayKey(Date.now());
    if (prefs.str('summaryDay', '') === today || !weather.wx) return;
    prefs.put('summaryDay', today);
    const { rangeKm, holiday } = Weekly.summaryExtras(prefs, trip.odoKm);
    const text = Errands.summary(
      new Date(),
      prefs.str('ownerName', ''),
      weather.wx.temp + '°',
      weather.wx.text,
      weather.wx.rainSoon > 0.2 ? 'Rain is expected within the hour' : '',
      weather.aqi,
      rangeKm,
      careAlert,
      holiday,
    );
    say(text);
    Alert.alert(Errands.greeting(new Date()), text.substring(text.indexOf('.') + 1).trim());
  }, [weather.wx, prefs, careAlert, fuelStats]);

  // the wash reminder, when parked and the next days look dry
  useEffect(() => {
    if (!weather.wx || trip.kmh > 3) return;
    const ask = Chores.washCheck(prefs, trip.kmh, Chores.forecastIcons(weather.wx.daily.map((d) => d.code)));
    if (ask) Alert.alert(ask.title, ask.message, [{ text: 'Washed today', onPress: () => Chores.washed(prefs) }, { text: 'Later' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather.wx]);

  // the automatic daily backup (Backup.daily)
  useEffect(() => {
    dailyBackup(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the service booking reminder: once a day when parked, if a service is near (HomeActivity)
  useEffect(() => {
    if (!Car.ready(prefs) || !Features.on(prefs, 'serviceBooking') || !Features.on(prefs, 'care') || trip.kmh > 3) return;
    const today = Trip.dayKey(Date.now());
    if (prefs.str('bookAsked', '') === today) return;
    const i = Care.bookingDue(prefs, odoKm);
    if (i < 0) return;
    prefs.put('bookAsked', today);
    const mine = prefs.str('myService', '').split('|');
    const have = mine.length === 2 && mine[1] !== '';
    const k = Care.kmLeft(prefs, i, odoKm);
    const when = k < 0 ? `is overdue by ${-k} km` : `is due in ${k} km`;
    Alert.alert(
      'Book the service?',
      `${Care.NAMES[i]} ${when}.` +
        (have ? ` Call ${mine[0]} to book a slot?` : " Find your service centre on the map and tap Mine next to it, so next time it's one tap to call."),
      [
        { text: 'Later', style: 'cancel' },
        {
          text: have ? 'Call' : 'Find one',
          onPress: () => (have ? Linking.openURL('tel:' + mine[1].replace(/[^0-9+]/g, '')).catch(() => {}) : router.push('/map?go=service')),
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock screensaver: after a few idle minutes while parked (Extras.saverCheck)
  const touchAt = useRef(Date.now());
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const [saver, setSaver] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const t = tripRef.current;
      const parked = Date.now() - (t.last?.t ?? 0) > 10000 || t.kmh < 5;
      if (Features.on(prefs, 'saver') && parked && Date.now() - touchAt.current > num(prefs, 'saverMin', 5) * 60000) setSaver(true);
    }, 20000);
    return () => clearInterval(id);
  }, [prefs]);

  // the weekly report, on the first parked start of a new week
  useEffect(() => {
    const t = setTimeout(() => {
      if (Car.ready(prefs) && trip.kmh <= 3 && Weekly.due(prefs)) router.push('/report');
    }, 3000);
    return () => clearTimeout(t);
    // once per dashboard visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!Car.ready(prefs)) return <Redirect href="/setup" />;

  if (saver) {
    const wake = () => {
      touchAt.current = Date.now();
      setSaver(false);
    };
    return (
      <Pressable style={[styles.fill, styles.saver]} onPress={wake}>
        <Text style={styles.saverTime}>{`${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`}</Text>
        <Text style={styles.saverDate}>
          {DAYS[now.getDay()]}  {now.getDate()} {MONTHS[now.getMonth()]}
        </Text>
        {weather.wx ? <Text style={[styles.saverNow, { color: look.accent }]}>{`${weather.wx.temp}°  ${weather.wx.text}`}</Text> : null}
      </Pressable>
    );
  }

  if (nightDrive) {
    // after sunset while driving: big red speed, nothing else
    return (
      <Pressable style={[styles.fill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]} onPress={() => router.push('/map')}>
        <Text style={{ color: '#C62828', fontSize: 160, fontWeight: '700' }}>{Math.round(trip.kmh)}</Text>
        <Text style={{ color: '#7F1D1D', fontSize: 22 }}>km/h</Text>
      </Pressable>
    );
  }

  if (layout) return <LayoutView layout={layout} />;

  const time = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';
  const carName = Car.name(prefs);

  const carBox = (
    <Box style={landscape ? { flex: 1.4 } : { height: 300 }} onPress={() => router.push('/map')} onLongPress={() => router.push('/settings')}>
      <Text style={[styles.welcome, { color: look.textDim }]}>{look.welcomeTitle}</Text>
      <Text style={[styles.carName, { color: look.chrome ? '#E9ECF0' : look.text }]} numberOfLines={1}>
        {carName || 'MY CAR'}
      </Text>
      <View style={styles.speedRow}>
        <Text style={[styles.speed, { color: drive.over ? '#E5484D' : look.text }]}>{Math.round(trip.kmh)}</Text>
        <Text style={[styles.unit, { color: look.textDim }]}>km/h</Text>
        {drive.limit > 0 ? (
          <View style={styles.limit}>
            <Text style={styles.limitText}>{drive.limit}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.roadWrap}>
        {look.road && Features.on(prefs, 'road') ? (
          <Road width={landscape ? width * 0.36 : width - 56} height={90} kmh={trip.kmh} fill={look.roadFill} line={look.roadLine} />
        ) : null}
      </View>
      <View style={styles.carFoot}>
        <Text style={[styles.small, { color: careAlert ? look.accent : look.textDim }]} numberOfLines={1}>
          {careAlert || (drive.gps === 'denied' ? 'LOCATION OFF: ALLOW IT IN SETTINGS' : drive.gps ? 'WAITING FOR GPS' : '')}
        </Text>
        {drive.cameraM >= 0 ? <Text style={[styles.small, { color: '#E5484D' }]}>SPEED CAMERA {drive.cameraM} m</Text> : null}
      </View>
    </Box>
  );

  const clockBox = (
    <Box style={styles.flexBox}>
      <Text style={[styles.time, { color: look.text }]}>
        {time} <Text style={[styles.ampm, { color: look.textDim }]}>{ampm}</Text>
      </Text>
      <Text style={{ color: look.textDim }}>
        {DAYS[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]}
      </Text>
      {rush ? <Text style={[styles.small, { color: look.accent, marginTop: 6 }]}>It's {rush}: highways will be busy</Text> : null}
    </Box>
  );

  const wx = weather.wx;
  const weatherBox = Features.on(prefs, 'weather') ? (
    <Box title={weather.place ? weather.place.toUpperCase() : 'WEATHER'} style={styles.flexBox}>
      {wx ? (
        <>
          <Text style={[styles.big, { color: look.text }]}>{wx.temp}°</Text>
          <Text style={{ color: look.textDim }}>
            {wx.text} · {Math.round(wx.humidity)}% · wind {Math.round(wx.wind)} km/h
          </Text>
          {Features.on(prefs, 'rain') && wx.rainSoon > 0.2 ? (
            <Text style={[styles.small, { color: look.accent }]}>Rain expected within the hour</Text>
          ) : null}
          {weather.aqi > 0 ? (
            <Text style={[styles.small, { color: weather.aqi > 200 ? '#E5484D' : look.textDim }]}>
              Air: {Air.band(weather.aqi)} (AQI {weather.aqi})
            </Text>
          ) : null}
          {wx.savedNote ? <Text style={[styles.small, { color: look.textDim }]}>{wx.savedNote}</Text> : null}
        </>
      ) : (
        <Text style={{ color: look.textDim }}>{trip.lat === 0 ? 'Waiting for the location' : 'Loading the weather'}</Text>
      )}
    </Box>
  ) : null;

  const tripBox = (
    <Box
      title="TRIP COMPUTER"
      style={styles.flexBox}
      onPress={() =>
        Alert.alert('Trip computer', undefined, [
          { text: 'Reset today', onPress: drive.resetToday },
          { text: 'Save parking spot here', onPress: () => trip.lat !== 0 && drive.setPark(trip.lat, trip.lon) },
          { text: 'Fuel log', onPress: () => router.push('/fuel') },
          { text: 'Close', style: 'cancel' },
        ])
      }
    >
      <Text style={[styles.big, { color: look.text }]}>
        {trip.todayKm.toFixed(1)} <Text style={[styles.unit, { color: look.textDim }]}>km today</Text>
      </Text>
      <Text style={{ color: look.textDim }}>
        {Trip.duration(trip.todaySec)} · avg {Math.round(Trip.avgKmh(trip.todayKm, trip.todaySec))} km/h
        {Features.on(prefs, 'score') ? ` · score ${Trip.score(trip)}` : ''}
      </Text>
      {Features.on(prefs, 'fuelPrice') && tripCost > 0 ? (
        <Text style={[styles.small, { color: look.textDim }]}>About ₹{Math.round(tripCost)} of {Car.word(Car.fuel(prefs))} today</Text>
      ) : null}
      <Text style={[styles.small, { color: look.textDim }]}>
        This drive {trip.driveKm.toFixed(1)} km
        {trip.park && Features.on(prefs, 'parking') ? ` · parked ${Errands.clock(trip.park.at)}` : ''}
      </Text>
    </Box>
  );

  // the dashcam records through this box, so it stays mounted while either camera feature is on
  const camBox = Features.on(prefs, 'dashcam') || Features.on(prefs, 'parkPhoto') ? <DashcamView style={styles.flexBox} /> : null;

  const cabShare = Cab.targetShare(prefs, now.getTime());
  const cabBox = Features.on(prefs, 'cab') ? (
    <Box title="CAB" style={styles.flexBox} onPress={() => router.push('/cab')}>
      <Text style={{ color: look.text, fontSize: 18 }}>{Cab.title(prefs, now.getTime()).replace(/^Cab\s+·\s+/, '')}</Text>
      {cabShare >= 0 ? (
        <View style={[styles.bar, { backgroundColor: look.edge }]}>
          <View style={{ width: `${Math.round(cabShare * 100)}%`, height: '100%', backgroundColor: look.accent, borderRadius: 3 }} />
        </View>
      ) : null}
    </Box>
  ) : null;

  const fuelWord = Car.word(Car.fuel(prefs));
  const fuelBox = (
    <Box title={`${fuelWord.toUpperCase()} LOG`} style={styles.flexBox} onPress={() => router.push('/fuel')}>
      {fuelStats.avgKmpl > 0 ? (
        <>
          <Text style={[styles.big, { color: look.text }]}>
            {Fuel.fmt(fuelStats.avgKmpl)} <Text style={[styles.unit, { color: look.textDim }]}>km/l average</Text>
          </Text>
          <Text style={{ color: look.textDim }}>
            Last tank {Fuel.fmt(fuelStats.lastKmpl)} km/l · ₹{Fuel.fmt(fuelStats.rupeesPerKm)} a km
          </Text>
        </>
      ) : (
        <Text style={{ color: look.textDim }}>
          {fuelStats.fills === 0 ? 'Tap to add your first fill-up' : 'Mileage shows after two full tanks'}
        </Text>
      )}
    </Box>
  );

  const dock = (
    <View style={[styles.dock, { borderColor: look.edge, backgroundColor: look.panelTop }]}>
      {[
        ['Map', '/map'],
        ['Music', '/music'],
        ['Apps', '/apps'],
        ['Fuel', '/fuel'],
        ['Care', '/care'],
        ['Settings', '/settings'],
      ].map(([label, href]) => (
        <Pressable key={href} onPress={() => router.push(href as never)} style={styles.dockItem} hitSlop={8}>
          <Text style={[styles.dockText, { color: look.icons }]}>{label}</Text>
        </Pressable>
      ))}
      {Features.on(prefs, 'voice') ? <MicButton size={40} aqi={weather.aqi} /> : null}
    </View>
  );

  const body = landscape ? (
    <View style={styles.cols}>
      {carBox}
      <View style={styles.col}>
        {clockBox}
        <RoadAhead style={styles.flexBox} />
        <MusicBox style={styles.flexBox} />
        {camBox}
        {weatherBox}
      </View>
      <View style={styles.col}>
        {tripBox}
        {cabBox ?? fuelBox}
        {Features.on(prefs, 'news') ? <NewsBox style={styles.flexBox} /> : null}
      </View>
    </View>
  ) : (
    <View style={styles.rows}>
      {carBox}
      <View style={styles.pair}>
        {clockBox}
        {weatherBox}
      </View>
      <RoadAhead />
      <MusicBox />
      {camBox}
      <View style={styles.pair}>
        {tripBox}
        {cabBox ?? fuelBox}
      </View>
    </View>
  );

  const content = (
    <SafeAreaView style={styles.fill} onTouchStart={() => (touchAt.current = Date.now())}>
      {body}
      {dock}
    </SafeAreaView>
  );
  return look.gradient ? (
    <LinearGradient colors={look.gradient as [string, string, ...string[]]} style={styles.fill}>
      {content}
    </LinearGradient>
  ) : (
    <View style={[styles.fill, { backgroundColor: look.background }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cols: { flex: 1, flexDirection: 'row', gap: 10, padding: 10 },
  col: { flex: 1, gap: 10 },
  rows: { flex: 1, gap: 10, padding: 10 },
  pair: { flex: 1, flexDirection: 'row', gap: 10 },
  flexBox: { flex: 1 },
  welcome: { fontSize: 12, letterSpacing: 4 },
  carName: { fontSize: 26, fontWeight: '700', letterSpacing: 3 },
  speedRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  speed: { fontSize: 72, fontWeight: '300', lineHeight: 76 },
  unit: { fontSize: 15, marginLeft: 6, marginBottom: 10 },
  limit: {
    marginLeft: 'auto',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 6,
    borderColor: '#D32F2F',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: { color: '#111', fontSize: 20, fontWeight: '700' },
  roadWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  carFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  small: { fontSize: 12, letterSpacing: 0.5 },
  time: { fontSize: 54, fontWeight: '300' },
  ampm: { fontSize: 18 },
  big: { fontSize: 34, fontWeight: '300' },
  saver: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  saverTime: { color: '#C9CDD2', fontSize: 150, fontWeight: '200' },
  saverDate: { color: '#7D838A', fontSize: 22 },
  saverNow: { fontSize: 18, paddingTop: 26 },
  bar: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  dock: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  dockItem: { paddingHorizontal: 12, paddingVertical: 6 },
  dockText: { fontSize: 16, fontWeight: '500' },
});
