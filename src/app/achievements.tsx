/**
 * Badges for good driving (Achievements.show in the Android version, which used a dialog): every
 * badge with how to earn it, the earned ones first with a star. Opened from Settings > Road
 * helpers; the dashboard says "New badge: …" when one is earned.
 */
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Heading, Row, Screen } from '../components/ui';
import * as Achievements from '../logic/achievements';
import { t } from '../logic/i18n';
import { history } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

export default function AchievementsScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [got, setGot] = useState<string[] | null>(null);

  // the driving log is read once; earning a badge here counts as seen, as the dialog did
  useEffect(() => {
    history()
      .then((h) => {
        const earned = Achievements.earned(Achievements.days(h));
        prefs.put('badges', earned.join(','));
        setGot(earned);
      })
      .catch(() => setGot([]));
  }, [prefs]);

  const have = got ?? [];
  return (
    <Screen title={t('Badges')}>
      <Heading>{got == null ? t('Badges') : Achievements.titleText(have.length)}</Heading>
      {Achievements.BADGES.map(([id, name, about]) => (
        <Row key={id} name={(have.includes(id) ? '★  ' : '☆  ') + t(name)} value={t(about)} />
      ))}
      <Text style={{ color: look.textDim, marginTop: 12 }}>
        {t('Badges come from your driving score day by day. A day counts from 5 km.')}
      </Text>
    </Screen>
  );
}
