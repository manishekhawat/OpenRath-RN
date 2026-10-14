/**
 * The driving side (the React Native version of the Drive service): follows the GPS, keeps the
 * trip computer and parking spot, looks up speed limits and cameras, and speaks the alerts.
 *
 * It runs while the app is open. The Android version kept counting behind other apps as a
 * foreground service; doing that here needs expo-task-manager background location (see
 * PORTING.md).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import * as Features from '../logic/features';
import { dist } from '../logic/geo';
import { num } from '../logic/prefs';
import * as Speed from '../logic/speed';
import * as Trip from '../logic/trip';
import { usePrefs } from './prefs';

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

  const tripRef = useRef(trip);
  const speedRef = useRef({ limit: 0, cameras: [] as Speed.Camera[], warned: false, announced: new Set<string>() });
  const queryRef = useRef({ busy: false, at: null as null | { lat: number; lon: number }, time: 0 });
  const savedAt = useRef(0);

  const update = (s: Trip.TripState) => {
    tripRef.current = s;
    setTrip(s);
  };

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
      const o = Speed.isOver(s.kmh, sp.limit, num(prefs, 'warnSpeed', 0));
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
          const alerts = Features.on(prefs, 'speedAlerts');
          const r = Trip.feed(
            tripRef.current,
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
          if (alerts) speedAlerts(r.state);
          else {
            setLimit(0);
            setCameraM(-1);
            setOver(false);
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
    };
  }, [prefs]);

  const value: DriveState = {
    trip,
    limit,
    cameraM,
    over,
    alertError,
    gps,
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
