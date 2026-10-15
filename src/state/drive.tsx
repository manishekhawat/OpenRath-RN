/**
 * The driving side (the React Native version of the Drive service): follows the GPS, keeps the
 * trip computer and parking spot, looks up speed limits and cameras, and speaks the alerts. The
 * road helpers (highway, hill, fog, monsoon, the road ahead, learnt spots, the 0–100 timer and
 * the break reminder) live in road.ts and get every fix too.
 *
 * It runs while the app is open. The Android version kept counting behind other apps as a
 * foreground service; doing that here needs expo-task-manager background location (see
 * PORTING.md).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import * as Cab from '../logic/cab';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { dist } from '../logic/geo';
import { num } from '../logic/prefs';
import * as Rescue from '../logic/rescue';
import * as Valet from '../logic/valet';
import * as Speed from '../logic/speed';
import * as Trip from '../logic/trip';
import { usePrefs } from './prefs';
import { EMPTY as NO_ROAD, RoadWatch, type RoadView } from './road';
import * as Trips from './trips';

const TRIP_KEY = 'openrath:trip';
const HIST_KEY = 'openrath:history';

export interface DriveState {
  trip: Trip.TripState;
  /** km/h, 0 = not known here */
  limit: number;
  /** metres to a speed camera ahead, -1 = none near */
  cameraM: number;
  over: boolean;
  alertError: string;
  /** "", "denied" or a message about the GPS */
  gps: string;
  /** the road helpers' view: road-ahead line, highway and fog modes, 0–100 result, break and crash times */
  road: RoadView;
  /** a message came in: true when highway mode holds it back until the car slows down */
  holdMessage: () => boolean;
  /** mark where the car is as a waterlogging spot; returns the message to show */
  markFlood: () => string;
  /** hide the fog screen for the rest of this drive */
  hideFog: () => void;
  setPark: (lat: number, lon: number) => void;
  resetToday: () => void;
}

const DriveContext = createContext<DriveState | null>(null);

export function say(text: string) {
  Speech.speak(text, { language: 'en-IN' });
}

export function DriveProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const [trip, setTrip] = useState<Trip.TripState>(() => Trip.initial(Date.now()));
  const [limit, setLimit] = useState(0);
  const [cameraM, setCameraM] = useState(-1);
  const [over, setOver] = useState(false);
  const [alertError, setAlertError] = useState('');
  const [gps, setGps] = useState('');
  const [road, setRoad] = useState<RoadView>(NO_ROAD);

  const tripRef = useRef(trip);
  const speedRef = useRef({ limit: 0, cameras: [] as Speed.Camera[], warned: false, announced: new Set<string>() });
  const queryRef = useRef({ busy: false, at: null as null | { lat: number; lon: number }, time: 0 });
  const savedAt = useRef(0);
  const roadRef = useRef<RoadWatch | null>(null);
  const crashSeen = useRef(0);
  const lights = useRef({ told: false, darkSince: -1 });
  if (!roadRef.current) roadRef.current = new RoadWatch(prefs, say);

  const update = (s: Trip.TripState) => {
    tripRef.current = s;
    setTrip(s);
  };

  // the Cab tools' once-a-second tick: the meter's waiting time, the duty reminder, papers due
  useEffect(() => {
    const id = setInterval(() => {
      const t = tripRef.current;
      for (const n of Cab.tick(prefs, Date.now(), t.kmh, t.last?.t ?? 0)) {
        if (Platform.OS === 'android') ToastAndroid.show(n.text, ToastAndroid.LONG);
        else Alert.alert(n.text);
        if (n.speak) say(n.text);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [prefs]);

  // load what was saved
  useEffect(() => {
    AsyncStorage.getItem(TRIP_KEY)
      .then((raw) => {
        if (raw) update(Trip.initial(Date.now(), JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const save = async (s: Trip.TripState, closed?: { day: string; row: number[] }) => {
      await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s)));
      if (closed) {
        const hist: Trip.History = JSON.parse((await AsyncStorage.getItem(HIST_KEY)) ?? '{}');
        hist[closed.day] = closed.row;
        const keys = Object.keys(hist).sort();
        for (const k of keys.slice(0, Math.max(0, keys.length - 430))) delete hist[k];
        await AsyncStorage.setItem(HIST_KEY, JSON.stringify(hist));
      }
    };

    const lookUpLimits = async (lat: number, lon: number) => {
      const q = queryRef.current;
      q.busy = true;
      q.at = { lat, lon };
      q.time = Date.now();
      try {
        const r = await fetch(Speed.OVERPASS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(Speed.query(lat, lon)),
        });
        const parsed = Speed.parse(await r.json());
        speedRef.current.limit = parsed.limit;
        speedRef.current.cameras = parsed.cameras;
        setLimit(parsed.limit);
        setAlertError('');
      } catch {
        setAlertError('speed data unreachable');
      } finally {
        q.busy = false;
      }
    };

    const speedAlerts = (s: Trip.TripState) => {
      const now = Date.now();
      const q = queryRef.current;
      const moved = q.at ? dist(q.at.lat, q.at.lon, s.lat, s.lon) : Infinity;
      if (!q.busy && now - q.time > 8000 && (moved > 250 || (now - q.time > 120000 && moved > 30))) {
        lookUpLimits(s.lat, s.lon);
      }
      const sp = speedRef.current;
      const cam = Speed.nearestCamera(s.lat, s.lon, s.heading, s.kmh, sp.cameras);
      setCameraM(cam);
      if (cam >= 0 && s.kmh > 10) {
        for (const c of sp.cameras) {
          const id = `${c.lat},${c.lon}`;
          if (dist(s.lat, s.lon, c.lat, c.lon) < 600 && !sp.announced.has(id)) {
            sp.announced.add(id);
            say('Speed camera ahead' + (c.limit > 0 ? ', limit ' + c.limit : ''));
          }
        }
      }
      const o = Speed.isOver(s.kmh, sp.limit, Valet.warnAt(prefs));
      if (o && !sp.warned) say(sp.limit > 0 && s.kmh > sp.limit + 3 ? 'Speed limit ' + sp.limit : 'Slow down');
      sp.warned = o;
      setOver(o);
      return o;
    };

    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setGps('denied');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (l) => {
          const alerts = Features.on(prefs, 'speedAlerts') || Valet.on(prefs);
          const prev = tripRef.current;
          const r = Trip.feed(
            prev,
            {
              lat: l.coords.latitude,
              lon: l.coords.longitude,
              speed: l.coords.speed,
              heading: l.coords.heading,
              accuracy: l.coords.accuracy,
              t: l.timestamp || Date.now(),
            },
            { over: speedRef.current.warned, scoring: Features.on(prefs, 'score'), parking: Features.on(prefs, 'parking') },
          );
          update(r.state);
          const s = r.state;
          if (alerts) speedAlerts(s);
          else {
            setLimit(0);
            setCameraM(-1);
            setOver(false);
          }
          // the road helpers: they speak their own warnings
          const view = roadRef.current!.feed({
              lat: s.lat,
              lon: s.lon,
              kmh: s.kmh,
              heading: s.heading,
              altitude: l.coords.altitude,
              accuracy: l.coords.accuracy,
              driveKm: s.driveKm,
              t: s.prevAt,
            });
          setRoad(view);
          // a crash-like stop with accident help on: the countdown screen, which texts the contact
          if (view.crashAt > crashSeen.current) {
            crashSeen.current = view.crashAt;
            router.push(Rescue.sosHref(s.lat, s.lon) as never);
          }
          // the mileage coach, the route recorder and the fuel-low check
          const out = Trips.onTripFix(prefs, prev, r, l.coords.altitude ?? null);
          out.say.forEach(say);
          // the headlight reminder, once a drive, after 30 s of driving in the dark (Drive.carChecks)
          if (out.driveEnded) lights.current = { told: false, darkSince: -1 };
          const lt = lights.current;
          if (Features.on(prefs, 'lightsReminder') && !lt.told) {
            const now = Date.now();
            if (Errands.dark(s.lat, s.lon, now) && s.kmh >= 20) {
              if (lt.darkSince < 0) lt.darkSince = now;
            } else lt.darkSince = -1;
            if (lt.darkSince > 0 && now - lt.darkSince > 30000) {
              // the unit's headlight signal isn't readable here, so only "always on" counts as known
              const on = prefs.str('lights', '') === 'on';
              const t = Errands.lightsReminder(true, s.kmh, on, on, false);
              lt.told = true;
              if (t) say(t);
            }
          }
          if (r.closedDay || Date.now() - savedAt.current > 15000) {
            savedAt.current = Date.now();
            save(r.state, r.closedDay).catch(() => {});
          }
        },
        (e) => setGps(String(e)),
      );
      if (cancelled) sub.remove();
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      save(tripRef.current).catch(() => {});
      roadRef.current?.saveSpots();
      Trips.end(prefs);
    };
  }, [prefs]);

  const value: DriveState = {
    trip,
    limit,
    cameraM,
    over,
    alertError,
    gps,
    road,
    holdMessage: () => {
      const held = roadRef.current!.holdMessage();
      if (held) setRoad(roadRef.current!.view);
      return held;
    },
    markFlood: () => roadRef.current!.markFlood(),
    hideFog: () => setRoad(roadRef.current!.hideFog()),
    setPark: (lat, lon) => {
      const s = { ...tripRef.current, park: { lat, lon, at: Date.now() } };
      update(s);
      AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
    },
    resetToday: () => {
      const s = { ...tripRef.current, todayKm: 0, todaySec: 0, driveKm: 0, driveSec: 0, todayBrakes: 0, todayAccels: 0, todaySpeedSec: 0 };
      update(s);
      AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
    },
  };
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive(): DriveState {
  const c = useContext(DriveContext);
  if (!c) throw new Error('useDrive outside DriveProvider');
  return c;
}

export async function history(): Promise<Trip.History> {
  try {
    return JSON.parse((await AsyncStorage.getItem(HIST_KEY)) ?? '{}');
  } catch {
    return {};
  }
}
