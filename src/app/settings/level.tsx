/**
 * Settings > OpenRath level (HomeSettings.askLevel, 1.36): Simple, Full or Custom — how much
 * OpenRath shows. Picking one puts every feature of that level back to its usual switch and turns
 * the rest off; each can still be changed afterwards. "Not now" leaves everything as it is (and,
 * the first time, counts as asked). Opened from Settings, and as a step of the first-run setup.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Screen, toast } from '../../components/ui';
import * as Features from '../../logic/features';
import { f, t } from '../../logic/i18n';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** The three cards, used here and by the setup step. */
export function LevelCards({ value, onChange }: { value: number; onChange: (level: number) => void }) {
  const look = useLook();
  return (
    <View>
      {Features.LEVEL_NAMES.map((name, i) => {
        const on = i === value;
        return (
          <Pressable
            key={name}
            onPress={() => onChange(i)}
            style={{
              borderWidth: on ? 2.5 : 1.2,
              borderRadius: 14,
              borderColor: on ? look.accent : look.edge,
              backgroundColor: on ? look.panelTop : look.panel,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: look.text, fontSize: 19, fontWeight: '500' }}>{(on ? '● ' : '○ ') + t(name)}</Text>
            <Text style={{ color: look.textDim, fontSize: 14, marginTop: 6 }}>{t(Features.LEVEL_ABOUT[i])}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LevelScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const asked = first === '1';
  const [pick, setPick] = useState(asked ? Features.SIMPLE : Features.level(prefs));

  const use = () => {
    Features.setLevel(prefs, pick);
    toast(f('%1$s. Change it any time in Settings > OpenRath level', t(Features.LEVEL_NAMES[pick])), true);
    router.back();
  };
  const notNow = () => {
    // asked once; everything stays as it was
    if (asked && !Features.levelPicked(prefs)) prefs.put('level', 'custom');
    router.back();
  };

  return (
    <Screen title={asked ? 'How much should OpenRath show?' : 'OpenRath level'}>
      <Text style={{ color: look.textDim, marginBottom: 14 }}>
        {t('Start simple if you like: you can add more any time in Settings, OpenRath level, or switch single features on.')}
      </Text>
      <LevelCards value={pick} onChange={setPick} />
      <Button label="Use this" kind="primary" onPress={use} />
      <Button label={asked ? 'Not now' : 'Cancel'} onPress={notNow} />
    </Screen>
  );
}
