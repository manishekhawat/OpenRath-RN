// The map page in a browser: react-native-web has no WebView, so the same page goes into an
// iframe. It is given the app's own values before it loads, as the real bridge does, and what the
// app injects later (the car's position, the route, the parking spot) runs in the page the same
// way. The tiles need the network, so with none the map's own controls show over an empty map.
import { useEffect, useImperativeHandle, useRef } from 'react';

export function WebView({ source, injectedJavaScriptBeforeContentLoaded, onMessage, onLoadEnd, ref, style }) {
  const frame = useRef(null);
  // the page is written once: it keeps whatever the app told it, and the newest handler is used
  const message = useRef(onMessage);
  message.current = onMessage;
  const loaded = useRef(onLoadEnd);
  loaded.current = onLoadEnd;

  useEffect(() => {
    const el = frame.current;
    const doc = el?.contentDocument;
    if (!doc) return;
    const send = (body) => message.current?.({ nativeEvent: { data: String(body) } });
    el.contentWindow.ReactNativeWebView = { postMessage: send };
    doc.open();
    doc.write(
      (injectedJavaScriptBeforeContentLoaded ? '<script>' + injectedJavaScriptBeforeContentLoaded + '</script>' : '') +
        (source?.html ?? ''),
    );
    doc.close();
    // the app waits for the page before it sends the car's position, as it does on a stereo
    setTimeout(() => loaded.current?.(), 300);
  }, [source?.html, injectedJavaScriptBeforeContentLoaded]);

  useImperativeHandle(ref, () => ({
    injectJavaScript(js) {
      try {
        frame.current?.contentWindow?.eval(js);
      } catch {
        // the page is still loading: the app sends its values again
      }
    },
    postMessage() {},
    reload() {},
  }));

  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style ?? {};
  return <iframe ref={frame} title="map" style={{ border: 0, width: '100%', height: '100%', ...flat }} />;
}

export default WebView;
