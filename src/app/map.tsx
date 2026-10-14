/**
 * The map: the Android version's own map page (Leaflet, search, OSRM routes with turn-by-turn,
 * tolls, rain on the route, parking spot), in a WebView. On Android the page talked to the app
 * through a Java bridge called `OpenRath`; here a small shim with the same methods forwards each
 * call as a message, and answers the questions the page asks synchronously from values the app
 * keeps up to date in `window.__OR`.
 */
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Button } from '../components/ui';
import * as Car from '../logic/car';
import * as Features from '../logic/features';
import { num } from '../logic/prefs';
import { MAP_HTML } from '../map/mapHtml';
import { say, useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { router } from 'expo-router';

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

export default function MapScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip, setPark } = useDrive();
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const sent = useRef({ lat: 0, lon: 0, park: 0 });

  const cfg = {
    online: true,
    navMode: prefs.str('navMode', 'own') === 'google' ? 'google' : 'own',
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
        prefs.put('navMode', String(a[0]));
        break;
      case 'parkHere':
        setPark(Number(a[0]), Number(a[1]));
        break;
      case 'call':
        Linking.openURL('tel:' + String(a[0]).replace(/[^0-9+]/g, '')).catch(() => {});
        break;
      case 'saveService':
        prefs.put('serviceName', String(a[0]));
        prefs.put('servicePhone', String(a[1] ?? ''));
        break;
      case 'destination':
        prefs.put('lastDest', JSON.stringify({ name: a[0], lat: a[1], lon: a[2], t: Date.now() }));
        break;
      case 'savedPlace':
        prefs.put('place:' + String(a[0]), JSON.stringify({ lat: a[1], lon: a[2] }));
        break;
      case 'routeRain':
        prefs.put('routeRain', String(a[0] ?? ''));
        break;
      case 'voice':
        Alert.alert('Voice search', 'Voice commands are not in the React Native version yet. Type the place in the search box.');
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
        }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
      />
      <View style={styles.back}>
        <Button label="‹ Home" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { position: 'absolute', left: 12, bottom: 12 },
});
