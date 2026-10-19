# OpenRath (React Native)

<p align="center"><img src="docs/opening-logo.gif" alt="The OpenRath wheel rolling in when the app opens" width="512"></p>

A free, open source home screen for Android car stereos, rebuilt in React Native with Expo. It is
the React Native edition of OpenRath 1.43: setup screens on first open, a dashboard with your car
and its live speed on a moving road (or one of thirteen picture layouts), the clock, hourly
weather, the calendar, news and a compass, a map with turn-by-turn guidance and saved places, a
360° view of your car, voice commands and spoken answers from the car, a trip computer with a
mileage coach, a fuel log and fuel-low planner, service reminders, speed limit and camera alerts,
road helpers for highways, fog and the monsoon, badges for good driving, chores, kids' trip games,
a documents wallet, its own music, radio and video player, a dashcam, cab driver tools, driver
profiles, backups and a boot animation maker. All of it is in Hindi as well as English, and how
much it shows is one setting: Simple, Full or Custom.

1.43 is the safer and lighter round: the map only loads its own page and asks before calling a
number from it, backups never carry the valet PIN or the hotspot password, five wrong valet PINs
lock entry for a minute, speed limits and cameras come from roads already fetched (and a square's
cameras are kept for a week), the GPS slows down after five minutes parked, and Settings > Help >
Diagnostics lists the errors OpenRath caught and carried on from, with addresses and places
removed.

*Rath* (रथ) is Sanskrit for chariot.

Based on OpenRath by Manish Shekhawat — https://github.com/manishekhawat/OpenRath

How it maps to the Android code, and the parts that still need native Android code, are in
[PORTING.md](PORTING.md).

## Screenshots

Taken at 1024 x 600, the usual 7 inch stereo size, by `npm run shots`: the web build of this port
in a browser, with a canned drive at 48 km/h and a made-up day's trip, so the screens show what a
driver would see. The parts only a stereo has (the camera, the map page, the media library) show
their own empty state.

**Dashboards**

<table>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-boxes.png" alt="Boxes" width="400"><br>Boxes</td>
<td align="center"><img src="docs/screenshots/dashboard-bubbles.png" alt="Bubbles" width="400"><br>Bubbles</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-scenery.png" alt="Scenery" width="400"><br>Scenery</td>
<td align="center"><img src="docs/screenshots/dashboard-columns.png" alt="Columns" width="400"><br>Columns</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-picture-clock.png" alt="Picture and clock" width="400"><br>Picture and clock</td>
<td align="center"><img src="docs/screenshots/dashboard-strip.png" alt="Strip" width="400"><br>Strip</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-twin-dials.png" alt="Twin dials" width="400"><br>Twin dials</td>
<td align="center"><img src="docs/screenshots/dashboard-room.png" alt="Room" width="400"><br>Room</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-big-clock.png" alt="Big clock" width="400"><br>Big clock</td>
<td align="center"><img src="docs/screenshots/dashboard-lyrics.png" alt="Lyrics" width="400"><br>Lyrics</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-cards-and-apps.png" alt="Cards and apps" width="400"><br>Cards and apps</td>
<td align="center"><img src="docs/screenshots/dashboard-mission-control.png" alt="Mission control" width="400"><br>Mission control</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/dashboard-electric.png" alt="Electric" width="400"><br>Electric</td>
<td align="center"><img src="docs/screenshots/dashboard-roadster.png" alt="Roadster" width="400"><br>Roadster</td>
</tr>
</table>

**Setup on first start**

<table>
<tr>
<td align="center"><img src="docs/screenshots/setup-welcome.png" alt="Welcome and language" width="400"><br>Welcome and language</td>
<td align="center"><img src="docs/screenshots/setup-permissions.png" alt="Permissions" width="400"><br>Permissions</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/setup-car.png" alt="Your car" width="400"><br>Your car</td>
<td align="center"><img src="docs/screenshots/setup-look.png" alt="Colour and layout" width="400"><br>Colour and layout</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/setup-level.png" alt="How much to show" width="400"><br>How much to show</td>
<td align="center"><img src="docs/screenshots/setup-apps.png" alt="Your apps" width="400"><br>Your apps</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/setup-phone-home.png" alt="Phone and home app" width="400"><br>Phone and home app</td>
<td align="center"><img src="docs/screenshots/setup-hindi.png" alt="In Hindi" width="400"><br>In Hindi</td>
</tr>
</table>

**Screens**

<table>
<tr>
<td align="center"><img src="docs/screenshots/map.png" alt="Map" width="300"><br>Map</td>
<td align="center"><img src="docs/screenshots/music.png" alt="Music" width="300"><br>Music</td>
<td align="center"><img src="docs/screenshots/news.png" alt="News" width="300"><br>News</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/all-apps.png" alt="All apps" width="300"><br>All apps</td>
<td align="center"><img src="docs/screenshots/saved-places.png" alt="Saved places" width="300"><br>Saved places</td>
<td align="center"><img src="docs/screenshots/video-window.png" alt="Video window" width="300"><br>Video window</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/trip-menu.png" alt="Trips, fuel and tolls" width="300"><br>Trips, fuel and tolls</td>
<td align="center"><img src="docs/screenshots/trip-history.png" alt="Trip history" width="300"><br>Trip history</td>
<td align="center"><img src="docs/screenshots/weekly-report.png" alt="Your week in the car" width="300"><br>Your week in the car</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/badges.png" alt="Badges" width="300"><br>Badges</td>
<td align="center"><img src="docs/screenshots/fuel-log.png" alt="Fuel log" width="300"><br>Fuel log</td>
<td align="center"><img src="docs/screenshots/car-care.png" alt="Car care" width="300"><br>Car care</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/tolls.png" alt="Tolls" width="300"><br>Tolls</td>
<td align="center"><img src="docs/screenshots/everyday-helpers.png" alt="Everyday helpers" width="300"><br>Everyday helpers</td>
<td align="center"><img src="docs/screenshots/kids-games.png" alt="Kids' games" width="300"><br>Kids' games</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/documents-wallet.png" alt="Documents wallet" width="300"><br>Documents wallet</td>
<td align="center"><img src="docs/screenshots/dashcam.png" alt="Dashcam" width="300"><br>Dashcam</td>
<td align="center"><img src="docs/screenshots/parking-photo.png" alt="Parking photo" width="300"><br>Parking photo</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/view-360.png" alt="360 view" width="300"><br>360 view</td>
<td align="center"><img src="docs/screenshots/boot-animation.png" alt="Boot animation" width="300"><br>Boot animation</td>
<td align="center"><img src="docs/screenshots/cab.png" alt="Cab driver" width="300"><br>Cab driver</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/cab-earnings.png" alt="Earnings" width="300"><br>Earnings</td>
<td align="center"><img src="docs/screenshots/cab-meter.png" alt="Fare meter" width="300"><br>Fare meter</td>
<td align="center"><img src="docs/screenshots/cab-cng.png" alt="CNG fills" width="300"><br>CNG fills</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/cab-notes.png" alt="Cab notes" width="300"><br>Cab notes</td>
<td align="center"><img src="docs/screenshots/cab-papers.png" alt="Cab papers" width="300"><br>Cab papers</td>
<td align="center"><img src="docs/screenshots/cab-phrases.png" alt="Say to the passenger" width="300"><br>Say to the passenger</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/cab-hotspots.png" alt="Pickup hotspots" width="300"><br>Pickup hotspots</td>
<td align="center"><img src="docs/screenshots/cab-sos.png" alt="Cab SOS" width="300"><br>Cab SOS</td>
<td align="center"><img src="docs/screenshots/cab-settings.png" alt="Cab settings" width="300"><br>Cab settings</td>
</tr>
</table>

**Settings**

<table>
<tr>
<td align="center"><img src="docs/screenshots/settings.png" alt="Settings" width="300"><br>Settings</td>
<td align="center"><img src="docs/screenshots/settings-level.png" alt="OpenRath level" width="300"><br>OpenRath level</td>
<td align="center"><img src="docs/screenshots/settings-features.png" alt="Features" width="300"><br>Features</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/settings-road-helpers.png" alt="Road helpers" width="300"><br>Road helpers</td>
<td align="center"><img src="docs/screenshots/settings-themes.png" alt="Themes" width="300"><br>Themes</td>
<td align="center"><img src="docs/screenshots/settings-layouts.png" alt="Screen layout" width="300"><br>Screen layout</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/settings-profiles.png" alt="Driver profiles" width="300"><br>Driver profiles</td>
<td align="center"><img src="docs/screenshots/settings-backup.png" alt="Backup and restore" width="300"><br>Backup and restore</td>
<td align="center"><img src="docs/screenshots/settings-usage-report.png" alt="Usage report" width="300"><br>Usage report</td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/settings-diagnostics.png" alt="Diagnostics" width="300"><br>Diagnostics</td>
<td align="center"><img src="docs/screenshots/settings-about.png" alt="About and licences" width="300"><br>About and licences</td>
<td></td>
</tr>
</table>

## Run it

You need Node 22.18 or newer, because `npm test` runs TypeScript straight through Node, and for a
device build the Android SDK (or an Expo account for EAS Build).

```sh
npm install
npm test            # the logic checks carried over from the Android version
npm run typecheck
npm run lint
npm run shots       # the screenshots above, from the web build in a browser
npx expo run:android   # build and install on a connected stereo or phone
```

`npx expo start` also works with a development build. Expo Go can run most of it, but not the
map's WebView settings or opening other apps.

On the stereo, press Home and pick **OpenRath**, then **Always**. The setup screens then ask for
location (speed, weather and the map), the car, the look and how much OpenRath shows; Settings >
Help > Run setup again goes through them later.

## Layout

```
src/
  app/          screens (Expo Router): dashboard, setup, map, 360 view, fuel, care, trips, tripmenu,
                tolls, report, news, chores, kids, wallet, places, achievements, music, video,
                dashcam, parkphoto, cab/, bootart, apps, settings/
  components/   themed boxes, rows, buttons, the moving road, road ahead, weather, calendar,
                compass, music, video, soundboard, news, QR, status icons, the floating mic, layouts
  logic/        everything with no screen, ported from the Java classes, with tests
  state/        settings store, GPS and the drive service, road helpers, trips, weather, look,
                camera, player, speech
  data/         built-in themes, picture layouts, car brands and models, the Hindi word table
  map/          the map page, generated from assets/map by `npm run map`
assets/map/     the original Leaflet map page and its libraries
assets/layouts/ the picture layouts' backgrounds, drawn by the Android project's art/scenes.py
scripts/        build-map.mjs, and hindi.py to rebuild src/data/hi.json from the Android project's
                string files: `python3 scripts/hindi.py <OpenRath>/res src/data/hi.json`;
                shots.mjs with shots/stubs to take the screenshots (`npm run shots`)
docs/           the screenshots and the opening logo shown above
```

## Licence

GPL-3.0-or-later (see LICENSE), with the added term under GPLv3 section 7(b) that copies keep the
author credit in their About screen (see NOTICE.md). The map uses Leaflet 1.9.4 (BSD-2-Clause),
leaflet-rotate (GPL-3.0) and qrcode-generator (MIT); their licences are in LICENSES/ and
assets/map/. What OpenRath learnt from is in CREDITS.md. Not affiliated with or endorsed by any car
or stereo maker; brand names belong to their owners.
