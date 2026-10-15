/**
 * Settings > Backup and restore (Backup.java): every setting, the fuel and toll logs, trip
 * history and the owner's own pictures, in a .zip in the same format as the Android version, so
 * a backup from either app restores in the other. Backups are kept in the app's documents
 * (backup/), shared with the share sheet, and restored from any file picked. With "Daily
 * automatic backup" on, dailyBackup() makes one a day (the last seven are kept).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Heading, Row, Screen } from '../../components/ui';
import * as Backup from '../../logic/backup';
import * as Features from '../../logic/features';
import type { Prefs } from '../../logic/prefs';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** The trip computer's keys in AsyncStorage (see src/state/drive.tsx). */
const TRIP_KEY = 'openrath:trip';
const HIST_KEY = 'openrath:history';

const dir = () => new Directory(Paths.document, 'backup');
const custom = () => new Directory(Paths.document, 'custom');

async function readJson<T>(key: string, def: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
}

/** Write a backup now; returns the file. */
export async function make(prefs: Prefs, kind: string): Promise<File> {
  const d = dir();
  d.create({ intermediates: true, idempotent: true });
  const now = new Date();
  const json = Backup.build(prefs, now.getTime(), { trip: await readJson(TRIP_KEY, null), history: await readJson(HIST_KEY, {}) });
  const pictures: Record<string, Uint8Array> = {};
  const c = custom();
  if (c.exists) for (const f of c.list()) if (f instanceof File && f.name.endsWith('.png')) pictures[f.name] = await f.bytes();
  const f = new File(d, Backup.fileName(kind, now));
  if (f.exists) f.delete();
  f.create();
  f.write(Backup.zip(json, pictures));
  for (const old of Backup.prune(found().map((x) => x.name), kind)) new File(d, old).delete();
  return f;
}

/** Once a day, when the dashboard opens ("Daily automatic backup" in Features). */
export async function dailyBackup(prefs: Prefs): Promise<void> {
  const now = new Date();
  if (!Features.on(prefs, 'backup') || !Backup.dueToday(prefs, now)) return;
  try {
    await make(prefs, 'auto');
    Backup.markDone(prefs, now);
  } catch {
    // try again tomorrow
  }
}

/** Backups here, newest first. */
function found(): File[] {
  try {
    const d = dir();
    if (!d.exists) return [];
    return d
      .list()
      .filter((f): f is File => f instanceof File && Backup.isBackupName(f.name))
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  } catch {
    return [];
  }
}

/** Put everything back from a backup's bytes. */
async function restore(prefs: Prefs, bytes: Uint8Array): Promise<number> {
  const o = Backup.unzip(bytes);
  const r = Backup.restore(prefs, o.json);
  if (r.drive) {
    await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(r.drive.trip));
    await AsyncStorage.setItem(HIST_KEY, JSON.stringify(r.drive.history));
  }
  const names = Object.keys(o.pictures);
  if (names.length > 0) {
    const c = custom();
    c.create({ intermediates: true, idempotent: true });
    for (const n of names) {
      const f = new File(c, n);
      if (f.exists) f.delete();
      f.create();
      f.write(o.pictures[n]);
    }
  }
  return r.settings;
}

function when(f: File): string {
  const t = f.modificationTime;
  return t ? new Date(t).toLocaleString() : '';
}

export default function BackupScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const files = found();
  const last = Number(prefs.str('backupLast', '0'));

  const share = async (f: File) => {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/zip', dialogTitle: f.name });
    else Alert.alert('Saved', f.uri);
  };

  const backUp = async () => {
    setBusy(true);
    try {
      const f = await make(prefs, 'manual');
      setRefresh((n) => n + 1);
      await share(f);
    } catch (e) {
      Alert.alert("Couldn't make the backup", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = (name: string, bytes: () => Promise<Uint8Array>) =>
    Alert.alert('Restore this backup?', `${name}\n\nEvery setting is replaced with the backup's.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: async () => {
          try {
            const n = await restore(prefs, await bytes());
            Alert.alert('Restored', `${n} settings are back. Close and reopen OpenRath to finish (the trip computer reloads then).`);
          } catch (e) {
            Alert.alert("Couldn't restore", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    confirmRestore(a.name, () => new File(a.uri).bytes());
  };

  return (
    <Screen title="Backup and restore">
      <Text style={{ color: look.textDim, marginBottom: 8 }}>
        Every setting, the fuel and toll logs, trip history and your own pictures, in a .zip that the Android version of OpenRath can restore too.
      </Text>
      <Button label={busy ? 'Making the backup…' : 'Back up now and share'} kind="primary" onPress={busy ? () => {} : backUp} />
      <Button label="Restore from a file…" onPress={pick} />
      <Row
        name="Daily automatic backup"
        value={
          Features.on(prefs, 'backup')
            ? 'On: once a day, the last seven are kept' + (last > 0 ? ` · last ${new Date(last).toLocaleDateString()}` : '')
            : 'Off'
        }
        right={<Text style={{ color: look.accent, fontSize: 18 }}>{Features.on(prefs, 'backup') ? '✓' : ''}</Text>}
        onPress={() => Features.set(prefs, 'backup', !Features.on(prefs, 'backup'))}
      />
      <Heading>Backups on this device</Heading>
      {files.length === 0 ? <Text style={{ color: look.textDim }}>None yet.</Text> : null}
      {files.map((f) => (
        <Row
          key={f.name}
          name={f.name}
          value={when(f) + ' · tap to share or restore'}
          onPress={() =>
            Alert.alert(f.name, undefined, [
              { text: 'Share', onPress: () => share(f) },
              { text: 'Restore', onPress: () => confirmRestore(f.name, () => f.bytes()) },
              { text: 'Close', style: 'cancel' },
            ])
          }
        />
      ))}
    </Screen>
  );
}
