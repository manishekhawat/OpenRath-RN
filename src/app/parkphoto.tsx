/**
 * The parking photo (Snap.java, shown by Chores.parkPhoto in the Android version): the latest
 * photo of where the car is parked, full width with when it was taken, and the one before; and a
 * camera to take one now. ?take=1 (from the question asked when the car parks) opens the camera
 * and takes the photo by itself once the exposure has settled.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Heading, Screen } from '../components/ui';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Snap from '../logic/snap';
import * as Cam from '../state/camera';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** The camera, while taking a photo: the only camera user on screen until it closes. */
function Shooter({ auto, onDone }: { auto: boolean; onDone: () => void }) {
  const cam = Cam.useCamera();
  const [id, setId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<CameraView>(null);

  useEffect(() => {
    const i = Cam.claim();
    setId(i);
    return () => Cam.release(i);
  }, []);
  const show = id != null && cam.owner === id && (cam.cameraIn == null || cam.cameraIn === id);
  useEffect(() => {
    if (id == null || !show) return;
    Cam.cameraOpen(id, true);
    return () => Cam.cameraOpen(id, false);
  }, [id, show]);

  const shoot = async () => {
    if (busy || !ref.current) return;
    setBusy(true);
    try {
      const pic = await ref.current.takePictureAsync({ quality: Snap.QUALITY });
      if (pic?.uri) Cam.storePhoto(pic.uri);
      onDone();
    } catch (e) {
      setBusy(false);
      Alert.alert(t("Couldn't take the photo"), String((e as Error)?.message ?? e));
    }
  };

  // ?take=1: let the exposure settle, then one picture
  useEffect(() => {
    if (!auto || !ready) return;
    const t = setTimeout(shoot, Snap.SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ready]);

  return (
    <View>
      <View style={styles.frame}>
        {show ? (
          <CameraView ref={ref} style={StyleSheet.absoluteFill} mode="picture" facing="back" onCameraReady={() => setReady(true)} />
        ) : (
          <Text style={{ color: '#FFFFFF', alignSelf: 'center' }}>{t('Waiting for the camera…')}</Text>
        )}
      </View>
      <Button label={t(busy ? 'Taking the photo…' : 'Take the photo')} kind="primary" onPress={shoot} />
      <Button label={t('Cancel')} onPress={onDone} />
    </View>
  );
}

export default function ParkPhotoScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const cam = Cam.useCamera();
  const { take } = useLocalSearchParams<{ take?: string }>();
  const [perm, askPerm] = useCameraPermissions();
  const [shooting, setShooting] = useState(false);
  const on = Features.on(prefs, 'parking');

  // read again whenever a photo is kept (cam.files)
  void cam.files;
  const latest = Cam.latestPhoto();
  const before = Cam.previousPhoto();

  const start = async () => {
    const p = perm?.granted ? perm : await askPerm();
    if (p.granted) setShooting(true);
    else if (!p.canAskAgain) Alert.alert(t('Allow the camera in the system settings'), undefined, [{ text: t('Cancel') }, { text: t('Open'), onPress: () => Linking.openSettings() }]);
  };

  useEffect(() => {
    if (take === '1' && perm) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take, perm != null]);

  const failed = (e: unknown) => Alert.alert(t("Couldn't do that"), String((e as Error)?.message ?? e));

  return (
    <Screen title={t('Parking photo')}>
      {!on ? <Text style={{ color: look.textDim, marginBottom: 8 }}>{t('Turn on "Parking" in Settings > Features to be asked when you park.')}</Text> : null}
      {shooting ? (
        <Shooter auto={take === '1'} onDone={() => setShooting(false)} />
      ) : latest ? (
        <>
          <Image source={{ uri: latest.uri }} style={styles.photo} resizeMode="contain" />
          <Text style={{ color: look.text, marginVertical: 8 }}>{Snap.takenText(latest.at)}</Text>
          <Button label={t('Take a new one')} kind="primary" onPress={start} />
          <Button label={t('Share')} onPress={() => Cam.share(latest.file, 'image/jpeg').catch(failed)} />
          <Button label={t('Save to the gallery')} onPress={() => Cam.toGallery(latest.file).then((m) => Alert.alert(m))} />
        </>
      ) : (
        <>
          <Text style={{ color: look.textDim, marginVertical: 8 }}>{Snap.noneText()}</Text>
          <Button label={t('Take one now')} kind="primary" onPress={start} />
        </>
      )}
      {!shooting && before ? (
        <>
          <Heading>{t('The one before')}</Heading>
          <Image source={{ uri: before.uri }} style={styles.small} resizeMode="contain" />
          <Text style={{ color: look.textDim, marginTop: 4 }}>{Snap.takenText(before.at)}</Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000000', justifyContent: 'center', overflow: 'hidden', borderRadius: 8, marginBottom: 8 },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000000', borderRadius: 8 },
  small: { width: '60%', aspectRatio: 4 / 3, backgroundColor: '#000000', borderRadius: 8 },
});
