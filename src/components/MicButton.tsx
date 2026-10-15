/**
 * Voice commands (HomeActivity.voiceSearch, heard and run in the Android version): the mic
 * button opens Android's speech recogniser, Voice.parse turns what was heard into a command,
 * and this file acts on it: FM, calls to favourites, the map's home, office, petrol pump and
 * rest stops, the news, documents, games, cab tools, the 360 view. Anything that isn't a command
 * is searched for on the map. The map page's own mic uses listen() and runVoice() too.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { Alert, Platform, Pressable, StyleSheet, ToastAndroid, type StyleProp, type ViewStyle } from 'react-native';

import * as Air from '../logic/air';
import * as Features from '../logic/features';
import type { Prefs } from '../logic/prefs';
import * as Voice from '../logic/voice';
import * as Cam from '../state/camera';
import { say } from '../state/drive';
import * as Engine from '../state/engine';
import * as Music from '../state/player';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

export interface VoiceCtx {
  prefs: Prefs;
  /** Run a function of the map page (e.g. "goFav('Home')") when the map is the page on screen. */
  mapJs?: (code: string) => void;
  /** Hand what was heard to the map page's search box (null: nothing heard). */
  voiceResult?: (heard: string | null) => void;
  /** The air quality index now, -1 when not known. */
  aqi?: number;
}

/** A short message at the bottom of the screen (Android's Toast). */
export function toast(text: string, long = false) {
  if (Platform.OS === 'android') ToastAndroid.show(text, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert(text);
}

/**
 * Listen once with Android's speech recogniser: up to five guesses, best first, or null when
 * nothing was heard (or there is no recogniser). Hindi and English both, by Settings' 'voiceLang'.
 */
export async function listen(prefs: Prefs): Promise<string[] | null> {
  if (Platform.OS !== 'android') {
    toast('Voice commands work on Android only');
    return null;
  }
  const commands = Features.on(prefs, 'voice');
  const lang = prefs.str('voiceLang', 'en-IN');
  try {
    const r = await IntentLauncher.startActivityAsync('android.speech.action.RECOGNIZE_SPEECH', {
      extra: {
        'android.speech.extra.LANGUAGE_MODEL': 'free_form',
        'android.speech.extra.PROMPT': commands ? 'Say a command or a place' : 'Where to?',
        'android.speech.extra.LANGUAGE': lang,
        'android.speech.extra.LANGUAGE_PREFERENCE': lang,
        'android.speech.extra.MAX_RESULTS': 5,
        // EXTRA_ADDITIONAL_LANGUAGES and PREFER_OFFLINE are left out: the intent launcher can't
        // pass a String[], and whether the unit is online isn't known here
      },
    });
    if (r.resultCode !== IntentLauncher.ResultCode.Success) return null;
    const said = (r.extra as Record<string, unknown> | undefined)?.['android.speech.extra.RESULTS'];
    return Array.isArray(said) ? said.map(String).filter((s) => s.trim() !== '') : null;
  } catch {
    toast('Voice needs the Google app on the unit', true);
    return null;
  }
}

/**
 * Act on what was heard (HomeActivity.heard): a command (FM, call, music, volume, places), else
 * a map search. With voice commands switched off, everything is a search.
 */
export function heard(said: string[] | null, ctx: VoiceCtx) {
  if (!said || said.length === 0) {
    ctx.voiceResult?.(null);
    return;
  }
  const cmd = Features.on(ctx.prefs, 'voice') ? Voice.pick(said) : null;
  if (cmd == null || cmd.kind === 'search') {
    const q = cmd == null ? said[0] : cmd.arg;
    if (ctx.voiceResult) ctx.voiceResult(q);
    else go({ pathname: '/map', params: { q } });
    return;
  }
  ctx.voiceResult?.(null);
  run(cmd, ctx);
}

/** Do what a spoken (or typed) sentence asks, as if it had come from the recogniser. */
export function runVoice(text: string | string[], ctx: VoiceCtx) {
  heard(Array.isArray(text) ? text : [text], ctx);
}

const go = (href: Href) => router.push(href);

/** Open the app chosen for a key ('app:<key>', as Prefs.app), or say how to choose one. */
function openApp(prefs: Prefs, key: string, name: string): boolean {
  const pkg = prefs.str('app:' + key, key === 'dock:navi' ? 'com.google.android.apps.maps' : '');
  if (pkg !== '' && Platform.OS === 'android') {
    try {
      IntentLauncher.openApplication(pkg);
      return true;
    } catch {
      // not installed any more: choose again
    }
  }
  toast('Choose the app for ' + name + ' in Apps', true);
  return false;
}

/** Feature on (Cab's own switches need the Cab tools on too, as Cab.on). */
const cabOn = (p: Prefs, id: string) => Features.on(p, 'cab') && Features.on(p, id);

/** The favourites from Settings > Phone and messages: 'fav1'..'fav3' as "name|number". */
function fav(p: Prefs, i: number): [string, string] | null {
  const v = p.str('fav' + (i + 1), '');
  const bar = v.indexOf('|');
  if (bar <= 0 || bar === v.length - 1) return null;
  return [v.substring(0, bar), v.substring(bar + 1)];
}

/** Carry out one command (HomeActivity.run). */
export function run(cmd: Voice.Command, ctx: VoiceCtx) {
  const p = ctx.prefs;
  const k = cmd.kind;
  switch (k) {
    case 'fm': {
      // the stereo's FM chip needs the maker's services (not in this version): the radio app plays it
      if (cmd.arg !== '') p.put('fmFreq', cmd.arg);
      if (openApp(p, 'media:radio', 'Radio')) toast('FM ' + (cmd.arg === '' ? 'radio' : cmd.arg));
      return;
    }
    case 'call': {
      let num = Voice.number(cmd.arg);
      let who = cmd.arg;
      if (num === '') {
        for (let i = 0; i < 3; i++) {
          const f = fav(p, i);
          if (f != null && Voice.sameName(f[0], cmd.arg)) {
            num = f[1];
            who = f[0];
            break;
          }
        }
      }
      if (num === '') {
        say("I couldn't find " + cmd.arg + ' in your favourites');
        toast('No favourite called "' + cmd.arg + '". Add one in Settings > Phone and messages.', true);
      } else {
        Linking.openURL('tel:' + num.replace(/[^0-9+]/g, ''))
          .then(() => toast('Calling ' + who + '…'))
          .catch((e) => toast("Couldn't call: " + String(e?.message ?? e)));
      }
      return;
    }
    case 'park':
      // the map shows the parking spot, with its QR code for the phone
      return go('/map');
    case 'clip':
      if (!Features.on(p, 'dashcam')) toast('Turn on the dashcam in Settings > Driving', true);
      else {
        const t = Cam.protect(p);
        toast(t);
        say(t);
      }
      return;
    case 'flood': {
      if (!Features.on(p, 'monsoon')) {
        toast('Turn on monsoon mode in Settings > Features', true);
        return;
      }
      const t = Engine.markFlood();
      toast(t);
      say(t);
      return;
    }
    case 'docs':
      if (Features.on(p, 'wallet')) go('/wallet');
      else toast('Turn on the documents wallet in Settings > Car', true);
      return;
    case 'kids':
      if (Features.on(p, 'kids')) go('/kids');
      else toast('Turn on trip games in Settings > Family', true);
      return;
    case 'fog': {
      if (!Features.on(p, 'fog')) {
        toast('Turn on fog mode in Settings > Driving', true);
        return;
      }
      const on = p.str('fogNow', 'off') !== 'on';
      p.put('fogNow', on ? 'on' : 'off');
      say(on ? 'Fog mode on' : 'Fog mode off');
      return;
    }
    case 'share':
      if (!Features.on(p, 'tripShare')) toast('Turn on "Share the trip by QR code" in Settings > Features', true);
      else go({ pathname: '/chores', params: { open: 'share' } });
      return;
    case 'parkPhoto':
      if (!Features.on(p, 'parkPhoto')) toast('Turn on the parking photo in Settings > Features', true);
      else go('/parkphoto');
      return;
    case 'hotspot':
    case 'split':
    case 'parkTimer':
      return go({ pathname: '/chores', params: { open: k } });
    case 'weekly':
      return go('/report');
    case 'news':
      if (!Features.on(p, 'news')) say('The news is switched off in Settings, Features.');
      else go({ pathname: '/news', params: { read: '1' } });
      return;
    case 'cab':
      return go('/cab');
    case 'sos':
      if (cabOn(p, 'cabSos')) go('/sos');
      else toast('Turn on One-tap SOS in Settings > Cab driver', true);
      return;
    case 'meter':
      if (!cabOn(p, 'cabMeter')) toast('Turn on the fare meter in Settings > Cab driver', true);
      else go({ pathname: '/cab', params: { open: 'meter', meter: cmd.arg } });
      return;
    case 'view360':
      // the stereo's 360 cameras when it has them, else OpenRath's 3D car
      if (!openCam(p)) go('/view360');
      return;
    case 'earnings': {
      if (cabOn(p, 'cabEarnings')) go({ pathname: '/cab', params: { open: 'earnings', speak: '1' } });
      else {
        const t = 'Turn on the earnings log in Settings > Cab driver.';
        toast(t, true);
        say(t);
      }
      return;
    }
    case 'aqi': {
      const aqi = ctx.aqi ?? -1;
      const t = aqi < 0 ? "The air quality isn't known yet." : 'The air quality is ' + Air.band(aqi).toLowerCase() + ', A Q I ' + aqi + '.';
      toast(t, true);
      say(t);
      return;
    }
    case 'music':
      // the app's own player; a music app chosen in Settings still opens when nothing is set up here
      if (p.str('app:media:music', '') !== '') openApp(p, 'media:music', 'Music');
      else Music.play();
      return;
    case 'next':
      if (!Music.next()) toast('Nothing of ours is playing');
      return;
    case 'prev':
      Music.prev();
      return;
    case 'pause':
    case 'mute':
      Music.pause();
      return;
    // only the app's own player's volume: the unit's volume needs a native module (see PORTING.md)
    case 'volUp':
      Music.changeVolume(10);
      return;
    case 'volDown':
      Music.changeVolume(-10);
      return;
  }
  // the map's places: home, office, petrol pump, a break, service centres
  const js = mapCall(k);
  if (js === '') return;
  if (ctx.mapJs) ctx.mapJs(js);
  else go({ pathname: '/map', params: { go: k } });
}

/** The map page's function for a voice place command ("home" → "goFav('Home')"), or "". */
export function mapCall(kind: string): string {
  if (kind === 'home') return "goFav('Home')";
  if (kind === 'office') return "goFav('Office')";
  if (kind === 'fuel') return 'goFuel()';
  if (kind === 'rest') return 'restStop()';
  if (kind === 'service') return 'serviceCentres()';
  return '';
}

/**
 * Open the stereo's 360 camera app (View360.openCam): the one chosen in Settings ('app:cam360').
 * Android also searched the installed apps for one that looks like a 360 camera app; that list
 * needs PackageManager, which Expo has no module for. False when there isn't one.
 */
export function openCam(p: Prefs): boolean {
  const pkg = p.str('app:cam360', '');
  if (pkg === '' || Platform.OS !== 'android') return false;
  try {
    IntentLauncher.openApplication(pkg);
    return true;
  } catch {
    return false;
  }
}

/** A round mic button for the dashboard: tap, speak, and it's done. */
export default function MicButton({ style, size = 56, aqi }: { style?: StyleProp<ViewStyle>; size?: number; aqi?: number }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      heard(await listen(prefs), { prefs, aqi });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Voice command"
      hitSlop={8}
      style={[
        styles.mic,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: busy ? look.accent : look.panel, borderColor: look.edge },
        style,
      ]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={busy ? look.background : look.text} strokeWidth={2} strokeLinecap="round">
        <Rect x={9} y={2} width={6} height={12} rx={3} fill={busy ? look.background : look.text} />
        <Path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mic: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
