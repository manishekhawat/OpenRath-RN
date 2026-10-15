/**
 * The drive engine (the work of the Drive service), outside React so it can run from the
 * background location task as well as on screen: each GPS fix goes through the trip computer,
 * the speed limit and camera alerts, the road helpers of road.ts, the trip side of trips.ts, the
 * crash check and the headlight reminder, and the trip is saved every 15 s. drive.tsx shows what
 * it publishes; background.ts decides where the fixes come from.
 *
 * Speech works behind other apps. What needs the screen (the SOS countdown, the Cab notes) waits
 * in a queue while the app is behind another one, and is shown when it comes back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { LocationObject } from 'expo-location';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';

import * as Bg from '../logic/background';
import * as Cab from '../logic/cab';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { dist } from '../logic/geo';
import * as Rescue from '../logic/rescue';
import * as Speed from '../logic/speed';
import * as Trip from '../logic/trip';
import * as Valet from '../logic/valet';
import { EMPTY as NO_ROAD, RoadWatch, type RoadView } from './road';
import * as Store from './store';
import * as Trips from './trips';
import { say as speak } from './speech';

export const TRIP_KEY = 'openrath:trip';
export const HIST_KEY = 'openrath:history';

/** What the screens show, replaced (never changed in place) on every update. */
export interface Snapshot {
  trip: Trip.TripState;
  limit: number;
  cameraM: number;
  over: boolean;
  alertError: string;
  gps: string;
  road: RoadView;
}

/** The car's voice; the app's own music dips while it talks (state/speech.ts). */
export function say(text: string) {
  speak(text);
}

const prefs = Store.prefs;
let snap: Snapshot = { trip: Trip.initial(Date.now()), limit: 0, cameraM: -1, over: false, alertError: '', gps: '', road: NO_ROAD };
const listeners = new Set<(s: Snapshot) => void>();

const speed = { limit: 0, cameras: [] as Speed.Camera[], warned: false, announced: new Set<string>() };
const query = { busy: false, at: null as null | { lat: number; lon: number }, time: 0 };
const road = new RoadWatch(prefs, say);
let savedAt = 0;
let crashSeen = 0;
let lights = { told: false, darkSince: -1 };
let lastFixT = 0;
let lastTick = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let loading: Promise<void> | null = null;
/** the root layout is mounted, so the router can open a screen */
let attached = false;
const queue: Bg.Queued[] = [];

export function snapshot(): Snapshot {
  return snap;
}

export function subscribe(fn: (s: Snapshot) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(change: Partial<Snapshot>) {
  snap = { ...snap, ...change };
  for (const fn of [...listeners]) fn(snap);
}

/** The settings and the saved trip, loaded once before the first fix (also in a headless start). */
export function ready(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      await Store.load();
      await reloadTrip();
    })();
  }
  return loading;
}

/** The saved trip was replaced (a backup restored): take it, or the next save would undo it. */
export async function reloadTrip(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TRIP_KEY);
    if (raw) set({ trip: Trip.initial(Date.now(), JSON.parse(raw)) });
  } catch {
    // keep the one in memory
  }
}

export function setGps(gps: string) {
  if (gps !== snap.gps) set({ gps });
}

const onScreen = () => attached && AppState.currentState === 'active';

/** Shown now when the app is on screen, otherwise kept for when it comes back. */
function show(item: Bg.Queued) {
  if (!onScreen()) {
    queue.push(item);
    return;
  }
  if (item.kind === 'sos') router.push(item.text as never);
  else if (Platform.OS === 'android') ToastAndroid.show(item.text, ToastAndroid.LONG);
  else Alert.alert(item.text);
}

/** The root layout is up (or went away): screens can be opened from here on. */
export function attach(on: boolean) {
  attached = on;
  if (on) foreground();
}

/** Back on screen: show what waited. */
export function foreground() {
  if (!onScreen() || queue.length === 0) return;
  const items = Bg.due(queue, Date.now());
  queue.length = 0;
  items.forEach(show);
}

// ---- saving

async function save(s: Trip.TripState, closed?: { day: string; row: number[] }) {
  await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s)));
  if (closed) {
    const hist: Trip.History = JSON.parse((await AsyncStorage.getItem(HIST_KEY)) ?? '{}');
    hist[closed.day] = closed.row;
    const keys = Object.keys(hist).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 430))) delete hist[k];
    await AsyncStorage.setItem(HIST_KEY, JSON.stringify(hist));
  }
}

/** Keep everything now: the app is going behind another one, or closing. */
export function persist(): Promise<void> {
  road.saveSpots();
  return Promise.all([save(snap.trip).catch(() => {}), Store.flush()]).then(() => {});
}

/** The app is closing. `keepDriving`: the background task goes on, so the drive isn't over. */
export function close(keepDriving: boolean) {
  stopTick();
  if (!keepDriving) Trips.end(prefs);
  persist();
}

// ---- the Cab tools' once-a-second tick: the meter's waiting time, the duty reminder, papers due

function tick() {
  const now = Date.now();
  lastTick = now;
  const t = snap.trip;
  for (const n of Cab.tick(prefs, now, t.kmh, t.last?.t ?? 0)) {
    show({ kind: 'note', text: n.text, at: now });
    if (n.speak) say(n.text);
  }
}

export function startTick() {
  if (!tickTimer) tickTimer = setInterval(tick, 1000);
}

export function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

// ---- speed limits and cameras

async function lookUpLimits(lat: number, lon: number) {
  query.busy = true;
  query.at = { lat, lon };
  query.time = Date.now();
  try {
    const r = await fetch(Speed.OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(Speed.query(lat, lon)),
    });
    const parsed = Speed.parse(await r.json());
    speed.limit = parsed.limit;
    speed.cameras = parsed.cameras;
    set({ limit: parsed.limit, alertError: '' });
  } catch {
    set({ alertError: 'speed data unreachable' });
  } finally {
    query.busy = false;
  }
}

function speedAlerts(s: Trip.TripState, out: Partial<Snapshot>) {
  const now = Date.now();
  const moved = query.at ? dist(query.at.lat, query.at.lon, s.lat, s.lon) : Infinity;
  if (!query.busy && now - query.time > 8000 && (moved > 250 || (now - query.time > 120000 && moved > 30))) {
    lookUpLimits(s.lat, s.lon);
  }
  const cam = Speed.nearestCamera(s.lat, s.lon, s.heading, s.kmh, speed.cameras);
  out.cameraM = cam;
  if (cam >= 0 && s.kmh > 10) {
    for (const c of speed.cameras) {
      const id = `${c.lat},${c.lon}`;
      if (dist(s.lat, s.lon, c.lat, c.lon) < 600 && !speed.announced.has(id)) {
        speed.announced.add(id);
        say('Speed camera ahead' + (c.limit > 0 ? ', limit ' + c.limit : ''));
      }
    }
  }
  const o = Speed.isOver(s.kmh, speed.limit, Valet.warnAt(prefs));
  if (o && !speed.warned) say(speed.limit > 0 && s.kmh > speed.limit + 3 ? 'Speed limit ' + speed.limit : 'Slow down');
  speed.warned = o;
  out.over = o;
}

// ---- one fix

function feedOne(l: LocationObject) {
  const alerts = Features.on(prefs, 'speedAlerts') || Valet.on(prefs);
  const prev = snap.trip;
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
    { over: speed.warned, scoring: Features.on(prefs, 'score'), parking: Features.on(prefs, 'parking') },
  );
  const s = r.state;
  const out: Partial<Snapshot> = { trip: s };
  // current already, so an update published on the way (a failed limit lookup) carries this trip
  snap = { ...snap, trip: s };
  if (alerts) speedAlerts(s, out);
  else {
    out.limit = 0;
    out.cameraM = -1;
    out.over = false;
  }
  // the road helpers: they speak their own warnings
  const view = road.feed({
    lat: s.lat,
    lon: s.lon,
    kmh: s.kmh,
    heading: s.heading,
    altitude: l.coords.altitude,
    accuracy: l.coords.accuracy,
    driveKm: s.driveKm,
    t: s.prevAt,
  });
  out.road = view;
  // a crash-like stop with accident help on: the countdown screen, which texts the contact
  if (view.crashAt > crashSeen) {
    crashSeen = view.crashAt;
    show({ kind: 'sos', text: Rescue.sosHref(s.lat, s.lon), at: Date.now() });
  }
  // the mileage coach, the route recorder and the fuel-low check
  const tr = Trips.onTripFix(prefs, prev, r, l.coords.altitude ?? null);
  tr.say.forEach(say);
  // the headlight reminder, once a drive, after 30 s of driving in the dark (Drive.carChecks)
  if (tr.driveEnded) lights = { told: false, darkSince: -1 };
  const lt = lights;
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
  if (r.closedDay || Date.now() - savedAt > 15000) {
    savedAt = Date.now();
    save(r.state, r.closedDay).catch(() => {});
  }
  set(out);
}

/**
 * Fixes from either source (the watch on screen gives one, the background task a batch): each
 * new one is fed once, in order, after the settings and the saved trip are loaded.
 */
export async function feed(batch: readonly LocationObject[]): Promise<void> {
  await ready();
  const now = Date.now();
  for (const l of Bg.fresh(batch, lastFixT, now)) {
    lastFixT = l.timestamp || now;
    feedOne(l);
  }
  // behind other apps the tick's timer may sleep: the fixes keep the Cab meter going
  if (!tickTimer || (AppState.currentState !== 'active' && Date.now() - lastTick > 1500)) tick();
  if (AppState.currentState !== 'active') Store.flush();
}

// ---- what the screens can do

export function holdMessage(): boolean {
  const held = road.holdMessage();
  if (held) set({ road: road.view });
  return held;
}

export function markFlood(): string {
  return road.markFlood();
}

export function hideFog() {
  set({ road: road.hideFog() });
}

export function setPark(lat: number, lon: number) {
  const s = { ...snap.trip, park: { lat, lon, at: Date.now() } };
  set({ trip: s });
  AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
}

export function resetToday() {
  const s = { ...snap.trip, todayKm: 0, todaySec: 0, driveKm: 0, driveSec: 0, todayBrakes: 0, todayAccels: 0, todaySpeedSec: 0 };
  set({ trip: s });
  AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
}
