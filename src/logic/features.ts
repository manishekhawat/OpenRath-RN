/**
 * Every optional feature, each with its own on/off switch in Settings (generated from Features.java,
 * version 1.42). Code checks Features.on(prefs, id) before doing the work, so a switched-off feature
 * costs nothing. `ported` marks the ones this React Native version already does; the rest are listed
 * so their switches and saved values carry over, and are shown as "coming" in Settings > Features.
 *
 * Levels (1.36): Simple, Full or Custom decides which switches Settings shows and what they are set
 * to when a level is picked; developer mode shows them all. Managed (fleet) settings are left out:
 * they come from Android's app restrictions, which need native code, so every switch is the owner's.
 */
import type { Prefs } from './prefs.ts';

export interface Feature {
  id: string;
  name: string;
  group: string;
  def: boolean;
  about: string;
  ported: boolean;
  /** the level it belongs to: SIMPLE, FULL or CUSTOM, or DEV for switches only developer mode shows */
  level: number;
}

// ---- levels: how much OpenRath shows. Each takes in the one before it; DEV is the hidden developer mode.
export const SIMPLE = 0;
export const FULL = 1;
export const CUSTOM = 2;
export const DEV = 3;
export const LEVELS = ['simple', 'full', 'custom'];
export const LEVEL_NAMES = ['Simple', 'Full', 'Custom'];
export const LEVEL_ABOUT = [
  'The must-haves: home screen, map, radio, music, phone, reverse lines, speed alerts',
  'Simple plus the helpers: voice, road warnings, highway trips, car care, driving score, cab tools',
  'Full plus making it your own: widgets, extra pages, boot logo, equalizer, driver profiles',
];
/** Off whatever the level until the owner turns them on: they need hardware, or change the home screen. */
const ASK_FIRST = new Set(['cab', 'obd', 'dashcam', 'tpms', 'reports']);

const SIMPLE_IDS = ['arrows', 'navTurns', 'parkedSettings', 'weather', 'news', 'ticker', 'nightDrive', 'speedAlerts', 'parking', 'reverse', 'lightsReminder', 'duck', 'keys', 'longKeys', 'resume', 'offlineMap', 'backup', 'reports', 'musicApp'];
const CUSTOM_IDS = ['pages', 'widgets', 'saver', 'perf', 'bootArt', 'soundProfiles', 'speedVolume', 'eq', 'profiles'];
const DEV_IDS = ['maker', 'perf'];

/**
 * Switches that became part of a bigger one (1.35): each old id follows its new switch, so code
 * and backups that use the old ids keep working.
 */
export const PARTS: [string, string][] = [
  ['parkLink', 'parking'], ['parkPhoto', 'parking'], ['parkTimer', 'parking'],
  ['tollAhead', 'tolls'],
  ['coach', 'fuelPrice'], ['fuelPlan', 'fuelPrice'], ['fuelCheck', 'fuelPrice'],
  ['serviceFinder', 'care'], ['serviceBooking', 'care'],
  ['monsoon', 'rain'], ['aqi', 'rain'],
  ['waits', 'bumps'],
  ['weekly', 'startSummary'],
  ['chimes', 'lightsReminder'],
  ['offlineVoice', 'offlineMap'],
  ['floatMic', 'voice'], ['micOverApps', 'voice'],
];

const F = (id: string, name: string, group: string, def: boolean, about: string): Feature => ({
  id,
  name,
  group,
  def,
  about,
  ported: false,
  level: FULL,
});

export const ALL: Feature[] = [
  // dashboard
  F("road", "Moving road under the car", "Dashboard", true, "Dashes move with your speed"),
  F("arrows", "Turn indicator arrows", "Dashboard", true, "Needs the indicator setup in Car signals"),
  F("weather", "Weather", "Dashboard", true, "Open-Meteo, every 15 minutes"),
  F("news", "News box", "Dashboard", true, "Top 5 headlines from Google News, read aloud on a tap"),
  F("rain", "Weather alerts", "Dashboard", true, "Rain here or on your route, waterlogging spots you've marked, and poor air"),
  F("pages", "Extra dashboard pages", "Dashboard", false, "Swipe sideways for a second and third set of boxes"),
  F("widgets", "Widgets from other apps", "Dashboard", true, "Put another app's widget in a box"),
  F("saver", "Clock screensaver", "Dashboard", false, "Big clock after a few idle minutes while parked"),
  F("ticker", "Notification ticker", "Dashboard", true, "Messages slide in along the top"),
  F("readAloud", "Read messages aloud", "Dashboard", false, "Says who sent a message, or the whole message"),
  F("nightDrive", "Night-drive mode", "Dashboard", true, "After sunset while driving: big red speed, dim red map, nothing else"),
  F("voice", "Voice commands (Hindi and English)", "Dashboard", true, "\"FM 91.1\", \"call Mom\", \"घर ले चलो\" from the mic; choose where the mic sits in Home screen"),
  F("smoothSpeed", "Smooth speed number", "Driving", true, "The speed eases between GPS readings and shows 0 when standing still, without flicker"),
  F("places", "Saved places for any navigation app", "Driving", true, "Long-press Navigation in the dock: Home, Office, the parked car and your own places; typing is blocked while moving"),
  F("tripShare", "Share the trip by QR code", "Driving", true, "A code family scan to see where you are and the route; nothing is sent online"),
  F("appDrawer", "Better all-apps screen", "Dashboard", true, "Search, A to Z or most used, pinned and recent apps, and a long press to pin, hide or uninstall"),
  F("dockStatus", "Status icons in the dock", "Dashboard", true, "Wi-Fi, mobile signal, Bluetooth, GPS and battery, for stereos that hide Android's status bar"),
  F("hourlyWeather", "Hourly weather", "Dashboard", true, "The next 24 hours' temperature and rain in a tall weather box, kept for offline use"),
  F("calendar", "Calendar box", "Dashboard", true, "Today's and the next few days' events from the unit's calendar"),
  F("artColour", "Music box colours from the album cover", "Dashboard", true, "The music box takes its colour from the song's cover"),
  F("seek", "Drag to seek in the music box", "Dashboard", true, "A bar with the time played; drag along it to move in the song (music apps that allow it)"),
  F("stopSummary", "Drive summary when stopped", "Dashboard", true, "Stopped for 5 seconds: distance, time, average and top speed of this drive in the car box"),
  F("setup", "Setup screens on first open", "Dashboard", true, "After installing: language, permissions, your car, the look, how much to show, your apps and the home app, step by step"),
  F("intro", "OpenRath logo when the app opens", "Dashboard", true, "The OpenRath wheel rolls in and the name appears, for two seconds; a tap skips it"),
  F("autoTheme", "Theme changes by itself", "Dashboard", false, "A theme for the night, and one for when a chosen phone connects"),
  F("tapFeedback", "Tap sound and buzz", "Dashboard", false, "A short tick and a buzz on each box and dock button"),
  F("perf", "Performance box", "Dashboard", false, "Frames per second, CPU use, temperature and free memory in a corner"),
  // driving
  F("speedAlerts", "Speed limit and camera alerts", "Driving", true, "Speaks and beeps near cameras and over the limit"),
  F("parking", "Parking", "Driving", true, "Saves the spot after 90 seconds standing still, with a photo, a QR code for your phone and a paid-parking reminder"),
  F("score", "Driving score", "Driving", true, "Harsh braking, hard starts and speeding"),
  F("achievements", "Badges for good driving", "Driving", true, "Smooth-driving streaks, weeks within the limit and distance milestones"),
  F("accel", "0–100 km/h timer", "Driving", true, "Times every standing start"),
  F("gpx", "Record routes (GPX export)", "Driving", true, "Kept 60 days on the unit only"),
  F("tolls", "Tolls", "Driving", true, "Toll plazas and costs on a planned route, and a countdown (with a FASTag lane reminder in India)"),
  F("reverse", "Reverse guide lines", "Driving", true, "Shown when reverse gear is engaged"),
  F("navTurns", "Next turn from your navigation app", "Driving", true, "The next turn from Google Maps, Waze and others, in a card on the dashboard"),
  F("overStrip", "Mini strip over other apps", "Driving", false, "The next turn and what's playing, along the bottom of other apps"),
  F("parkedSettings", "Settings only when stopped", "Driving", true, "Settings and their keyboard open when the car is stopped; a passenger can still open them"),
  F("fuelPrice", "Fuel and mileage", "Driving", true, "Trip cost from your city's petrol price, which drives used extra fuel, how far the tank goes, and a leak or theft check"),
  F("restStop", "Break reminder and rest stops", "Driving", true, "After 2 hours at the wheel, dhabas and pumps ahead"),
  F("dashcam", "Dashcam", "Driving", false, "Records a USB camera in 1-minute clips; a jolt keeps the clip"),
  F("zones", "School and hospital alerts", "Driving", true, "Slow down near schools at school times; no horn near hospitals"),
  F("highway", "Highway mode", "Driving", true, "Above 75 km/h for two minutes: message pop-ups wait, a slim highway strip shows"),
  F("parkedMusic", "Battery saver for parked music", "Driving", true, "Engine off and music on: pauses it after 20 minutes (reminds once without OBD)"),
  F("split", "Split the cost by UPI", "Driving", true, "A UPI QR code for each person's share of the petrol or tolls"),
  F("startSummary", "Daily and weekly summary", "Dashboard", true, "Each morning: weather, air, petrol range and service due. On Sundays: the week's km, costs and score"),
  F("lightsReminder", "Car-signal reminders", "Driving", true, "Headlights after sunset, doors and seat belts, by voice (needs the setup in Car signals)"),
  F("bumps", "Road learning", "Driving", true, "Learns speed-breakers and how long you wait at signals and tolls, and tells you next time"),
  F("duck", "Music dips for voice prompts", "Driving", true, "Music lowers while the car speaks a turn or a warning"),
  F("hotspot", "Guest Wi-Fi", "Phone", true, "A QR code passengers scan to join the unit's hotspot"),
  F("callScreen", "Call screen over other apps", "Phone", true, "Who is calling, with big Answer and End buttons, on top of whatever app is open"),
  F("maker", "Stereo maker's services", "Radio and music", true, "Topway, FYT, MTCD/Joying and szchoiceway units: FM in the radio box, Bluetooth calls, reverse gear and lights through the maker's own services. Off, or on other stereos: plain Android only (the radio app's controls, the system phone)"),
  F("projection", "Phone projection app", "Radio and music", true, "A button in the music box opens your wireless CarPlay or Android Auto app (ZLink, AutoKit and others)"),
  F("projectionAuto", "Open the projection app when the phone connects", "Radio and music", false, "Your CarPlay or Android Auto app opens by itself when a phone connects by Bluetooth"),
  F("androidAuto", "Android Auto built in", "Radio and music", false, "Plug in your phone with its cable and Android Auto shows on this screen"),
  F("androidAutoWireless", "Wireless Android Auto", "Radio and music", false, "A paired phone starts Android Auto by itself over Bluetooth and Wi-Fi, without the cable"),
  F("musicApp", "Radio and music screen", "Radio and music", true, "A tap on the music or radio box opens a full screen for FM, online radio, your music files and music apps"),
  F("radioText", "Big frequency from any radio app", "Radio and music", true, "Shows \"FM 98.3\" and the station name from the radio app's text"),
  F("soundboard", "Soundboard", "Radio and music", false, "A box of fun sounds (horn, fart, applause and more) that plays only when the car is stopped"),
  F("video", "Video window", "Radio and music", false, "Plays a video from the unit or a USB stick in a box; the picture shows only when the car is stopped"),
  F("soundProfiles", "Sound profiles", "Radio and music", false, "City, highway and night: equalizer and volume switch by themselves"),
  F("fog", "Fog mode", "Driving", true, "In thick fog: big speed, a slow guide and the next bend ahead"),
  // car
  F("view360", "360 view of your car", "Car", true, "Your car in 3D in its shape, colour and number plate, from any side; opens the stereo's 360 camera app when it has one"),
  F("cam360Turn", "360 camera on turn signals", "Car", false, "Below 15 km/h the indicator opens the stereo's 360 camera app (needs the indicators set up in Car signals)"),
  F("care", "Car service", "Car", true, "Oil, tyres, service, insurance and PUC reminders, the nearest workshops, and a call to book"),
  F("obd", "OBD-II engine data", "Car", true, "Needs a small plug-in OBD adapter (Bluetooth or Wi-Fi, often sold as ELM327)"),
  F("faultWords", "Fault codes in plain words", "Car", true, "Each fault code with what it means, what to check and how urgent it is, from a table kept on the unit"),
  F("askCar", "Ask the car by voice", "Car", true, "\"How's the engine?\", \"how much fuel?\", \"any faults?\" answered from the engine data"),
  F("ledStrip", "LED light strip", "Car", false, "A Bluetooth ELK-BLEDOM strip takes the theme's colour, dims at night and turns red for a warning"),
  F("tpms", "Tyre pressure sensors (TPMS)", "Car", false, "Bluetooth valve-cap sensors"),
  F("keys", "Steering-wheel buttons", "Car", true, "Your own action for each button"),
  F("longKeys", "Hold a steering-wheel button", "Car", true, "Each button can do a second action when held down"),
  F("wallet", "Car documents wallet", "Car", true, "Photos of the RC, insurance, PUC and licence, shown offline"),
  // family
  F("childLock", "Child-lock for apps", "Family", false, "Chosen apps can't be opened while moving"),
  F("profiles", "Driver profiles", "Family", false, "Each driver's own boxes, theme, volume and alerts"),
  F("kids", "Trip games for children", "Family", true, "Spot the colour, number plates, and how far to go"),
  // sound
  F("wake", "Recover after deep sleep", "Sound", true, "When the stereo wakes from sleep with the ignition, the GPS, music link and map start again"),
  F("resume", "Resume after switch-on", "Sound", true, "Plays what was on, at the same volume"),
  F("speedVolume", "Volume rises with speed", "Sound", false, "Louder on the highway, back down in town"),
  F("sourceVolume", "Volume for each music app", "Sound", false, "Each music app, FM and online radio come back at the volume they last played at"),
  F("eq", "Equalizer", "Sound", false, "Bass, treble and presets for the app's own sound"),
  F("quiet", "Quiet hours", "Sound", false, "Late at night: music turned down, no alert beeps"),
  // data
  F("offlineMap", "Without internet", "Driving", true, "Keeps the map of places you've seen, and uses the offline speech pack, for when there's no Wi-Fi"),
  F("bootArt", "Boot logo and animation maker", "Dashboard", true, "Your car's badge and name for the stereo's start-up screens"),
  F("backup", "Daily automatic backup", "Data", true, "Settings, fuel log and trips, kept on the unit"),
  F("updates", "App updates from GitHub", "Data", false, "Checks once a day for a new OpenRath and offers it when parked"),
  F("reports", "Crash and usage reports", "Data", false, "Which settings you open and any crashes, kept on the unit for you to share; off forgets them"),
  // cab drivers: one switch for all, then one each
  F("cab", "Cab driver tools", "Cab", false, "Earnings, fare meter, SOS and more; adds the Cab box and the Cab menu"),
  F("cabEarnings", "Earnings log", "Cab", true, "Rides and costs; today's and this week's net in the Cab box"),
  F("cabMeter", "Fare meter", "Cab", true, "Distance, waiting and night charge for the passenger, with a UPI QR to pay"),
  F("cabApps", "Ride app switch", "Cab", true, "Uber, Ola, Rapido, inDrive and Namma Yatri one tap away"),
  F("cabPapers", "Permit and badge reminders", "Cab", true, "Permit, fitness, badge, road tax, insurance and PUC, 15 days ahead"),
  F("cabCng", "CNG finder and fill log", "Cab", true, "Nearest CNG stations, and km per kg from your fills"),
  F("cabSpots", "Pickup hotspots", "Cab", true, "Where you got the most rides at this hour"),
  F("cabTarget", "Daily target and duty hours", "Cab", true, "A target bar, and a break reminder after long duty"),
  F("cabSos", "One-tap SOS", "Cab", true, "Texts your location to two contacts (or calls, without a SIM)"),
  F("cabQuiet", "Quiet ride", "Cab", true, "Passenger in: music down, messages not read aloud"),
  F("cabNotes", "Ride notes and lost items", "Cab", true, "Quick notes, and a photo of anything left in the car"),
  F("cabPhrases", "Phrases for passengers", "Cab", true, "Seat belt, OTP, AC, payment: spoken in Hindi, English or your language"),
];

/** The switch that decides `id`: itself, or the bigger switch it became part of. */
export function parent(id: string): string {
  for (const [part, whole] of PARTS) if (part === id) return whole;
  return id;
}

export function get(id: string): Feature | undefined {
  const p = parent(id);
  return ALL.find((f) => f.id === p);
}

for (const id of SIMPLE_IDS) (get(id) as Feature).level = SIMPLE;
for (const id of CUSTOM_IDS) (get(id) as Feature).level = CUSTOM;
for (const id of DEV_IDS) (get(id) as Feature).level = DEV;

/**
 * What this version does: the switches ported from 1.30 (old ids follow their new switch; the
 * features 1.35 removed are gone), and the ones added since in 1.42 and 1.44.
 */
const PORTED_130 = ["accel", "backup", "bootArt", "bumps", "cab", "cabApps", "cabCng", "cabEarnings", "cabMeter", "cabNotes", "cabPapers", "cabPhrases", "cabQuiet", "cabSos", "cabSpots", "cabTarget", "care", "childLock", "coach", "dashcam", "duck", "fog", "fuelCheck", "fuelPlan", "fuelPrice", "gpx", "highway", "hotspot", "kids", "lightsReminder", "monsoon", "news", "nightDrive", "parkLink", "parkPhoto", "parkTimer", "parkedMusic", "parking", "profiles", "quiet", "rain", "restStop", "resume", "road", "saver", "score", "serviceBooking", "serviceFinder", "soundProfiles", "speedAlerts", "speedVolume", "split", "startSummary", "tollAhead", "tolls", "tripShare", "view360", "voice", "waits", "wallet", "weather", "weekly", "zones", "aqi"];
const PORTED_144 = ["parkedSettings", "musicApp", "sourceVolume"];
const PORTED_142 = ["smoothSpeed", "stopSummary", "achievements", "places", "hourlyWeather", "calendar", "dockStatus", "tapFeedback", "soundboard", "video", "projection", "askCar", "faultWords", "wake", "setup", "intro", "autoTheme", "appDrawer", "reports", "seek"];

export const PORTED = new Set([...PORTED_130, ...PORTED_142, ...PORTED_144].map(parent).filter((id) => get(id) != null));
for (const f of ALL) f.ported = PORTED.has(f.id);

export function levelOf(name: string): number {
  const i = LEVELS.indexOf(name);
  return i < 0 ? CUSTOM : i;
}

/** Whether a feature is part of a level (DEV features never are). */
export function inLevel(f: Feature, level: number): boolean {
  return f.level <= level && f.level !== DEV;
}

/** The switch a feature gets when the owner picks a level. */
export function onAt(f: Feature, level: number, now: boolean): boolean {
  if (f.level === DEV) return now;
  if (!inLevel(f, level)) return false;
  return ASK_FIRST.has(f.id) ? now : f.def;
}

/** The owner's level; Custom (everything, as before levels) until one is picked. */
export function level(p: Prefs): number {
  return levelOf(p.str('level', 'custom'));
}

export function levelPicked(p: Prefs): boolean {
  return p.str('level', '') !== '';
}

/** Pick a level: its features go back to their usual switch, the rest off. Each can still be changed. */
export function setLevel(p: Prefs, lv: number): void {
  p.put('level', LEVELS[lv]);
  for (const f of ALL) {
    if (f.level === DEV) continue;
    set(p, f.id, onAt(f, lv, on(p, f.id)));
  }
}

/** Developer mode: seven taps on Settings > Version. */
export function dev(p: Prefs): boolean {
  return p.str('devMode', 'off') === 'on';
}

/** Whether Settings shows this feature's switch: those of the owner's level, or every one in developer mode. */
export function shown(p: Prefs, f: Feature): boolean {
  return dev(p) || inLevel(f, level(p));
}

/** Where the voice mic sits: "map" (only the map's), "float" (a floating button) or "apps" (floating, also over other apps). */
export function micPlace(p: Prefs): string {
  const m = p.str('micPlace', '');
  if (m !== '') return m;
  // before there was one setting: what the two old switches said
  if (p.str('feat:floatMic', 'on') === 'off') return 'map';
  return p.str('feat:micOverApps', 'on') === 'off' ? 'float' : 'apps';
}

/** Speed alerts are kept in the older "alerts" switch (a boolean in the Android app's backups). */
function alertsOn(p: Prefs): boolean {
  const a = p.str('alerts', '');
  if (a !== '') return a !== 'false';
  return p.str('feat:speedAlerts', 'on') === 'on';   // the first React Native builds kept it here
}

export function on(p: Prefs, id: string): boolean {
  if (id === 'floatMic') return on(p, 'voice') && micPlace(p) !== 'map';
  if (id === 'micOverApps') return on(p, 'voice') && micPlace(p) === 'apps';
  id = parent(id);
  if (id === 'speedAlerts') return alertsOn(p);
  const f = get(id);
  return p.str('feat:' + id, !f || f.def ? 'on' : 'off') === 'on';
}

export function set(p: Prefs, id: string, value: boolean): void {
  id = parent(id);
  p.put('feat:' + id, value ? 'on' : 'off');
  if (id === 'speedAlerts') p.put('alerts', value ? 'true' : 'false');   // the older switch, kept in step
}

/** Feature groups in the order Features.java lists them. */
export function groups(): string[] {
  return [...new Set(ALL.map((f) => f.group))];
}
