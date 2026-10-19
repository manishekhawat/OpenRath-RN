// OpenRath's own player: nothing plays while the screens are being photographed.
const silent = {
  play() {},
  pause() {},
  remove() {},
  replace() {},
  seekTo() {},
  volume: 1,
  muted: false,
  loop: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  isLoaded: true,
  addListener() {
    return { remove() {} };
  },
};

export function createAudioPlayer() {
  return silent;
}
export async function setAudioModeAsync() {}
export function useAudioPlayer() {
  return silent;
}
export function useAudioPlayerStatus() {
  return { playing: false, currentTime: 0, duration: 0, isLoaded: true };
}
