/**
 * The compass and altitude box (Cards.CompassCard, 1.36): heading as a point and in degrees from
 * the GPS while moving (the last one kept when stopped), and the GPS altitude.
 */
import * as Location from 'expo-location';
import { memo, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '../logic/i18n';
import * as Status from '../logic/status';
import { useDriveTrip } from '../state/drive';
import { useLook } from '../state/look';
import { TapBox } from './Tap';

export const CompassBox = memo(function CompassBox({ style, onPress }: { style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const look = useLook();
  const { trip } = useDriveTrip();
  const kept = useRef(-1);
  const now = trip.heading; // -1 below 5 km/h or without a bearing
  if (now >= 0) kept.current = now;
  const hd = now >= 0 ? now : kept.current;
  const [alt, setAlt] = useState<number | null>(null);

  // the trip's fixes carry no altitude, so it comes from the last fix Android kept
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const l = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (live) setAlt(l?.coords.altitude ?? null);
      } catch {
        // no location yet
      }
    };
    read();
    // nothing to show behind another app, so the reading waits there
    const id = setInterval(() => {
      if (AppState.currentState === 'active') read();
    }, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const figs: [string, string][] = [
    ['HEADING', hd < 0 ? '--' : t(Status.point(hd))],
    ['DEGREES', hd < 0 ? '--' : `${Math.round(hd) % 360}°`],
    ['ALTITUDE M', alt == null ? '--' : String(Math.round(alt))],
  ];
  const foot =
    hd < 0
      ? t('The heading shows once the car moves')
      : now < 0
        ? t('Last heading while moving; GPS altitude is within about 10 m')
        : t('GPS altitude is within about 10 m');
  return (
    <TapBox title={t('COMPASS')} style={style} onPress={onPress}>
      <View style={styles.row}>
        {figs.map(([name, value]) => (
          <View key={name} style={styles.fig}>
            <Text style={[styles.value, { color: look.text }]}>{value}</Text>
            <Text style={[styles.label, { color: look.textDim }]}>{t(name)}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.foot, { color: look.textDim }]} numberOfLines={1}>
        {foot}
      </Text>
    </TapBox>
  );
});

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fig: { flex: 1, alignItems: 'center' },
  value: { fontSize: 30, fontWeight: '300' },
  label: { fontSize: 10, letterSpacing: 1.5 },
  foot: { fontSize: 11, textAlign: 'center' },
});
