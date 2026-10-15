# Porting OpenRath 1.30 to React Native

OpenRath 1.30 is a native Android launcher: about 27,000 lines of Java in 98 classes, talking
straight to Android services and to stereo makers' firmware (Topway, FYT and MTC units, the FM
chip driver, accessibility and notification services). This folder is the React Native (Expo SDK
57, TypeScript) version. Everything that can be done in TypeScript with Expo's modules is ported;
what is left needs native Android code, and is listed at the end with what it would take.

## What changed from the 1.28 port

- **1.30 changes:** the 360° view of your car (`Car3D`, `View360`) with four body shapes, colours
  and your number plate; car shape and colour in the first-run setup; the "360" voice command; the
  stereo's own 360 camera app from the view. The map's saved places, destination and service
  centre now use the Android app's formats (`place:Home` "lat,lon", `dest` "name|lat|lon",
  `myService` "name|phone"), and the tank size key is `tankL`, so backups move across cleanly.
- **Ported since 1.28 (the "JS only" list):** road helpers, mileage coach, commute, fuel-low
  planner, GPX tracks and the 0–100 timer, tolls and the weekly report, news, QR codes, chores,
  kids' games, documents wallet, accident help, voice commands, picture layouts, theme packs,
  driver profiles, backup and restore, cab driver tools, boot animation maker, valet mode, child
  lock and the clock screensaver.

## How the code maps

| Android (Java) | React Native | Notes |
| --- | --- | --- |
| `HomeActivity`, `Cards`, `Dashboard`, `Extras` (screensaver) | `src/app/index.tsx` | Car box, clock, weather, road ahead, trip, fuel or cab box, news, dock with the mic. Night-drive mode, start-up summary with the petrol range, wash reminder, weekly report, clock screensaver. |
| `Prefs` | `src/logic/prefs.ts`, `src/state/prefs.tsx` | Same string keys, kept in AsyncStorage. |
| `Features` | `src/logic/features.ts` | All 89 switches from 1.30; each says whether it is ported. |
| `Car`, `Car3D`, `View360` | `src/logic/car.ts`, `src/logic/car3d.ts`, `src/app/setup.tsx`, `src/app/view360.tsx` | The 3D car is drawn with react-native-svg. |
| `Fuel`, `FuelPlan`, `Care`, `Coach`, `Commute`, `Tracks` | `src/logic/{fuel,fuelplan,care,coach,commute,tracks,weekly}.ts`, `src/state/{trips,tracks}.ts`, `src/app/{fuel,care,trips,tolls,report}.tsx` | GPX files go out through the share sheet. |
| `Drive`, `Highway`, `Hill`, `Fog`, `Monsoon`, `Ahead`, `Spots` | `src/state/drive.tsx`, `src/state/road.ts`, `src/logic/{trip,speed,highway,hill,fog,monsoon,ahead,spots,accel,rest,sky}.ts`, `src/components/RoadAhead.tsx`, `src/app/settings/road.tsx` | Overpass for limits, cameras, tolls, zones and bends; learnt speed breakers and waits. |
| `Hub`, `Weather`, `Air`, `Holidays`, `Geo`, `Errands`, `Chores` | `src/logic/*.ts`, `src/state/weather.ts`, `src/app/chores.tsx` | UPI split, parking timer, guest Wi-Fi, trip share, wash. |
| `News`, `Qr`, `Kids`, `Wallet`, `Rescue` | `src/logic/{news,qr,kids,wallet,rescue}.ts`, `src/components/{NewsBox,Qr}.tsx`, `src/app/{news,kids,wallet,sos}.tsx` | |
| `Voice` | `src/logic/voice.ts`, `src/components/MicButton.tsx` | Android's speech recogniser through an intent. |
| `Theme`, `ThemeGallery`, `Layouts`, `LayoutView`, `LayoutGallery` | `src/logic/{theme,layouts}.ts`, `src/state/look.ts`, `src/components/LayoutView.tsx`, `src/app/settings/{theme,layouts}.tsx` | Layout pictures drawn by `art/scenes.py` at build time, in `assets/layouts`. |
| `Profiles`, `Backup` | `src/logic/{profiles,backup}.ts`, `src/app/settings/{profiles,backup}.tsx` | Same backup format as the Android app. |
| `Cab`, `BootArt` | `src/logic/{cab,bootart}.ts`, `src/app/cab/*`, `src/app/bootart.tsx` | The boot animation is drawn and zipped in TypeScript. |
| `Valet`, `ChildLock` | `src/logic/{valet,childlock}.ts`, Settings and the app drawer | |
| Map card + `assets/map/map.html`, `OfflineNav` | `src/app/map.tsx`, `src/map/mapHtml.ts` | The original map page in a WebView; offline guidance hands over with a `geo:` link. |
| `AppsActivity`, `AppPicker` | `src/app/apps.tsx` | Opens apps by package name. |
| `SettingsView` | `src/app/settings/*` | |
| `tests/Tests.java` | `src/logic/__tests__/*.test.ts` | Run with `npm test`. |

## Done differently, because Expo can't do it from TypeScript

- **Accident help and cab SOS** open the messaging app with the text filled in; sending still needs
  a tap. Sending by itself needs SmsManager and the SEND_SMS permission.
- **Volume** (valet mode's cap, quiet-ride, volume rising with speed, quiet hours) needs the system
  audio API. The settings and rules are kept; nothing changes the volume yet.
- **Installed apps** can't be listed, so the app drawer, the 360 camera app and the ride apps open
  apps by package name.
- **Beeps** before spoken warnings are left out (no tone generator); the spoken warnings play.
- **Trips count while the app is open**, not behind other apps.
- **The number plate** on the 3D car uses an affine transform, not Android's perspective mapping.
- **QR codes** keep the screen awake but don't raise the brightness.
- **The boot animation** uses a built-in stroke font instead of Inter, and the brand badge is the
  wheel mark; installing it still needs root, as before.

## Still needs native Android code

Each of these needs Kotlin or Java in an Expo module or a config plugin.

- Being the Home app beyond the HOME intent filter (single task, clear task on launch): a small config plugin.
- Listing installed apps (`AppsActivity`, `ChildLock` sending the screen home, finding the 360 camera and ride apps): PackageManager.
- Counting trips behind other apps and after boot (`Drive` as a foreground service, `Resume$Boot`): expo-task-manager background location and a boot receiver.
- What's playing and the notification ticker (`MediaListener`, `Ticker`): NotificationListenerService.
- Steering-wheel buttons (`Keys`, `KeyService`): key events and an AccessibilityService.
- Own music and radio player, equalizer, ducking, sound profiles, quiet hours, parked music (`Player`, `Eq`, `Duck`, `Sound`, `Quiet`, `Resume`, `ParkedMusic`): expo-audio covers playback; equalizer and system volume need native code.
- OBD-II and TPMS over Bluetooth (`Obd`, `Tpms`): a Bluetooth library such as react-native-ble-plx.
- Dashcam, parking photo, reverse camera (`Dashcam`, `Snap`, `ReverseView`): expo-camera for the phone camera; USB cameras need native code.
- Stereo makers' services: Topway (`TopwayUnit`, `Tw`, `Xt`, `Calls`, `Lights`), and new in 1.30 FYT and MTC units (`FytUnit`, `MtcUnit`, `Unit` with its frequency and lights helpers), plus `Fm`, `Tuner`, `Scan`, `StockRadio`, `Probe`, `Peek`, `Stereo`, `Hub`'s unit start/stop and `com.android.fmradio.FmNative`. These call firmware classes by reflection and only make sense as a native module loaded on those units.
- Floating mic over other apps (`Floaters`, `OverMic`): SYSTEM_ALERT_WINDOW overlay.
- Crash guard and diagnostics (`Crash`, `Strings`): reads other apps' dex files and guards native calls.
- Offline map tiles (`Tiles`): a tile cache through the map bridge.
- Indicator-driven 360 camera turns (`cam360Turn`): needs the unit's turn signals.

## Differences to know

- The app id is `org.openrath.rn`, so it installs next to the Android version instead of over it.
- Settings live in AsyncStorage, not in Android SharedPreferences. Restore an Android backup in
  Settings > Backup and restore to bring them across.
- The cab SOS no longer has a built-in sender name; it uses the owner name you set (`welcome`).
