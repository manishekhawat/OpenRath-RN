/**
 * The map: the Android version's own map page (Leaflet, search, OSRM routes with turn-by-turn,
 * tolls, rain on the route, parking spot), in a WebView. On Android the page talked to the app
 * through a Java bridge called `OpenRath`; here a small shim with the same methods forwards each
 * call as a message, and answers the questions the page asks synchronously from values the app
 * keeps up to date in `window.__OR`. What the bridge saves uses the Java bridge's keys and
 * formats (Cards.MapCard.Bridge, 1.30): 'place:Home' / 'place:Office' as "lat,lon", 'dest' as
 * "name|lat|lon", 'myService' as "name|phone", the navigation choice in 'src:navi'.
 *
 * Opened with ?q=<place> it searches for that place, and with ?go=home|office|fuel|rest|service
 * it runs that voice command, once the page has loaded (how the mic button hands over).
 */
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { heard, listen, mapCall } from '../components/MicButton';
import { QrSheet } from '../components/Qr';
import { Button } from '../components/ui';
import * as Car from '../logic/car';
import * as Features from '../logic/features';
import { mapsLink } from '../logic/geo';
import { num } from '../logic/prefs';
import { MAP_HTML } from '../map/mapHtml';
import { say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { router, useLocalSearchParams } from 'expo-router';

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
  o.offlineNavName = function () { return ''; };
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

  const cfg = {
    online: true,
    navMode: navMode(prefs.str('src:navi', 'own')),
    tollRate: Features.on(prefs, 'tolls') ? num(prefs, 'tollRate', 100) : 0,
    parkLink: Features.on(prefs, 'parkLink'),
    carBrand: Car.brandName(prefs),
    brandWords: Car.searchWords(Car.brand(prefs), Car.brandName(prefs)),
    serviceFinder: Features.on(prefs, 'serviceFinder'),
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
      case 'navigate':
        // guide in Google Maps
        Linking.openURL(`google.navigation:q=${a[0]},${a[1]}`).catch(() =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${a[0]},${a[1]}&travelmode=driving`),
        );
        break;
      case 'navigateOffline':
        Linking.openURL(`geo:${a[0]},${a[1]}?q=${a[0]},${a[1]}(${encodeURIComponent(String(a[2] ?? ''))})`).catch(() => {});
        break;
      case 'setNavMode':
        prefs.put('src:navi', navMode(String(a[0])));
        break;
      case 'parkHere':
        setPark(Number(a[0]), Number(a[1]));
        break;
      case 'call':
        Linking.openURL('tel:' + String(a[0]).replace(/[^0-9+]/g, '')).catch(() => {});
        break;
      case 'saveService':
        // "Mine" on a service centre: kept for the service booking reminder
        prefs.put('myService', String(a[0] ?? '').replace(/\|/g, ' ') + '|' + String(a[1] ?? ''));
        break;
      case 'destination': {
        // where the map is taking you, for the kids' distance countdown
        const name = String(a[0] ?? '').replace(/\|/g, ' ');
        if (!prefs.str('dest', '').startsWith(name + '|')) prefs.put('destNick', ''); // a new place: the children's name for the old one no longer fits
        prefs.put('dest', name + '|' + f6(a[1]) + '|' + f6(a[2]));
        break;
      }
      case 'savedPlace':
        // the map's saved Home and Office, so drives can be named for the commute insights
        if (a[0] === 'Home' || a[0] === 'Office') prefs.put('place:' + a[0], f6(a[1]) + ',' + f6(a[2]));
        break;
      case 'bigQr':
        // the parking spot as a QR code, to walk back to the car with the phone (HomeActivity.parkQr)
        if (!Features.on(prefs, 'parkLink')) Alert.alert('Turn on "Parking spot to your phone" in Settings > Features');
        else if (!trip.park) Alert.alert('No parking spot saved yet');
        else setParkQr(true);
        break;
      case 'routeRain':
        prefs.put('routeRain', String(a[0] ?? ''));
        break;
      case 'voice':
        // the page's mic: commands are carried out, anything else goes back to its search box
        listen(prefs).then((said) => heard(said, { prefs, mapJs: js, voiceResult }));
        break;
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: look.background }]}>
      <WebView
        ref={web}
        style={styles.fill}
        originWhitelist={['*']}
        source={{ html: MAP_HTML, baseUrl: 'https://openrath.local/' }}
        injectedJavaScriptBeforeContentLoaded={cfgJs + SHIM}
        onMessage={onMessage}
        onLoadEnd={() => {
          ready.current = true;
          sent.current = { lat: 0, lon: 0, park: 0 };
          web.current?.injectJavaScript(cfgJs + 'true;');
          push();
          handOver();
        }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
      />
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
  back: { position: 'absolute', left: 12, bottom: 12 },
});
