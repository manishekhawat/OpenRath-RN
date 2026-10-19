/**
 * The road box for the dashboard: what the road helpers know right now. In fog it shows the
 * speed against the fog guide speed and the next bend (Fog.java's screen, tap to hide it for the
 * drive); otherwise the highway strip, the road-ahead line, the latest road warning, a fresh
 * 0–100 time and the break reminder. Renders nothing when there is nothing to say.
 */
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Fog from '../logic/fog';
import * as Highway from '../logic/highway';
import { f, t } from '../logic/i18n';
import { avgKmh } from '../logic/trip';
import * as Units from '../logic/units';
import { useDriveSpeed, useDriveTrip } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { Box } from './ui';

const AMBER = '#FFB02E';
/** how long a spoken warning stays on the box */
const SAID_MS = 60000;
const ACCEL_MS = 2 * 60000;
const REST_MS = 5 * 60000;

export const RoadAhead = memo(function RoadAhead({ style }: { style?: StyleProp<ViewStyle> }) {
  const { road, trip, hideFog } = useDriveTrip();
  // the fog screen shows the speed as it reads now, so this box follows it
  const { speedShown } = useDriveSpeed();
  const { prefs } = usePrefs();
  const look = useLook();
  const now = Date.now();
  const kmh = Math.round(speedShown >= 0 ? speedShown : trip.kmh);
  const inMph = Units.mph(prefs);

  // fog mode while driving: the speed against the guide, and the next bend
  if (road.fog && !road.fogHidden && trip.kmh > 5) {
    const over = kmh > road.fogGuide;
    const bend = road.bendM < 0 ? t('No bend known ahead') : Fog.bendText(road.bendM, road.bendDir);
    const arrow = road.bendM < 0 || road.bendDir === 0 ? '↑' : road.bendDir > 0 ? '↱' : '↰';
    return (
      <Box title={t('FOG')} style={style} onPress={hideFog}>
        <View style={s.fogRow}>
          <View style={{ alignItems: 'center' }}>
            <Text style={[s.fogSpeed, { color: over ? AMBER : look.text }]}>{Units.speed(kmh, inMph)}</Text>
            <Text style={{ color: look.textDim }}>{Units.speedLabel(prefs)}</Text>
          </View>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[s.arrow, { color: road.bendM >= 0 && road.bendM < 150 ? AMBER : look.text }]}>{arrow}</Text>
            <Text style={{ color: look.text, textAlign: 'center' }}>{bend}</Text>
          </View>
        </View>
        <Text style={[s.line, { color: over ? AMBER : look.accent }]}>{Fog.guideText(kmh, road.fogGuide)}</Text>
        <Text style={[s.small, { color: look.textDim }]}>{Fog.lampsText()}</Text>
        <Text style={[s.small, { color: look.textDim }]}>{t('Tap to close for this drive')}</Text>
      </Box>
    );
  }

  const lines: { text: string; strong?: boolean }[] = [];
  if (road.highway) lines.push({ text: Highway.stripText(avgKmh(trip.todayKm, trip.todaySec), road.drivingMin, road.held), strong: true });
  if (road.line) lines.push({ text: road.line, strong: true });
  if (road.said && now - road.said.at < SAID_MS && road.said.text !== road.line) lines.push({ text: road.said.text });
  if (road.accel && now - road.accel.at < ACCEL_MS) {
    const a = road.accel;
    lines.push({ text: f('0–100 in %1$s s', a.t100.toFixed(1)) + (a.t60 > 0 ? ` (0–60 ${a.t60.toFixed(1)} s)` : '') + (a.record ? t(', your best') : '') });
  }
  if (road.restAt > 0 && now - road.restAt < REST_MS) lines.push({ text: f('%1$s min at the wheel · time for a short break', road.drivingMin), strong: true });
  if (lines.length === 0) return null;
  return (
    <Box title={t('ROAD AHEAD')} style={style}>
      {lines.map((l, i) => (
        <Text key={i} style={[s.line, { color: l.strong ? look.text : look.textDim }]} numberOfLines={2}>
          {l.text}
        </Text>
      ))}
    </Box>
  );
});

const s = StyleSheet.create({
  fogRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fogSpeed: { fontSize: 64, fontWeight: '300' },
  arrow: { fontSize: 56, lineHeight: 64 },
  line: { fontSize: 16, marginTop: 4 },
  small: { fontSize: 12, marginTop: 2 },
});
