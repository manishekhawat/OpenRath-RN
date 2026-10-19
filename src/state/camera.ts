/**
 * The camera's shared state for the dashcam and the parking photo (the static parts of
 * Dashcam.java and Snap.java): the status line, the clip being recorded and the one before,
 * keeping clips on a jolt, the clip and photo folders in the app's documents, and which camera
 * view on screen may use the camera (only one at a time: the last one opened).
 */
import { Camera } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';

import * as Dashcam from '../logic/dashcam';
import * as Diag from '../logic/diag';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import type { Prefs } from '../logic/prefs';
import * as Snap from '../logic/snap';
import { useDrive } from './drive';
import { usePrefs } from './prefs';

export interface CameraState {
  status: string;
  recording: boolean;
  /** Stop was pressed on the dashcam screen: no recording until Start */
  held: boolean;
  /** the car parked and the camera view on screen should take the parking photo */
  snap: boolean;
  /** when the car last parked, so the dashboard's dashcam stops */
  parkedAt: number;
  /** the camera user on top (the last one opened), and the one whose camera is open now */
  owner: number | null;
  cameraIn: number | null;
  /** bumps when clips or photos change, for the lists */
  files: number;
}

let state: CameraState = { status: Dashcam.STATUS.off, recording: false, held: false, snap: false, parkedAt: 0, owner: null, cameraIn: null, files: 0 };
const listeners = new Set<() => void>();
const users: number[] = [];
let nextId = 1;

function set(change: Partial<CameraState>) {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function get(): CameraState {
  return state;
}

export function useCamera(): CameraState {
  return useSyncExternalStore(subscribe, get);
}

export function setStatus(status: string) {
  if (state.status !== status) set({ status });
}

// ------------------------------------------------------------------ who has the camera

/** A camera view opened: it goes on top, and the ones under it give the camera up. */
export function claim(): number {
  const id = nextId++;
  users.push(id);
  set({ owner: id });
  return id;
}

export function release(id: number) {
  const i = users.indexOf(id);
  if (i >= 0) users.splice(i, 1);
  set({ owner: users.length ? users[users.length - 1] : null, cameraIn: state.cameraIn === id ? null : state.cameraIn });
}

/** The view whose camera is open now; another may open its own only once this is null. */
export function cameraOpen(id: number, open: boolean) {
  if (open) set({ cameraIn: id });
  else if (state.cameraIn === id) set({ cameraIn: null });
}

/** Stop and Start on the dashcam screen. */
export function hold(held: boolean) {
  set({ held, status: held ? Dashcam.STATUS.held : state.status === Dashcam.STATUS.held ? Dashcam.STATUS.waiting : state.status });
}

// ------------------------------------------------------------------ folders

function dir(...parts: string[]): Directory {
  const d = new Directory(Paths.document, ...parts);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export const clipDir = () => dir(Dashcam.DIR);
export const savedDir = () => dir(Dashcam.DIR, Dashcam.SAVED);
export const photoDir = () => dir(Snap.DIR);

export interface Clip {
  name: string;
  file: File;
  size: number;
  saved: boolean;
}

function filesIn(d: Directory, saved: boolean): Clip[] {
  try {
    return d
      .list()
      .filter((f): f is File => f instanceof File && f.name.endsWith('.mp4'))
      .map((file) => ({ name: file.name, file, size: file.size ?? 0, saved }))
      .sort((a, b) => (a.name < b.name ? 1 : -1));
  } catch {
    return [];
  }
}

/** The kept clips and the loop clips, newest first. */
export function clips(): { saved: Clip[]; loop: Clip[] } {
  return { saved: filesIn(savedDir(), true), loop: filesIn(clipDir(), false) };
}

export function savedCount(): number {
  return filesIn(savedDir(), true).length;
}

// ------------------------------------------------------------------ recording

let current: string | null = null;
let previous: File | null = null;
let keepCurrent = false;

/** A clip has started recording, named for when it started. */
export function clipStarted(name: string) {
  current = name;
  set({ recording: true, status: Dashcam.STATUS.recording });
}

/** Recording stopped (the view closed, the car parked, or Stop). */
export function recordingEnded(status: string = Dashcam.STATUS.off) {
  current = null;
  set({ recording: false, status });
}

function move(f: File, to: Directory): File {
  const dest = new File(to, f.name);
  if (dest.exists) dest.delete();
  f.moveSync(dest);
  return new File(dest.uri);
}

/**
 * A clip finished: move it from the camera's cache into the dashcam folder under its name (into
 * saved/ when a jolt asked for it), then delete the oldest past the space allowed.
 */
export function clipDone(uri: string | undefined, name: string, prefs: Prefs) {
  const keep = keepCurrent;
  keepCurrent = false;
  if (current === name) current = null;
  if (!uri) return;
  try {
    const src = new File(uri);
    if (!src.exists) return;
    if (!src.size) {
      src.delete(); // too short to be a clip
      return;
    }
    const dest = new File(keep ? savedDir() : clipDir(), name);
    if (dest.exists) dest.delete();
    src.moveSync(dest);
    previous = new File(dest.uri);
    if (keep) set({ status: Dashcam.STATUS.saved });
  } catch (e) {
    Diag.note('dashcam clip', e);
    set({ status: Dashcam.STATUS.error(String((e as Error)?.message ?? e)) });
  }
  prune(prefs);
  set({ files: state.files + 1 });
}

function prune(prefs: Prefs) {
  const loop = filesIn(clipDir(), false);
  for (const n of Dashcam.prune(loop, Dashcam.spaceGB(prefs), current)) {
    try {
      new File(clipDir(), n).delete();
    } catch {
      // already gone
    }
  }
}

/**
 * Keep the clip before and the one being recorded (a jolt, the button or the voice command);
 * returns what to say.
 */
export function protect(prefs: Prefs): string {
  const on = Features.on(prefs, 'dashcam');
  if (!on || !state.recording) return Dashcam.protectText(on, false);
  keepCurrent = true;
  if (previous && previous.exists && previous.parentDirectory.uri === clipDir().uri) {
    try {
      previous = move(previous, savedDir());
    } catch {
      // it was pruned meanwhile
    }
  }
  set({ status: Dashcam.STATUS.saved, files: state.files + 1 });
  return Dashcam.protectText(true, true);
}

/** Keep a loop clip from the list by hand. */
export function keepClip(c: Clip) {
  move(c.file, savedDir());
  set({ files: state.files + 1 });
}

export function deleteClip(c: Clip) {
  c.file.delete();
  set({ files: state.files + 1 });
}

// ------------------------------------------------------------------ opening, sharing, the gallery

/** Play a clip in the unit's video player (Android), or offer it to the share sheet. */
export async function play(f: File, mime = 'video/mp4') {
  if (Platform.OS === 'android') {
    try {
      // 1 = FLAG_GRANT_READ_URI_PERMISSION
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: f.contentUri, type: mime, flags: 1 });
      return;
    } catch {
      // no player: share instead
    }
  }
  await share(f, mime);
}

export async function share(f: File, mime = 'video/mp4') {
  if (!(await Sharing.isAvailableAsync())) return Alert.alert(t('Sharing is not available on this unit'));
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: f.name });
}

/** A copy in the phone's gallery; returns the message to show. */
export async function toGallery(file: File): Promise<string> {
  try {
    const p = await MediaLibrary.requestPermissionsAsync(true);
    if (!p.granted) return t('Allow the gallery to save it there');
    await MediaLibrary.Asset.create(file.uri);
    return t('Saved to the gallery');
  } catch (e) {
    Diag.note('clip to the gallery', e);
    return f("Couldn't save it: %1$s", String((e as Error)?.message ?? e));
  }
}

// ------------------------------------------------------------------ the parking photo

/** Keep a picture as the latest parking photo, the one before becoming previous.jpg. */
export function storePhoto(uri: string) {
  const d = photoDir();
  const names = d.list().map((f) => f.name);
  for (const r of Snap.rotate(names)) {
    const to = new File(d, r.to);
    if (to.exists) to.delete();
    new File(d, r.from).moveSync(to);
  }
  const src = new File(uri);
  const dest = new File(d, Snap.LATEST);
  if (dest.exists) dest.delete();
  src.copySync(dest);
  try {
    src.delete();
  } catch {
    // the camera's cache
  }
  set({ files: state.files + 1 });
}

export interface Photo {
  file: File;
  at: number;
  /** a uri that changes with the photo, so the image cache never shows the old one */
  uri: string;
}

function photo(name: string): Photo | null {
  try {
    const f = new File(photoDir(), name);
    if (!f.exists) return null;
    const at = f.modificationTime ?? f.lastModified ?? Date.now();
    return { file: f, at, uri: `${f.uri}?t=${at}` };
  } catch {
    return null;
  }
}

export const latestPhoto = () => photo(Snap.LATEST);
export const previousPhoto = () => photo(Snap.PREVIOUS);

/** The Settings row "Last parking photo": its value; a tap opens /parkphoto. */
export function photoRowText(): string {
  return Snap.rowText(latestPhoto() != null);
}

/**
 * Call when the drive service says the car has parked (Drive.java called Snap.take there): the
 * dashboard's dashcam stops, and the parking photo is taken by the camera view on screen, or
 * the owner is asked to take one.
 */
export async function carParked(prefs: Prefs) {
  set({ parkedAt: Date.now() });
  let allowed: boolean | null = null;
  try {
    const p = await Camera.getCameraPermissionsAsync();
    allowed = p.granted ? true : p.canAskAgain ? null : false;
  } catch {
    allowed = null;
  }
  const how = Snap.plan(prefs, allowed, views.size > 0 && state.owner != null && views.has(state.owner));
  if (how === 'view') set({ snap: true });
  else if (how === 'ask')
    Alert.alert(t(Snap.ASK_TITLE), t(Snap.ASK_TEXT), [
      { text: t('Not now'), style: 'cancel' },
      { text: t('Take photo'), onPress: () => router.push({ pathname: '/parkphoto', params: { take: '1' } }) },
    ]);
}

/** The dashcam views on screen, which can take the parking photo themselves. */
const views = new Set<number>();

export function viewOpen(id: number, open: boolean) {
  if (open) views.add(id);
  else views.delete(id);
}

export function snapDone() {
  set({ snap: false });
}

/**
 * For the dashboard: calls carParked when the drive state's parking spot is set by the drive
 * service (a spot newer than when the dashboard opened, and from the last two minutes).
 */
export function useParkedSnap() {
  const { trip } = useDrive();
  const { prefs } = usePrefs();
  const at = trip.park?.at ?? 0;
  const seen = useRef(at);
  useEffect(() => {
    if (at <= seen.current) return;
    seen.current = at;
    if (Date.now() - at < 120000) carParked(prefs);
  }, [at, prefs]);
}
