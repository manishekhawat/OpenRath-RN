/**
 * Videos for the video box (Videos.java). The picture shows only while GPS says the car is
 * stopped; the sound keeps going. The Android version listed every video on the unit and USB
 * sticks itself; here the system's file picker (expo-document-picker) chooses one, since walking
 * other folders needs storage access Expo doesn't give.
 */

/** Below this the GPS speed counts as standing still (Fixes.STILL_KMH). */
export const STILL_KMH = 2;

export const VIDEO_EXT = ['.mp4', '.mkv', '.webm', '.3gp', '.mov', '.avi', '.m4v', '.ts'];

export function isVideo(name: string): boolean {
  const n = name.toLowerCase();
  return VIDEO_EXT.some((e) => n.endsWith(e));
}

/** Whether the picture may show: a GPS fix in the last 10 seconds that says the car is standing still. */
export function parked(kmh: number, fixAgeMs: number): boolean {
  return fixAgeMs >= 0 && fixAgeMs < 10000 && kmh < STILL_KMH;
}

/** A picked file's name for the box, without its folder. */
export function name(uriOrName: string): string {
  let n = uriOrName;
  try {
    n = decodeURIComponent(n);
  } catch {
    // keep it as it is
  }
  const slash = Math.max(n.lastIndexOf('/'), n.lastIndexOf(':'));
  return slash >= 0 ? n.substring(slash + 1) : n;
}
