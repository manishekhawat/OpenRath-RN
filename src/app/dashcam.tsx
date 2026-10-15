/**
 * The dashcam screen (Settings > Dashcam in the Android version, with a live view): the camera
 * full width, recording while this screen is open; Start and Stop; "Save the clip now"; the
 * settings Dashcam.java offered (camera, space for recordings) and the new ones (sound, how hard
 * a knock keeps a clip); and the kept and recent clips, each to play in the unit's video player
 * (or the share sheet where there's none: no player is built in), share, keep, save to the
 * gallery or delete.
 */
import { useMicrophonePermissions } from 'expo-camera';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { DashcamView } from '../components/DashcamView';
import { Button, Choice, Heading, Row, Screen } from '../components/ui';
import * as Dashcam from '../logic/dashcam';
import * as Features from '../logic/features';
import * as Cam from '../state/camera';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** Recent clips shown before "Show all". */
const SHOW = 20;

function ClipRow({ clip, open, onToggle }: { clip: Cam.Clip; open: boolean; onToggle: () => void }) {
  const failed = (e: unknown) => Alert.alert("Couldn't do that", String((e as Error)?.message ?? e));
  const remove = () =>
    Alert.alert('Delete this clip?', Dashcam.clipLabel(clip.name), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            Cam.deleteClip(clip);
          } catch (e) {
            failed(e);
          }
        },
      },
    ]);
  return (
    <View>
      <Row name={Dashcam.clipLabel(clip.name)} value={Dashcam.sizeText(clip.size) + (clip.saved ? ' · kept' : '')} onPress={onToggle} />
      {open ? (
        <View style={{ marginVertical: 8 }}>
          <Button label="Play" kind="primary" onPress={() => Cam.play(clip.file).catch(failed)} />
          <Button label="Share" onPress={() => Cam.share(clip.file).catch(failed)} />
          {!clip.saved ? (
            <Button
              label="Keep (never deleted automatically)"
              onPress={() => {
                try {
                  Cam.keepClip(clip);
                } catch (e) {
                  failed(e);
                }
              }}
            />
          ) : null}
          <Button label="Save to the gallery" onPress={() => Cam.toGallery(clip.file).then((m) => Alert.alert(m))} />
          <Button label="Delete" kind="danger" onPress={remove} />
        </View>
      ) : null}
    </View>
  );
}

export default function DashcamScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const cam = Cam.useCamera();
  const [, askMic] = useMicrophonePermissions();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const on = Features.on(prefs, 'dashcam');

  // read again whenever clips change (cam.files)
  const { saved, loop } = Cam.clips();
  void cam.files;

  const setSound = async (v: 'on' | 'off') => {
    if (v === 'on') {
      const p = await askMic();
      if (!p.granted) return Alert.alert('Allow the microphone to record sound with the clips');
    }
    prefs.put('dashcamSound', v);
  };

  const list = (clips: Cam.Clip[]) =>
    clips.map((c) => <ClipRow key={c.file.uri} clip={c} open={open === c.file.uri} onToggle={() => setOpen(open === c.file.uri ? null : c.file.uri)} />);

  return (
    <Screen title="Dashcam">
      <DashcamView full />
      <Text style={{ color: look.textDim, marginVertical: 8 }}>{Dashcam.rowText(prefs, cam.status)}</Text>
      {on ? (
        <>
          {cam.held ? (
            <Button label="Start" kind="primary" onPress={() => Cam.hold(false)} />
          ) : (
            <Button label="Stop" onPress={() => Cam.hold(true)} />
          )}
          <Button label="Save the clip now" kind="primary" onPress={() => Alert.alert(Cam.protect(prefs))} />
        </>
      ) : (
        <Text style={{ color: look.textDim }}>Turn on "Dashcam" in Settings &gt; Features to record.</Text>
      )}

      <Heading>Settings</Heading>
      <Row name="Camera" value="the device's own camera (a USB dashcam needs native code)" />
      <Choice
        options={[
          { id: 'back', label: 'Back' },
          { id: 'front', label: 'Front' },
        ]}
        value={Dashcam.facing(prefs)}
        onChange={(v) => prefs.put('dashcamFacing', v)}
      />
      <Row name="Sound" value={Dashcam.sound(prefs) ? 'recorded with the clips' : 'off: no sound in the clips'} />
      <Choice
        options={[
          { id: 'off', label: 'Off' },
          { id: 'on', label: 'On' },
        ]}
        value={Dashcam.sound(prefs) ? 'on' : 'off'}
        onChange={setSound}
      />
      <Row name="Space for recordings" value={Dashcam.spaceText(prefs)} onPress={() => Dashcam.nextSpace(prefs)} />
      <Row name="Jolt that keeps the clip" value={Dashcam.joltText(prefs) + '; harsh braking always does'} />
      <Choice options={Dashcam.JOLT_CHOICES} value={String(Math.round(Dashcam.joltG(prefs) * 10))} onChange={(v) => prefs.put('dashcamJolt', v)} />
      <Text style={{ color: look.textDim, marginTop: 4 }}>
        Records one-minute clips while the dashboard or this screen is showing and the car is moving (this screen: always). A jolt
        keeps the clip before and the one being recorded; a long press on the camera does too.
      </Text>

      <Heading>Kept clips</Heading>
      <Row name="Save the clip now" value={Dashcam.savedText(saved.length)} onPress={() => Alert.alert(Cam.protect(prefs))} />
      {saved.length ? list(saved) : <Text style={{ color: look.textDim, marginVertical: 8 }}>None yet.</Text>}

      <Heading>Recent clips</Heading>
      {loop.length ? (
        <>
          {list(all ? loop : loop.slice(0, SHOW))}
          {!all && loop.length > SHOW ? <Button label={`Show all ${loop.length}`} onPress={() => setAll(true)} /> : null}
        </>
      ) : (
        <Text style={{ color: look.textDim, marginVertical: 8 }}>None yet.</Text>
      )}
    </Screen>
  );
}
