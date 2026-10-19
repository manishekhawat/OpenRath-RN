/**
 * Pickup hotspots (Cab.hotspotList): where your own logged or metered rides started around this
 * hour, busiest first; a tap opens directions there.
 */
import { Linking, Text } from 'react-native';

import { Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { dist } from '../../logic/geo';
import { t } from '../../logic/i18n';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

export default function Hotspots() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const hour = new Date().getHours();
  const spots = Cab.hotspots(Cab.log(prefs), hour, 6);

  if (spots.length === 0) {
    return (
      <Screen title={t('Pickup hotspots')}>
        <Text style={{ color: look.text, lineHeight: 22 }}>
          {t('Not enough rides around this hour yet. Each ride you log (or meter) remembers where it started; ' +
            'places with two or more rides around this time of day show here.')}
        </Text>
      </Screen>
    );
  }
  // the Android version drove there with its own map; here Google Maps (or any map app) gets the directions
  const go = (lat: number, lon: number) =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}&travelmode=driving`).catch(() =>
      toast(t('Needs a map app (Google Maps, Organic Maps or OsmAnd)')),
    );
  return (
    <Screen title={t('Where you got rides at this hour (tap to drive there)')}>
      {spots.map((s) => {
        const far = trip.lat === 0 ? null : dist(trip.lat, trip.lon, s[0], s[1]) / 1000;
        return <Row key={s[0] + ',' + s[1]} name={Cab.hotspotRow(s, hour, far)} onPress={() => go(s[0], s[1])} />;
      })}
    </Screen>
  );
}
