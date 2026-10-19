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

Every screen is in [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md): the fourteen dashboard looks, the
setup steps, the screens and Settings. They are taken at 1024 x 600, the usual 7 inch stereo size,
by `npm run shots` from the web build, with a canned drive at 48 km/h and a made-up day's trip.

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

## Contributing

Bug reports from a real head unit are the most useful help of all, because every unit is a little
different. [CONTRIBUTING.md](CONTRIBUTING.md) has the build steps, the conventions this codebase is
strict about and what a pull request needs; [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to
everyone taking part. Security problems go privately to the maintainer rather than into an issue:
see [SECURITY.md](SECURITY.md). What the app sends, and to whom, is in [PRIVACY.md](PRIVACY.md).
[CHANGELOG.md](CHANGELOG.md) is what changed in each version of this port.

## Licence

GPL-3.0-or-later (see LICENSE), with the added term under GPLv3 section 7(b) that copies keep the
author credit in their About screen (see NOTICE.md). The map uses Leaflet 1.9.4 (BSD-2-Clause),
leaflet-rotate (GPL-3.0) and qrcode-generator (MIT); their licences are in LICENSES/ and
assets/map/. What OpenRath learnt from is in CREDITS.md. Not affiliated with or endorsed by any car
or stereo maker; brand names belong to their owners.
