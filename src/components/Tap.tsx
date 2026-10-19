/**
 * Tap sound and buzz (Tap.java): a short tick and a buzz on each tap of a box or dock button,
 * when the owner turns it on (tapFeedback). TapBox is the shared Box with that added to its taps.
 * Android's own tone generator plays on the system stream; expo-audio plays on the music stream
 * and asks for audio focus for a moment, so another app's music can dip during the tick.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import type { ComponentProps } from 'react';
import { Vibration } from 'react-native';

import type { Prefs } from '../logic/prefs';
import * as Tap from '../logic/tap';
import { usePrefs } from '../state/prefs';
import { Box } from './ui';

let player: AudioPlayer | null = null;
let broken = false;

function tick(): void {
  if (broken) return;
  try {
    if (!player) {
      const f = new File(Paths.cache, 'tap-tick.wav');
      if (!f.exists) {
        f.create();
        f.write(Tap.wav());
      }
      player = createAudioPlayer({ uri: f.uri });
      player.volume = Tap.VOLUME;
    }
    player.seekTo(0);
    player.play();
  } catch {
    broken = true; // no sound on this unit: the buzz is still there
  }
}

/** The tick and the buzz, when the owner wants them. */
export function feedback(p: Prefs | null | undefined): void {
  if (!Tap.on(p)) return;
  try {
    Vibration.vibrate(Tap.BUZZ_MS);
  } catch {
    // no vibrator
  }
  tick();
}

/** `fn` with the tap feedback first (for dock buttons and other Pressables). */
export function useTap(): <A extends unknown[]>(fn?: (...a: A) => void) => ((...a: A) => void) | undefined {
  const { prefs } = usePrefs();
  return (fn) =>
    fn
      ? (...a) => {
          feedback(prefs);
          fn(...a);
        }
      : undefined;
}

/** A dashboard Box whose tap gives the tick and buzz. */
export function TapBox(props: ComponentProps<typeof Box>) {
  const tap = useTap();
  return <Box {...props} onPress={tap(props.onPress)} />;
}
