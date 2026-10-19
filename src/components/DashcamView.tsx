/**
 * The dashcam's camera (the recording half of Dashcam.java): a small live box for the dashboard
 * that records one-minute clips while the dashcam is on and the car is moving, keeps the clip
 * before and the one being recorded on a jolt (harsh braking from the GPS, or a knock the
 * accelerometer feels), and takes the parking photo when the car parks. `full` is the dashcam
 * screen's big view, which records whenever it is open.
 *
 * expo-camera records only while its view is on screen, so this must stay mounted; it shows
 * nothing when there is nothing to record. Only one view uses the camera: the last one opened.
 * A tap opens the dashcam screen, a long press keeps the clip.
 */
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Dashcam from '../logic/dashcam';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Snap from '../logic/snap';
import * as Cam from '../state/camera';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { Box } from './ui';

const errorText = (e: unknown) => String((e as Error)?.message ?? e);

export function DashcamView({ full = false, style }: { full?: boolean; style?: StyleProp<ViewStyle> }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const cam = Cam.useCamera();
  const [perm, askPerm] = useCameraPermissions();
  const [mic] = useMicrophonePermissions();
  const on = Features.on(prefs, 'dashcam');
  const snapOn = Features.on(prefs, 'parking');

  // take a place among the camera users, on top
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    const i = Cam.claim();
    Cam.viewOpen(i, true);
    setId(i);
    return () => {
      Cam.viewOpen(i, false);
      Cam.release(i);
    };
  }, []);
  const mine = id != null && cam.owner === id;

  // moving or parked, and harsh braking, from each GPS fix
  const motion = useRef(new Dashcam.Motion());
  const brakes = useRef(new Dashcam.BrakeWatch());
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!trip.prevAt) return;
    setMoving(motion.current.feed(trip.kmh, trip.prevAt));
    if (brakes.current.feed(trip.kmh, trip.prevAt) && mine) Cam.protect(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.prevAt]);
  useEffect(() => {
    if (!cam.parkedAt) return;
    motion.current.parked();
    setMoving(false);
  }, [cam.parkedAt]);

  // a camera error: try again a minute later
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying) return;
    const t = setTimeout(() => setRetrying(false), Dashcam.RETRY_MS);
    return () => clearTimeout(t);
  }, [retrying]);

  const granted = perm?.granted === true;
  const wantRecord = on && granted && !cam.held && !retrying && (full || moving);
  const snapping = mine && cam.snap && snapOn && granted;
  const needCamera = mine && (wantRecord || snapping);
  const showCamera = needCamera && (cam.cameraIn == null || cam.cameraIn === id);
  const mode = snapping ? 'picture' : 'video';

  // the parking photo can't be taken by this view: let it go
  useEffect(() => {
    if (mine && cam.snap && !(snapOn && granted)) Cam.snapDone();
  }, [mine, cam.snap, snapOn, granted]);

  useEffect(() => {
    if (id == null || !showCamera) return;
    Cam.cameraOpen(id, true);
    return () => Cam.cameraOpen(id, false);
  }, [id, showCamera]);

  // each time the camera opens or changes mode it is a new view, ready once it says so
  const ref = useRef<CameraView>(null);
  const gen = useRef({ sig: '', n: 0 });
  const sig = showCamera ? mode : '';
  if (gen.current.sig !== sig) gen.current = { sig, n: gen.current.n + 1 };
  const thisGen = gen.current.n;
  const [readyGen, setReadyGen] = useState(0);
  const ready = showCamera && readyGen === thisGen;

  // the status line, while not recording
  useEffect(() => {
    if (!mine || cam.recording || retrying) return;
    Cam.setStatus(
      !on ? Dashcam.STATUS.off : perm && !granted ? Dashcam.STATUS.permission : cam.held ? Dashcam.STATUS.held : Dashcam.STATUS.waiting,
    );
  }, [mine, cam.recording, retrying, on, perm, granted, cam.held]);

  // record: one clip after another until told to stop
  const recordNow = showCamera && wantRecord && !snapping && ready;
  useEffect(() => {
    const camera = ref.current;
    if (!recordNow || !camera) return;
    let alive = true;
    (async () => {
      while (alive) {
        const name = Dashcam.clipName(Date.now());
        Cam.clipStarted(name);
        let r: { uri: string } | undefined;
        try {
          r = await camera.recordAsync({ maxDuration: Dashcam.CLIP_SECONDS, ...(Platform.OS === 'ios' ? { codec: 'avc1' as const } : {}) });
        } catch (e) {
          if (alive) {
            Cam.recordingEnded(Dashcam.STATUS.error(errorText(e)));
            setRetrying(true);
          }
          return;
        }
        Cam.clipDone(r?.uri, name, prefs);
        // stopped at once with nothing recorded: the camera is in trouble, so wait, don't spin
        if (alive && !r?.uri && Date.now() - Dashcam.clipTime(name) < 2000) {
          Cam.recordingEnded(Dashcam.STATUS.error('recording stopped at once'));
          setRetrying(true);
          return;
        }
      }
    })();
    return () => {
      alive = false;
      try {
        camera.stopRecording();
      } catch {
        // already stopped
      }
      Cam.recordingEnded(on ? Dashcam.STATUS.waiting : Dashcam.STATUS.off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordNow]);

  // a knock keeps the clip
  const g = Dashcam.joltG(prefs);
  useEffect(() => {
    if (!recordNow || g <= 0) return;
    const jolt = new Dashcam.JoltWatch();
    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      if (jolt.feed(x, y, z, Date.now(), g)) Cam.protect(prefs);
    });
    return () => sub.remove();
  }, [recordNow, g, prefs]);

  // the parking photo: let the exposure settle, then one picture
  useEffect(() => {
    if (!snapping || !showCamera || !ready || cam.recording) return;
    const t = setTimeout(async () => {
      try {
        const pic = await ref.current?.takePictureAsync({ quality: Snap.QUALITY, shutterSound: false });
        if (pic?.uri) Cam.storePhoto(pic.uri);
      } catch {
        // no photo this time
      }
      Cam.snapDone();
    }, Snap.SETTLE_MS);
    return () => clearTimeout(t);
  }, [snapping, showCamera, ready, cam.recording]);

  // "clip saved" for a few seconds after a long press
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 3000);
    return () => clearTimeout(t);
  }, [flash]);
  const keep = () => setFlash(Cam.protect(prefs));

  const allow = () => (perm?.canAskAgain === false ? Linking.openSettings() : askPerm());

  const camera = showCamera ? (
    <CameraView
      key={thisGen}
      ref={ref}
      style={StyleSheet.absoluteFill}
      facing={Dashcam.facing(prefs)}
      mode={mode}
      mute={!(Dashcam.sound(prefs) && mic?.granted)}
      videoQuality={Dashcam.QUALITY}
      videoBitrate={Dashcam.BITRATE}
      animateShutter={false}
      onCameraReady={() => setReadyGen(thisGen)}
      onMountError={(e) => {
        Cam.recordingEnded(Dashcam.STATUS.error(e.message));
        setRetrying(true);
      }}
    />
  ) : null;

  const label = snapping
    ? t('Parking photo…')
    : flash || (cam.recording ? (cam.status === Dashcam.STATUS.recording ? 'REC' : Dashcam.statusText(cam.status)) : Dashcam.statusText(cam.status));
  const overlay = (
    <View style={styles.overlay} pointerEvents="none">
      {cam.recording && !snapping ? <View style={styles.dot} /> : null}
      <Text style={styles.overlayText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (full) {
    return (
      <Pressable style={[styles.full, { borderRadius: look.radius }, style]} onLongPress={keep}>
        {camera}
        {!showCamera ? (
          <Pressable style={styles.center} onPress={on && !granted ? allow : undefined}>
            <Text style={{ color: '#FFFFFF', textAlign: 'center' }}>
              {!on
                ? t('Turn on the dashcam in Settings > Driving')
                : !granted
                  ? t('Tap to allow the camera')
                  : needCamera
                    ? t('Waiting for the camera…')
                    : mine
                      ? Dashcam.statusText(cam.status)
                      : t('The camera is in use on another screen')}
            </Text>
          </Pressable>
        ) : null}
        {showCamera ? overlay : null}
      </Pressable>
    );
  }

  // the dashboard box
  if (on && perm && !granted) {
    return (
      <Box title={t('DASHCAM')} style={style} onPress={allow}>
        <Text style={{ color: look.text }}>{t('needs camera permission: open Settings once to allow it')}</Text>
      </Box>
    );
  }
  if (!showCamera) return null;
  return (
    <Box title={snapping ? t('PARKING PHOTO') : t('DASHCAM')} style={[{ minHeight: 140 }, style]} onPress={() => router.push('/dashcam')} onLongPress={keep}>
      <View style={[styles.live, { borderRadius: Math.max(0, look.radius - 6) }]}>
        {camera}
        {overlay}
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  full: { backgroundColor: '#000000', overflow: 'hidden', aspectRatio: 16 / 9, width: '100%' },
  live: { flex: 1, minHeight: 100, backgroundColor: '#000000', overflow: 'hidden' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16 },
  overlay: { position: 'absolute', left: 8, bottom: 6, right: 8, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D', marginRight: 6 },
  overlayText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', textShadowColor: '#000000', textShadowRadius: 3 },
});
