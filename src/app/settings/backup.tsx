/**
 * Settings > Backup and restore (Backup.java): every setting, the fuel and toll logs, trip
 * history and the owner's own pictures, in a .zip in the same format as the Android version, so
 * a backup from either app restores in the other. Backups are kept in the app's documents
 * (backup/), shared with the share sheet, and restored from any file picked. With "Daily
 * automatic backup" on, dailyBackup() makes one a day (the last seven are kept). Before a
 * restore, a copy of what is here now is saved ("before-restore"), as in the Android version.
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
import { f, t } from '../../logic/i18n';
import type { Prefs } from '../../logic/prefs';
import * as Engine from '../../state/engine';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** The trip computer's keys in AsyncStorage (see src/state/drive.tsx). */
const TRIP_KEY = 'openrath:trip';
const HIST_KEY = 'openrath:history';

const dir = () => new Directory(Paths.document, 'backup');
const custom = () => new Directory(Paths.document, 'custom');

/**
 * A backup is the settings and the owner's own pictures, so a few megabytes; a file much bigger
 * than that isn't one, and is turned down before anything is unpacked. The pictures it carries
 * are capped as well, so a picked file can't fill the unit up.
 */
const MAX_ZIP = 16 * 1024 * 1024;
const MAX_PICTURES = 40;
const TOO_BIG = 'that file is too big to be a backup';

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

/** Put everything back from a backup already unpacked (once, by the caller). */
async function restore(prefs: Prefs, o: Backup.Opened): Promise<number> {
  const r = Backup.restore(prefs, o.json);
  if (r.drive) {
    await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(r.drive.trip));
    await AsyncStorage.setItem(HIST_KEY, JSON.stringify(r.drive.history));
    // the drive service keeps running, so it takes the restored trip now rather than overwriting it
    await Engine.reloadTrip();
  }
  const names = Object.keys(o.pictures).slice(0, MAX_PICTURES);
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

  const share = async (file: File) => {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: file.name });
    else Alert.alert(f('Saved %1$s', file.uri));
  };

  const backUp = async () => {
    setBusy(true);
    try {
      const file = await make(prefs, 'manual');
      setRefresh((n) => n + 1);
      await share(file);
    } catch (e) {
      Alert.alert(f("Couldn't back up: %1$s", e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = (name: string, bytes: () => Promise<Uint8Array>) =>
    Alert.alert(name, t("Replace every setting, the fuel log and trip history with this backup? A copy of what's here now is saved first."), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Restore'),
        style: 'destructive',
        onPress: async () => {
          try {
            const b = await bytes();
            if (b.length > MAX_ZIP) throw new Error(t(TOO_BIG));
            // unpacked once, which also says "not an OpenRath backup" before a copy of what's here is made
            const o = Backup.unzip(b);
            await make(prefs, 'before-restore');
            const n = await restore(prefs, o);
            setRefresh((k) => k + 1);
            Alert.alert(t('Restored'), f('%1$s settings are back.', n));
          } catch (e) {
            Alert.alert(f("Couldn't restore: %1$s", e instanceof Error ? e.message : String(e)));
          }
        },
      },
    ]);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    // asked before the whole file is read, so a huge one isn't loaded to be turned down after
    if ((a.size ?? new File(a.uri).size ?? 0) > MAX_ZIP) return Alert.alert(f("Couldn't restore: %1$s", t(TOO_BIG)));
    confirmRestore(a.name, () => new File(a.uri).bytes());
  };

  return (
    <Screen title="Backup and restore">
      <Text style={{ color: look.textDim, marginBottom: 8 }}>
        {t('Every setting, the fuel and toll logs, trip history and your own pictures, in a .zip that the Android version of OpenRath can restore too.')}
      </Text>
      <Button label={t(busy ? 'Making the backup…' : 'Back up now and share')} kind="primary" onPress={busy ? () => {} : backUp} />
      <Button label="Restore from a backup" onPress={pick} />
      <Row
        name="Daily automatic backup"
        value={Features.on(prefs, 'backup') ? (last > 0 ? f('on; last %1$s', new Date(last).toLocaleDateString()) : t('on; none yet')) : t('off')}
        split
        onPress={() => Features.set(prefs, 'backup', !Features.on(prefs, 'backup'))}
      />
      <Heading>Backups on this device</Heading>
      {files.length === 0 ? <Text style={{ color: look.textDim }}>{t('None yet.')}</Text> : null}
      {files.map((f) => (
        <Row
          key={f.name}
          name={f.name}
          value={when(f) + ' · ' + t('tap to share or restore')}
          onPress={() =>
            Alert.alert(f.name, undefined, [
              { text: t('Share'), onPress: () => share(f) },
              { text: t('Restore'), onPress: () => confirmRestore(f.name, () => f.bytes()) },
              { text: t('Close'), style: 'cancel' },
            ])
          }
        />
      ))}
    </Screen>
  );
}
