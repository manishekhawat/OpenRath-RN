/**
 * The driving side (the React Native version of the Drive service), for the screens: the trip
 * computer and parking spot, speed limits and cameras, and the road helpers' view, as the drive
 * engine (engine.ts) publishes them. The engine does the work on each GPS fix and speaks the
 * alerts; background.ts feeds it, from the background location task when trips count behind
 * other apps (Settings > Road helpers), or from the plain watch while the app is open.
 *
 * The speed shown and the last fix move several times a second while the car is speeding up or
 * slowing down, so they are handed out on their own (useDriveSpeed) and only the speed readout and
 * the road take them; the trip side comes from the context. useDrive() gives both, as it always has.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import * as Achievements from '../logic/achievements';
import * as Bg from '../logic/background';
import * as Features from '../logic/features';
import * as Trip from '../logic/trip';
import * as Wake from '../logic/wake';
import * as Background from './background';
import * as Engine from './engine';
import { usePrefs } from './prefs';
import type { RoadView } from './road';
import * as Store from './store';

export { say } from './engine';

/** The fields that move with the speed: the engine publishes them a few times a second. */
export interface DriveSpeed {
  /** km/h after correction, filter and smoothing; -1 when there is no fix in the last 10 s */
  speedShown: number;
  /** this drive's summary once stopped 5 s, when stopSummary is on */
  stopped: { km: number; sec: number; avgKmh: number; topKmh: number } | null;
  /** when the last fix came in (Date.now()), 0 = none yet */
  fixAt: number;
}

export interface DriveState extends DriveSpeed {
  trip: Trip.TripState;
  /** km/h, 0 = not known here */
  limit: number;
  /** metres to a speed camera ahead, -1 = none near */
  cameraM: number;
  over: boolean;
  alertError: string;
  /** "", "denied" or a message about the GPS */
  gps: string;
  /** the road helpers' view: road-ahead line, highway and fog modes, 0–100 result, break time */
  road: RoadView;
  /** a message came in: true when highway mode holds it back until the car slows down */
  holdMessage: () => boolean;
  /** mark where the car is as a waterlogging spot; returns the message to show */
  markFlood: () => string;
  /** hide the fog screen for the rest of this drive */
  hideFog: () => void;
  setPark: (lat: number, lon: number) => void;
  resetToday: () => void;
  /** "Park here" from a live fix only; returns the message to show */
  parkHere: () => string;
  /** a GPS fix from the last 30 s, or null (for saving a place where the car is) */
  liveFix: () => { lat: number; lon: number } | null;
}

/** Everything but the speed: it changes on a fix, not between them. What the context carries. */
export type DriveTrip = Omit<DriveState, keyof DriveSpeed>;

const DriveContext = createContext<DriveTrip | null>(null);

// The engine replaces its whole snapshot on every update, so each half is kept as its own object
// and handed out again unchanged while its fields stand: a consumer of one doesn't follow the other.
const takeSpeed = (s: Engine.Snapshot): DriveSpeed => ({ speedShown: s.speedShown, stopped: s.stopped, fixAt: s.fixAt });
let speedPart = takeSpeed(Engine.snapshot());

function speedSnapshot(): DriveSpeed {
  const s = Engine.snapshot();
  if (s.speedShown !== speedPart.speedShown || s.stopped !== speedPart.stopped || s.fixAt !== speedPart.fixAt) speedPart = takeSpeed(s);
  return speedPart;
}

const takeTrip = (s: Engine.Snapshot) => ({
  trip: s.trip,
  limit: s.limit,
  cameraM: s.cameraM,
  over: s.over,
  alertError: s.alertError,
  gps: s.gps,
  road: s.road,
});
let tripPart = takeTrip(Engine.snapshot());

function tripSnapshot(): ReturnType<typeof takeTrip> {
  const s = Engine.snapshot();
  if (
    s.trip !== tripPart.trip ||
    s.limit !== tripPart.limit ||
    s.cameraM !== tripPart.cameraM ||
    s.over !== tripPart.over ||
    s.alertError !== tripPart.alertError ||
    s.gps !== tripPart.gps ||
    s.road !== tripPart.road
  )
    tripPart = takeTrip(s);
  return tripPart;
}

/** The driving log for the badges: the closed days, and today so far (as Drive.history kept it). */
async function badgeLog(): Promise<Trip.History> {
  const hist = await history();
  const s = Engine.snapshot().trip;
  hist[s.day] = [Math.round(s.todayKm * 10) / 10, s.todaySec, s.todayBrakes, s.todayAccels, s.todaySpeedSec, Trip.score(s)];
  return hist;
}

/** Everything that goes stale in deep sleep, started again (Wake.woke). */
function woke() {
  Store.prefs.put('sleptAt', String(Date.now() - 2 * Wake.SLEPT_MS)); // so the music carries on
  Background.restart();
  Wake.woke();
}

/** The dashboard's 15-second check (Wake.watch): deep sleep, and new badges at most once an hour. */
function check(watch: Wake.Watch) {
  const [e, u] = Wake.clocks();
  if (watch.feed(e, u) && Features.on(Store.prefs, 'wake')) woke();
  if (Features.on(Store.prefs, 'achievements'))
    badgeLog()
      .then((h) => Achievements.check(Store.prefs, h, Date.now()).forEach((id) => Engine.note(Achievements.newText(id))))
      .catch(() => {});
}

export function DriveProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const snap = useSyncExternalStore(Engine.subscribe, tripSnapshot);
  const bgOn = Bg.wanted(prefs);

  // the engine's start and end with the app; behind other apps it saves, and on coming back
  // it shows what waited (the SOS countdown, Cab notes) and checks the GPS source again
  useEffect(() => {
    Engine.ready();
    Engine.startTick();
    Engine.attach(true);
    // the sleep watch runs while on screen; coming back checks too (the unit may have slept meanwhile)
    const watch = new Wake.Watch();
    check(watch);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') check(watch);
    }, Wake.CHECK_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        Engine.foreground();
        Background.sync();
        check(watch);
      } else if (st === 'background') Engine.persist();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      Engine.attach(false);
      Background.detach().then((m) => Engine.close(m === 'task'));
    };
  }, []);

  // the GPS source: at start-up and when the switch changes
  useEffect(() => {
    Background.sync();
  }, [bgOn]);

  const value = useMemo<DriveTrip>(
    () => ({
      ...snap,
      holdMessage: Engine.holdMessage,
      markFlood: Engine.markFlood,
      hideFog: Engine.hideFog,
      setPark: Engine.setPark,
      resetToday: Engine.resetToday,
      parkHere: Engine.parkHere,
      liveFix: Engine.liveFix,
    }),
    [snap],
  );
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

/** The trip side: it keeps up with the fixes, not with the speed between them. */
export function useDriveTrip(): DriveTrip {
  const c = useContext(DriveContext);
  if (!c) throw new Error('useDrive outside DriveProvider');
  return c;
}

/** Just the speed, the stop summary and the last fix, for the speed readout and the road. */
export function useDriveSpeed(): DriveSpeed {
  return useSyncExternalStore(Engine.subscribe, speedSnapshot);
}

/** The speed fields as they are this moment, for a timer that mustn't follow every fix. */
export function speedNow(): DriveSpeed {
  return speedSnapshot();
}

/** Both halves together, as the screens have always had them. */
export function useDrive(): DriveState {
  const trip = useDriveTrip();
  const speed = useDriveSpeed();
  return useMemo(() => ({ ...trip, ...speed }), [trip, speed]);
}

export async function history(): Promise<Trip.History> {
  try {
    return JSON.parse((await AsyncStorage.getItem(Engine.HIST_KEY)) ?? '{}');
  } catch {
    return {};
  }
}
