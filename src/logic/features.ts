/**
 * Every optional feature, each with its own switch in Settings > Features (generated from
 * Features.java). `ported` marks the ones this React Native version already does; the rest are
 * listed so their switches and saved values carry over, and are shown as "coming" in Settings.
 */
import type { Prefs } from './prefs.ts';

export interface Feature {
  id: string;
  name: string;
  group: string;
  def: boolean;
  about: string;
  ported: boolean;
}

const F = (id: string, name: string, group: string, def: boolean, about: string): Feature => ({
  id,
  name,
  group,
  def,
  about,
  ported: PORTED.has(id),
});

export const PORTED = new Set(["aqi", "care", "fuelCheck", "fuelPrice", "holidayTraffic", "nightDrive", "parking", "rain", "road", "score", "speedAlerts", "startSummary", "weather"]);

export const ALL: Feature[] = [
  F("road", "Moving road under the car", "Dashboard", true, "Dashes move with your speed"),
  F("arrows", "Turn indicator arrows", "Dashboard", true, "Needs the indicator setup in Car signals"),
  F("weather", "Weather", "Dashboard", true, "Open-Meteo, every 15 minutes"),
  F("news", "News box", "Dashboard", true, "Top 5 headlines from Google News, read aloud on a tap"),
  F("rain", "Rain warnings", "Dashboard", true, "Rain here, or along your route, in the weather box"),
  F("pages", "Extra dashboard pages", "Dashboard", false, "Swipe sideways for a second and third set of boxes"),
  F("widgets", "Widgets from other apps", "Dashboard", true, "Put another app's widget in a box"),
  F("saver", "Clock screensaver", "Dashboard", false, "Big clock after a few idle minutes while parked"),
  F("ticker", "Notification ticker", "Dashboard", true, "Messages slide in along the top"),
  F("readAloud", "Read messages aloud", "Dashboard", false, "Says who sent a message, or the whole message"),
  F("nightDrive", "Night-drive mode", "Dashboard", true, "After sunset while driving: big red speed, dim red map, nothing else"),
  F("voice", "Voice commands (Hindi and English)", "Dashboard", true, "\"FM 91.1\", \"call Mom\", \"घर ले चलो\" from the map's mic"),
  F("floatMic", "Floating mic button", "Dashboard", true, "Drag it anywhere on the home screen; tap for a voice command"),
  F("tripShare", "Share the trip by QR code", "Driving", true, "A code family scan to see where you are and the route; nothing is sent online"),
  F("micOverApps", "Mic over other apps", "Dashboard", true, "The floating mic stays on top of maps and music; needs the \"Display over other apps\" permission"),
  F("perf", "Performance box", "Dashboard", false, "Frames per second, CPU use and temperature in a corner"),
  F("speedAlerts", "Speed limit and camera alerts", "Driving", true, "Speaks and beeps near cameras and over the limit"),
  F("parking", "Remember where you parked", "Driving", true, "Saves the spot after 90 seconds standing still"),
  F("score", "Driving score", "Driving", true, "Harsh braking, hard starts and speeding"),
  F("accel", "0–100 km/h timer", "Driving", true, "Times every standing start"),
  F("gpx", "Record routes (GPX export)", "Driving", true, "Kept 60 days on the unit only"),
  F("tolls", "Toll estimates on routes", "Driving", true, "Toll plazas on a planned route, in rupees"),
  F("reverse", "Reverse guide lines", "Driving", true, "Shown when reverse gear is engaged"),
  F("fuelPrice", "Petrol cost of trips", "Driving", true, "Today's cost from your city's petrol price"),
  F("coach", "Mileage coach", "Driving", true, "Which drives used extra fuel, and why"),
  F("restStop", "Break reminder and rest stops", "Driving", true, "After 2 hours at the wheel, dhabas and pumps ahead"),
  F("dashcam", "Dashcam", "Driving", false, "Records a USB camera in 1-minute clips; a jolt keeps the clip"),
  F("parkLink", "Parking spot to your phone", "Driving", true, "A QR code that opens the spot in Google Maps"),
  F("monsoon", "Monsoon mode", "Driving", true, "In rain, warns before the waterlogging spots you've marked"),
  F("fuelPlan", "Fuel-low planner", "Driving", true, "How far the petrol will go; pumps ahead when it's low"),
  F("commute", "Commute insights", "Driving", true, "The quickest time to leave for your usual drives"),
  F("tollAhead", "Toll plaza countdown", "Driving", true, "\"Toll in 2 km, about ₹100\", with a FASTag lane reminder"),
  F("wrongWay", "Wrong-way warning", "Driving", true, "Warns if you seem to drive against a one-way street"),
  F("zones", "School and hospital alerts", "Driving", true, "Slow down near schools at school times; no horn near hospitals"),
  F("hill", "Hill (ghat) road tips", "Driving", true, "On a long steep climb or descent: lower gear, engine braking, who gives way"),
  F("overtake", "Overtaking warning", "Driving", true, "On two-way roads, says when a bend just ahead hides oncoming traffic"),
  F("aqi", "Air quality alerts", "Driving", true, "Open-Meteo; when the air is poor, a reminder to set the AC to recirculate"),
  F("highway", "Highway mode", "Driving", true, "Above 75 km/h for two minutes: message pop-ups wait, a slim highway strip shows"),
  F("parkedMusic", "Battery saver for parked music", "Driving", true, "Engine off and music on: pauses it after 20 minutes (reminds once without OBD)"),
  F("split", "Split the cost by UPI", "Driving", true, "A UPI QR code for each person's share of the petrol or tolls"),
  F("parkTimer", "Paid parking reminder", "Driving", true, "A QR code that puts a reminder on your phone before the parking runs out"),
  F("startSummary", "Start-up summary", "Dashboard", true, "Once a day: weather, air, petrol range, service due and holidays"),
  F("lightsReminder", "Headlight reminder", "Driving", true, "After sunset, once a drive, if the headlights look off (or can't be seen)"),
  F("chimes", "Door and seat-belt reminders", "Driving", true, "A voice instead of beeps; needs the door or belt setup in Car signals"),
  F("waits", "Wait-time memory", "Driving", true, "Learns how long you wait at signals and toll plazas, and tells you as you approach"),
  F("bumps", "Speed-breaker learning", "Driving", true, "A spot where you brake hard on three drives gets a warning next time"),
  F("duck", "Music dips for voice prompts", "Driving", true, "Music lowers while the car speaks a turn or a warning"),
  F("parkPhoto", "Parking photo", "Driving", true, "A camera photo when you park, to find the car in a big lot (needs a camera)"),
  F("weekly", "Weekly report", "Driving", true, "On Sundays: km, time, petrol, tolls, score, best and worst drive"),
  F("hotspot", "Guest Wi-Fi", "Phone", true, "A QR code passengers scan to join the unit's hotspot"),
  F("maker", "Stereo maker's services", "Radio and music", true, "On Topway units: FM in the radio box, Bluetooth calls and reverse gear through Topway's own apps. Off, or on other stereos: plain Android only (the radio app's controls, the system phone)"),
  F("soundProfiles", "Sound profiles", "Radio and music", false, "City, highway and night: equalizer and volume switch by themselves"),
  F("fog", "Fog mode", "Driving", true, "In thick fog: big speed, a slow guide and the next bend ahead"),
  F("accidentHelp", "Accident help", "Driving", false, "After a crash-like stop, calls your emergency contact unless you tap I'm OK"),
  F("holidayTraffic", "Holiday traffic warning", "Driving", true, "Before festival and long-weekend drives, warns of busy highways"),
  F("care", "Service reminders", "Car", true, "Oil, tyres, service, insurance and PUC"),
  F("fuelCheck", "Fuel leak or theft check", "Car", true, "After a full tank: warns if the mileage dropped sharply"),
  F("wash", "Car wash reminder", "Car", true, "Every two weeks or as you set, only when no rain is due"),
  F("obd", "OBD-II engine data", "Car", true, "Needs a Bluetooth ELM327 adapter"),
  F("tpms", "Tyre pressure sensors (TPMS)", "Car", false, "Bluetooth valve-cap sensors"),
  F("keys", "Steering-wheel buttons", "Car", true, "Your own action for each button"),
  F("serviceFinder", "Service centre finder", "Car", true, "Nearest workshops for your car's brand, with a call button"),
  F("serviceBooking", "Service booking reminder", "Car", true, "When a service is near, offers to call your service centre"),
  F("wallet", "Car documents wallet", "Car", true, "Photos of the RC, insurance, PUC and licence, shown offline"),
  F("childLock", "Child-lock for apps", "Family", false, "Chosen apps can't be opened while moving"),
  F("profiles", "Driver profiles", "Family", false, "Each driver's own boxes, theme, volume and alerts"),
  F("kids", "Trip games for children", "Family", true, "Spot the colour, number plates, and how far to go"),
  F("resume", "Resume after switch-on", "Sound", true, "Plays what was on, at the same volume"),
  F("speedVolume", "Volume rises with speed", "Sound", false, "Louder on the highway, back down in town"),
  F("eq", "Equalizer", "Sound", false, "Bass, treble and presets for the app's own sound"),
  F("quiet", "Quiet hours", "Sound", false, "Late at night: music turned down, no alert beeps"),
  F("offlineMap", "Map without internet", "Driving", true, "Keeps the map of places you've seen, for when there's no Wi-Fi"),
  F("offlineVoice", "Voice without internet", "Driving", true, "Uses the offline speech pack when there's no Wi-Fi"),
  F("bootArt", "Boot logo and animation maker", "Dashboard", true, "Your car's badge and name for the stereo's start-up screens"),
  F("backup", "Daily automatic backup", "Data", true, "Settings, fuel log and trips to OpenRath/backup"),
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

export const get = (id: string) => ALL.find((f) => f.id === id);

export function on(p: Prefs, id: string): boolean {
  const f = get(id);
  return p.str('feat:' + id, !f || f.def ? 'on' : 'off') === 'on';
}

export function set(p: Prefs, id: string, value: boolean): void {
  p.put('feat:' + id, value ? 'on' : 'off');
}

/** Feature groups in the order Settings shows them. */
export function groups(): string[] {
  return [...new Set(ALL.map((f) => f.group))];
}
