# Porting OpenRath 1.43 to React Native

OpenRath 1.43 is a native Android launcher: about 35,000 lines of Java in 135 classes, talking
straight to Android services and to stereo makers' firmware (Topway, FYT, MTC and szchoiceway
units, the FM chip driver, accessibility and notification services). This folder is the React
Native (Expo SDK 57, TypeScript) version. Everything that can be done in TypeScript with Expo's
modules is ported — 71 of the Android version's 90 feature switches — and what is left needs
native Android code, and is listed at the end with what it would take.

## What changed from the 1.30 port

- **Safer and lighter** (1.43): the map page is the only page the map's WebView loads, and a tap on
  a phone number there asks before it dials; backups leave out the valet PIN, the hotspot password
  and the update key, and a restore never writes them; five wrong valet PINs lock entry for a
  minute; speed limits come from the roads already fetched and are asked for again only after about
  5 km or when the car leaves them; a square of about 5 km keeps its speed cameras for a week, in
  memory and on the unit; every question to Overpass goes through one gate (8 seconds apart, and a
  doubling wait up to 5 minutes after a failure); GPS fixes drop to one every 15 seconds after five
  minutes parked; and Settings > Help > Diagnostics lists the errors OpenRath caught and carried on
  from, with web addresses and coordinates taken out, as the crash notes now are.

- **The whole app in Hindi** (1.34): `src/logic/i18n.ts` is the `Hindi` class, and
  `src/data/hi.json` its 2,239 English-to-Hindi pairs, built from the Android project's
  `res/values` and `res/values-hi` string files by `scripts/hindi.py`. Every string on screen goes
  through `t()` or `f()`. Spoken prompts stay in English, as in the Android version.
- **How much OpenRath shows** (1.36): Simple, Full or Custom, asked during setup and in Settings;
  the 1.35 round of merged switches (parking, tolls, fuel and mileage, car service, weather alerts,
  road learning, summaries, car-signal reminders, the moving road, one "Your name", one Mic button
  setting) is in `src/logic/features.ts`, with each old name following the switch it became part of
  so fleets and backups keep working.
- **Setup screens on first open** (1.42): language, permissions each explained, the car, the look,
  how much OpenRath shows, the apps, and pairing the phone and becoming the home app; every step
  skippable, and Settings > Help > Run setup again. The 1.41 logo animation plays before it.
- **Seven features removed in 1.35** are gone from here too: the wrong-way and overtaking
  warnings, the holiday traffic warning, commute insights, hill (ghat) road tips, the car wash
  reminder and accident help. Their screens and helpers were deleted, not switched off.
- **Three new looks** (1.42): Mission control, Electric and Roadster, each a picture layout and a
  matching theme — thirteen layouts and eight themes in all.
- **Ported since the 1.30 port:** mph and °F, Less movement (Standard, Reduced, Off), the smoothed
  speed and the drive summary when stopped, the hourly weather, calendar and compass boxes, the
  dock's status icons, tap sound and buzz, badges for good driving, saved places for any navigation
  app, the better all-apps screen, the soundboard and video boxes, the CarPlay / Android Auto
  button, drag to seek, the car's spoken answers with the plain-words fault table, recovery after
  deep sleep, theme changes at night, usage and crash reports, and the credit term in About.
- **The 1.38 crash guard:** a crashing map rebuilds itself and rests for five minutes if it keeps
  crashing, instead of closing OpenRath.

## How the code maps

| Android (Java) | React Native | Notes |
| --- | --- | --- |
| `HomeActivity`, `Dashboard`, `CarCard`, `MapCard`, `MediaCard`, `PhoneCard`, `HomeDock`, `Extras` (screensaver) | `src/app/index.tsx`, `src/components/{Dock,StatusIcons,CalendarBox,CompassBox,WeatherBox,MusicBox,VideoBox,SoundboardBox,NewsBox}.tsx` | Car box with the drive summary, clock, hourly weather, calendar, compass, road ahead, trip, fuel or cab box, news, dock with the status icons and the floating mic. Night-drive mode, start-up summary, weekly report, clock screensaver. |
| `Hindi`, `res/values-hi` | `src/logic/i18n.ts`, `src/data/hi.json`, `scripts/hindi.py` | `t()` and `f()`; `%1$s` and `%d` filled the Android way. |
| `Prefs`, `Managed` | `src/logic/prefs.ts`, `src/state/prefs.tsx` | Same string keys, kept in AsyncStorage. Fleet settings are native. |
| `Features`, `SettingsView`, `SettingsRows`, `HomeSettings` | `src/logic/{features,settings}.ts`, `src/app/settings/*` | All 89 switches, the four levels, the sections of 1.37 with the state on the right, and "Recently used". |
| `Setup`, `Intro`, `Compat` | `src/logic/{setup,intro}.ts`, `src/app/setup.tsx`, `src/components/Intro.tsx` | Seven steps, remembered in `setupStep`; the wheel animation before the dashboard. |
| `Units`, `Motion`, `Tap` | `src/logic/{units,motion,tap}.ts`, `src/components/Tap.tsx` | mph and °F, Standard/Reduced/Off, the tick and buzz on every box. |
| `Car`, `Car3D`, `View360` | `src/logic/{car,car3d}.ts`, `src/app/{setup,view360}.tsx` | The 3D car is drawn with react-native-svg. |
| `Fuel`, `FuelPlan`, `Care`, `Coach`, `Tracks`, `Achievements` | `src/logic/{fuel,fuelplan,care,coach,tracks,achievements,weekly}.ts`, `src/state/{trips,tracks}.ts`, `src/app/{fuel,care,trips,tripmenu,tolls,report,achievements}.tsx` | The trip menu is one screen, shared with its Settings row. GPX files go out through the share sheet. |
| `Drive`, `Fixes`, `Highway`, `Fog`, `Monsoon`, `Ahead`, `Spots` | `src/state/{drive.tsx,engine.ts,road.ts,trips.ts,background.ts}`, `src/logic/{trip,speed,highway,fog,monsoon,ahead,spots,accel,rest,sky}.ts`, `src/components/RoadAhead.tsx`, `src/app/settings/road.tsx` | Overpass for limits, cameras, tolls, zones and bends; learnt speed breakers and waits; replayed fixes skipped and the speed smoothed. |
| `Hub`, `Weather`, `Air`, `Agenda`, `Holidays`, `Geo`, `Errands`, `Chores`, `Places` | `src/logic/*.ts`, `src/state/weather.ts`, `src/app/{chores,places}.tsx` | Hourly weather kept for offline use, the unit's calendar, UPI split, parking timer, guest Wi-Fi, trip share, saved places. |
| `News`, `Qr`, `Kids`, `Wallet` | `src/logic/{news,qr,kids,wallet}.ts`, `src/components/{NewsBox,Qr}.tsx`, `src/app/{news,kids,wallet}.tsx` | |
| `Voice`, `HomeVoice`, `CarAnswer`, `FaultCodes` | `src/logic/{voice,caranswer,faultcodes}.ts`, `src/components/MicButton.tsx` | Android's speech recogniser through an intent; the mic floats where it is dragged; 90 fault codes in plain words. |
| `Theme`, `ThemeAuto`, `ThemeGallery`, `Layouts`, `LayoutView`, `LayoutGallery` | `src/logic/{theme,themeauto,layouts}.ts`, `src/state/look.ts`, `src/components/LayoutView.tsx`, `src/app/settings/{theme,layouts}.tsx` | Thirteen layouts, eight themes, the night theme by sunset. Layout pictures drawn by `art/scenes.py` at build time, in `assets/layouts`. |
| `Profiles`, `Backup`, `Reports` | `src/logic/{profiles,backup,reports}.ts`, `src/app/settings/{profiles,backup,reports}.tsx` | Same backup format as the Android app, and a copy kept before a restore. |
| `Cab`, `CabMeter`, `CabEarnings`, `CabSos`, `CabSettings`, `BootArt` | `src/logic/{cab,cabMeter,cabEarnings,cabSos,cabSettings,bootart}.ts`, `src/app/cab/*`, `src/app/bootart.tsx` | The boot animation is drawn and zipped in TypeScript. |
| `Drive` as a foreground service, `Wake` | `src/state/{engine,background,store}.ts`, `src/logic/wake.ts`, `index.js` | The per-fix work runs outside React; a background location task feeds it behind other apps, and after deep sleep the GPS, music and map start again. Setting: Road helpers > Count trips behind other apps (`bgTrips`). |
| `Dashcam`, `Snap` | `src/logic/{dashcam,snap}.ts`, `src/state/camera.ts`, `src/components/DashcamView.tsx`, `src/app/{dashcam,parkphoto}.tsx` | expo-camera; a jolt (accelerometer or harsh braking) keeps the clip. |
| `Player`, `Resume`, `ParkedMusic`, `Duck`, `Sound`, `Quiet`, `Speak`, `Soundboard`, `Videos`, `Projection` | `src/logic/{player,sound,soundboard,videos}.ts`, `src/state/{player.tsx,speech.ts}`, `src/app/{music,video}.tsx`, `src/components/{MusicBox,VideoBox,SoundboardBox}.tsx` | expo-audio with background playback and seeking, expo-video for the video box; songs from the media library or picked files, stations from Radio Browser, the soundboard's sounds generated in TypeScript. |
| `Valet`, `ChildLock` | `src/logic/{valet,childlock}.ts`, Settings and the app drawer | Five wrong PINs lock entry for a minute (1.43). |
| `OverpassGate`, `Diag`, `Crash` | `src/logic/{overpass,diag}.ts`, `src/state/crash.ts`, `src/app/settings/diagnostics.tsx` | One gate for every Overpass question, speed cameras kept by square, and the errors carried on from, in Settings > Help > Diagnostics. |
| Map card + `assets/map/map.html`, `OfflineNav`, `Tiles` | `src/app/map.tsx`, `src/map/mapHtml.ts` | The original map page in a WebView, with the 1.38 crash guard; offline guidance hands over to the chosen offline map app. |
| `AppsActivity`, `AppPicker`, `Apps` | `src/logic/apps.ts`, `src/app/apps.tsx` | The 1.38 screen: search, pinned and recent, A to Z; opens apps by package name. |
| `tests/Tests.java` | `src/logic/__tests__/*.test.ts` | 197 checks; run with `npm test`. |

## Done differently, because Expo can't do it from TypeScript

- **Cab SOS** opens the messaging app with the text filled in; sending still needs a tap. Sending by
  itself needs SmsManager and the SEND_SMS permission.
- **Volume:** volume by speed, quiet hours, sound profiles and ducking change the app's own player
  only. The unit's volume (and so valet mode's cap and cab quiet-ride) needs the system audio API;
  other apps' music doesn't dip for voice prompts without audio focus from native code.
- **Installed apps** can't be listed, so the all-apps screen, the 360 camera app, the projection
  app, the offline map app and the ride apps are opened and chosen by package name. The 1.38
  search, pinned and recent rows and the A to Z column work on that list.
- **The seek bar follows OpenRath's own player**, not other apps': reading and moving another app's
  position needs a media session from native code.
- **Beeps** before spoken warnings are left out (no tone generator); the spoken warnings play.
- **The dashcam records while its dashboard box or screen is showing**, with a second or so between
  clips; recording with the screen off, and USB cameras, need native code. Clips open in the unit's
  video player.
- **The video box** shows the picture only while a fresh GPS fix says the car is stopped, as the
  Android version does, and keeps the sound going when it hides it.
- **Parked music** only reminds after 30 minutes parked, as the Android version does without OBD.
- **The car's spoken answers** cover the trip computer ("how far today"); the engine, fuel, fault
  and battery answers say the adapter isn't connected, because OBD is native.
- **The night theme** changes after sunset only; "with the headlights" needs the unit's lights.
- **The number plate** on the 3D car uses an affine transform, not Android's perspective mapping.
- **QR codes** keep the screen awake but don't raise the brightness.
- **The boot animation** uses a built-in stroke font instead of Inter, and the brand badge is the
  wheel mark; installing it still needs root, as before.

## Still needs native Android code

Each of these needs Kotlin or Java in an Expo module or a config plugin. They are the 19 feature
switches `src/logic/features.ts` marks as not ported, and the services behind them.

- Being the Home app beyond the HOME intent filter (single task, clear task on launch): a small config plugin.
- Listing installed apps (`Apps`, `AppsActivity`, `ChildLock` sending the screen home, finding the 360 camera, projection, offline map and ride apps): PackageManager.
- What's playing, the notification ticker and the big radio frequency (`MediaListener`, `Ticker`, `RadioText`, `readAloud`): NotificationListenerService and a media session.
- Album-cover colours for the music box (`ArtColour`): the pick-and-position maths is ported and tested, but reading an image's pixels needs native code.
- Steering-wheel buttons, and a second action when one is held down (`Keys`, `KeyService`, `longKeys`): key events and an AccessibilityService.
- Equalizer and the unit's volume (`Eq`, the volume parts of `Sound`, `Valet`, `Cab` quiet-ride): Android audio effects and AudioManager.
- OBD-II and TPMS over Bluetooth or Wi-Fi (`Obd`, `Tpms`, and so the engine box, the car's mood and the fault-code reader): a Bluetooth library such as react-native-ble-plx.
- The LED light strip (`LedStrip`): the same Bluetooth library.
- USB cameras, recording with the screen off, and the reverse camera (`Dashcam` over UVC, `ReverseView`): a UVC library and a foreground service.
- Turn-indicator arrows and the 360 camera turning with the indicators (`arrows`, `cam360Turn`): the unit's turn signals.
- Stereo makers' services: Topway (`TopwayUnit`, `Tw`, `Xt`, `Calls`, `Lights`), FYT, MTC and szchoiceway units (`FytUnit`, `MtcUnit`, `SzUnit`, `Unit`), plus `Fm`, `Tuner`, `Scan`, `StockRadio`, `Probe`, `Peek`, `Stereo`, `Hub`'s unit start/stop, Reset GPS and `com.android.fmradio.FmNative`. These call firmware classes by reflection and only make sense as a native module loaded on those units.
- Floating mic over other apps (`Floaters`, `OverMic`): SYSTEM_ALERT_WINDOW overlay. The mic floats over OpenRath's own screens here.
- Home-screen widgets and extra dashboard pages (`widgets`, `pages`, resizing and moving the boxes): AppWidgetHost and the Android layout work behind them.
- Managed settings for fleets (`Managed`): Android's app restrictions.
- App updates from GitHub (`Updates`): installing a package needs the install permission.
- The performance box (`perf`): free memory and the reason the app last closed.
- The rest of Diagnostics (`Crash`, `Strings`): the errors carried on from, the crash notes and what Diagnostics can know about this unit are ported (1.43); the stereo's own services, the reason the app last closed and the guards around native calls are not.
- Offline map tiles (`offlineMap`, `Tiles`): a tile cache through the map bridge.
- The maker's own screen (`maker`): the stereo firmware's settings app.

## Differences to know

- The app id is `org.openrath.rn`, so it installs next to the Android version instead of over it.
- Settings live in AsyncStorage, not in Android SharedPreferences. Restore an Android backup in
  Settings > Backup and restore to bring them across.
- The owner's name is kept under `welcome`, as the Android version and its backups call it; names
  typed into earlier builds of this port (`ownerName`) are still read.
- The cab SOS has no built-in sender name; it uses the owner name you set.
- The dashboard's boxes come from the chosen picture layout and a long-press on a box, so 1.43's
  one "What the boxes show" row (which replaced the Android version's five slot rows) has nothing
  to replace here.
- Crash notes and the errors carried on from live in the app's own storage (AsyncStorage), with web
  addresses and coordinates removed, and are never sent anywhere.
