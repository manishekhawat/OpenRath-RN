// The video box's player.
import { Text, View } from 'react-native';

const player = {
  play() {},
  pause() {},
  replace() {},
  muted: false,
  loop: false,
  currentTime: 0,
  duration: 0,
  playing: false,
  addListener() {
    return { remove() {} };
  },
  removeListener() {},
};

export function useVideoPlayer() {
  return player;
}

export function VideoView({ style }) {
  return (
    <View style={[{ alignItems: 'center', backgroundColor: '#000', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#888' }}>Video</Text>
    </View>
  );
}
