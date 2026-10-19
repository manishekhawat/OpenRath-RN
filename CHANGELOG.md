# Changelog

What changed in the React Native edition. The features themselves are designed in the
[Android version](https://github.com/manishekhawat/OpenRath), and its own
[CHANGELOG](https://github.com/manishekhawat/OpenRath/blob/main/CHANGELOG.md) describes what each
OpenRath release added; this file says what the port did with it. [PORTING.md](PORTING.md) lists
what still needs native Android code.

## 1.43

The safer and lighter round, matching OpenRath 1.43.

- The map only loads its own page, and asks the driver before it dials a number tapped on it.
- Backups never carry the valet PIN, the hotspot password or the key-action token, and five wrong
  valet PINs lock entry for a minute.
- Speed limits and cameras come from roads already fetched, and a square's cameras are kept for a
  week, so Overpass is asked far less often.
- The GPS slows down after five minutes parked.
- Settings > Help > Diagnostics lists the errors OpenRath caught and carried on from, with web
  addresses and position-like numbers removed. Crashes are recorded from the moment the app starts.
- New switch: a steering-wheel button can do a second action when held down (not yet ported, and
  marked as such).
- The Hindi word table was rebuilt from the 1.43 string files: 2,239 pairs.
- Screenshots of every screen and the opening logo animation, taken from the web build by
  `npm run shots`.

## 1.42

Caught the port up with OpenRath 1.42, which is most of what the app does today: the thirteen
picture layouts and eight themes, the trip computer and mileage coach, the fuel log and fuel-low
planner, service reminders, road helpers, badges, chores, kids' games, the documents wallet, the
cab driver tools, driver profiles, the boot animation maker, voice commands and the spoken answers,
the setup screens and the opening logo. Hindi throughout. A linter, stricter TypeScript and the
CI check were added in the same round, along with limits on what the app fetches, stores and
restores.

## 1.30

The 360 view of the car, the dashcam, the parking photo and the music player, trips counted behind
other apps, and the Expo modules those need.

## 1.28

The first port: the dashboard, the map, settings and the logic layer with its tests.
