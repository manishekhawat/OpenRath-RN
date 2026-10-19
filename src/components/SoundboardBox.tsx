/**
 * The soundboard box (Cards.SoundCard and Soundboard.play, 1.36): six pads of fun sounds, made by
 * the app itself (logic/soundboard.ts) and written once as WAV files in the cache, then played
 * with expo-audio. They play only when the car is stopped; while it moves the pads dim and say so.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Soundboard from '../logic/soundboard';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { Box, toast } from './ui';

let playing: AudioPlayer | null = null;

/** The pad's sound as a file, made the first time it is needed. */
function soundFile(pad: number): File {
  const f = new File(Paths.cache, `soundboard-${pad}.wav`);
  if (!f.exists) {
    f.create({ overwrite: true });
    f.write(Soundboard.wav(Soundboard.make(pad)));
  }
  return f;
}

/** Plays pad i; false (with a note) while the car moves. */
export function playPad(pad: number, kmh: number): boolean {
  if (!Soundboard.canPlay(kmh)) {
    toast('The soundboard plays only when the car is stopped');
    return false;
  }
  try {
    if (playing) playing.remove();
    playing = createAudioPlayer({ uri: soundFile(pad).uri });
    playing.play();
    return true;
  } catch {
    playing = null;
    return false;
  }
}

export function SoundboardBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const { prefs } = usePrefs();
  const kmh = useDrive().trip.kmh;
  const moving = !Soundboard.canPlay(kmh);

  const tap = (pad: number) => {
    if (!Features.on(prefs, 'soundboard')) {
      toast('Turn on Soundboard in Settings, Radio and music', true);
      return;
    }
    playPad(pad, kmh);
  };

  const rows = [Soundboard.PADS.slice(0, 3), Soundboard.PADS.slice(3)];
  return (
    <Box style={style} title="SOUNDBOARD">
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((name, i) => (
              <Pressable
                key={name}
                onPress={() => tap(r * 3 + i)}
                accessibilityRole="button"
                style={[styles.pad, { borderColor: look.edge, opacity: moving ? 0.4 : 1 }]}
              >
                <Text numberOfLines={1} style={[styles.padText, { color: look.text }]}>
                  {t(name)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <Text numberOfLines={1} style={[styles.note, { color: look.textDim }]}>
        {moving ? t('Plays when the car is stopped') : ''}
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  pad: { flex: 1, minHeight: 44, borderWidth: 1.5, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  padText: { fontSize: 13 },
  note: { fontSize: 10, textAlign: 'center', marginTop: 6 },
});
