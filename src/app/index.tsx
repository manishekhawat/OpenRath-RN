/**
 * The dashboard (HomeActivity + Cards in the Android version): the car with live speed and the
 * moving road, the clock, weather with the next 24 hours, the calendar, compass, trip computer and
 * fuel log, and the dock along the bottom with the status icons. Night-drive mode, the start-up
 * summary with the petrol range, the weekly report and the clock screensaver.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarBox } from '../components/CalendarBox';
import { CompassBox } from '../components/CompassBox';
import { DashcamView } from '../components/DashcamView';
import { Dock } from '../components/Dock';
import LayoutView, { useLayout } from '../components/LayoutView';
import { FloatingMic } from '../components/MicButton';
import { MusicBox } from '../components/MusicBox';
import { NewsBox } from '../components/NewsBox';
import { Road } from '../components/Road';
import { RoadAhead } from '../components/RoadAhead';
import { SoundboardBox } from '../components/SoundboardBox';
import { TapBox } from '../components/Tap';
import { PickList, toast } from '../components/ui';
import { VideoBox } from '../components/VideoBox';
import { WeatherBox } from '../components/WeatherBox';
import * as Cab from '../logic/cab';
import * as CabEarnings from '../logic/cabEarnings';
import * as Car from '../logic/car';
import * as Care from '../logic/care';
import { DAYS_FULL, MONTHS_FULL } from '../logic/dates';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import * as Fuel from '../logic/fuel';
import { f, t } from '../logic/i18n';
import * as Layouts from '../logic/layouts';
import { num } from '../logic/prefs';
import * as Setup from '../logic/setup';
import * as Trip from '../logic/trip';
import * as Units from '../logic/units';
import * as Weekly from '../logic/weekly';
import { useParkedSnap } from '../state/camera';
import { say, speedNow, useDriveSpeed, useDriveTrip } from '../state/drive';
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

/** Three figures in a row under a box's title (Cards.FiguresCard). */
function Figures({ figs }: { figs: [string, string][] }) {
  const look = useLook();
  return (
    <View style={styles.figures}>
      {figs.map(([label, value]) => (
        <View key={label} style={styles.figure}>
          <Text style={[styles.figValue, { color: look.text }]}>{value}</Text>
          <Text style={[styles.figLabel, { color: look.textDim }]}>{t(label)}</Text>
        </View>
      ))}
    </View>
  );
}

/** "just now", "5 min ago", "3 h ago" (Cards.TripCard.ago). */
function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return f('%1$s min ago', m);
  if (m < 48 * 60) return f('%1$s h ago', Math.floor(m / 60));
  return f('%1$s days ago', Math.floor(m / 1440));
}

/** The speed as it reads now, "--" without a fix (1.39: the number eases between fixes). */
function SpeedText({ mph, style }: { mph: boolean; style: StyleProp<TextStyle> }) {
  const { speedShown } = useDriveSpeed();
  return <Text style={style}>{speedShown < 0 ? '--' : String(Units.speed(speedShown, mph))}</Text>;
}

/** This drive's summary, which the engine fills in after 5 seconds at a standstill. */
function StopSummary({ mph, color }: { mph: boolean; color: string }) {
  const { stopped } = useDriveSpeed();
  if (!stopped) return null;
  return (
    <Text style={[styles.small, { color, textAlign: 'center' }]} numberOfLines={1}>
      {Trip.stopText(stopped.km, stopped.sec, stopped.topKmh, mph)}
    </Text>
  );
}

/** The moving road under the car: it follows the speed, so it keeps that to itself. */
function MovingRoad({ width, fill, line }: { width: number; fill: string; line: string }) {
  const { speedShown } = useDriveSpeed();
  return <Road width={width} height={90} kmh={Math.max(0, speedShown)} fill={fill} line={line} />;
}

export default function Home() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const drive = useDriveTrip();
  const { trip } = drive;
  const now = useClock();
  const weather = useWeather(trip.lat, trip.lon);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const layout = useLayout();
  const [menu, setMenu] = useState<string | null>(null);
  // the parking photo when the car parks
  useParkedSnap();

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' is the store counter the memo depends on; Store.prefs keeps one identity
  const fuelStats = useMemo(() => Fuel.stats(Fuel.log(prefs)), [prefs, version]);
  // today's rides, the box's foot line and the month's tolls each parse a kept log, so they are
  // worked out again only when a setting changes, the clock ticks or the odometer moves on
  const cabSum = useMemo(
    () => (Features.on(prefs, 'cab') ? Cab.sum(Cab.log(prefs), Cab.dayStart(now.getTime()), now.getTime() + 1) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' is the store counter the memo depends on; Store.prefs keeps one identity
    [prefs, version, now],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' is the store counter the memo depends on; Store.prefs keeps one identity
  const cabFoot = useMemo(() => CabEarnings.boxFoot(prefs, now.getTime(), trip.odoKm), [prefs, version, now, trip.odoKm]);
  const dayKey = Trip.dayKey(now.getTime());
  const tolls = useMemo(
    // only the month matters here, so this is read again when the day moves on
    () => Care.tollsThisMonth(prefs, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, version, dayKey],
  );
  const odoKm = Care.odo(prefs, trip.odoKm);
  const tripCost = Fuel.cost(prefs, trip.todayKm, Car.kmpl(Car.fuel(prefs)));
  const careAlert = Features.on(prefs, 'care') ? Care.alert(prefs, odoKm, now) : '';
  const dark = trip.lat !== 0 && Errands.dark(trip.lat, trip.lon, now.getTime());
  const driving = trip.kmh > 20;
  const mph = Units.mph(prefs);

  // the start-up summary, once a day, when the weather is in
  useEffect(() => {
    if (!Car.ready(prefs) || !Features.on(prefs, 'startSummary')) return;
    const today = Trip.dayKey(Date.now());
    if (prefs.str('summaryDay', '') === today || !weather.wx) return;
    prefs.put('summaryDay', today);
    const { rangeKm, holiday } = Weekly.summaryExtras(prefs, trip.odoKm);
    const text = Errands.summary(
      new Date(),
      Layouts.owner(prefs),
      weather.wx.temp + '°',
      weather.wx.text,
      weather.wx.rain,
      weather.aqi,
      rangeKm,
      careAlert,
      holiday,
    );
    say(text);
    Alert.alert(t(Errands.greeting(new Date())), text.substring(text.indexOf('.') + 1).trim());
  // the summary is written once a day (summaryDay) and waits for the weather, so it does not
  // follow every odometer tick or air-quality update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather.wx, prefs, careAlert, fuelStats]);

  // the automatic daily backup (Backup.daily)
  useEffect(() => {
    dailyBackup(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the service booking reminder: once a day when parked, if a service is near (HomeDialogs)
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
    const what = t(Care.NAMES[i]);
    const when = k < 0 ? f('%1$s is overdue by %2$s km.', what, -k) : f('%1$s is due in %2$s km.', what, k);
    Alert.alert(
      t('Book the service?'),
      when +
        (have
          ? f(' Call %1$s to book a slot?', mine[0])
          : t(" Find your service centre on the map and tap Mine next to it, so next time it's one tap to call.")),
      [
        { text: t('Later'), style: 'cancel' },
        {
          text: have ? t('Call') : t('Find one'),
          onPress: () => (have ? Linking.openURL('tel:' + mine[1].replace(/[^0-9+]/g, '')).catch(() => {}) : router.push('/map?go=service')),
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock screensaver: after a few idle minutes while parked (Extras.saverCheck)
  const touchAt = useRef(Date.now());
  const driveRef = useRef(drive);
  driveRef.current = drive;
  const [saver, setSaver] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const parked = Date.now() - speedNow().fixAt > 10000 || driveRef.current.trip.kmh < 5;
      if (Features.on(prefs, 'saver') && parked && Date.now() - touchAt.current > num(prefs, 'saverMin', 5) * 60000) setSaver(true);
    }, 20000);
    return () => clearInterval(id);
  }, [prefs]);

  // the weekly report, on the first parked start of a new week
  useEffect(() => {
    const t = setTimeout(() => {
      if (Car.ready(prefs) && driveRef.current.trip.kmh <= 3 && Weekly.due(prefs)) router.push('/report');
    }, 3000);
    return () => clearTimeout(t);
    // once per dashboard visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1.42: with the car set up but no level picked, ask once, a few seconds in (HomeActivity.onResume)
  useEffect(() => {
    const t = setTimeout(() => {
      if (Car.ready(prefs) && !Features.levelPicked(prefs)) router.push('/settings/level?first=1');
    }, 5000);
    return () => clearTimeout(t);
    // once per dashboard visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // night-drive mode comes back on the next drive after it is tapped away
  const [nightOff, setNightOff] = useState(false);
  useEffect(() => {
    if (!driving) setNightOff(false);
  }, [driving]);

  // 1.42: the first-run setup shows until it is finished, and carries on where it was left
  const setupNeeded = Setup.needed(
    Features.on(prefs, 'setup'),
    prefs.str('setupDone', '') === 'yes',
    prefs.str('setupStep', '') !== '',
    Car.ready(prefs),
    Features.levelPicked(prefs),
  );
  if (setupNeeded) return <Redirect href="/setup" />;
  if (!Car.ready(prefs)) return <Redirect href="/setup?only=car" />;

  if (saver) {
    const wake = () => {
      touchAt.current = Date.now();
      setSaver(false);
    };
    return (
      <Pressable style={[styles.fill, styles.saver]} onPress={wake}>
        <Text style={styles.saverTime}>{Errands.clock(now.getTime(), { bare: true })}</Text>
        <Text style={styles.saverDate}>
          {t(DAYS_FULL[now.getDay()])}  {now.getDate()} {t(MONTHS_FULL[now.getMonth()])}
        </Text>
        {weather.wx ? (
          <Text style={[styles.saverNow, { color: look.accent }]}>{`${Units.temp(prefs, weather.wx.tempC)}  ${t(weather.wx.text)}`}</Text>
        ) : null}
      </Pressable>
    );
  }

  if (Features.on(prefs, 'nightDrive') && dark && driving && !nightOff) {
    // after sunset while driving: big red speed, nothing else; a tap leaves it until the next drive
    return (
      <Pressable style={[styles.fill, styles.night]} onPress={() => setNightOff(true)} onLongPress={() => router.push('/map')}>
        <Text style={styles.nightTime}>{Errands.clock(now.getTime(), { bare: true })}</Text>
        <SpeedText mph={mph} style={styles.nightSpeed} />
        <Text style={styles.nightUnit}>{Units.speedLabel(prefs).toUpperCase()}</Text>
        <Text style={styles.nightHint}>{t('Tap here to leave night-drive mode')}</Text>
      </Pressable>
    );
  }

  if (layout) return <LayoutView layout={layout} />;

  const time = Errands.clock(now.getTime(), { bare: true });
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';
  const carName = Car.name(prefs);
  // 1.42: no greeting line until the owner types their name
  const owner = Layouts.owner(prefs);
  const carBox = (
    <TapBox style={landscape ? { flex: 1.4 } : { height: 300 }} onPress={() => router.push('/map')} onLongPress={() => router.push('/settings')}>
      {owner ? (
        <>
          <Text style={[styles.welcome, { color: look.textDim }]}>{t(look.welcomeTitle)}</Text>
          <Text style={[styles.owner, { color: look.chrome ? '#E9ECF0' : look.text }]} numberOfLines={1}>
            {owner.toUpperCase()}
          </Text>
        </>
      ) : null}
      <Text style={[styles.carName, { color: look.chrome ? '#E9ECF0' : look.text }]} numberOfLines={1}>
        {carName || t('MY CAR')}
      </Text>
      <View style={styles.speedRow}>
        <SpeedText mph={mph} style={[styles.speed, { color: drive.over ? '#E5484D' : look.text }]} />
        <Text style={[styles.unit, { color: look.textDim }]}>{Units.speedLabel(prefs)}</Text>
        {drive.limit > 0 ? (
          <View style={styles.limit}>
            <Text style={styles.limitText}>{Units.speed(drive.limit, mph)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.roadWrap}>
        {look.road && Features.on(prefs, 'road') ? (
          <MovingRoad width={landscape ? width * 0.36 : width - 56} fill={look.roadFill} line={look.roadLine} />
        ) : null}
      </View>
      <StopSummary mph={mph} color={look.textDim} />
      <View style={styles.carFoot}>
        <Text style={[styles.small, { color: careAlert ? look.accent : look.textDim }]} numberOfLines={1}>
          {t(careAlert) || (drive.gps === 'denied' ? t('LOCATION OFF: ALLOW IT IN SETTINGS') : drive.gps ? t('WAITING FOR GPS') : '')}
        </Text>
        {drive.cameraM >= 0 ? (
          <Text style={[styles.small, { color: '#E5484D' }]}>{f('SPEED CAMERA  %1$s m', Math.floor(drive.cameraM / 10) * 10)}</Text>
        ) : null}
      </View>
    </TapBox>
  );

  const clockBox = (
    <TapBox style={styles.flexBox}>
      <Text style={[styles.time, { color: look.text }]}>
        {time} <Text style={[styles.ampm, { color: look.textDim }]}>{ampm}</Text>
      </Text>
      <Text style={{ color: look.textDim }}>
        {t(DAYS_FULL[now.getDay()])}, {now.getDate()} {t(MONTHS_FULL[now.getMonth()])}
      </Text>
    </TapBox>
  );

  const weatherBox = Features.on(prefs, 'weather') ? (
    <WeatherBox weather={weather} waiting={trip.lat === 0} style={styles.flexBox} />
  ) : null;

  const min = Math.floor(trip.todaySec / 60);
  const avg = Trip.avgKmh(trip.todayKm, trip.todaySec);
  const tripBox = (
    <TapBox title="TODAY" style={styles.flexBox} onPress={() => setMenu('trip')}>
      <Figures
        figs={[
          ['KM', trip.todayKm < 100 ? Fuel.fmt(trip.todayKm) : String(Math.round(trip.todayKm))],
          ['DRIVE TIME', min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`],
          ['AVG KM/H', avg <= 0 ? '--' : String(Math.round(avg))],
        ]}
      />
      <Text style={[styles.small, { color: look.textDim, textAlign: 'center' }]} numberOfLines={1}>
        {f('This drive %1$s km', Fuel.fmt(trip.driveKm)) +
          (Features.on(prefs, 'fuelPrice') && tripCost >= 1 ? '  ·  ' + f('₹%1$s petrol today', Math.round(tripCost)) : '') +
          (Features.on(prefs, 'score') ? '  ·  ' + f('score %1$s', Trip.score(trip)) : '') +
          (trip.park && Features.on(prefs, 'parking') ? '  ·  ' + f('parked %1$s', ago(trip.park.at, now.getTime())) : '')}
      </Text>
    </TapBox>
  );

  // the dashcam records through this box, so it stays mounted while either camera feature is on
  const camBox = Features.on(prefs, 'dashcam') || Features.on(prefs, 'parkPhoto') ? <DashcamView style={styles.flexBox} /> : null;

  const cabShare = Cab.targetShare(prefs, now.getTime());
  const cabBox = cabSum ? (
    <TapBox title="CAB  ·  TODAY" style={styles.flexBox} onPress={() => router.push('/cab')}>
      <Figures
        figs={[
          ['EARNED', Cab.rs(cabSum.in)],
          ['RIDES', String(cabSum.rides)],
          ['NET', Cab.rs(Cab.net(cabSum))],
        ]}
      />
      {cabShare >= 0 ? (
        <View style={[styles.bar, { backgroundColor: look.edge }]}>
          <View style={{ width: `${Math.round(cabShare * 100)}%`, height: '100%', backgroundColor: look.accent, borderRadius: 3 }} />
        </View>
      ) : null}
      <Text style={[styles.small, { color: look.textDim, textAlign: 'center' }]} numberOfLines={1}>
        {cabFoot}
      </Text>
    </TapBox>
  ) : null;

  const fuelBox = (
    <TapBox title="FUEL" style={styles.flexBox} onPress={() => router.push('/fuel')}>
      <Figures
        figs={[
          ['LAST TANK KM/L', fuelStats.lastKmpl > 0 ? Fuel.fmt(fuelStats.lastKmpl) : '--'],
          ['AVERAGE KM/L', fuelStats.avgKmpl > 0 ? Fuel.fmt(fuelStats.avgKmpl) : '--'],
          ['₹ / KM', fuelStats.rupeesPerKm > 0 ? Fuel.fmt(fuelStats.rupeesPerKm) : '--'],
        ]}
      />
      <Text style={[styles.small, { color: look.textDim, textAlign: 'center' }]} numberOfLines={1}>
        {fuelStats.fills === 0
          ? t('Tap to add your first fill-up')
          : fuelStats.lastKmpl <= 0
            ? t('Mileage shows after two full-tank fill-ups')
            : f('%1$s fill-ups  ·  last %2$s', fuelStats.fills, ago(fuelStats.lastAt, now.getTime())) + tolls}
      </Text>
    </TapBox>
  );

  const calendarBox = Features.on(prefs, 'calendar') ? <CalendarBox style={styles.flexBox} /> : null;
  const soundBox = Features.on(prefs, 'soundboard') ? <SoundboardBox style={styles.flexBox} /> : null;
  const videoBox = Features.on(prefs, 'video') ? <VideoBox style={styles.flexBox} /> : null;

  // the trip menu, shared with the Settings row (HomeActivity.tripMenu)
  const tripPick = (i: number) => {
    if (i === 0) drive.resetToday();
    else if (i === 1) toast(drive.parkHere());
    else if (i === 2) router.push('/fuel');
    else if (i === 3) router.push('/trips');
    else router.push('/tolls');
  };

  const body = landscape ? (
    <View style={styles.cols}>
      {carBox}
      <View style={styles.col}>
        {clockBox}
        <RoadAhead style={styles.flexBox} />
        <MusicBox style={styles.flexBox} />
        {camBox}
        {videoBox}
        {weatherBox}
      </View>
      <View style={styles.col}>
        {tripBox}
        {cabBox ?? fuelBox}
        {calendarBox}
        {soundBox}
        <CompassBox style={styles.flexBox} />
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
      {videoBox}
      {soundBox}
      <View style={styles.pair}>
        {tripBox}
        {cabBox ?? fuelBox}
      </View>
      {calendarBox ? <View style={styles.pair}>{calendarBox}</View> : null}
      <View style={styles.pair}>
        <CompassBox style={styles.flexBox} />
      </View>
    </View>
  );

  const content = (
    <SafeAreaView style={styles.fill} onTouchStart={() => (touchAt.current = Date.now())}>
      {body}
      <Dock />
      {/* 1.42: the mic floats where it was dragged, unless it belongs to the map only (Features.micPlace) */}
      {Features.on(prefs, 'voice') && Features.micPlace(prefs) !== 'map' ? <FloatingMic aqi={weather.aqi} /> : null}
      {menu === 'trip' ? (
        <PickList
          title={Care.tripMenuTitle(trip.todayKm, odoKm)}
          options={Care.TRIP_MENU}
          onPick={tripPick}
          onClose={() => setMenu(null)}
        />
      ) : null}
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
  welcome: { fontSize: 11, letterSpacing: 4 },
  owner: { fontSize: 18, letterSpacing: 3 },
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
  figures: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  figure: { flex: 1, alignItems: 'center' },
  figValue: { fontSize: 30, fontWeight: '300' },
  figLabel: { fontSize: 10, letterSpacing: 1.5 },
  saver: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  saverTime: { color: '#C9CDD2', fontSize: 150, fontWeight: '200' },
  saverDate: { color: '#7D838A', fontSize: 22 },
  saverNow: { fontSize: 18, paddingTop: 26 },
  night: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  nightTime: { color: '#7A1C1C', fontSize: 30 },
  nightSpeed: { color: '#C62828', fontSize: 160, fontWeight: '300' },
  nightUnit: { color: '#7A1C1C', fontSize: 22, letterSpacing: 4, fontWeight: '500' },
  nightHint: { color: '#7A1C1C', fontSize: 13, paddingTop: 30 },
  bar: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
});
