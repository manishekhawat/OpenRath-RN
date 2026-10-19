/**
 * The video window (Cards.VideoCard, 1.38): a video from the unit or a USB stick, in a box. The
 * picture shows only while GPS says the car is stopped (a fix in the last 10 seconds under
 * 2 km/h); while moving it is covered and the sound keeps going. Android listed the videos
 * itself; here the system's file picker chooses one (Videos.ts says why).
 */
import * as DocumentPicker from 'expo-document-picker';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Videos from '../logic/videos';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { Box, toast } from './ui';

export function VideoBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const { prefs } = usePrefs();
  const { trip } = useDrive();
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [, setNow] = useState(0);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // the fix grows old without a new one: look again every few seconds
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (status === 'error' && path != null) {
      setPath(null);
      setError(true);
    }
  }, [status, path]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setPath(null));
    return () => sub.remove();
  }, [player]);

  const fixAge = trip.last ? Date.now() - trip.last.t : -1;
  const parked = Videos.parked(trip.kmh, fixAge);
  const show = path != null && parked;

  const tapped = async () => {
    if (!Features.on(prefs, 'video')) {
      toast('Turn on Video window in Settings, Radio and music', true);
      return;
    }
    if (path != null) {
      if (player.playing) player.pause();
      else player.play();
      return;
    }
    const r = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: false });
    if (r.canceled || r.assets.length === 0) return;
    const a = r.assets[0];
    if (a.mimeType ? !a.mimeType.startsWith('video/') : !Videos.isVideo(a.name ?? a.uri)) {
      toast('No videos found on the unit or USB stick', true);
      return;
    }
    setError(false);
    setPath(a.uri);
    player.replace({ uri: a.uri, metadata: { title: Videos.name(a.name ?? a.uri) } });
    player.play();
  };

  const note = error
    ? "This video can't be played on this unit"
    : path == null
      ? 'Tap to play a video. The picture shows only when the car is stopped.'
      : 'The picture shows when the car is stopped';

  return (
    <Box style={[styles.box, style]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" />
      <Pressable onPress={tapped} style={[StyleSheet.absoluteFill, styles.tap]}>
        {show ? null : (
          <View style={[StyleSheet.absoluteFill, styles.cover]}>
            <Text style={[styles.note, { color: look.textDim }]}>{t(note)}</Text>
          </View>
        )}
      </Pressable>
    </Box>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', minHeight: 134, padding: 0 },
  tap: { alignItems: 'stretch' },
  cover: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  note: { fontSize: 13, textAlign: 'center' },
});
