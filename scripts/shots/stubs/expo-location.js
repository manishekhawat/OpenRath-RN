// A stereo's GPS, for the screenshots: a canned drive along Ring Road in Delhi at about 48 km/h,
// so the dashboard shows a car that is moving instead of "no GPS".
export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };
export const ActivityType = { Other: 1, AutomotiveNavigation: 2, Fitness: 3, OtherNavigation: 4, Airborne: 5 };

const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
const KMH = 48;
const MS = KMH / 3.6;
const START = { lat: 28.6139, lon: 77.209 };
let sent = 0;

function fix(now = Date.now()) {
  // a straight run east, one fix a second
  const metres = MS * sent++;
  return {
    coords: {
      latitude: START.lat + metres / 111320 * 0.1,
      longitude: START.lon + (metres * 0.995) / (111320 * Math.cos((START.lat * Math.PI) / 180)),
      altitude: 216,
      accuracy: 5,
      altitudeAccuracy: 3,
      heading: 92,
      speed: MS,
    },
    timestamp: now,
    mocked: true,
  };
}

export async function requestForegroundPermissionsAsync() {
  return granted;
}
export async function getForegroundPermissionsAsync() {
  return granted;
}
export async function requestBackgroundPermissionsAsync() {
  return granted;
}
export async function getBackgroundPermissionsAsync() {
  return granted;
}
export async function hasServicesEnabledAsync() {
  return true;
}
export async function getLastKnownPositionAsync() {
  return fix();
}
export async function watchPositionAsync(_options, callback) {
  callback(fix());
  const timer = setInterval(() => callback(fix()), 1000);
  return {
    remove() {
      clearInterval(timer);
    },
  };
}
export async function startLocationUpdatesAsync() {
  // no background task in a browser, so the app falls back to its watch and gets the fixes above
  throw new Error('no background location here');
}
export async function stopLocationUpdatesAsync() {}
export async function hasStartedLocationUpdatesAsync() {
  return false;
}
export async function reverseGeocodeAsync() {
  return [{ city: 'New Delhi', subregion: 'New Delhi', region: 'Delhi', country: 'India' }];
}
