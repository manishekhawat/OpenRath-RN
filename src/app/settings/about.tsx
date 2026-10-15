/** About: what OpenRath is, where its data comes from, and its licence. */
import { Text } from 'react-native';

import { Heading, Screen } from '../../components/ui';
import { useLook } from '../../state/look';

export default function About() {
  const look = useLook();
  const p = { color: look.text, marginBottom: 8, lineHeight: 21 };
  return (
    <Screen title="About OpenRath">
      <Text style={p}>
        A free, open source home screen for car stereos. Rath (रथ) is Sanskrit for chariot. This is the React Native edition of
        OpenRath 1.30.
      </Text>
      <Heading>Where the data comes from</Heading>
      <Text style={p}>• Weather and air quality: Open-Meteo</Text>
      <Text style={p}>• Speed limits and cameras: OpenStreetMap, through the Overpass API</Text>
      <Text style={p}>• Map: Esri and OpenStreetMap tiles, Photon search and OSRM routes</Text>
      <Text style={p}>Nothing about your drives is sent anywhere else; trips, fuel log and settings stay on the unit.</Text>
      <Heading>Licence</Heading>
      <Text style={p}>
        GPL-3.0-or-later. Leaflet (BSD-2-Clause), leaflet-rotate (GPL-3.0) and qrcode-generator (MIT); licences in the LICENSES
        folder. Not affiliated with or endorsed by any car or stereo maker.
      </Text>
    </Screen>
  );
}
