/**
 * The setup screens' steps (Setup.java, 1.42): language, permissions (and a backup to bring
 * back), the car, the look, how much OpenRath shows, the apps, then the phone and the home app.
 * Every step can be skipped; Back goes a step back; the step is remembered in 'setupStep'.
 */
export const WELCOME = 0;
export const ACCESS = 1;
export const CAR = 2;
export const LOOK = 3;
export const LEVEL = 4;
export const APPS = 5;
export const FINISH = 6;
export const STEPS = ['Welcome', 'Permissions', 'Your car', 'Look', 'How much', 'Apps', 'Phone and home'];

/** Whether to show it: switched on, not finished, and either under way or a fresh install. */
export function needed(on: boolean, done: boolean, started: boolean, carReady: boolean, levelPicked: boolean): boolean {
  if (!on || done) return false;
  return started || (!carReady && !levelPicked);
}

/** The step after `step`; How much is left out when the level is locked (a fleet's, in the Android app). */
export function next(step: number, levelLocked: boolean): number {
  let n = step + 1;
  if (n === LEVEL && levelLocked) n++;
  return Math.min(n, FINISH);
}

export function back(step: number, levelLocked: boolean): number {
  let n = step - 1;
  if (n === LEVEL && levelLocked) n--;
  return Math.max(n, WELCOME);
}

/** What a permission is for, as the group shown on the permissions step. */
export function kind(perm: string): string {
  if (perm.includes('LOCATION')) return 'location';
  if (perm.includes('STORAGE') || perm.includes('MEDIA')) return 'files';
  if (perm.includes('BLUETOOTH')) return 'bluetooth';
  if (perm.includes('NOTIFICATIONS')) return 'notifications';
  return 'phone';
}

export const KINDS: [string, string, string][] = [
  ['location', 'Location', 'Your speed, the map, speed-camera alerts and trip records. It stays on the unit.'],
  ['files', 'Music and photos', 'Music from a USB stick, and your own pictures for the car and backgrounds.'],
  ['bluetooth', 'Nearby devices', "Your phone's calls over Bluetooth, and OBD or tyre sensors if you have them."],
  ['phone', 'Phone and calls', 'Shows who is calling, and lets you answer and call back from the home screen.'],
  ['notifications', 'Notifications', 'Reminders such as a break after long driving.'],
];

/** The apps step: the pref key ('app:' + key holds the package), its name and what it is for. */
export const APP_KEYS: [string, string, string][] = [
  ['media:radio', 'Radio', "FM and AM, from the stereo's radio app"],
  ['media:music', 'Music', 'Songs from USB, Bluetooth or a streaming app'],
  ['dock:navi', 'Navigation', 'Opens from the dock and from saved places'],
  ['dock:phone', 'Phone', 'Calls and contacts'],
];

/** Keys set when setup is finished or skipped, so the start-up questions it covered aren't asked again. */
export const DONE_KEYS = ['setupDone', 'carSetup', 'permsExplained', 'restoreAsked', 'askedVoice', 'askedAllFiles'];
