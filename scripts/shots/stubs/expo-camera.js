// The camera: the dashcam and parking-photo screens show their own "no camera" state instead.
import { Text, View } from 'react-native';

const denied = { status: 'undetermined', granted: false, canAskAgain: true };

export const Camera = {
  async getCameraPermissionsAsync() {
    return denied;
  },
  async requestCameraPermissionsAsync() {
    return denied;
  },
};

export function useCameraPermissions() {
  return [denied, async () => denied];
}
export function useMicrophonePermissions() {
  return [denied, async () => denied];
}

export function CameraView({ style }) {
  return (
    <View style={[{ alignItems: 'center', backgroundColor: '#111', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#888' }}>Camera</Text>
    </View>
  );
}
