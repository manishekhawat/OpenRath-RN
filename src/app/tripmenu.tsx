/**
 * The trip menu (HomeActivity.tripMenu): since 1.35 Settings has one "Trips, fuel and tolls" row
 * that opens it, and the trip box opens it too. Start today's trip again, save the parking spot
 * here, the fuel log, trip history with the driving score, and a toll payment.
 */
import { router } from 'expo-router';
import { Alert, Text } from 'react-native';

import { Row, Screen } from '../components/ui';
import * as Care from '../logic/care';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Trip from '../logic/trip';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

export default function TripMenu() {
  const { prefs } = usePrefs();
  const look = useLook();
  const drive = useDrive();
  const { trip } = drive;

  const go = [
    () => drive.resetToday(),
    // only a live GPS fix: an old one can be hundreds of metres off (Engine.parkHere says which)
    () => Alert.alert(drive.parkHere()),
    () => router.push('/fuel'),
    () => router.push('/trips'),
    () => router.push('/tolls'),
  ];
  const values = [
    Trip.duration(trip.todaySec),
    '',
    '',
    Features.on(prefs, 'score') ? Care.scoreLine(Trip.score(trip), trip.todayBrakes, trip.todayAccels, trip.todaySpeedSec) : '',
    Care.tollsThisMonth(prefs).replace('  ·  ', ''),
  ];

  return (
    <Screen title={t('Trips, fuel and tolls')}>
      <Text style={{ color: look.text, fontSize: 18, marginBottom: 8 }}>{Care.tripMenuTitle(trip.todayKm, trip.odoKm)}</Text>
      {Care.TRIP_MENU.map((name, i) => (
        <Row key={name} name={t(name)} value={values[i] || undefined} onPress={go[i]} />
      ))}
    </Screen>
  );
}
