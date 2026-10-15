/**
 * Pickup hotspots (Cab.hotspotList): where your own logged or metered rides started around this
 * hour, busiest first; a tap opens directions there.
 */
import { Linking, Text } from 'react-native';

import { Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { dist } from '../../logic/geo';
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
      <Screen title="Pickup hotspots">
        <Text style={{ color: look.text, lineHeight: 22 }}>
          Not enough rides around this hour yet. Each ride you log (or meter) remembers where it started; places with two or more
          rides around this time of day show here.
        </Text>
      </Screen>
    );
  }
  // the Android version drove there with its own map; here Google Maps (or any map app) gets the directions
  const go = (lat: number, lon: number) =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}&travelmode=driving`).catch(() =>
      toast('Needs a map app (Google Maps, Organic Maps or OsmAnd)'),
    );
  return (
    <Screen title="Where you got rides at this hour (tap to drive there)">
      {spots.map(([lat, lon, n]) => {
        const far = trip.lat === 0 ? '' : (dist(trip.lat, trip.lon, lat, lon) / 1000).toFixed(1) + ' km away  ·  ';
        return <Row key={lat + ',' + lon} name={far + Math.round(n) + ' rides around ' + hour + ':00'} value={Cab.where(lat, lon)} onPress={() => go(lat, lon)} />;
      })}
    </Screen>
  );
}
