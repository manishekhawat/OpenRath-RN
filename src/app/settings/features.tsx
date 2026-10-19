/**
 * Settings > Features: every optional switch in one place, grouped as Features.java lists them
 * (1.42). Only the switches of the owner's OpenRath level show, and all of them in developer mode,
 * as in the Android version; the ones this React Native edition can't do yet say "coming". The cab
 * driver's own switches live in Cab driver tools, so they are left out here.
 */
import { Text, View } from 'react-native';

import { Heading, Row, Screen } from '../../components/ui';
import * as Features from '../../logic/features';
import { f, t } from '../../logic/i18n';
import * as Reports from '../../logic/reports';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function FeaturesScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const shown = Features.ALL.filter((x) => x.group !== 'Cab' && Features.shown(prefs, x));
  const flip = (id: string) => {
    Features.set(prefs, id, !Features.on(prefs, id));
    if (id === 'reports' && !Features.on(prefs, id)) Reports.clear();
  };
  return (
    <Screen title="Features">
      <Text style={{ color: look.textDim }}>
        {t('Features marked "coming" are still being moved over from the Android version. Their switches are kept, so they start working as they arrive.')}
      </Text>
      <Text style={{ color: look.textDim, marginTop: 6 }}>
        {f('%1$s of %2$s switches, at your OpenRath level', String(shown.length), String(Features.ALL.length))}
      </Text>
      {Features.groups()
        .filter((g) => g !== 'Cab')
        .map((g) => {
          const mine = shown.filter((x) => x.group === g);
          if (mine.length === 0) return null;
          return (
            <View key={g}>
              <Heading>{g}</Heading>
              {mine.map((x) => (
                <Row
                  key={x.id}
                  name={t(x.name) + (x.ported ? '' : '  ' + t('(coming)'))}
                  value={x.about}
                  on={Features.on(prefs, x.id)}
                  onPress={() => flip(x.id)}
                />
              ))}
            </View>
          );
        })}
    </Screen>
  );
}
