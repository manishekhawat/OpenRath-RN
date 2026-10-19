/**
 * The drive engine (the work of the Drive service), outside React so it can run from the
 * background location task as well as on screen: each GPS fix goes through the trip computer,
 * the speed limit and camera alerts, the road helpers of road.ts, the trip side of trips.ts and
 * the headlight reminder, and the trip is saved every 15 s. drive.tsx shows what it publishes;
 * background.ts decides where the fixes come from.
 *
 * Since 1.38 it also works out the speed to show (Hub.speed and Fixes.java): replayed and
 * impossible fixes are skipped, the owner's speed correction is added, the number eases between
 * readings and shows 0 below the speed filter, and "--" (-1) without a fix for 10 s; and, from
 * 1.39, this drive's summary once the car has stood still for 5 s (CarCard).
 *
 * Speech works behind other apps. What needs the screen (the Cab notes, new badges) waits in a
 * queue while the app is behind another one, and is shown when it comes back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationObject } from 'expo-location';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';

import * as Bg from '../logic/background';
import * as Cab from '../logic/cab';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { dist } from '../logic/geo';
import { t } from '../logic/i18n';
import * as Motion from '../logic/motion';
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
  /** km/h to show: corrected, filtered and smoothed; -1 with no fix in the last 10 s */
  speedShown: number;
  /** this drive so far, once the car has stood still 5 s (with the stopSummary switch on) */
  stopped: Trip.Stopped | null;
  /** when the last fix came in (Date.now()), 0 = none yet */
  fixAt: number;
}

/** The car's voice; the app's own music dips while it talks (state/speech.ts). */
export function say(text: string) {
  speak(text);
}

const prefs = Store.prefs;
let snap: Snapshot = {
  trip: Trip.initial(Date.now()),
  limit: 0,
  cameraM: -1,
  over: false,
  alertError: '',
  gps: '',
  road: NO_ROAD,
  speedShown: -1,
  stopped: null,
  fixAt: 0,
};
const listeners = new Set<(s: Snapshot) => void>();

const speed = { limit: 0, cameras: [] as Speed.Camera[], warned: false, announced: new Set<string>() };
const query = { busy: false, at: null as null | { lat: number; lon: number }, time: 0 };
const road = new RoadWatch(prefs, say);
let savedAt = 0;
/** the speed shown, unrounded, and when it was worked out (the monotonic clock where there is one) */
const shown = { kmh: 0, at: 0, stoppedAt: 0 };
let easeTimer: ReturnType<typeof setTimeout> | null = null;
let lights = { told: false, darkSince: -1 };
let lastFixT = 0;
let lastTick = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let loading: Promise<void> | null = null;
/** the root layout is mounted, so notes can be shown */
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
  if (Platform.OS === 'android') ToastAndroid.show(item.text, ToastAndroid.LONG);
  else Alert.alert(item.text);
}

/** A note for the screen (a new badge): shown now, or when the app comes back. */
export function note(text: string) {
  show({ kind: 'note', text, at: Date.now() });
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
  refreshSpeed();
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
    set({ alertError: t('speed data unreachable') });
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
    { over: speed.warned, scoring: Features.on(prefs, 'score'), parking: Features.on(prefs, 'parking'), speedFix: Speed.fix(prefs) },
  );
  const s = r.state;
  const out: Partial<Snapshot> = { trip: s, fixAt: Date.now() };
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
    t: s.prevAt,
  });
  out.road = view;
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
  snap = { ...snap, ...out };
  set(speedNow(Date.now()));
}

// ---- the speed shown, and the drive summary when stopped

const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** The speed and stop summary for now, from the last fix (Hub.speed and CarCard.changed). */
function speedNow(now: number): Partial<Snapshot> {
  const tk = clock();
  const fresh = snap.fixAt > 0 && now - snap.fixAt < Speed.FIX_TIMEOUT_MS;
  let kmh = -1;
  if (!fresh) shown.kmh = 0;
  else {
    const raw = snap.trip.kmh;
    const still = Speed.filter(prefs);
    shown.kmh = Features.on(prefs, 'smoothSpeed') ? Speed.smooth(shown.kmh, raw, tk - shown.at, still) : raw < still ? 0 : raw;
    kmh = Math.round(shown.kmh);
    if (Math.abs(shown.kmh - raw) >= 0.5) ease();
  }
  shown.at = tk;
  // stopped for 5 seconds after some driving: how the drive went
  const isStill = kmh === 0;
  if (!isStill) shown.stoppedAt = 0;
  else if (shown.stoppedAt === 0) shown.stoppedAt = now;
  const tr = snap.trip;
  const due = isStill && now - shown.stoppedAt >= Trip.STOP_SUMMARY_MS && tr.driveKm >= Trip.STOP_SUMMARY_KM && Features.on(prefs, 'stopSummary');
  const stopped = due ? (snap.stopped && snap.stopped.km === tr.driveKm && snap.stopped.sec === tr.driveSec ? snap.stopped : Trip.stopped(tr)) : null;
  return { speedShown: kmh, stopped };
}

/** The number moves on towards the reading a few times a second while on screen (not at "Less movement: Off"). */
function ease() {
  if (easeTimer || AppState.currentState !== 'active' || Motion.level(prefs) === 'off') return;
  easeTimer = setTimeout(() => {
    easeTimer = null;
    refreshSpeed();
  }, Motion.level(prefs) === 'reduced' ? 500 : 250);
}

/** Publish the speed shown and the stop summary when they changed (the tick, the easing). */
function refreshSpeed() {
  const c = speedNow(Date.now());
  if (c.speedShown !== snap.speedShown || c.stopped !== snap.stopped) set(c);
}

/**
 * Fixes from either source (the watch on screen gives one, the background task a batch): each
 * new one is fed once, in order, after the settings and the saved trip are loaded.
 */
export async function feed(batch: readonly LocationObject[]): Promise<void> {
  await ready();
  const now = Date.now();
  // no real position (0,0 or out of range): skipped; old fixes replayed by Android: Bg.fresh skips them
  const real = batch.filter((l) => Speed.usable(l.coords.latitude, l.coords.longitude, 0, 0));
  for (const l of Bg.fresh(real, lastFixT, now)) {
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

/** A live GPS fix from the last 30 seconds (not an old one), or null (Hub.liveFix). */
export function liveFix(): { lat: number; lon: number } | null {
  const s = snap.trip;
  return snap.fixAt > 0 && Date.now() - snap.fixAt < 30000 && s.last ? { lat: s.lat, lon: s.lon } : null;
}

/** "Park here": only from a live GPS fix, as an old one can be hundreds of metres off. Returns what to show. */
export function parkHere(): string {
  const f = liveFix();
  if (!f) return t('No GPS position yet');
  setPark(f.lat, f.lon);
  return t('Parking spot saved');
}

export function setPark(lat: number, lon: number) {
  const s = { ...snap.trip, park: { lat, lon, at: Date.now() } };
  set({ trip: s });
  AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
}

export function resetToday() {
  const s = { ...snap.trip, todayKm: 0, todaySec: 0, driveKm: 0, driveSec: 0, driveTop: 0, todayBrakes: 0, todayAccels: 0, todaySpeedSec: 0 };
  set({ trip: s });
  AsyncStorage.setItem(TRIP_KEY, JSON.stringify(Trip.persisted(s))).catch(() => {});
}
