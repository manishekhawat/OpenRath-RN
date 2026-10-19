/**
 * The map: the Android version's own map page (Leaflet, search, OSRM routes with turn-by-turn,
 * tolls, rain on the route, parking spot), in a WebView. On Android the page talked to the app
 * through a Java bridge called `OpenRath`; here a small shim with the same methods forwards each
 * call as a message, and answers the questions the page asks synchronously from values the app
 * keeps up to date in `window.__OR`. What the bridge saves uses the Java bridge's keys and
 * formats (MapCard.Bridge, 1.42): 'place:Home' / 'place:Office' as "lat,lon", 'dest' as
 * "name|lat|lon", 'myService' as "name|phone", the navigation choice in 'src:navi'. The bridge is
 * there for this page alone, so the pane stays on it: a link in the page (Leaflet's attribution,
 * say) opens in the browser instead, and what the page hands the bridge is checked before it is
 * used, as the Java bridge checked it.
 *
 * Opened with ?q=<place> it searches for that place, and with ?go=home|office|fuel|rest|service
 * it runs that voice command, once the page has loaded (how the mic button hands over).
 *
 * 1.38: a crashing map no longer closes OpenRath. Android's WebView renderer can die (out of
 * memory, a WebView update); the page is then built again, and after two deaths in five minutes
 * it rests for five minutes with a note (MapCard.resting). 1.35: night dimming ('dim',
 * 'dimLevel') darkens the map as it does the dashboard, and 1.39's deep-sleep recovery loads the
 * page again after the stereo wakes.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { heard, listen, mapCall } from '../components/MicButton';
import { QrSheet } from '../components/Qr';
import { Button } from '../components/ui';
import * as Car from '../logic/car';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { mapsLink } from '../logic/geo';
import { f, t } from '../logic/i18n';
import { num } from '../logic/prefs';
import * as Wake from '../logic/wake';
import { MAP_HTML } from '../map/mapHtml';
import { say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** The page's `OpenRath` object: calls become messages; answers come from window.__OR. */
const SHIM = `
(function () {
  var cfg = function () { return window.__OR || {}; };
  var send = function (fn, args) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ fn: fn, args: Array.prototype.slice.call(args) }));
  };
  var calls = ['navigate', 'navigateOffline', 'setNavMode', 'speak', 'routeRain', 'parkHere', 'call', 'saveService',
               'destination', 'savedPlace', 'bigQr', 'voice'];
  var o = {};
  calls.forEach(function (n) { o[n] = function () { if (n === 'setNavMode') window.__OR.navMode = arguments[0]; send(n, arguments); }; });
  o.online = function () { return cfg().online !== false; };
  o.offlineNavName = function () { return cfg().offlineNav || ''; };
  o.navMode = function () { return cfg().navMode || 'own'; };
  o.tollRate = function () { return cfg().tollRate == null ? 100 : cfg().tollRate; };
  o.parkLink = function () { return !!cfg().parkLink; };
  o.carBrand = function () { return cfg().carBrand || ''; };
  o.brandWords = function () { return cfg().brandWords || ''; };
  o.serviceFinder = function () { return cfg().serviceFinder !== false; };
  window.OpenRath = o;
})();
true;
`;

/** Where Go guides: "own" (this map) or "google" (Prefs.source("navi"); "dzire" was the old name for own). */
function navMode(v: string): string {
  return v === 'google' ? 'google' : 'own';
}

/** Java's String.format(Locale.US, "%.6f", x). */
const f6 = (x: unknown) => Number(x).toFixed(6);

/** A place from the page, written as the bridge writes it; null when it isn't a pair of numbers. */
function latLon(a: unknown, b: unknown): [string, string] | null {
  const lat = Number(a);
  const lon = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [f6(lat), f6(lon)];
}

/** A name or note from the page, cut to the length a setting holds. */
const short = (v: unknown) => String(v ?? '').substring(0, 200);

/** The map page's own address (the WebView's baseUrl); the whitelist is matched against the origin. */
const ORIGIN = 'https://openrath.local';
const BASE = ORIGIN + '/';

/**
 * Whether the pane may go there: the page itself, and the blank page Android loads it into. The
 * page's links (Leaflet's attribution, the OSM copyright) would otherwise open the open web in
 * the pane, where the bridge is still there to be called.
 */
export function pageUrl(url: string): boolean {
  // the trailing slash matters: "https://openrath.local.example.com/" is somewhere else
  return url === 'about:blank' || url.startsWith(BASE);
}

/**
 * The offline map app Go hands over to (OfflineNav): the one chosen in Settings
 * ('app:offlineNav'), by its name when it is one of the known ones. Android also looked through
 * the installed apps for Organic Maps, OsmAnd or Google Maps; listing apps needs native code, so
 * with nothing chosen the `geo:` link lets Android pick, and the page says nothing by name.
 */
const OFFLINE_NAMES: Record<string, string> = {
  'app.organicmaps': 'Organic Maps',
  'net.osmand.plus': 'OsmAnd+',
  'net.osmand': 'OsmAnd',
  'com.google.android.apps.maps': 'Google Maps',
};

function offlineNavName(pkg: string): string {
  return pkg === '' ? '' : (OFFLINE_NAMES[pkg] ?? pkg);
}

/** When the map's renderer last died, newest first (MapCard.deaths). */
const deaths = [0, 0];

/** True when the map died twice in five minutes: show a note instead, until five minutes pass. */
export function resting(now: number, last: number, before: number): boolean {
  return before > 0 && last - before < 5 * 60000 && now - last < 5 * 60000;
}

/** How dark the night layer over the map is, 0–1 ('dim' and 'dimLevel', one row since 1.35). */
export function dimAlpha(mode: string, level: number, lightsOn: boolean, dark: boolean): number {
  const night = mode === 'lights' ? lightsOn : mode === 'sunset' ? dark : false;
  return night ? Math.max(0, Math.min(100, level)) / 100 : 0;
}

export default function MapScreen() {
  const { prefs } = usePrefs();
  const params = useLocalSearchParams<{ q?: string; go?: string }>();
  const pending = useRef<{ q?: string; go?: string }>({ q: params.q, go: params.go });
  const look = useLook();
  const { trip, setPark } = useDrive();
  const [parkQr, setParkQr] = useState(false);
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const sent = useRef({ lat: 0, lon: 0, park: 0 });
  /** rebuilt after the renderer dies, so the WebView starts over (1.38) */
  const [build, setBuild] = useState(0);
  const [rest, setRest] = useState(() => resting(Date.now(), deaths[0], deaths[1]));
  const net = Network.useNetworkState();
  const offlineNav = prefs.str('app:offlineNav', '');

  const cfg = {
    online: net.isInternetReachable !== false && net.isConnected !== false,
    navMode: navMode(prefs.str('src:navi', 'own')),
    tollRate: Features.on(prefs, 'tolls') ? num(prefs, 'tollRate', 100) : 0,
    // 'parkLink' and 'serviceFinder' became part of 'parking' and 'care' in 1.35
    parkLink: Features.on(prefs, 'parking'),
    carBrand: Car.brandName(prefs),
    brandWords: Car.searchWords(Car.brand(prefs), Car.brandName(prefs)),
    serviceFinder: Features.on(prefs, 'care'),
    offlineNav: offlineNavName(offlineNav),
  };
  const cfgJs = `window.__OR = ${JSON.stringify(cfg)};`;

  const push = () => {
    if (!ready.current || !web.current) return;
    const s = sent.current;
    if (trip.park && trip.park.at !== s.park) {
      s.park = trip.park.at;
      web.current.injectJavaScript(`setPark(${trip.park.lat},${trip.park.lon},${trip.park.at});true;`);
    }
    if (trip.lat === 0 || (Math.abs(trip.lat - s.lat) < 1e-5 && Math.abs(trip.lon - s.lon) < 1e-5)) return;
    s.lat = trip.lat;
    s.lon = trip.lon;
    const hdg = trip.heading >= 0 && trip.kmh > 3.6 ? trip.heading : -1;
    web.current.injectJavaScript(`setPos(${trip.lat},${trip.lon},${Math.round(hdg)},${(trip.kmh / 3.6).toFixed(1)});true;`);
  };

  useEffect(push);

  // the page asks these as it needs them, so new values only have to be put where it looks
  useEffect(() => {
    if (ready.current) web.current?.injectJavaScript(cfgJs + 'true;');
     
  }, [cfgJs]);

  // after deep sleep the page's tiles and position are stale: load it again (Wake.java, 1.39)
  useEffect(
    () =>
      Wake.onWoke(() => {
        ready.current = false;
        setBuild((n) => n + 1);
      }),
    [],
  );

  // the renderer died: build the map again, or rest for five minutes after twice in five
  const died = () => {
    deaths[1] = deaths[0];
    deaths[0] = Date.now();
    ready.current = false;
    if (resting(Date.now(), deaths[0], deaths[1])) {
      setRest(true);
      setTimeout(() => {
        setRest(false);
        setBuild((n) => n + 1);
      }, 5 * 60000 + 1000);
    } else setBuild((n) => n + 1);
  };

  /** Run a function of the map page (MapCard.js). */
  const js = (code: string) => web.current?.injectJavaScript(code + ';true;');
  /** What voice search heard, for the page's search box (MapCard.voiceResult). */
  const voiceResult = (text: string | null) => js(text == null ? 'voiceResult(null)' : 'voiceResult(' + JSON.stringify(text) + ')');

  // a search or a place command handed over by the mic button, once the page is ready
  const handOver = () => {
    const p = pending.current;
    pending.current = {};
    if (p.q) voiceResult(p.q);
    else if (p.go && mapCall(p.go)) js(mapCall(p.go));
  };
  useEffect(() => {
    if (params.q || params.go) {
      pending.current = { q: params.q, go: params.go };
      if (ready.current) handOver();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.go]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { fn: string; args: unknown[] };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const a = m.args;
    switch (m.fn) {
      case 'speak':
        say(String(a[0]));
        break;
      case 'navigate': {
        // guide in Google Maps
        const at = latLon(a[0], a[1]);
        if (!at) break;
        Linking.openURL(`google.navigation:q=${at[0]},${at[1]}`).catch(() =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${at[0]},${at[1]}&travelmode=driving`),
        );
        break;
      }
      case 'navigateOffline': {
        // Google Maps starts guiding; the others show the place to route to (OfflineNav.uri)
        const at = latLon(a[0], a[1]);
        if (!at) break;
        const url =
          offlineNav === 'com.google.android.apps.maps'
            ? `google.navigation:q=${at[0]},${at[1]}`
            : `geo:${at[0]},${at[1]}?q=${at[0]},${at[1]}(${encodeURIComponent(String(a[2] ?? ''))})`;
        if (offlineNav !== '' && Platform.OS === 'android') {
          IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: url, packageName: offlineNav }).catch(() =>
            Linking.openURL(url).catch(() => {}),
          );
        } else Linking.openURL(url).catch(() => {});
        break;
      }
      case 'setNavMode':
        prefs.put('src:navi', navMode(String(a[0])));
        break;
      case 'parkHere': {
        const at = latLon(a[0], a[1]);
        if (at) setPark(Number(at[0]), Number(at[1]));
        break;
      }
      case 'call': {
        // 1.43: a tap on a phone number asks first, so the map can't ring a stranger (MapCard.confirmCall)
        const n = String(a[0] ?? '').replace(/[^0-9+]/g, '');
        if (!n) break;
        Alert.alert(f('Call %1$s?', n), undefined, [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Call'), onPress: () => Linking.openURL('tel:' + n).catch(() => {}) },
        ]);
        break;
      }
      case 'saveService':
        // "Mine" on a service centre: kept for the service booking reminder
        prefs.put('myService', short(a[0]).replace(/\|/g, ' ') + '|' + short(a[1]));
        break;
      case 'destination': {
        // where the map is taking you, for the kids' distance countdown
        const at = latLon(a[1], a[2]);
        if (!at) break;
        const name = short(a[0]).replace(/\|/g, ' ');
        if (!prefs.str('dest', '').startsWith(name + '|')) prefs.put('destNick', ''); // a new place: the children's name for the old one no longer fits
        prefs.put('dest', name + '|' + at[0] + '|' + at[1]);
        break;
      }
      case 'savedPlace': {
        // the map's saved Home and Office, so the dock's saved places and drive names can use them
        const at = latLon(a[1], a[2]);
        if (at && (a[0] === 'Home' || a[0] === 'Office')) prefs.put('place:' + a[0], at[0] + ',' + at[1]);
        break;
      }
      case 'bigQr':
        // the parking spot as a QR code, to walk back to the car with the phone (HomeActivity.parkQr)
        if (!Features.on(prefs, 'parking')) Alert.alert(t('Turn on "Parking spot to your phone" in Settings > Driving'));
        else if (!trip.park) Alert.alert(t('No parking spot saved yet'));
        else setParkQr(true);
        break;
      case 'routeRain':
        prefs.put('routeRain', short(a[0]));
        break;
      case 'voice':
        // the page's mic: commands are carried out, anything else goes back to its search box
        listen(prefs).then((said) => heard(said, { prefs, mapJs: js, voiceResult }));
        break;
    }
  };

  // the night layer over the map, as dark as Settings' night dimming says (one row since 1.35).
  // "With the headlights" needs the unit's own lights, which need native code, so only "after
  // sunset" dims here.
  const dim = dimAlpha(prefs.str('dim', 'off'), num(prefs, 'dimLevel', 40), false, trip.lat !== 0 && Errands.dark(trip.lat, trip.lon, Date.now()));

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: look.background }]}>
      {rest ? (
        <View style={[styles.fill, styles.note]}>
          <Text style={[styles.noteText, { color: look.textDim }]}>
            {t("The map stopped working twice, so it's resting. It comes back in a few minutes.")}
          </Text>
        </View>
      ) : (
        <WebView
          key={build}
          ref={web}
          style={styles.fill}
          originWhitelist={[ORIGIN]}
          source={{ html: MAP_HTML, baseUrl: BASE }}
          injectedJavaScriptBeforeContentLoaded={cfgJs + SHIM}
          onMessage={onMessage}
          // a tap on a link in the page opens it outside, where there is no bridge to call
          onShouldStartLoadWithRequest={(r) => {
            if (pageUrl(r.url)) return true;
            Linking.openURL(r.url).catch(() => {});
            return false;
          }}
          onLoadEnd={() => {
            ready.current = true;
            sent.current = { lat: 0, lon: 0, park: 0 };
            web.current?.injectJavaScript(cfgJs + 'true;');
            push();
            handOver();
          }}
          // the renderer dying used to take OpenRath with it (1.38)
          onRenderProcessGone={died}
          onContentProcessDidTerminate={died}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled={false}
          setSupportMultipleWindows={false}
        />
      )}
      {dim > 0 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: dim }]} /> : null}
      <View style={styles.back}>
        <Button label="‹ Home" onPress={() => router.back()} />
      </View>
      <QrSheet
        visible={parkQr && !!trip.park}
        title="Where the car is parked"
        text={trip.park ? mapsLink(trip.park.lat, trip.park.lon) : ''}
        caption="Scan with your phone to open the spot in Google Maps and walk back to the car."
        onClose={() => setParkQr(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  note: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  noteText: { fontSize: 15, textAlign: 'center' },
  back: { position: 'absolute', left: 12, bottom: 12 },
});
