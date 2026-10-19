import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Intro from '../components/Intro';
import * as Features from '../logic/features';
import * as IntroLogic from '../logic/intro';
import * as Motion from '../logic/motion';
import * as Reports from '../logic/reports';
// defines the background trip task as the app starts, before Android hands it any fixes
import '../state/background';
import { DriveProvider } from '../state/drive';
import { useLook } from '../state/look';
import { PlayerProvider } from '../state/player';
import { PrefsProvider, usePrefs } from '../state/prefs';
import * as Store from '../state/store';

function Screens() {
  const look = useLook();
  const { prefs } = usePrefs();
  // the logo plays once, when the app starts (HomeActivity's `b == null`), not on every return home
  const [intro, setIntro] = useState(() => IntroLogic.show(Features.on(prefs, 'intro'), Motion.level(prefs), true));

  // the opt-in usage counts live in their own store; this counts one app start when they're on
  useEffect(() => {
    Reports.install(Store.reports, Store.prefs);
  }, []);

  return (
    <>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: look.background }, animation: 'fade' }} />
      {intro ? <Intro onDone={() => setIntro(false)} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <DriveProvider>
          <PlayerProvider>
            <Screens />
          </PlayerProvider>
        </DriveProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
