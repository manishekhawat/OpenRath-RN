# Privacy

OpenRath has no account, no ads, no analytics and no tracking. It never sends anything to the people who make it, and there is no server of ours for it to send anything to.

## What stays on the unit

Trips and the day-by-day history, saved places, driving score and badges, recorded routes, the fuel and toll logs, the parking spot and parking photo, service reminders, the documents wallet, cab earnings and notes, crash notes, settings and backups.

- Settings are in the app's own storage (AsyncStorage). Android's own cloud backup is turned off for the app (`allowBackup: false`), so none of it is copied to a Google account.
- Files the app writes — themes, exported GPX routes, backups — are in the app's own document folder. Dashcam clips and parking photos are saved to the unit's gallery, where other apps that can read photos can see them, because that is what the owner asked for when they saved them.
- Backups leave out the valet PIN, the hotspot password and the key-action token.
- Crash notes and the errors the app carried on from are kept in the app's own storage with web addresses and position-like numbers stripped out, and are shown in Settings > Help > Diagnostics. They are never sent anywhere; the only way they leave the unit is if the owner shares them.
- Calendar events are read on the unit to fill the calendar box and are never stored.

## What is sent, and only when the feature is used

Each of these can be switched off under **Turn on or off** in its Settings section.

| Feature | Sent to | What it receives |
| --- | --- | --- |
| Weather and rain | Open-Meteo (api.open-meteo.com) | Position rounded to about 100 m, or points along a planned route |
| Air quality | Open-Meteo (air-quality-api.open-meteo.com) | Position rounded to about 100 m |
| News box | Google News (news.google.com RSS) | Nothing about you or the car; only the topic chosen |
| Speed limits, cameras, toll plazas, petrol pumps, CNG stations | Overpass API (overpass-api.de, OpenStreetMap) | The map area around the car or the route |
| Map pictures | Esri (server.arcgisonline.com) for the dark map, and tile.openstreetmap.org when Esri's tiles do not load | The tiles on screen, which shows the area being looked at |
| Routes | OSRM demo server (router.project-osrm.org) | Start and destination |
| Place search | Photon (photon.komoot.io), and Nominatim (nominatim.openstreetmap.org) when Photon does not answer | What was typed or said, and the map centre (Photon only) |
| Voice search | The unit's own speech recogniser, usually Google | The spoken words |
| Online radio | radio-browser.info, then the station itself | The station list request, and the stream |
| Cab SOS (only when you set it off) | Your two SOS contacts, by SMS from the stereo's SIM | Your name, vehicle number, a map link to where the car is, and the time |

Every request goes straight from the unit to that service, so each service also sees the unit's internet address.

### Handed to other apps

Some things open another app, which then follows its own privacy policy. OpenRath sends nothing itself.

- **Guidance in another app:** Google Maps, Organic Maps or OsmAnd receive the destination when guidance is handed over, and the saved place you tap.
- **Calls:** a tapped number is handed to the system phone app. On the map the driver is asked first.
- **QR codes** (parking spot, UPI payment, SOS text, Wi-Fi hotspot) are drawn on the unit. Nothing is sent until a phone scans one.

## Permissions

Android asks the owner for most of these. Saying no turns off only the features that need it.

| Permission | Why |
| --- | --- |
| Location, including in the background | Speed, trips, weather, speed limits and the map. The background one keeps the trip counting while another app is on screen, with a notification showing. |
| Camera | The dashcam and the parking photo |
| Microphone | Sound with dashcam clips, when that is turned on |
| Photos and videos | Saving dashcam clips and parking photos to the gallery, and picking your own pictures for themes and the video box |
| Calendar (read only) | The calendar box. Writing to the calendar is blocked in the manifest. |
| Notifications | The notification Android needs while music plays or a drive is being recorded |
| Internet and network state | The services above, and knowing when the unit is offline |
| Wi-Fi state | The Wi-Fi icon in the dock |
| See all apps (`QUERY_ALL_PACKAGES`) | This app is a home screen: the app drawer, the dock and the buttons that open other apps need the list of what is installed. It is not used for anything else. |
| Keep awake, vibrate | Keeping the screen on while driving, and feedback on taps |

## What this edition does not do

The Android version has features this port does not, and each one is a thing it therefore cannot collect: there is no Bluetooth, so no OBD-II readings and no tyre sensors; no accessibility service and no notification listener, so no steering-wheel keys read and no messages from other apps; no in-app updater; no fleet-managed settings and no usage report sent anywhere. [PORTING.md](PORTING.md) lists them in full.

## Deleting it all

Uninstalling the app, or clearing its data in Android's settings, removes everything it kept. Dashcam clips and parking photos already saved to the gallery, and backups or GPX files the owner copied off the unit, belong to the owner and stay until the owner deletes them.
