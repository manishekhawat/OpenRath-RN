/** Settings > Features: one switch for every optional feature, by group. */
import { Switch, Text, View } from 'react-native';

import { Heading, Row, Screen } from '../../components/ui';
import * as Features from '../../logic/features';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function FeaturesScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  return (
    <Screen title="Features">
      <Text style={{ color: look.textDim }}>
        Features marked "coming" are still being moved over from the Android version. Their switches are kept, so they start
        working as they arrive.
      </Text>
      {Features.groups().map((g) => (
        <View key={g}>
          <Heading>{g}</Heading>
          {Features.ALL.filter((f) => f.group === g).map((f) => (
            <Row
              key={f.id}
              name={f.name + (f.ported ? '' : '  (coming)')}
              value={f.about}
              onPress={() => Features.set(prefs, f.id, !Features.on(prefs, f.id))}
              right={<Switch value={Features.on(prefs, f.id)} onValueChange={(v) => Features.set(prefs, f.id, v)} />}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
