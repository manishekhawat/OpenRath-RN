/**
 * The settings group. With valet mode on the owner's PIN is asked for here, in front of every
 * settings screen, as SettingsActivity asked for it before it drew anything: Backup, Features,
 * Profiles and the rest are routes of their own, and the app answers to `openrath://`, so a lock
 * on the first screen alone would be walked past by `openrath://settings/backup`.
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Field, Screen } from '../../components/ui';
import { t } from '../../logic/i18n';
import * as Valet from '../../logic/valet';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function SettingsLayout() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [unlocked, setUnlocked] = useState(false);
  const [pinTry, setPinTry] = useState('');

  if (Valet.on(prefs) && !unlocked) {
    return (
      <Screen title="Settings">
        <Text style={{ color: look.textDim, marginBottom: 12 }}>{t('Valet mode is on. Enter the PIN')}</Text>
        <Field label="PIN" value={pinTry} onChange={setPinTry} numeric secret />
        <Button
          label="OK"
          kind="primary"
          onPress={() => {
            if (pinTry.trim() === Valet.pin(prefs)) setUnlocked(true);
            else Alert.alert(t('Wrong PIN'));
            setPinTry('');
          }}
        />
      </Screen>
    );
  }

  // the same screens as before, drawn the way the app's one stack draws them
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: look.background }, animation: 'fade' }} />;
}
