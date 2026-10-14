# OpenRath (React Native)

A free, open source home screen for Android car stereos, rebuilt in React Native with Expo. It
is the React Native edition of [OpenRath](https://github.com/) 1.28: a dashboard with your car
and its live speed on a moving road, the clock, weather, a map with turn-by-turn guidance, a trip
computer, a fuel log, service reminders, and speed limit and camera alerts.

*Rath* (रथ) is Sanskrit for chariot.

What is ported so far, and what is still to come, is in [PORTING.md](PORTING.md).

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
  app/          screens (Expo Router): dashboard, setup, fuel, care, map, apps, settings
  components/   themed boxes, rows, buttons, the moving road
  logic/        everything with no screen, ported from the Java classes, with tests
  state/        settings store, GPS and trip computer, weather
  data/         built-in themes, picture layouts, car brands and models
  map/          the map page, generated from assets/map by `npm run map`
assets/map/     the original Leaflet map page and its libraries
```

## Licence

GPL-3.0-or-later (see LICENSE). The map uses Leaflet 1.9.4 (BSD-2-Clause), leaflet-rotate
(GPL-3.0) and qrcode-generator (MIT); their licences are in LICENSES/ and assets/map/. Not
affiliated with or endorsed by any car or stereo maker; brand names belong to their owners.
