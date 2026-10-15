# OpenRath (React Native)

A free, open source home screen for Android car stereos, rebuilt in React Native with Expo. It
is the React Native edition of OpenRath 1.30: a dashboard with your car and its live speed on a
moving road (or one of ten picture layouts), the clock, weather and news, a map with turn-by-turn
guidance, a 360° view of your car, voice commands, a trip computer with a mileage coach, a fuel log
and fuel-low planner, service reminders, speed limit and camera alerts, road helpers for highways,
hills, fog and the monsoon, chores, kids' trip games, a documents wallet, accident help, cab driver
tools, driver profiles, backups and a boot animation maker.

*Rath* (रथ) is Sanskrit for chariot.

How it maps to the Android code, and the parts that still need native Android code, are in
[PORTING.md](PORTING.md).

## Run it

You need Node 20 or newer, and for a device build the Android SDK (or an Expo account for EAS Build).

```sh
npm install
npm test            # the logic checks carried over from the Android version
npm run typecheck
npx expo run:android   # build and install on a connected stereo or phone
```

`npx expo start` also works with a development build. Expo Go can run most of it, but not the
map's WebView settings or opening other apps.

On the stereo, press Home and pick **OpenRath**, then **Always**. Allow location for speed,
weather and the map.

## Layout

```
src/
  app/          screens (Expo Router): dashboard, setup, map, 360 view, fuel, care, trips, tolls,
                report, news, chores, kids, wallet, sos, cab/, bootart, apps, settings/
  components/   themed boxes, rows, buttons, the moving road, road ahead, news, QR, mic, layouts
  logic/        everything with no screen, ported from the Java classes, with tests
  state/        settings store, GPS and the drive service, road helpers, trips, weather, look
  data/         built-in themes, picture layouts, car brands and models
  map/          the map page, generated from assets/map by `npm run map`
assets/map/     the original Leaflet map page and its libraries
assets/layouts/ the picture layouts' backgrounds, drawn by the Android project's art/scenes.py
```

## Licence

GPL-3.0-or-later (see LICENSE). The map uses Leaflet 1.9.4 (BSD-2-Clause), leaflet-rotate
(GPL-3.0) and qrcode-generator (MIT); their licences are in LICENSES/ and assets/map/. Not
affiliated with or endorsed by any car or stereo maker; brand names belong to their owners.
