/**
 * The car's voice with ducking (Speak.java's say and Duck.java): say() speaks in Indian English
 * like drive.tsx's say(), and tells the app's own player while it talks so the music dips
 * (feature 'duck', checked by the player). Spoken prompts stay English even in Hindi, as in the
 * Android version; with no voice on the unit it says so on screen, and getVoice() gets one. Other apps' music and the unit's radio don't dip:
 * that needs Android's audio focus from native code.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import * as Speech from 'expo-speech';
import { Alert, Platform, ToastAndroid } from 'react-native';

import * as Diag from '../logic/diag';
import { t } from '../logic/i18n';
import * as Sound from '../logic/sound';
import { Speaking } from '../logic/sound';

/** Said on screen when the stereo has no working voice (Speak.NO_VOICE, 1.32). */
export const NO_VOICE = 'The stereo has no spoken voice yet. Settings > Map and navigation > Spoken voice gets one in two taps.';
/** Said on screen when the unit has a voice, but none that reads English (Speak.NO_DATA, 1.44). */
export const NO_ENGLISH =
  "The voice engine has no English voice installed. Settings > Map and navigation > Spoken voice > Android's voice settings downloads one, or get eSpeak NG.";
export const GOOGLE_TTS = 'com.google.android.tts';
/** eSpeak NG isn't on the Play Store, so its own F-Droid page is where the APK is (1.44). */
export const ESPEAK = 'com.reecedunn.espeak';
export const ESPEAK_PAGE = 'https://f-droid.org/packages/' + ESPEAK + '/';
/** Android's "install the voice's data" screen, which downloads the English voice. */
const TTS_DATA = 'android.speech.tts.engine.INSTALL_TTS_DATA';

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

let toldAt = 0;

/** The no-voice notice, at most once a minute (Speak.tell). */
function tell(text: string) {
  const now = Date.now();
  if (now - toldAt < 60000) return;
  toldAt = now;
  if (Platform.OS === 'android') ToastAndroid.show(t(text), ToastAndroid.LONG);
  else Alert.alert(t(text));
}

let voices: boolean | null = null;
let voicesAt = 0;
/** The language the voices on this unit can read; "" until they have been listed (1.44). */
let lang = '';

/** Whether the unit has a text-to-speech voice; looked at again after a minute, as one may have been installed. */
export async function hasVoice(): Promise<boolean> {
  if (voices != null && (voices || Date.now() - voicesAt < 60000)) return voices;
  try {
    const have = await Speech.getAvailableVoicesAsync();
    voices = have.length > 0;
    // 1.44: Indian English, then any English, then the unit's own, and last a Hindi voice
    lang = Sound.voiceLanguage(have.map((v) => v.language ?? ''));
  } catch (e) {
    Diag.note('voice list', e);
    voices = true; // can't tell: try speaking
  }
  voicesAt = Date.now();
  return voices;
}

/** The language the car speaks in, for the tests and Diagnostics. */
export function voiceLanguage(): string {
  return lang;
}

/**
 * Get a voice (Speak.getVoice): Google's Speech Services from the Play Store when the unit has no
 * voice at all (Android doesn't let an app install another one by itself); a voice that doesn't
 * read English goes straight to Google's own voice download, because some stereos' Android voice
 * settings screen crashes (1.44); otherwise that settings screen, to pick the voice. Expo can't
 * list the installed engines, so "no voices" stands for "no Google engine".
 */
export async function getVoice() {
  voices = null;
  const any = await hasVoice();
  try {
    if (!any) {
      await Linking.openURL('market://details?id=' + GOOGLE_TTS).catch(() =>
        Linking.openURL('https://play.google.com/store/apps/details?id=' + GOOGLE_TTS),
      );
    } else if (Platform.OS === 'android' && !Sound.englishVoice(lang)) {
      // the English voice itself, from the engine that would download it
      await IntentLauncher.startActivityAsync(TTS_DATA, { packageName: GOOGLE_TTS }).catch(() =>
        IntentLauncher.startActivityAsync(TTS_DATA),
      );
    } else if (Platform.OS === 'android') {
      await IntentLauncher.startActivityAsync('com.android.settings.TTS_SETTINGS');
    }
  } catch (e) {
    Diag.note('voice settings', e);
    if (Platform.OS === 'android') IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.SETTINGS).catch(() => {});
  }
  voices = null;
}

/** eSpeak NG's F-Droid page: a small voice for stereos the Play Store can't reach (1.44). */
export async function getEspeak() {
  try {
    await Linking.openURL(ESPEAK_PAGE);
  } catch (e) {
    Diag.note('espeak page', e);
  }
}

/** Say something; the app's music dips until it is done. Options as expo-speech's speak(). */
export function say(text: string, options: Speech.SpeechOptions = {}) {
  if (!text || text.trim() === '') return;
  if (voices === false) {
    // no voice on the unit: say so on screen instead of staying silent, and look again later
    tell(NO_VOICE);
    hasVoice();
    return;
  }
  if (voices == null) hasVoice();
  // a unit with only a Hindi voice still reads English words: say what is missing, then speak
  if (lang !== '' && !Sound.englishVoice(lang)) tell(NO_ENGLISH);
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
    language: lang === '' ? 'en-IN' : lang,
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
      if (options.onError) options.onError(e);
      else tell("The voice couldn't read this aloud. Check the stereo's text-to-speech in Android Settings.");
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
