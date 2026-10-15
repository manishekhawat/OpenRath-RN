// The entry point: the background drive task is registered before the app's screens, so Android
// finds it when it restarts the task with no screen open, then Expo Router starts as usual.
import './src/state/background';
import 'expo-router/entry';
