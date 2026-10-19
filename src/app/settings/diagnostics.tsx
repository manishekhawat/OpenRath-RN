/**
 * Settings > Help > Diagnostics (HomeSettings.diagnostics, 1.43): what OpenRath knows about this
 * unit, and the errors it caught and carried on from since it started (diag.ts). The Android
 * version shows it all in one dialog; here it is a screen, with the errors newest first. Nothing
 * is sent anywhere, and the lines have web addresses and coordinates taken out, as crash reports do.
 */
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { Button, Heading, Row, Screen } from '../../components/ui';
import * as Diag from '../../logic/diag';
import { f, t } from '../../logic/i18n';
import * as Reports from '../../logic/reports';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

const VERSION = Constants.expoConfig?.version ?? '1.43';

export default function DiagnosticsScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const drive = useDrive();
  const [, setRefresh] = useState(0);
  const lines = Diag.lines();
  const crashes = Reports.crashes();

  /** The app chosen for a dock button, as Settings names it ('app:' + key). */
  const app = (key: string) => prefs.str('app:' + key, '') || t('not chosen');

  return (
    <Screen title="Diagnostics">
      <Heading>This unit</Heading>
      <Row name="OpenRath" state={VERSION} />
      <Row name="Unit" state={`${Platform.OS === 'android' ? 'Android' : Platform.OS} ${String(Platform.Version)}`} />
      <Row name="GPS" state={drive.gps === '' ? (drive.fixAt > 0 ? t('fixes coming in') : t('no fix yet')) : drive.gps} />
      <Row name="Speed limit here" state={drive.limit > 0 ? `${drive.limit} km/h` : t('not known here')} />
      {drive.cameraM >= 0 ? <Row name="Speed camera ahead" state={`${drive.cameraM} m`} /> : null}
      {drive.alertError ? <Row name="Speed limits and cameras" state={drive.alertError} /> : null}
      <Row name="Today" state={f('%1$s km, %2$s min', drive.trip.todayKm.toFixed(1), String(Math.round(drive.trip.todaySec / 60)))} />
      <Row name="Guide routes in" state={prefs.str('src:navi', 'own') === 'google' ? 'Google Maps' : t("OpenRath's map")} />
      <Row name="Chosen apps" value={`radio ${app('radio')}, music ${app('music')}, phone ${app('phone')}`} />
      <Row name="Crash reports" state={String(crashes.length)} />

      <Heading>Errors caught since the app started</Heading>
      {lines.length === 0 ? (
        <Text style={{ color: look.textDim }}>{t('Nothing has gone wrong. Good.')}</Text>
      ) : (
        lines.map((line, i) => (
          <Text key={String(i) + line} style={{ color: look.textDim, fontSize: 14, marginBottom: 6 }}>
            {line}
          </Text>
        ))
      )}
      {lines.length > 0 ? (
        <Button
          label="Clear"
          onPress={() => {
            Diag.clear();
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      <Text style={{ color: look.textDim, marginTop: 10 }}>
        {t('Kept while the app runs, on the unit only; the newest 30 are shown')}
      </Text>
    </Screen>
  );
}
