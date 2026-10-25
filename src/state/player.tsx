/**
 * The app's own music and radio player (the Player service in the Android version): one
 * expo-audio player for the whole app, which keeps playing behind other apps and shows its
 * controls in the notification. Songs come from the phone's media library (audio assets, played
 * where they are) and from files added on the music page (copied into the app's own storage, so
 * they stay playable); stations come from Radio Browser.
 *
 * The plain functions (play, pause, toggle, next, prev, stop, pick, current) work from anywhere,
 * such as voice commands. PlayerProvider, inside DriveProvider, runs the sound features on the
 * player's own volume: resume after switch-on, louder with speed, sound profiles, quiet hours,
 * the dip while the car speaks and the parked-music battery saver.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Player from '../logic/player';
import { FILES, WEB, type Mode, type Track } from '../logic/player';
import { num, type Prefs } from '../logic/prefs';
import * as Sound from '../logic/sound';
import * as Wake from '../logic/wake';
import { useDrive } from './drive';
import { usePrefs } from './prefs';
import { onSpeaking, say } from './speech';

// ------------------------------------------------------------------ the shared state

/** What the boxes read. `playing` is what the owner wants (true while connecting too). */
export const state = {
  mode: null as Mode | null,
  playing: false,
  /** connecting, looking for music or buffering */
  busy: false,
  /** a short message when something went wrong */
  status: '',
  stations: [] as Track[],
  songs: [] as Track[],
  station: 0,
  song: 0,
  /** seconds into the track, and its length (0 for radio) */
  position: 0,
  duration: 0,
  /** the volume the player is at now, 0–1, after speed, profile, quiet hours and ducking */
  level: 1,
  /** dipped while the car speaks */
  ducked: false,
  /** the list being fetched or looked for now: "web", "files" or "" */
  loadingList: '' as Mode | '',
  /** the sound profile now ("" when profiles are off) */
  profile: '' as string,
  version: 0,
};

const listeners = new Set<() => void>();

export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

function changed() {
  state.version++;
  for (const f of listeners) f();
}

let prefs: Prefs | null = null;
let ap: AudioPlayer | null = null;
/** the track loaded in the player ("" for none) */
let loaded = '';
let errors = 0;
let loading = false;
let openSeq = 0;
/** when the owner last asked for something: status updates just after are not taken as an outside pause */
let commandAt = 0;
let modeSet = false;
let ducked = false;
let speedSteps = 0;

const list = () => (state.mode === WEB ? state.stations : state.songs);
const index = () => (state.mode === WEB ? state.station : state.song);
function setIndex(i: number) {
  if (state.mode === WEB) state.station = i;
  else state.song = i;
}

/** The station or song loaded now, or null. */
export function current(): Track | null {
  return state.mode ? Player.current(list(), index()) : null;
}

/** Where songs added on the music page are kept. */
export function musicDir(): Directory {
  return new Directory(Paths.document, 'music');
}

function toast(text: string) {
  if (Platform.OS === 'android') ToastAndroid.show(t(text), ToastAndroid.SHORT);
  else Alert.alert(t(text));
}

// ------------------------------------------------------------------ the player

function ensure(): AudioPlayer {
  if (ap) return ap;
  ap = createAudioPlayer(null, { updateInterval: 1000 });
  ap.addListener('playbackStatusUpdate', onStatus);
  return ap;
}

async function audioMode() {
  if (modeSet) return;
  modeSet = true;
  // doNotMix: other apps stop as this starts (audio focus), and the notification gets the controls
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {
    modeSet = false;
  });
}

/** The owner's own level, 0–100 ('playerVol'). */
export function baseVolume(): number {
  return prefs ? Math.max(0, Math.min(100, num(prefs, 'playerVol', 100))) : 100;
}

function applyVolume() {
  const p = prefs;
  const steps = p ? speedSteps + Sound.profileSteps(p, state.profile) : 0;
  const dip = ducked && (!p || Features.on(p, 'duck'));
  const v = Sound.volume(baseVolume(), steps, dip);
  const was = state.level;
  state.level = v;
  state.ducked = dip;
  if (ap) ap.volume = v;
  if (Math.abs(was - v) > 0.001) changed();
}

/** Set the owner's level, 0–100. */
export function setVolume(pct: number) {
  prefs?.put('playerVol', String(Math.round(Math.max(0, Math.min(100, pct)))));
  keepSourceVolume();
  applyVolume();
}

/**
 * 1.44: each source comes back at the volume it last played at. The owner's level is written down
 * under the source playing now, and read back when the source changes (Resume.sourceVolume). The
 * Android version does this to the stereo's own volume; here it is this player's level, because
 * the system volume needs native code.
 */
function keepSourceVolume() {
  const p = prefs;
  if (!p || state.mode === null || !Features.on(p, 'sourceVolume')) return;
  p.put('volSrc', state.mode);
  p.put(Sound.volumeKey(state.mode), String(baseVolume()));
}

/** The new source's own volume, when it has played at one before. */
function takeSourceVolume(mode: Mode) {
  const p = prefs;
  if (!p || !Features.on(p, 'sourceVolume')) return;
  const want = Sound.volumeFor(mode, p.str('volSrc', ''), baseVolume(), num(p, Sound.volumeKey(mode), -1));
  p.put('volSrc', mode);
  if (want >= 0) {
    p.put('playerVol', String(want));
    applyVolume();
  }
}

/** Louder (+) or softer (-) by `pct` points: the voice commands' volume up and down. */
export function changeVolume(pct: number) {
  setVolume(baseVolume() + pct);
}

function release() {
  openSeq++;
  if (ap && loaded !== '') {
    try {
      ap.pause();
    } catch {
      // already gone
    }
  }
  loaded = '';
  state.busy = false;
  state.position = 0;
  state.duration = 0;
}

function showControls(tr: Track) {
  try {
    ap?.setActiveForLockScreen(
      true,
      { title: tr.name, artist: tr.sub !== '' ? tr.sub : state.mode === WEB ? t('Online radio') : t('Music') },
      { isLiveStream: state.mode === WEB },
    );
  } catch {
    // not on this platform
  }
}

async function open() {
  let t = current();
  if (!t) {
    setIndex(0);
    t = current();
    if (!t) return;
  }
  const mode = state.mode as Mode;
  if (prefs) Player.saveIndex(prefs, mode, index());
  release();
  const seq = openSeq;
  state.busy = true;
  state.status = '';
  state.playing = true;
  commandAt = Date.now();
  changed();
  try {
    let uri = t.src;
    if (uri.startsWith('asset:')) uri = await new MediaLibrary.Asset(uri.substring(6)).getUri();
    await audioMode();
    if (seq !== openSeq) return; // something else was asked for meanwhile
    if (!state.playing) {
      state.busy = false; // paused while connecting
      changed();
      return;
    }
    const a = ensure();
    a.replace({ uri });
    loaded = t.src;
    applyVolume();
    a.play();
    showControls(t);
  } catch {
    if (seq !== openSeq) return;
    state.busy = false;
    state.playing = false;
    state.status = Player.STATUS.cantPlay;
    changed();
  }
}

function onStatus(st: AudioStatus) {
  if (loaded === '') return;
  state.position = st.currentTime || 0;
  state.duration = state.mode === WEB ? 0 : st.duration || 0;
  if (st.error) {
    onError();
    return;
  }
  if (st.didJustFinish) {
    if (Date.now() - commandAt < 1500) return; // the last track's end, arriving late
    if (state.mode === FILES) skip(1);
    else {
      state.playing = false;
      changed();
    }
    return;
  }
  if (st.playing) {
    errors = 0;
    state.status = '';
  }
  state.busy = state.playing && (!st.isLoaded || (st.isBuffering && !st.playing));
  // paused or played from outside (the notification's buttons, a call, another app taking the sound)
  const settled = Date.now() - commandAt > 3000;
  if (settled && state.playing && st.isLoaded && !st.playing && !st.isBuffering) state.playing = false;
  else if (settled && !state.playing && st.playing) state.playing = true;
  changed();
}

function onError() {
  const mode = state.mode as Mode;
  release();
  state.status = mode === WEB ? Player.STATUS.stationDown : Player.STATUS.fileBad;
  // move on, but don't spin for ever when there is no connection at all
  if (Player.retry(++errors)) {
    const seq = openSeq;
    setTimeout(() => {
      if (seq === openSeq && state.playing) skip(1);
    }, 1200);
  } else {
    errors = 0;
    state.playing = false;
    state.status = Player.gaveUp(mode);
  }
  changed();
}

function skip(d: number) {
  const l = list();
  if (l.length === 0) {
    load(state.mode ?? FILES, true);
    return;
  }
  setIndex(Player.skip(index(), d, l.length));
  open();
}

function turn(on: boolean) {
  if (!state.mode) state.mode = FILES;
  commandAt = Date.now();
  if (!on) {
    if (ap && loaded !== '') ap.pause();
    state.playing = false;
    changed();
    return;
  }
  if (list().length === 0) {
    load(state.mode, true);
    return;
  }
  const t = current();
  if (ap && loaded !== '' && t && loaded === t.src && !state.busy) {
    ap.play();
    state.playing = true;
    showControls(t);
    changed();
  } else if (!state.busy || loaded === '') {
    open();
  }
}

function switchTo(mode: Mode | undefined) {
  if (mode && mode !== state.mode) {
    release();
    takeSourceVolume(mode);
    state.mode = mode;
    state.playing = false;
    state.status = '';
  }
}

// ------------------------------------------------------------------ the lists

async function load(m: Mode, thenPlay: boolean) {
  if (loading) return;
  loading = true;
  state.loadingList = m;
  // the box's lines only when it shows this list
  const shown = () => state.mode === m || state.mode === null;
  if (shown()) {
    state.busy = true;
    state.status = m === WEB ? Player.STATUS.findingStations : Player.STATUS.findingMusic;
  }
  changed();
  let l: Track[] = [];
  try {
    l = m === WEB ? (prefs ? await Player.fetchStations(prefs) : []) : await scanSongs();
  } catch {
    l = [];
  }
  loading = false;
  state.loadingList = '';
  if (m === WEB) state.stations = l;
  else state.songs = l;
  if (shown()) {
    if (loaded === '') state.busy = false;
    if (l.length === 0) {
      state.status = m === WEB ? Player.STATUS.webUnreachable : Player.STATUS.noMusic;
      if (loaded === '') state.playing = false;
    } else if (loaded === '') {
      state.status = '';
      if (thenPlay && m === state.mode) {
        open();
        return;
      }
    }
  }
  changed();
}

/** The phone's music (longer than 15 s, by name), then the files added here (by name). */
async function scanSongs(): Promise<Track[]> {
  const lib: Track[] = [];
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
    if (perm.granted) {
      const found = await new MediaLibrary.Query().eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.AUDIO).limit(3000).exeForMetadata();
      for (const a of found) {
        if (!a.filename || !Player.longEnough(a.duration)) continue;
        lib.push({ name: Player.title(a.filename), sub: '', src: 'asset:' + a.id });
      }
    }
  } catch {
    // no media library here: the added files only
  }
  return [...Player.byName(lib), ...Player.byName(addedSongs())];
}

/** The songs added on the music page. */
export function addedSongs(): Track[] {
  const out: Track[] = [];
  try {
    const d = musicDir();
    if (!d.exists) return out;
    for (const f of d.list()) {
      if (f instanceof File && Player.isAudio(f.name)) out.push({ name: Player.title(f.name), sub: 'Added here', src: f.uri });
    }
  } catch {
    // nothing readable
  }
  return out;
}

/**
 * Pick music files with the system's file picker and copy them into the app (a picked file's
 * link stops working after a restart). Returns how many were added.
 */
export async function addFiles(): Promise<number> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (r.canceled) return 0;
  const d = musicDir();
  d.create({ intermediates: true, idempotent: true });
  let n = 0;
  for (const a of r.assets) {
    try {
      const name = a.name && a.name.includes('.') ? a.name : (a.name || 'song') + '.mp3';
      let to = new File(d, name);
      for (let k = 2; to.exists; k++) to = new File(d, Player.title(name) + ` (${k})` + name.substring(name.lastIndexOf('.')));
      await new File(a.uri).move(to);
      n++;
    } catch {
      // skip this one
    }
  }
  if (n > 0) await rescan();
  return n;
}

/** Delete the songs added here (the phone's own music is left alone). */
export async function removeAdded() {
  try {
    const d = musicDir();
    if (d.exists) d.delete();
  } catch {
    // nothing to remove
  }
  if (state.mode === FILES && loaded.startsWith('file:')) stop();
  await rescan();
}

/** Look for music again (a new USB stick, or files added). */
export async function rescan() {
  state.songs = [];
  await load(FILES, false);
}

/** Fetch the stations again. */
export async function refreshStations() {
  state.stations = [];
  await load(WEB, false);
}

/** Load a mode's list without playing, for the music page. */
export function ensureList(mode: Mode) {
  if ((mode === WEB ? state.stations : state.songs).length > 0 || loading) return;
  if (mode === WEB) refreshStations();
  else rescan();
}

// ------------------------------------------------------------------ for the boxes and voice

/** Play (optionally switching to "web" or "files"); remembered for resume after switch-on. */
export function play(mode?: Mode) {
  switchTo(mode);
  turn(true);
  if (prefs) Player.remember(prefs, state.mode ?? FILES);
}

/** Pause; nothing is resumed at the next switch-on. */
export function pause() {
  if (!state.mode) return;
  turn(false);
  if (prefs) Player.remember(prefs, '');
}

/** Play or pause (the box's button). */
export function toggle(mode?: Mode) {
  if (state.playing && (!mode || mode === state.mode)) pause();
  else play(mode);
}

/** The next song or station. False when the player has nothing loaded (it was another app's music). */
export function next(): boolean {
  if (!state.mode) return false;
  commandAt = Date.now();
  skip(1);
  if (prefs) Player.remember(prefs, state.mode);
  return true;
}

export function prev(): boolean {
  if (!state.mode) return false;
  commandAt = Date.now();
  skip(-1);
  if (prefs) Player.remember(prefs, state.mode);
  return true;
}

/** Play entry `i` of a mode's list (a tap in the list). */
export function pick(mode: Mode, i: number) {
  switchTo(mode);
  setIndex(i);
  release();
  turn(true);
  if (prefs) Player.remember(prefs, mode);
}

/** Choose what the box plays next without starting it. */
export function setMode(mode: Mode) {
  if (mode === state.mode) return;
  if (state.playing) pause();
  switchTo(mode);
  changed();
}

/** Move in the song to `sec` seconds (the music box's drag to seek). Radio streams can't seek. */
export function seek(sec: number) {
  if (!ap || loaded === '' || state.mode !== FILES || state.duration <= 0) return;
  const to = Math.max(0, Math.min(state.duration, sec));
  commandAt = Date.now();
  state.position = to;
  changed();
  ap.seekTo(to).catch(() => {});
}

/** Stop and let go of the sound and the notification. */
export function stop() {
  release();
  state.playing = false;
  try {
    ap?.clearLockScreenControls();
  } catch {
    // not shown
  }
  if (prefs) Player.remember(prefs, '');
  changed();
}

/** True while this player is playing (or connecting). */
export function isPlaying(): boolean {
  return state.playing;
}

// ------------------------------------------------------------------ the provider

/** The player's state, re-rendering on every change. */
export function usePlayer() {
  useSyncExternalStore(subscribe, () => state.version);
  return state;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { prefs: p, version } = usePrefs();
  const drive = useDrive();
  const kmh = drive.trip.kmh;
  const highway = drive.road.highway;
  const where = useRef({ kmh: 0, lat: 0, lon: 0, highway: false });
  where.current = { kmh, lat: drive.trip.lat, lon: drive.trip.lon, highway };
  const speed = useRef(new Sound.SpeedVolume());
  const parked = useRef(new Sound.Parked());
  const wasQuiet = useRef(false);

  // set while rendering, so the screens' first effects (which run before this one's) have them
  if (prefs !== p) {
    prefs = p;
    state.station = Player.savedIndex(p, WEB);
    state.song = Player.savedIndex(p, FILES);
  }

  // carrying on after switch-on
  useEffect(() => {
    if (!Player.due(p, true)) return;
    const what = Player.toResume(p) as Mode;
    const t = setTimeout(() => {
      if (state.playing) return;
      play(what);
      toast('Carrying on where you left off');
      if (p.str('summaryHow', 'voice') !== 'text') say('Welcome back. Carrying on where you left off.');
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // after deep sleep (the ignition, with OpenRath still on screen) the sound session is stale:
  // set the audio mode again and carry the song on where it stopped (Wake.java, 1.39)
  useEffect(
    () =>
      Wake.onWoke(() => {
        modeSet = false;
        if (!state.playing) return;
        audioMode().then(() => {
          try {
            ap?.play();
          } catch {
            open(); // the player let go of the song: load it again
          }
        });
      }),
    [],
  );

  // the music dips while the car speaks
  useEffect(
    () =>
      onSpeaking((on) => {
        ducked = on;
        applyVolume();
      }),
    [],
  );

  // a setting changed (volume, steps, features): work the volume out again
  useEffect(() => {
    applyVolume();
  }, [version]);

  // louder with speed, on every GPS fix
  useEffect(() => {
    const steps = speed.current.update(Sound.speedSteps(p, kmh), Date.now());
    if (steps !== speedSteps) {
      speedSteps = steps;
      applyVolume();
    }
  }, [kmh, p]);

  // every 20 s: quiet hours, the sound profile and parked music
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const w = where.current;
      const q = Sound.quietNow(p, new Date(now).getHours());
      if (q && !wasQuiet.current) {
        const cap = Sound.quietVol(p);
        if (baseVolume() > cap) setVolume(Sound.quietLevel(baseVolume(), cap));
      }
      wasQuiet.current = q;

      let profile = '';
      if (Features.on(p, 'soundProfiles')) {
        const hr = new Date(now).getHours();
        const dark = w.lat !== 0 || w.lon !== 0 ? Errands.dark(w.lat, w.lon, now) : hr >= 19 || hr < 6;
        profile = Errands.soundProfile(w.highway, dark);
      }
      if (profile !== state.profile) {
        state.profile = profile;
        applyVolume();
        changed();
      }

      const what = parked.current.tick(w.kmh, now, state.playing && Features.on(p, 'parkedMusic'), Sound.parkedMin(p));
      if (what !== '') {
        if (what === 'pause') turn(false); // not remembered: it carries on at the next switch-on
        say(Sound.PARKED_TEXT[what]);
      }
    };
    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [p]);

  // the highway profile at once, not at the next tick
  useEffect(() => {
    if (!Features.on(p, 'soundProfiles')) return;
    const w = where.current;
    const hr = new Date().getHours();
    const dark = w.lat !== 0 || w.lon !== 0 ? Errands.dark(w.lat, w.lon, Date.now()) : hr >= 19 || hr < 6;
    const profile = Errands.soundProfile(highway, dark);
    if (profile !== state.profile) {
      state.profile = profile;
      applyVolume();
      changed();
    }
  }, [highway, p]);

  return <>{children}</>;
}
