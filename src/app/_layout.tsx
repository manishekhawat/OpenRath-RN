import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// defines the background trip task as the app starts, before Android hands it any fixes
import '../state/background';
import { DriveProvider } from '../state/drive';
import { PlayerProvider } from '../state/player';
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
          <PlayerProvider>
            <Screens />
          </PlayerProvider>
        </DriveProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
