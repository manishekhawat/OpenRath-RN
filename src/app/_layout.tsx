import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DriveProvider } from '../state/drive';
import { useLook } from '../state/look';
import { PrefsProvider } from '../state/prefs';

function Screens() {
  const look = useLook();
  return (
    <>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: look.background }, animation: 'fade' }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <DriveProvider>
          <Screens />
        </DriveProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
