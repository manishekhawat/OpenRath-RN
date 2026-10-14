# Porting OpenRath 1.28 to React Native

OpenRath 1.28 is a native Android launcher: about 26,000 lines of Java in 95 classes, with no
build system beyond `build.py`, talking straight to Android services and to stereo makers'
firmware (Topway MCU, FM chip driver, accessibility and notification services). This folder is
the React Native (Expo SDK 57, TypeScript) version. The first pass carries over the core of the
dashboard and every piece of business logic it needs; the rest is listed below with what it
would take.

## How the code maps

| Android (Java) | React Native | Notes |
| --- | --- | --- |
| `HomeActivity`, `Cards`, `Dashboard` | `src/app/index.tsx` | Car box (speed, moving road, limit sign, camera, care alert), clock, weather, trip computer, fuel log, dock. Landscape columns, portrait stacks. Night-drive mode. Start-up summary. |
| `Prefs` | `src/logic/prefs.ts`, `src/state/prefs.tsx` | Same string keys (`feat:<id>`, `care:<item>:last`, `fuel`, `odoOffset`…), kept in AsyncStorage. |
| `Features` | `src/logic/features.ts` | All 87 switches, generated from `Features.java`; each says whether it is ported. |
| `Car`, first-run setup | `src/logic/car.ts`, `src/app/setup.tsx` | Brands and models from `catalogue/cars.json`. |
| `Fuel`, `Errands` (fuel parts) | `src/logic/fuel.ts`, `src/app/fuel.tsx` | Full-to-full mileage, price by city, leak/theft check. |
| `Care` | `src/logic/care.ts`, `src/app/care.tsx` | Odometer, km- and date-based reminders, most-urgent alert. |
| `Drive` (trip, score, parking, speed alerts) | `src/logic/trip.ts`, `src/logic/speed.ts`, `src/state/drive.tsx` | expo-location, Overpass limits and cameras, spoken alerts with expo-speech. |
| `Hub` (weather), `Weather`, `Air` | `src/logic/weather.ts`, `src/logic/air.ts`, `src/state/weather.ts` | Open-Meteo, offline hour from the saved forecast, AQI alert. |
| `Holidays`, `Geo`, `Errands` | `src/logic/*.ts` | Pure ports. |
| `Theme`, `ThemeGallery` | `src/logic/theme.ts`, `src/state/look.ts`, `src/app/settings/theme.tsx` | The five built-in themes; Android `#AARRGGBB` colours are converted. |
| Map card + `assets/map/map.html` | `src/app/map.tsx`, `src/map/mapHtml.ts` | The original map page, unchanged, in a WebView. A shim stands in for the Java `OpenRath` bridge. `npm run map` rebuilds the inlined page. |
| `AppsActivity`, `AppPicker` | `src/app/apps.tsx` | Opens apps by package name (see below). |
| `SettingsView` | `src/app/settings/*` | Car, price, theme, features, warning speed, toll rate, holidays, about. |
| `tests/Tests.java` | `src/logic/__tests__/logic.test.ts` | The checks for everything ported, run with `npm test`. |

## Not ported yet

Grouped by what they need. "JS only" means it can be written in TypeScript with the libraries
already here; "native module" means it needs Kotlin/Java code in an Expo module or a config
plugin, because Expo has no API for it.

**JS only (straightforward next steps)**
- Mileage coach and commute insights (`Coach`, `Commute`), fuel-low planner (`FuelPlan`), and the petrol range in the start-up summary.
- Road ahead: tolls, one-way, school and hospital zones, overtaking, fog (`Ahead`, `Fog`), hill tips (`Hill`), highway mode (`Highway`), monsoon spots (`Monsoon`), learnt speed breakers and waits (`Spots`).
- News box (`News`), kids' trip games (`Kids`), chores: UPI split, parking timer, guest Wi-Fi QR (`Chores`; the link builders are already in `errands.ts`), QR codes (`Qr`, via react-native-qrcode-svg).
- Picture layouts (`Layouts`, `LayoutView`, `LayoutGallery`) from `src/data/layouts.json`, theme packs from storage, driver profiles (`Profiles`), weekly report, GPX tracks (`Tracks`), backup and restore (`Backup`, with expo-file-system), car documents wallet (`Wallet`), cab driver tools (`Cab`), boot art maker (`BootArt`), voice commands (`Voice`, with a speech recognition module).

**Needs a native module or background task**
- Being the Home app. `app.json` already declares the HOME intent filter, so Android offers OpenRath as the home screen; the launcher behaviours around it (single task, clear task on launch) need a small config plugin.
- Listing installed apps for the app drawer and child lock (`AppsActivity`, `ChildLock`): PackageManager.
- Counting trips behind other apps and after boot (`Drive` as a foreground service, `Resume$Boot`): expo-task-manager background location and a boot receiver.
- What's playing and the notification ticker (`MediaListener`, `Ticker`): NotificationListenerService.
- Steering-wheel buttons (`Keys`, `KeyService`): key events and an AccessibilityService.
- Own music and internet radio player, equalizer, ducking, sound profiles, quiet hours (`Player`, `Eq`, `Duck`, `Sound`, `Quiet`, `Resume`, `ParkedMusic`): expo-audio covers playback; equalizer and system volume need native code.
- OBD-II and TPMS over Bluetooth (`Obd`, `Tpms`): a BLE / classic Bluetooth library such as react-native-ble-plx.
- Dashcam, parking photo, reverse camera (`Dashcam`, `Snap`, `ReverseView`): expo-camera covers the camera; USB cameras need native code.
- Stereo makers' services (`TopwayUnit`, `Tw`, `Xt`, `Fm`, `Tuner`, `Scan`, `StockRadio`, `Calls`, `Lights`, `Probe`, `Peek`, `Stereo`, `com.android.fmradio.FmNative`): these call Topway firmware classes and the FM chip driver by reflection. They only make sense as a native Android module that loads on Topway units.
- Floating mic over other apps (`Floaters`, `OverMic`): SYSTEM_ALERT_WINDOW overlay.
- Accident help SMS (`Rescue`): expo-sms can open the composer; sending without a tap needs native code.
- Offline map tiles (`Tiles`): the map page would need a tile cache through the bridge.

## Differences to know

- The app id is `org.openrath.rn`, so it installs next to the Android version instead of over it.
- Settings live in AsyncStorage, not in Android SharedPreferences, so settings from the Java app don't carry over automatically. A backup importer (`Backup`) is the way to bring them across.
- Trips are counted while the app is open, not yet behind other apps.
