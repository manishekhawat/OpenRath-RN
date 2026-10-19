/**
 * Settings > About and licences, and Privacy (About.java, 1.42). The licence notice and the credits
 * stay in English, as they are written; the rest is translated. The credit line "Based on OpenRath
 * by Manish Shekhawat", with the project's link, is the additional term under GPLv3 section 7(b)
 * (see NOTICE.md), so this edition keeps it here as the Android version does.
 */
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Heading, Screen } from '../../components/ui';
import { t } from '../../logic/i18n';
import { useLook } from '../../state/look';

const VERSION = '1.43';
export const PROJECT = 'https://github.com/manishekhawat/OpenRath';
export const CREDIT = 'Based on OpenRath by Manish Shekhawat';

export default function About() {
  const look = useLook();
  const { show } = useLocalSearchParams<{ show?: string }>();
  const p = { color: look.text, marginBottom: 8, lineHeight: 21 };
  const dim = { color: look.textDim, marginBottom: 8, lineHeight: 21 };

  if (show === 'privacy') {
    return (
      <Screen title="Privacy">
        <Text style={p}>{t('OpenRath has no account, no ads, no analytics and no tracking. It never sends anything to its makers.')}</Text>
        <Text style={p}>
          {t(
            'Crash and usage reports (off unless you turn them on in Settings > Features) stay on the unit for you to share. ' +
              "On a fleet's unit, its managed settings can send them once a day to the fleet's own address.",
          )}
        </Text>
        <Heading>STAYS ON THE UNIT</Heading>
        <Text style={p}>
          {t(
            'Trips, driving score, routes (GPX), fuel and toll logs, parking spot, service reminders, phone favourites, ' +
              'learnt car signals, settings, driver profiles, waterlogging spots and backups. Backups go to OpenRath/backup ' +
              "on the unit's own storage. Dashcam clips go to OpenRath/dashcam and are never uploaded. The parking QR code " +
              'is made on the unit; only the phone that scans it opens the map link.',
          )}
        </Text>
        <Heading>SENT ONLY WHEN THE FEATURE IS USED</Heading>
        <Text style={p}>• {t('Weather and air quality: your approximate position (3 decimals, about 100 m) to Open-Meteo.')}</Text>
        <Text style={p}>
          • {t('QR codes (parking, trip sharing, UPI split, parking reminder) are made on the unit; nothing is sent until a phone scans one.')}
        </Text>
        <Text style={p}>
          •{' '}
          {t(
            'Speed limits, cameras, toll plazas, one-way streets, schools, hospitals, bends, rest stops, petrol pumps and service centres: the area around you to the Overpass API (OpenStreetMap).',
          )}
        </Text>
        <Text style={p}>• {t('Map: the map area you look at to the tile server.')}</Text>
        <Text style={p}>• {t('Routes: start and destination to the OSRM routing server.')}</Text>
        <Text style={p}>
          • {t("Search: what you type or say to Photon. Voice search uses the unit's speech recogniser (usually Google).")}
        </Text>
        <Text style={p}>• {t('Online radio: the station list from radio-browser.info, and the stream from the station itself.')}</Text>
        <Text style={dim}>
          {t(
            'Each has an on/off switch at the top of its section in Settings. Messages shown by the ticker are read on the unit and never stored.',
          )}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen title={`OpenRath ${VERSION}`}>
      <Text style={p}>{t('A free and open-source home screen for Android car stereos.')}</Text>
      <Text style={p}>
        OpenRath by Manish Shekhawat, {PROJECT}
      </Text>
      <Text style={p}>
        Copyright (C) 2026 Manish Shekhawat and the OpenRath contributors. This program is free software: you can redistribute it
        and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either
        version 3 of the License, or (at your option) any later version. It comes with ABSOLUTELY NO WARRANTY. The full licence is
        in the LICENSE file of the source code. Additional term under GPLv3 section 7(b): anyone who conveys OpenRath or a modified
        version must keep the credit &quot;{CREDIT}&quot;, with a link to {PROJECT}, in its About or credits screen.
      </Text>
      <Text style={p}>{t('This is the React Native edition, built from OpenRath 1.43.')}</Text>
      <Text style={p}>
        {t(
          'Not affiliated with or endorsed by any car or stereo maker; brand names belong to their owners. ' +
            "Car names and logos are trademarks of their owners and are shown only to identify the owner's own car.",
        )}
      </Text>
      <Heading>THIRD-PARTY PARTS</Heading>
      <Text style={p}>• Leaflet 1.9.4: BSD 2-Clause, (c) 2010-2023 Vladimir Agafonkin, (c) 2010-2011 CloudMade</Text>
      <Text style={p}>• leaflet-rotate: GPL-3.0, Iván Sánchez Ortega, Raruto and contributors</Text>
      <Text style={p}>• QR Code Generator for JavaScript: MIT, (c) 2009 Kazuhiko Arase</Text>
      <Text style={p}>• fflate: MIT, (c) 2020 Arjun Barrett</Text>
      <Text style={p}>• React Native and Expo: MIT, (c) Meta Platforms and Expo contributors</Text>
      <Heading>THANKS TO</Heading>
      <Text style={p}>
        • Ideas and know-how from fyt-dialer, honda-customizer, MTCD-E_Radio-app, MtcDialer, mtccanbus-decompiled, Femto Car
        Launcher, Car Nebula and Mini AA. The full list is in CREDITS.md in the source code.
      </Text>
      <Heading>ONLINE SERVICES (free, no account)</Heading>
      <Text style={p}>• Map: © OpenStreetMap contributors (ODbL), tiles from tile.openstreetmap.org</Text>
      <Text style={p}>• Weather: Open-Meteo.com (CC BY 4.0)</Text>
      <Text style={p}>• Routing: OSRM project demo server</Text>
      <Text style={p}>• Speed limits, cameras, tolls, petrol pumps, service centres: OpenStreetMap via the Overpass API</Text>
      <Text style={p}>• Place search: Photon by Komoot</Text>
      <Text style={p}>• Place names: BigDataCloud (when the unit has no geocoder)</Text>
      <Text style={p}>• Online radio: radio-browser.info community directory</Text>
    </Screen>
  );
}
