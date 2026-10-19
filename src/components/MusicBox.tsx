/**
 * The music box on the dashboard (MediaCard in the Android version, for the app's own player):
 * what is playing, or why not, with big previous, play/pause and next buttons. The heading
 * switches between online radio and music files; a tap anywhere else opens the music page.
 * With 'seek' on, a bar under a song shows the time played and its length, and a drag along it
 * moves in the song (1.39). With 'projection' on and an app chosen, a CARPLAY / AUTO button
 * opens the phone-projection app (1.36).
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '../logic/i18n';
import * as Player from '../logic/player';
import { WEB, FILES } from '../logic/player';
import { useLook } from '../state/look';
import * as P from '../state/player';
import { usePrefs } from '../state/prefs';
import { Box, toast } from './ui';

/** Open the phone-projection app (Projection.open); false when there's none. */
export function openProjection(pkg: string): boolean {
  if (pkg === '') {
    toast('No phone projection app found; choose one in Settings, Radio and music', true);
    return false;
  }
  if (Platform.OS !== 'android') return false;
  try {
    IntentLauncher.openApplication(pkg);
    return true;
  } catch {
    toast("That app couldn't be opened", true);
    return false;
  }
}

export const MusicBox = memo(function MusicBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const { prefs } = usePrefs();
  const s = P.usePlayer();
  const mode = s.mode ?? FILES;
  const tr = P.current();

  let title: string;
  let sub: string;
  if (s.status !== '' && (s.busy || !s.playing)) {
    title = tr ? tr.name : t(Player.idle(mode).title);
    sub = t(s.status);
  } else if (tr) {
    title = tr.name;
    sub = s.busy ? t('Connecting…') : tr.sub !== '' ? t(tr.sub) : mode === WEB ? t('Online radio') : t('Music');
  } else {
    title = t(Player.idle(mode).title);
    sub = t(Player.idle(mode).sub);
  }

  const projection = mode === FILES ? Player.projectionApp(prefs) : '';

  const button = (label: string, onPress: () => void, name: string, main = false) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t(name)}
      style={[styles.btn, main && styles.main, { borderColor: main ? look.accent : look.edge, backgroundColor: main ? look.accent : 'transparent' }]}
    >
      <Text style={[styles.btnText, { color: main ? look.background : look.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Box style={style} onPress={() => router.push('/music')}>
      <View style={styles.top}>
        {/* the heading is the source switch, as in the Android version */}
        <Pressable onPress={() => P.setMode(mode === WEB ? FILES : WEB)} hitSlop={8} style={styles.headTap}>
          <Text style={[styles.head, { color: look.textDim }]}>{t(mode === WEB ? 'ONLINE RADIO' : 'MUSIC FILES')}  ▾</Text>
        </Pressable>
        {projection !== '' ? (
          <Pressable
            onPress={() => openProjection(projection)}
            hitSlop={6}
            accessibilityRole="button"
            style={[styles.pill, { borderColor: look.edge }]}
          >
            <Text style={[styles.pillText, { color: look.text }]}>{t('CARPLAY / AUTO')}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[styles.title, { color: look.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sub, { color: look.textDim }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {button('⏮︎', () => (s.mode ? P.prev() : P.play(mode)), 'Previous track or station')}
        {button(s.playing ? '❚❚' : '▶︎', () => P.toggle(mode), 'Play / pause', true)}
        {button('⏭︎', () => (s.mode ? P.next() : P.play(mode)), 'Next track or station')}
      </View>
      {Player.seekable(prefs, s.mode, s.duration) ? <SeekBar position={s.position} duration={s.duration} /> : null}
    </Box>
  );
});

/** A thin bar with the time played and the length; drag along it to move in the song (MediaCard.Progress). */
function SeekBar({ position, duration }: { position: number; duration: number }) {
  const look = useLook();
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(-1);
  const at = drag >= 0 ? drag : Math.min(position, duration);
  const share = duration > 0 ? at / duration : 0;
  const x = (e: GestureResponderEvent) => Player.seekTo(e.nativeEvent.locationX, width, duration);

  return (
    <View
      style={styles.seek}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      // the bar takes the touch, so a drag doesn't open the music page
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => setDrag(x(e))}
      onResponderMove={(e) => setDrag(x(e))}
      onResponderRelease={(e) => {
        P.seek(x(e));
        setDrag(-1);
      }}
      onResponderTerminate={() => setDrag(-1)}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: look.edge }]}>
        <View style={{ width: `${share * 100}%`, height: '100%', backgroundColor: look.accent }} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.knob, drag >= 0 && styles.knobBig, { left: share * width - (drag >= 0 ? 8 : 5), backgroundColor: look.accent }]}
      />
      <View pointerEvents="none" style={styles.times}>
        <Text style={[styles.time, { color: look.textDim }]}>{Player.clock(at)}</Text>
        <Text style={[styles.time, { color: look.textDim }]}>{Player.clock(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headTap: { alignSelf: 'flex-start' },
  head: { fontSize: 12, letterSpacing: 1.5, marginBottom: 6 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 2 },
  // big targets: they're pressed while driving
  btn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  main: { width: 60, height: 60, borderRadius: 30 },
  btnText: { fontSize: 20 },
  seek: { height: 30, marginTop: 8, justifyContent: 'flex-start' },
  track: { height: 3, marginTop: 8, borderRadius: 2, overflow: 'hidden' },
  knob: { position: 'absolute', top: 4.5, width: 10, height: 10, borderRadius: 5 },
  knobBig: { top: 1.5, width: 16, height: 16, borderRadius: 8 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontSize: 10 },
});
