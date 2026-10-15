/**
 * The car's voice with ducking (Speak.java's say and Duck.java): say() speaks in Indian English
 * like drive.tsx's say(), and tells the app's own player while it talks so the music dips
 * (feature 'duck', checked by the player). Other apps' music and the unit's radio don't dip:
 * that needs Android's audio focus from native code.
 */
import * as Speech from 'expo-speech';

import { Speaking } from '../logic/sound';

const speaking = new Speaking();
const listeners = new Set<(on: boolean) => void>();
let watch: ReturnType<typeof setInterval> | null = null;

function changed() {
  for (const l of listeners) l(speaking.on);
  // a lost callback mustn't leave the music down: check the engine while ducked
  if (speaking.on && !watch) {
    watch = setInterval(() => {
      Speech.isSpeakingAsync().then(
        (on) => {
          if (!on && speaking.on) {
            speaking.count = 0;
            changed();
          }
        },
        () => {},
      );
    }, 3000);
  } else if (!speaking.on && watch) {
    clearInterval(watch);
    watch = null;
  }
}

/** Called with true when the car starts talking and false when it is done. */
export function onSpeaking(l: (on: boolean) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** True while something is being said. */
export function isSpeaking(): boolean {
  return speaking.on;
}

/** Say something; the app's music dips until it is done. Options as expo-speech's speak(). */
export function say(text: string, options: Speech.SpeechOptions = {}) {
  if (!text || text.trim() === '') return;
  let started = false;
  let ended = false;
  const begin = () => {
    if (started) return;
    started = true;
    if (speaking.start()) changed();
  };
  const end = () => {
    if (!started || ended) return;
    ended = true;
    if (speaking.end()) changed();
  };
  Speech.speak(text, {
    language: 'en-IN',
    ...options,
    onStart: () => {
      begin();
      options.onStart?.();
    },
    onDone: () => {
      end();
      options.onDone?.();
    },
    onStopped: () => {
      end();
      options.onStopped?.();
    },
    onError: (e) => {
      end();
      options.onError?.(e);
    },
  });
}

/** Stop talking now (the news box's Stop); the music comes back up. */
export function stop() {
  Speech.stop().catch(() => {});
  if (speaking.on) {
    speaking.count = 0;
    changed();
  }
}
