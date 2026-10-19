/**
 * Where the drive engine's fixes come from (Drive.java ran as a foreground service, so trips
 * counted behind maps and music):
 *
 * - with "Count trips behind other apps" on and location allowed all the time, the background
 *   task below, with its notification; it is the only source then, on screen too, so no fix is
 *   counted twice;
 * - otherwise the plain watch while the app is open, as before.
 *
 * The task is defined when this file loads (src/app/_layout.tsx imports it). Android can start it
 * again with no screen at all, so it loads the settings and the saved trip before feeding.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState } from 'react-native';

import * as Bg from '../logic/background';
import { t } from '../logic/i18n';
import * as Engine from './engine';
import * as Store from './store';

export const TASK = 'openrath-drive';

/** How long the car has been standing still, in fixes (Bg.parkedRun). */
let parked = 0;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) {
    Engine.setGps(error.message);
    return;
  }
  await Engine.ready();
  // turned off while the app wasn't running to stop it
  if (!Bg.wanted(Store.prefs)) {
    Location.stopLocationUpdatesAsync(TASK).catch(() => {});
    return;
  }
  const fixes = data?.locations ?? [];
  await Engine.feed(fixes);
  // on a head unit that stays powered the GPS and its notification would otherwise run until the
  // next reboot: once the car has stood still for a few minutes let go of them, and leave starting
  // again to sync(), which runs whenever the app comes back on screen
  parked = Bg.parkedRun(parked, fixes.length, Engine.snapshot().trip.kmh);
  if (Bg.parkedLongEnough(parked)) {
    parked = 0;
    Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
});

let mode: Bg.Source = 'none';
let sub: Location.LocationSubscription | null = null;
let chain: Promise<unknown> = Promise.resolve();
let first = true;

/** The source running now. */
export function current(): Bg.Source {
  return mode;
}

/** Location allowed all the time? */
export async function allowed(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const onScreen = () => AppState.currentState === 'active';

/** The explanation first, then Android's own question. */
function ask(): Promise<boolean> {
  Store.prefs.put(Bg.ASKED, '1');
  return new Promise((resolve) =>
    Alert.alert(t(Bg.EXPLAIN_TITLE), t(Bg.EXPLAIN), [
      { text: t('Not now'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: t('Continue'),
        onPress: () =>
          Location.requestBackgroundPermissionsAsync()
            .then((r) => resolve(r.granted))
            .catch(() => resolve(false)),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

async function startTask(): Promise<boolean> {
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      foregroundService: { ...Bg.NOTICE, killServiceOnDestroy: false },
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function stopTask() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  } catch {
    // not registered
  }
}

async function switchTo(target: Bg.Source) {
  if (target !== 'watch' && sub) {
    sub.remove();
    sub = null;
  }
  if (target === 'task') {
    // checked each time: Android may have stopped the service behind our back
    if (mode === 'task' && (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))) return;
    if (await startTask()) {
      mode = 'task';
      return;
    }
    target = 'watch';
  }
  await stopTask();
  if (target === 'watch' && !sub) {
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (l) => {
        Engine.feed([l]);
      },
      (e) => Engine.setGps(String(e)),
    );
  }
  mode = target;
}

async function reconcile(force: boolean) {
  // Android only lets the service start while the app is on screen; Alerts need it too
  if (!onScreen()) return;
  const fg = first ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  first = false;
  if (fg.status !== 'granted') {
    Engine.setGps('denied');
    await switchTo('none');
    return;
  }
  if (Engine.snapshot().gps === 'denied') Engine.setGps('');
  const p = Store.prefs;
  let bg = await allowed();
  // start counting first, so the explanation never holds up the trip computer
  await switchTo(Bg.source(true, Bg.wanted(p), bg));
  if (Bg.shouldAsk(p, bg, onScreen(), force)) {
    bg = await ask();
    if (bg) await switchTo(Bg.source(true, Bg.wanted(p), bg));
  }
}

/**
 * Starts, switches or keeps the source to match the switch and the permissions: at start-up, on
 * coming back on screen (location may have been allowed in Android's settings meanwhile) and
 * when the switch changes. `force` asks for "all the time" again (a tap in Settings).
 */
export function sync(force = false): Promise<Bg.Source> {
  const next = chain.then(() => reconcile(force)).catch(() => {});
  chain = next;
  return next.then(() => mode);
}

/**
 * After deep sleep (Wake.woke) the GPS listener can be stale: stop the watch or the task and start
 * the source again, as Drive.start did.
 */
export function restart(): Promise<Bg.Source> {
  const next = chain
    .then(async () => {
      sub?.remove();
      sub = null;
      await stopTask();
      mode = 'none';
    })
    .catch(() => {});
  chain = next;
  return sync();
}

/**
 * The app is closing: the watch stops with it; the task (and its notification) goes on, until the
 * car has been parked for a few minutes and the task lets go of the GPS itself.
 */
export function detach(): Promise<Bg.Source> {
  const next = chain
    .then(() => {
      sub?.remove();
      sub = null;
      if (mode === 'watch') mode = 'none';
    })
    .catch(() => {});
  chain = next;
  return next.then(() => mode);
}
