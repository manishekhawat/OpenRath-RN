/**
 * Routes driven, on the device (the file side of Tracks.java): one small CSV per day in the app's
 * own documents folder (kept 60 days, never sent anywhere), turned into GPX and handed to the
 * share sheet on request, for Google Earth, OsmAnd or Strava.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import * as Tracks from '../logic/tracks';

function dir(): Directory {
  return new Directory(Paths.document, 'tracks');
}

function dayFile(day: string): File {
  return new File(dir(), day + '.csv');
}

/** Adds one point's line to the day's file. Errors are swallowed: a lost point doesn't matter. */
export function append(t: number, line: string): void {
  try {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const f = new File(d, Tracks.fileName(t));
    if (!f.exists) f.create();
    f.write(line, { append: true });
  } catch {
    // storage full or unavailable
  }
}

/** Days with a recorded route, newest first. */
export function days(): string[] {
  try {
    const d = dir();
    if (!d.exists) return [];
    return Tracks.days(d.list().filter((x) => x instanceof File).map((x) => x.name));
  } catch {
    return [];
  }
}

/** Deletes all but the newest 60 days. */
export function prune(): void {
  for (const day of Tracks.toPrune(days())) {
    try {
      dayFile(day).delete();
    } catch {
      // already gone
    }
  }
}

export function deleteAll(): void {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // nothing to delete
  }
}

/** A day's points, or none when the file is missing. */
export async function points(day: string): Promise<Tracks.Point[]> {
  try {
    const f = dayFile(day);
    return f.exists ? Tracks.parse(await f.text()) : [];
  } catch {
    return [];
  }
}

/** Writes the day as GPX (documents/gpx/openrath-<day>.gpx) and returns the file. */
export async function exportGpx(day: string): Promise<File> {
  const csv = await dayFile(day).text();
  const out = new Directory(Paths.document, 'gpx');
  if (!out.exists) out.create({ intermediates: true, idempotent: true });
  const f = new File(out, Tracks.gpxName(day));
  if (f.exists) f.delete();
  f.create();
  f.write(Tracks.gpx(day, csv));
  return f;
}

/** Exports the day and opens the share sheet; throws with a message when it can't. */
export async function shareGpx(day: string): Promise<void> {
  const f = await exportGpx(day);
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing is not available on this device; saved as ' + f.uri);
  await Sharing.shareAsync(f.uri, { mimeType: 'application/gpx+xml', dialogTitle: 'Drives on ' + day, UTI: 'com.topografix.gpx' });
}
