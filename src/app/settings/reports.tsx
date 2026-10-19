/**
 * Settings > Help > Crash reports and Usage report (About.crashes and About.usage, 1.42): the
 * counts of app starts and settings opened, with any crash notes, to read and share. Nothing is
 * sent anywhere; turning the "reports" switch off forgets the counts. Sending a report to a
 * fleet's own address needs managed settings, which this edition leaves out.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { Button, Heading, Row, Screen, toast } from '../../components/ui';
import * as Features from '../../logic/features';
import { f, t } from '../../logic/i18n';
import * as Reports from '../../logic/reports';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

const VERSION = '1.42';

/** The unit, as the report names it. */
function unit(): string {
  return `${Platform.OS === 'android' ? 'Android' : Platform.OS} ${String(Platform.Version)}`;
}

export default function ReportsScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [, setRefresh] = useState(0);
  const on = Features.on(prefs, 'reports');
  const counts = Reports.counts();
  const crashes = Reports.crashes();
  const body = Reports.text(VERSION, unit());

  /** Share the report as a text file, through the share sheet (the Android app sends plain text). */
  const share = async () => {
    try {
      const d = new Directory(Paths.cache, 'reports');
      d.create({ intermediates: true, idempotent: true });
      const file = new File(d, 'openrath-usage-report.txt');
      if (file.exists) file.delete();
      file.create();
      file.write(body);
      if (!(await Sharing.isAvailableAsync())) return toast('No app to share with', true);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: t('Share the report') });
    } catch {
      toast('No app to share with', true);
    }
  };

  const startAgain = () =>
    Alert.alert('', t('Start again'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Start again'),
        onPress: () => {
          Reports.clear();
          setRefresh((n) => n + 1);
        },
      },
    ]);

  return (
    <Screen title="Usage report">
      {on ? null : (
        <Text style={{ color: look.textDim, marginBottom: 10 }}>
          {t('Crash and usage reports')}: {t('off')}.{' '}
          {t('Counts which settings you open, kept on the unit with any crash reports for you to share; off forgets them')}
        </Text>
      )}
      <Row
        name="Crash and usage reports"
        value="Counts which settings you open, kept on the unit with any crash reports for you to share; off forgets them"
        on={on}
        onPress={() => {
          Features.set(prefs, 'reports', !on);
          if (on) Reports.clear();
          setRefresh((n) => n + 1);
        }}
      />
      <Heading>What is counted</Heading>
      {Object.keys(counts).length === 0 ? (
        <Text style={{ color: look.textDim }}>{t('Nothing counted yet')}</Text>
      ) : (
        Reports.format(counts)
          .trim()
          .split('\n')
          .map((line) => {
            const colon = line.lastIndexOf(': ');
            return <Row key={line} name={line.substring(0, colon)} state={line.substring(colon + 2)} />;
          })
      )}
      <Heading>Crash reports</Heading>
      {crashes.length === 0 ? (
        <Text style={{ color: look.textDim }}>{t('No crash reports. Good.')}</Text>
      ) : (
        crashes.map((c) => (
          <Row key={c.name} name={c.name} value={c.body.split('\n')[0]} onPress={() => Alert.alert(c.name, c.body.substring(0, 1500))} />
        ))
      )}
      <Button label="Share" kind="primary" onPress={() => void share()} />
      <Button label="Start again" onPress={startAgain} />
      {crashes.length > 0 ? (
        <Button
          label="Delete all"
          kind="danger"
          onPress={() => {
            Reports.clearCrashes();
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      <Text style={{ color: look.textDim, marginTop: 10 }}>{f('%1$s saved', String(crashes.length))}</Text>
    </Screen>
  );
}
