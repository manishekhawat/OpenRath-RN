/**
 * The car documents wallet (Wallet.java): add a photo or PDF of each document from the gallery,
 * the camera or the files, keep a copy in the app's own folder, and show it full screen at a
 * check (tap for the next one) or share it.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Heading, Row, Screen } from '../components/ui';
import * as Features from '../logic/features';
import * as Wallet from '../logic/wallet';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

function folder(): Directory {
  const d = new Directory(Paths.document, Wallet.DIR);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** The file names in the documents folder. */
function names(): string[] {
  try {
    return folder()
      .list()
      .filter((f) => f instanceof File)
      .map((f) => f.name);
  } catch {
    return [];
  }
}

/** Keep a copy of a picked file as document i, in place of any earlier one. */
async function keep(i: number, uri: string, name: string | null | undefined, mime: string | null | undefined) {
  const dir = folder();
  const before = names();
  await new File(uri).copy(new File(dir, Wallet.fileName(i, Wallet.ext(name, mime), Date.now())));
  // then remove the earlier copies
  for (const n of before) if (Wallet.stored([n], i)) new File(dir, n).delete();
}

/** Open a PDF in the unit's PDF viewer, or the share sheet where there's none. */
async function openPdf(f: File) {
  if (Platform.OS === 'android') {
    try {
      // 1 = FLAG_GRANT_READ_URI_PERMISSION
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: f.contentUri, type: 'application/pdf', flags: 1 });
      return;
    } catch {
      // no viewer: share instead
    }
  }
  await share(f);
}

async function share(f: File) {
  if (!(await Sharing.isAvailableAsync())) return Alert.alert('Sharing is not available on this unit');
  await Sharing.shareAsync(f.uri, { mimeType: Wallet.mime(f.name), dialogTitle: f.name });
}

/** The documents full screen, starting at one; tap for the next, back to close. */
function Viewer({ files, start, onClose }: { files: { i: number; name: string }[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(Math.max(0, files.findIndex((f) => f.i === start)));
  const cur = files[at];
  const file = new File(folder(), cur.name);
  const next = () => (files.length < 2 ? onClose() : setAt((at + 1) % files.length));
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      <Pressable style={styles.viewer} onPress={next}>
        {Wallet.isPdf(cur.name) ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 22 }}>{Wallet.NAMES[cur.i]} is a PDF</Text>
            <Pressable onPress={() => openPdf(file)} style={styles.open}>
              <Text style={{ color: '#FFFFFF', fontSize: 18 }}>Open it</Text>
            </Pressable>
          </View>
        ) : (
          <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        )}
        <View style={styles.label}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>{Wallet.label(cur.i, at, files.length)}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.close} hitSlop={12} accessibilityLabel="Close">
          <Text style={{ color: '#FFFFFF', fontSize: 28 }}>×</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function WalletScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [, setTick] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [showing, setShowing] = useState<number | null>(null);
  const refresh = () => setTick((n) => n + 1);

  const have = Wallet.index(names());
  const files = have.flatMap((name, i) => (name ? [{ i, name }] : []));

  const done = (i: number) => {
    setEditing(null);
    refresh();
    Alert.alert(Wallet.NAMES[i] + ' saved');
  };
  const failed = (e: unknown) => Alert.alert("Couldn't use that file", String((e as Error)?.message ?? e));

  const fromGallery = async (i: number) => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      await keep(i, a.uri, a.fileName, a.mimeType);
      done(i);
    } catch (e) {
      failed(e);
    }
  };

  const fromCamera = async (i: number) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Allow the camera to photograph the document');
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (r.canceled || !r.assets[0]) return;
      await keep(i, r.assets[0].uri, 'photo.jpg', r.assets[0].mimeType);
      done(i);
    } catch (e) {
      failed(e);
    }
  };

  const fromFiles = async (i: number) => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      await keep(i, a.uri, a.name, a.mimeType);
      done(i);
    } catch (e) {
      failed(e);
    }
  };

  /** Several files at once, each taken by its name (rc, insurance, puc, licence). */
  const importMany = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: true });
      if (r.canceled) return;
      const got: string[] = [];
      for (const a of r.assets) {
        const i = Wallet.which(a.name, true);
        if (i < 0) continue;
        await keep(i, a.uri, a.name, a.mimeType);
        got.push(Wallet.NAMES[i]);
      }
      refresh();
      Alert.alert(Wallet.importText(got));
    } catch (e) {
      failed(e);
    }
  };

  const remove = (i: number) => {
    const n = have[i];
    if (n) new File(folder(), n).delete();
    setEditing(null);
    refresh();
    Alert.alert(Wallet.NAMES[i] + ' removed');
  };

  if (!Features.on(prefs, 'wallet')) {
    return (
      <Screen title="Car documents">
        <Text style={{ color: look.textDim }}>Turn on "Car documents wallet" in Settings &gt; Features.</Text>
      </Screen>
    );
  }

  return (
    <Screen title="Car documents">
      <Text style={{ color: look.textDim, marginBottom: 8 }}>
        Kept inside the app, so they show with no network, to show at a check. {Wallet.countText(names())}.
      </Text>
      {files.length > 0 ? <Button label="Show the documents" kind="primary" onPress={() => setShowing(files[0].i)} /> : null}
      <Heading>Documents</Heading>
      {Wallet.DOCS.map((_, i) => (
        <View key={i}>
          <Row
            name={Wallet.NAMES[i]}
            value={have[i] ? (Wallet.isPdf(have[i]) ? 'PDF' : 'Photo') : 'not added'}
            onPress={() => setEditing(editing === i ? null : i)}
          />
          {editing === i ? (
            <View style={{ marginVertical: 8 }}>
              {have[i] ? (
                <>
                  <Button label="Show" kind="primary" onPress={() => setShowing(i)} />
                  <Button label="Share" onPress={() => share(new File(folder(), have[i] as string)).catch(failed)} />
                </>
              ) : null}
              <Button label={have[i] ? 'Replace with a photo from the gallery' : 'Add a photo from the gallery'} onPress={() => fromGallery(i)} />
              <Button label="Take a photo" onPress={() => fromCamera(i)} />
              <Button label="Pick a file (photo or PDF)" onPress={() => fromFiles(i)} />
              {have[i] ? <Button label="Remove" kind="danger" onPress={() => remove(i)} /> : null}
            </View>
          ) : null}
        </View>
      ))}
      <Heading>Several at once</Heading>
      <Row name="Import by file name" value="Pick files named rc, insurance, puc or licence (.jpg, .png or .pdf)" onPress={importMany} />
      {showing != null && files.length > 0 ? <Viewer files={files} start={showing} onClose={() => setShowing(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', bottom: 16, alignSelf: 'center', backgroundColor: '#00000099', paddingHorizontal: 16, paddingVertical: 8 },
  close: { position: 'absolute', top: 12, right: 16, padding: 8 },
  open: { backgroundColor: '#2F6FD6', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 },
});
