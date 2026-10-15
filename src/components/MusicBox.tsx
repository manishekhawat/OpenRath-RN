/**
 * The music box on the dashboard (MediaCard in the Android version, for the app's own player):
 * what is playing, or why not, with big previous, play/pause and next buttons. The heading
 * switches between online radio and music files; a tap anywhere else opens the music page.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Player from '../logic/player';
import { WEB, FILES } from '../logic/player';
import { useLook } from '../state/look';
import * as P from '../state/player';
import { Box } from './ui';

export function MusicBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const s = P.usePlayer();
  const mode = s.mode ?? FILES;
  const t = P.current();

  let title: string;
  let sub: string;
  if (s.status !== '' && (s.busy || !s.playing)) {
    title = t ? t.name : Player.idle(mode).title;
    sub = s.status;
  } else if (t) {
    title = t.name;
    sub = s.busy ? 'Connecting…' : t.sub !== '' ? t.sub : mode === WEB ? 'Online radio' : 'Music';
  } else {
    ({ title, sub } = Player.idle(mode));
  }

  const button = (label: string, onPress: () => void, name: string, main = false) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={[styles.btn, main && styles.main, { borderColor: main ? look.accent : look.edge, backgroundColor: main ? look.accent : 'transparent' }]}
    >
      <Text style={[styles.btnText, { color: main ? look.background : look.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Box style={style} onPress={() => router.push('/music')}>
      {/* the heading is the source switch, as in the Android version */}
      <Pressable onPress={() => P.setMode(mode === WEB ? FILES : WEB)} hitSlop={8} style={styles.headTap}>
        <Text style={[styles.head, { color: look.textDim }]}>{mode === WEB ? 'ONLINE RADIO' : 'MUSIC FILES'}  ▾</Text>
      </Pressable>
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[styles.title, { color: look.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sub, { color: look.textDim }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {button('⏮\uFE0E', () => (s.mode ? P.prev() : P.play(mode)), 'Previous')}
        {button(s.playing ? '❚❚' : '▶\uFE0E', () => P.toggle(mode), s.playing ? 'Pause' : 'Play', true)}
        {button('⏭\uFE0E', () => (s.mode ? P.next() : P.play(mode)), 'Next')}
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  headTap: { alignSelf: 'flex-start' },
  head: { fontSize: 12, letterSpacing: 1.5, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 2 },
  // big targets: they're pressed while driving
  btn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  main: { width: 60, height: 60, borderRadius: 30 },
  btnText: { fontSize: 20 },
});
