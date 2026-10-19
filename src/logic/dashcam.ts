/**
 * The dashcam (port of Dashcam.java): records in one-minute clips to the 'dashcam' folder,
 * deleting the oldest when the space set in Settings is used up. A sudden jolt (harsh braking,
 * or a knock the accelerometer feels) or the "save clip" button moves the clip before and the
 * one being recorded to dashcam/saved, which is never cleared automatically.
 *
 * The Android version recorded a USB dashcam the unit listed as a camera, from its drive service
 * with no screen; here it is the device's own camera through expo-camera, which records only
 * while its view is on screen (src/components/DashcamView.tsx does the camera and file work, this
 * the rules). A USB camera, or recording with the screen off, needs native code.
 */
import * as Features from './features.ts';
import { f, t } from './i18n.ts';
import { num, type Prefs } from './prefs.ts';

/** Seconds in a clip (MediaRecorder.setMaxDuration(60000) in the Android version). */
export const CLIP_SECONDS = 60;
/** The folder inside the app's documents, and the kept clips inside it. */
export const DIR = 'dashcam';
export const SAVED = 'saved';
/** After a camera error, try again a minute later. */
export const RETRY_MS = 60000;
/** Video quality and bitrate: 720p at most 6 Mbit/s, as the Android version chose. */
export const QUALITY = '720p';
export const BITRATE = 6000000;

/** Settings: the space for loop clips, in GB. */
export const SPACE_CHOICES = [2, 4, 8, 16, 32];

export function spaceGB(p: Prefs): number {
  return num(p, 'dashcamGB', 4);
}

/** The next space choice on a tap, as the Settings row cycled through them. */
export function nextSpace(p: Prefs): number {
  const i = SPACE_CHOICES.indexOf(spaceGB(p));
  const n = SPACE_CHOICES[(i + 1) % SPACE_CHOICES.length];
  p.put('dashcamGB', String(n));
  return n;
}

export function spaceText(p: Prefs): string {
  return f('%1$s GB, oldest clips deleted first', spaceGB(p));
}

/**
 * Which camera: the Android version cycled through the unit's cameras by number ('dashcamId',
 * the last one by default, usually the USB one); expo-camera offers the back or the front one.
 */
export type Facing = 'back' | 'front';

export function facing(p: Prefs): Facing {
  return p.str('dashcamFacing', 'back') === 'front' ? 'front' : 'back';
}

/** Sound with the clips: off, as the Android version recorded none. */
export function sound(p: Prefs): boolean {
  return p.str('dashcamSound', 'off') === 'on';
}

/**
 * How hard a knock keeps the clip, in tenths of a g beyond gravity (0 = only harsh braking from
 * the GPS, as in the Android version, which had no accelerometer rule).
 */
export const JOLT_CHOICES = [
  { id: '0', label: 'Off' },
  { id: '10', label: '1 g' },
  { id: '15', label: '1.5 g' },
  { id: '20', label: '2 g' },
  { id: '30', label: '3 g' },
];

export function joltG(p: Prefs): number {
  return num(p, 'dashcamJolt', 20) / 10;
}

export function joltText(p: Prefs): string {
  const g = joltG(p);
  return g <= 0 ? t('off: only harsh braking keeps a clip') : f('a knock over %1$s g keeps the clip (lower is more sensitive)', g);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A clip's file name from when it started: "20261015-083005.mp4" (local time, as SimpleDateFormat). */
export function clipName(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`;
}

/** When a clip started, from its name, or 0 for a file that isn't a clip. */
export function clipTime(name: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.mp4$/.exec(name);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 15 Oct, 8:30:05 am" for a clip's name in the list. */
export function clipLabel(name: string): string {
  const t = clipTime(name);
  if (!t) return name;
  const d = new Date(t);
  const h = d.getHours() % 12 || 12;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

/**
 * Which loop clips to delete, oldest first by name, until the rest fit in the space allowed;
 * never the one being recorded (prune() in the Android version).
 */
export function prune(files: { name: string; size: number }[], capGB: number, current?: string | null): string[] {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const cap = capGB * 1024 * 1024 * 1024;
  let used = sorted.reduce((s, f) => s + f.size, 0);
  const out: string[] = [];
  for (const f of sorted) {
    if (used <= cap) break;
    if (f.name === current) continue;
    used -= f.size;
    out.push(f.name);
  }
  return out;
}

/** The status line the Android version showed in Settings (kept in English; shown through statusText). */
export const STATUS = {
  off: 'off',
  recording: 'recording',
  saved: 'recording · clip saved',
  permission: 'needs camera permission: open the dashcam screen once to allow it',
  noCamera: 'no camera found',
  waiting: 'on: records while the car is moving',
  held: 'stopped: tap Start to record again',
  error: (msg: string) => 'camera error: ' + msg,
};

/** A status in the chosen language ("camera error: …" keeps the camera's own words). */
export function statusText(status: string): string {
  const err = 'camera error: ';
  return status.startsWith(err) ? f('camera error: %1$s', status.slice(err.length)) : t(status);
}

/** The Settings row's value: the status when the dashcam is switched on. */
export function rowText(p: Prefs, status: string): string {
  return Features.on(p, 'dashcam') ? statusText(status) : t('off (switch above)');
}

/** "3 saved in dashcam/saved" for the "Save the clip now" row. */
export function savedText(n: number): string {
  return f('%1$s saved in %2$s', n, `${DIR}/${SAVED}`);
}

/** What the "save the clip" voice command and button say. */
export function protectText(on: boolean, recording: boolean): string {
  if (!on) return t('Turn on the dashcam in Settings > Driving');
  return recording ? t('Clip saved') : t("The dashcam isn't recording right now");
}

/**
 * Harsh braking from the GPS speed, as Drive.java fed each fix: more than 12 km/h lost per
 * second from over 20 km/h, measured over half a second to 2.5 s, at most once in 5 s. (1.42
 * keeps clips on harsh braking only: the crash-like stop went with accident help.)
 */
export class BrakeWatch {
  private prevKmh = 0;
  private prevAt = 0;
  private lastHarsh = -Infinity;

  feed(kmh: number, now: number): boolean {
    let hit = false;
    const dt = now - this.prevAt;
    if (this.prevAt !== 0 && dt <= 2500 && dt >= 500 && now - this.lastHarsh > 5000) {
      const rate = (kmh - this.prevKmh) / (dt / 1000);
      if (rate < -12 && this.prevKmh > 20) {
        this.lastHarsh = now;
        hit = true;
      } else if (rate > 11) this.lastHarsh = now; // a hard start: counted, keeps nothing
    }
    this.prevKmh = kmh;
    this.prevAt = now;
    return hit;
  }
}

/**
 * A knock from the accelerometer (x, y, z in g, gravity included): the reading less a slowly
 * followed estimate of gravity, so the way the unit is mounted doesn't matter. True once when
 * that goes over the threshold, then quiet for 5 s.
 */
export class JoltWatch {
  private g: [number, number, number] | null = null;
  private lastAt = -Infinity;

  feed(x: number, y: number, z: number, now: number, thresholdG: number): boolean {
    if (!this.g) {
      this.g = [x, y, z];
      return false;
    }
    const g = this.g;
    const d = Math.hypot(x - g[0], y - g[1], z - g[2]);
    // follow gravity slowly (about a second at 20 readings a second)
    g[0] += (x - g[0]) * 0.05;
    g[1] += (y - g[1]) * 0.05;
    g[2] += (z - g[2]) * 0.05;
    if (thresholdG <= 0 || d < thresholdG || now - this.lastAt < 5000) return false;
    this.lastAt = now;
    return true;
  }
}

/**
 * When the dashboard's dashcam records: once the car is moving (over 8 km/h, the speed Drive.java
 * counted as driving) until it parks, or has stood still for 5 minutes when parking isn't being
 * watched; not before the first drive, so it doesn't film a parked car. (The Android version
 * recorded all the time it was switched on.) The full-screen dashcam view records whenever it is open.
 */
export const STILL_MS = 5 * 60000;

export class Motion {
  moving = false;
  private stillSince = 0;

  feed(kmh: number, now: number): boolean {
    if (kmh > 8) {
      this.moving = true;
      this.stillSince = 0;
    } else if (this.moving) {
      if (this.stillSince === 0) this.stillSince = now;
      else if (now - this.stillSince > STILL_MS) this.parked();
    }
    return this.moving;
  }

  parked(): void {
    this.moving = false;
    this.stillSince = 0;
  }
}
