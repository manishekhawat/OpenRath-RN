/**
 * The driving side (the React Native version of the Drive service), for the screens: the trip
 * computer and parking spot, speed limits and cameras, and the road helpers' view, as the drive
 * engine (engine.ts) publishes them. The engine does the work on each GPS fix and speaks the
 * alerts; background.ts feeds it, from the background location task when trips count behind
 * other apps (Settings > Road helpers), or from the plain watch while the app is open.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import * as Bg from '../logic/background';
import type * as Trip from '../logic/trip';
import * as Background from './background';
import * as Engine from './engine';
import { usePrefs } from './prefs';
import type { RoadView } from './road';

export { say } from './engine';

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

export function DriveProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const snap = useSyncExternalStore(Engine.subscribe, Engine.snapshot);
  const bgOn = Bg.wanted(prefs);

  // the engine's start and end with the app; behind other apps it saves, and on coming back
  // it shows what waited (the SOS countdown, Cab notes) and checks the GPS source again
  useEffect(() => {
    Engine.ready();
    Engine.startTick();
    Engine.attach(true);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        Engine.foreground();
        Background.sync();
      } else if (st === 'background') Engine.persist();
    });
    return () => {
      sub.remove();
      Engine.attach(false);
      Background.detach().then((m) => Engine.close(m === 'task'));
    };
  }, []);

  // the GPS source: at start-up and when the switch changes
  useEffect(() => {
    Background.sync();
  }, [bgOn]);

  const value = useMemo<DriveState>(
    () => ({
      ...snap,
      holdMessage: Engine.holdMessage,
      markFlood: Engine.markFlood,
      hideFog: Engine.hideFog,
      setPark: Engine.setPark,
      resetToday: Engine.resetToday,
    }),
    [snap],
  );
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive(): DriveState {
  const c = useContext(DriveContext);
  if (!c) throw new Error('useDrive outside DriveProvider');
  return c;
}

export async function history(): Promise<Trip.History> {
  try {
    return JSON.parse((await AsyncStorage.getItem(Engine.HIST_KEY)) ?? '{}');
  } catch {
    return {};
  }
}
