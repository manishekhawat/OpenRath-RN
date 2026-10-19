// Metro's defaults, plus the screenshot harness: with OPENRATH_SHOTS=1 the web bundle gets the
// stand-ins in scripts/shots/stubs for the parts that only exist on a stereo (the camera, the GPS,
// the media library and the rest), so `npm run shots` can open every screen in a browser at
// 1024 x 600. Without that variable nothing changes, so Android builds are untouched.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.OPENRATH_SHOTS === '1') {
  const stubs = path.join(__dirname, 'scripts', 'shots', 'stubs');
  const STOOD_IN_FOR = new Set([
    'expo-audio',
    'expo-battery',
    'expo-calendar',
    'expo-camera',
    'expo-document-picker',
    'expo-file-system',
    'expo-image-picker',
    'expo-intent-launcher',
    'expo-location',
    'expo-media-library',
    'expo-sensors',
    'expo-task-manager',
    'expo-video',
    'react-native-webview',
  ]);
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && STOOD_IN_FOR.has(moduleName)) {
      return { type: 'sourceFile', filePath: path.join(stubs, moduleName + '.js') };
    }
    return (resolve ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
